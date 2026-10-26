import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Серверный кэш ответов WB с узкими лимитами (таблица seller_hub_data_cache).
 * Один кэш на пользователя для всех его устройств; перезагрузка страницы не бьёт в лимиты WB.
 */

export type CacheEntry<T> = { payload: T; loadedAt: string };

export type CacheStore = {
  read<T>(key: string): Promise<CacheEntry<T> | null>;
  write(key: string, payload: unknown): Promise<void>;
};

/** Сколько живёт ответ для каждого вида данных. */
export const CACHE_TTL_MS = {
  adsStats: 10 * 60_000,
  adsClusters: 30 * 60_000,
  adsBids: 30 * 60_000,
  warehouseStocks: 30 * 60_000,
  /** WB отдаёт коэффициенты приёмки не чаще 6 запросов в минуту; слоты меняются в течение дня. */
  acceptance: 15 * 60_000,
  /** Воронка и остатки за выбранный период в «Аналитике»: методы WB с жёсткими лимитами. */
  analyticsPeriod: 30 * 60_000,
  regionOrders: 60 * 60_000,
  blockedCards: 60 * 60_000,
  searchTexts: 2 * 60 * 60_000,
  /** Состав закрытой поставки больше не меняется. */
  supplyOrdersClosed: 24 * 60 * 60_000,
  supplyOrdersOpen: 5 * 60_000,
} as const;

/** Явное «Обновить» не чаще, чем раз в минуту: у WB лимиты на эти методы от 1 запроса в минуту. */
export const MIN_REFRESH_MS = 60_000;

/** Использовать кэш или идти в WB. Чистая функция, покрыта тестами. */
export function decideCache(input: {
  loadedAt: string | null;
  nowMs: number;
  ttlMs: number;
  refresh: boolean;
  minRefreshMs?: number;
}): "use" | "fetch" {
  if (!input.loadedAt) return "fetch";
  const loaded = Date.parse(input.loadedAt);
  if (!Number.isFinite(loaded)) return "fetch";
  const age = input.nowMs - loaded;
  if (age < 0) return "use";
  if (input.refresh) return age < (input.minRefreshMs ?? MIN_REFRESH_MS) ? "use" : "fetch";
  return age < input.ttlMs ? "use" : "fetch";
}

export type CachedResult<T> = {
  value: T;
  loadedAt: string;
  fromCache: boolean;
  /** Данные устарели, потому что WB сейчас не ответил: показываем последние известные. */
  stale: boolean;
  /** Причина, если stale. */
  staleReason?: string;
};

/**
 * Ответ из кэша или из WB. Если WB не ответил (лимит, сбой), а в кэше есть пусть и устаревшие данные,
 * возвращаем их с пометкой stale: экран остаётся полезным, а не пустым.
 */
export async function cachedFetch<T>(input: {
  store: CacheStore;
  key: string;
  ttlMs: number;
  refresh?: boolean;
  nowMs?: number;
  fetcher: () => Promise<T>;
}): Promise<CachedResult<T>> {
  const nowMs = input.nowMs ?? Date.now();
  const hit = await input.store.read<T>(input.key).catch(() => null);
  const decision = decideCache({
    loadedAt: hit?.loadedAt ?? null,
    nowMs,
    ttlMs: input.ttlMs,
    refresh: input.refresh === true,
  });
  if (hit && decision === "use") {
    return { value: hit.payload, loadedAt: hit.loadedAt, fromCache: true, stale: false };
  }
  try {
    const value = await input.fetcher();
    const loadedAt = new Date(nowMs).toISOString();
    await input.store.write(input.key, value).catch(() => undefined);
    return { value, loadedAt, fromCache: false, stale: false };
  } catch (error) {
    if (hit) {
      return {
        value: hit.payload,
        loadedAt: hit.loadedAt,
        fromCache: true,
        stale: true,
        staleReason: error instanceof Error ? error.message : "WB не ответил",
      };
    }
    throw error;
  }
}

/** Хранилище кэша в Supabase для пользователя. Сервер работает от имени сервисной роли, доступ ограничен user_id. */
export function supabaseCacheStore(supabase: SupabaseClient, userId: string, marketplaceId = "wildberries"): CacheStore {
  return {
    async read<T>(key: string): Promise<CacheEntry<T> | null> {
      const { data, error } = await supabase
        .from("seller_hub_data_cache")
        .select("payload, loaded_at")
        .eq("user_id", userId)
        .eq("marketplace_id", marketplaceId)
        .eq("cache_key", key)
        .maybeSingle();
      if (error || !data) return null;
      return { payload: data.payload as T, loadedAt: data.loaded_at as string };
    },
    async write(key: string, payload: unknown): Promise<void> {
      await supabase.from("seller_hub_data_cache").upsert(
        {
          user_id: userId,
          marketplace_id: marketplaceId,
          cache_key: key,
          payload,
          loaded_at: new Date().toISOString(),
        },
        { onConflict: "user_id,marketplace_id,cache_key" },
      );
    },
  };
}

/** Короткий стабильный отпечаток длинного списка (id артикулов) для ключа кэша. */
export function shortHash(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}
