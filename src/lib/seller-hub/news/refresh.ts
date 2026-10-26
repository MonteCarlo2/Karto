import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseCacheStore } from "@/lib/seller-hub/data-cache";
import { promoShortName } from "@/lib/seller-hub/event-engine/store-events";
import { newsToEvents, parseRubricList, type NewsProfile } from "@/lib/seller-hub/news/analysis";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { safeSellerHubMessage } from "@/lib/seller-hub/wb-token";
import { fetchWbNews, type WbNewsItem } from "@/lib/services/wildberries/news-client";

/**
 * Чтение новостей портала WB и превращение их в уведомления «Событий». Общая часть для маршрута (ручной запуск из браузера)
 * и для фонового сбора на сервере: новости читаются без открытого интерфейса.
 */

const KEY = "wb-news:v1";
/** Новости обновляем не чаще раза в 20 минут: у WB лимит 1 запрос в минуту (для обычного токена до 1 запроса в час). */
const FRESH_MS = 20 * 60_000;
/** Первая загрузка: новости за последние дни. Старше нам не нужно: ленту ведём вперёд. */
const FIRST_LOOKBACK_DAYS = 8;
const KEEP_ITEMS = 200;
/** Событиями делаем новости не старше этого срока. */
const MAX_AGE_DAYS = 21;
const PAGE = 100;
/** Пока не дочитали страницы, ждём минуту (лимит WB). */
const MORE_WAIT_MS = 65_000;

type NewsCache = { items: WbNewsItem[]; cursorId: number | null; more: boolean };

export type NewsRefreshResult = { created: number; news: number; more: boolean; warning: string | null };

const moscowDay = (ms: number) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" }).format(new Date(ms));

const uniq = (list: Array<string | undefined>) => [...new Set(list.map((v) => (v ?? "").trim()).filter(Boolean))];

/** Профиль продавца для персонализации новостей: категории и бренды товаров, схема работы, склады. */
export function newsProfileFromSnapshot(snapshot: SellerCatalogSnapshot | undefined | null, mutedRubrics: string[] = []): NewsProfile {
  const items = snapshot?.items ?? [];
  const supplies = snapshot?.supplies?.supplies ?? [];
  return {
    categories: uniq(items.map((i) => i.category)),
    brands: uniq(items.map((i) => i.brand)),
    worksFbs: (snapshot?.orders?.total ?? 0) > 0 || supplies.some((x) => x.type === "fbs"),
    worksFbw: supplies.some((x) => x.type === "fbw"),
    usesAds: (snapshot?.ads?.totalCount ?? 0) > 0,
    promoNames: [...new Set((snapshot?.promotions ?? []).map((p) => promoShortName(p.name)))].slice(0, 40),
    mutedRubrics,
    // Склады, куда продавец реально возит товар (поставки FBW за 60 дней). СЦ-новости показываем, только если назван один из них.
    warehouseNames: uniq([...supplies.flatMap((x) => [x.warehouseName, x.actualWarehouseName]), ...(snapshot?.orders?.officeNames ?? [])]),
  };
}

/** Какие рубрики новостей продавец отключил в настройках (хранятся в его настройках в базе). */
export async function loadMutedRubrics(db: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await db.from("seller_hub_user_settings").select("value").eq("user_id", userId).eq("setting_key", "events.newsMutedRubrics").maybeSingle();
  const value = (data as { value?: unknown } | null)?.value;
  return typeof value === "string" ? parseRubricList(value) : [];
}

/**
 * Прочитать новости (инкрементально, по курсору), разобрать под профиль и записать события без дублей.
 * Бросает ошибку, только если новостей нет совсем и WB не ответил; при сбое с уже накопленным работает по накопленному и пишет warning.
 */
export async function refreshSellerHubNews(input: {
  db: SupabaseClient;
  userId: string;
  token: string;
  profile: NewsProfile;
  nowMs?: number;
  /** Фон читает независимо от свежести кэша: срок между запусками задаёт расписание. */
  force?: boolean;
}): Promise<NewsRefreshResult> {
  const { db, userId, token, profile } = input;
  const nowMs = input.nowMs ?? Date.now();
  const store = supabaseCacheStore(db, userId);
  let warning: string | null = null;

  const hit = await store.read<NewsCache>(KEY).catch(() => null);
  let cache: NewsCache = hit?.payload ?? { items: [], cursorId: null, more: false };
  const age = hit ? nowMs - Date.parse(hit.loadedAt) : Number.POSITIVE_INFINITY;
  const wait = cache.more ? MORE_WAIT_MS : input.force ? 0 : FRESH_MS;
  if (age >= wait) {
    try {
      const start = cache.cursorId != null ? { fromId: cache.cursorId } : { from: moscowDay(nowMs - FIRST_LOOKBACK_DAYS * 86_400_000) };
      const result = await fetchWbNews(token, start);
      const merged = new Map(cache.items.map((n) => [n.id, n]));
      for (const n of result.items) merged.set(n.id, n);
      const items = [...merged.values()].sort((a, b) => a.id - b.id).slice(-KEEP_ITEMS);
      const maxId = items.at(-1)?.id ?? cache.cursorId;
      cache = { items, cursorId: maxId != null ? maxId + 1 : cache.cursorId, more: result.items.length >= PAGE };
      await store.write(KEY, cache).catch(() => undefined);
    } catch (e) {
      // Лимит или сбой WB: работаем с тем, что уже есть, и честно говорим об этом.
      warning = safeSellerHubMessage(e instanceof Error ? e.message : "Не удалось обновить новости", token);
      if (cache.items.length === 0) throw e;
    }
  }

  const fresh = cache.items.filter((n) => nowMs - Date.parse(n.date) <= MAX_AGE_DAYS * 86_400_000);
  const events = newsToEvents(fresh, profile, moscowDay(nowMs), new Date(nowMs).toISOString());
  let created = 0;
  if (events.length > 0) {
    const keys = events.map((e) => e.id);
    const { data: existing, error: readError } = await db.from("seller_hub_product_events").select("event_key").eq("user_id", userId).eq("marketplace_id", "wildberries").in("event_key", keys);
    if (readError) throw new Error(readError.message);
    const have = new Set((existing ?? []).map((r) => (r as { event_key: string }).event_key));
    const rows = events
      .filter((e) => !have.has(e.id))
      .map((e) => ({
        user_id: userId,
        marketplace_id: "wildberries",
        event_key: e.id,
        created_at: e.createdAt,
        kind: e.kind,
        event_group: e.group,
        severity: e.severity,
        title: e.title,
        detail: e.detail,
        product_title: null,
        vendor_code: null,
        nm_id: null,
        item_id: null,
      }));
    if (rows.length > 0) {
      const { error } = await db.from("seller_hub_product_events").upsert(rows, { onConflict: "user_id,marketplace_id,event_key", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      created = rows.length;
    }
  }
  return { created, news: fresh.length, more: cache.more, warning };
}
