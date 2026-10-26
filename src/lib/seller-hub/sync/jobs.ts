import type { SupabaseClient } from "@supabase/supabase-js";
import { lastFullDaysRange } from "@/lib/seller-hub/complete-days";
import { syncSellerHubFeedbacks } from "@/lib/seller-hub/feedbacks/sync";
import type { SellerAdsStats, SellerCatalogSnapshot, SellerPaidStorageSnapshot } from "@/lib/seller-hub/types";
import { fetchPaidStorage, fetchSalesFunnel, fetchStocksReport } from "@/lib/services/wildberries/analytics-client";
import { fetchWbAdsStats } from "@/lib/services/wildberries/advert-client";
import { syncWildberriesCatalog } from "@/lib/services/wildberries/content-client";
import { fetchRealizationMargin } from "@/lib/services/wildberries/realization-margin";
import { fetchWbBlockedCards } from "@/lib/services/wildberries/risks-client";
import { fetchWbBoxTariffs } from "@/lib/services/wildberries/tariffs-client";
import { missingFunnelDays, moscowToday, readStoreMetricRows, refreshMetricHistory } from "@/lib/seller-hub/history/refresh";
import { loadMutedRubrics, newsProfileFromSnapshot, refreshSellerHubNews } from "@/lib/seller-hub/news/refresh";
import { assessBaseSnapshot } from "./assess";
import type { CabinetKey, SyncStore } from "./store";
import type { SyncSourceId } from "./sources";

/**
 * Задания фонового сбора: каждое читает свой источник из WB и решает, можно ли публиковать результат.
 * Публикуется только целый снимок: частичный результат не затирает прежний (задачи и события иначе «мигали» бы).
 */

export type JobContext = {
  key: CabinetKey;
  token: string;
  store: SyncStore;
  db: SupabaseClient;
  now: number;
  /** Сколько раз подряд этот источник не удался. */
  failCount: number;
};

export type JobOutcome =
  /** retryInMs: источник ещё достраивается, вернуться раньше обычного срока (это прогресс, а не ошибка). */
  | { status: "ok"; changed: boolean; rows?: number; retryInMs?: number }
  | { status: "partial"; reason: string };

export type Job = (ctx: JobContext) => Promise<JobOutcome>;

const DAY_MS = 86_400_000;
const shiftDate = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** Кампании со статусами 7, 9, 11: только для них WB формирует статистику. */
const STATS_STATUSES = new Set([7, 9, 11]);

async function publishIfComplete<T extends { error?: string }>(
  ctx: JobContext,
  source: SyncSourceId,
  result: T,
  window?: { from?: string; to?: string },
): Promise<JobOutcome> {
  if (result.error) return { status: "partial", reason: result.error };
  const changed = await ctx.store.publishSnapshot(ctx.key, source, result, window);
  return { status: "ok", changed };
}

const base: Job = async (ctx) => {
  const previous = await ctx.store.readSnapshot<SellerCatalogSnapshot>(ctx.key, "base");
  const next = await syncWildberriesCatalog(ctx.token, { categoryCharcCache: previous?.payload.categoryCharcCache });
  const verdict = assessBaseSnapshot(previous?.payload ?? null, next, ctx.failCount);
  if (!verdict.publish) return { status: "partial", reason: verdict.reason };
  const changed = await ctx.store.publishSnapshot(ctx.key, "base", next);
  return { status: "ok", changed, rows: next.items.length };
};

const adsStats: Job = async (ctx) => {
  const baseSnap = await ctx.store.readSnapshot<SellerCatalogSnapshot>(ctx.key, "base");
  if (!baseSnap) return { status: "partial", reason: "Нет базового снимка: список кампаний неизвестен" };
  const ids = (baseSnap.payload.ads?.campaigns ?? [])
    .filter((c) => c.status != null && STATS_STATUSES.has(c.status))
    .map((c) => Number(c.id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) {
    const changed = await ctx.store.publishSnapshot(ctx.key, "ads_stats", { current: null, prev: null });
    return { status: "ok", changed, rows: 0 };
  }
  // Окна считаем от времени базового снимка: те же даты, что видит интерфейс на вкладке рекламы.
  const range = lastFullDaysRange(Date.parse(baseSnap.payload.syncedAt) || ctx.now, 7);
  const prevRange = { dateFrom: shiftDate(range.dateFrom, -7), dateTo: shiftDate(range.dateTo, -7) };
  const current = await fetchWbAdsStats(ctx.token, ids, range.dateFrom, range.dateTo, { nmDays: true });
  const prev = await fetchWbAdsStats(ctx.token, ids, prevRange.dateFrom, prevRange.dateTo, { nmDays: true });

  const rows = [current, prev].flatMap((stats: SellerAdsStats) =>
    stats.campaigns.flatMap((campaign) =>
      (campaign.nmDays ?? []).map((cell) => ({
        date: cell.date,
        advertId: Number(campaign.advertId),
        nmId: Number(cell.nmId),
        views: cell.views,
        clicks: cell.clicks,
        spend: cell.spend,
        orders: cell.orders,
        orderSum: cell.orderSum,
      })),
    ),
  );
  const written = await ctx.store.upsertAdDaily(
    ctx.key,
    rows.filter((r) => Number.isFinite(r.advertId) && Number.isFinite(r.nmId)),
  );
  // В снимок для движков по дням и товарам не кладём: он нужен только для истории, снимок остаётся лёгким.
  const light = (stats: SellerAdsStats): SellerAdsStats => ({
    ...stats,
    campaigns: stats.campaigns.map((campaign) => {
      const copy = { ...campaign };
      delete copy.nmDays;
      return copy;
    }),
  });
  const changed = await ctx.store.publishSnapshot(ctx.key, "ads_stats", { current: light(current), prev: light(prev) }, { from: prevRange.dateFrom, to: range.dateTo });
  return { status: "ok", changed, rows: written };
};

const funnel: Job = async (ctx) => publishIfComplete(ctx, "funnel", await fetchSalesFunnel(ctx.token));

const stocksReport: Job = async (ctx) => publishIfComplete(ctx, "stocks_report", await fetchStocksReport(ctx.token));

const realization: Job = async (ctx) => publishIfComplete(ctx, "realization", await fetchRealizationMargin(ctx.token));

const blocked: Job = async (ctx) => {
  const cards = await fetchWbBlockedCards(ctx.token);
  const changed = await ctx.store.publishSnapshot(ctx.key, "blocked", cards);
  return { status: "ok", changed, rows: cards.cards.length };
};

const feedbacks: Job = async (ctx) => {
  const snapshot = await syncSellerHubFeedbacks({
    supabase: ctx.db,
    userId: ctx.key.userId,
    token: ctx.token,
    marketplaceId: ctx.key.marketplaceId,
  });
  if (snapshot.status !== "ok" && snapshot.status !== "partial") {
    return { status: "partial", reason: `Отзывы: статус «${snapshot.status}»` };
  }
  const changed = await ctx.store.publishSnapshot(ctx.key, "feedbacks", snapshot);
  return { status: "ok", changed };
};

const tariffs: Job = async (ctx) => {
  const result = await fetchWbBoxTariffs(ctx.token, ctx.now);
  // Время чтения в сравнение содержимого не входит (см. store), так что снимок меняется только вместе с тарифами.
  const changed = await ctx.store.publishSnapshot(ctx.key, "tariffs", result);
  return { status: "ok", changed, rows: result.warehouses.length };
};

/** Пауза перед следующей страницей новостей: у WB лимит один запрос в минуту. */
const NEWS_NEXT_PAGE_MS = 70_000;

const news: Job = async (ctx) => {
  const baseSnap = await ctx.store.readSnapshot<SellerCatalogSnapshot>(ctx.key, "base");
  if (!baseSnap) return { status: "partial", reason: "Нет базового снимка: профиль продавца неизвестен" };
  const muted = await loadMutedRubrics(ctx.db, ctx.key.userId);
  const result = await refreshSellerHubNews({
    db: ctx.db,
    userId: ctx.key.userId,
    token: ctx.token,
    profile: newsProfileFromSnapshot(baseSnap.payload, muted),
    nowMs: ctx.now,
    force: true,
  });
  // Новые события пишутся прямо в историю событий, снимок кабинета они не меняют.
  return { status: "ok", changed: false, rows: result.created, ...(result.more ? { retryInMs: NEWS_NEXT_PAGE_MS } : {}) };
};

/** Пока история не докачана (по три дня за прогон), возвращаемся через несколько минут. */
const HISTORY_NEXT_STEP_MS = 4 * 60_000;

const history: Job = async (ctx) => {
  const today = moscowToday(ctx.now);
  const notes = await refreshMetricHistory({ db: ctx.db, userId: ctx.key.userId, token: ctx.token, today });
  if (notes.length > 0) return { status: "partial", reason: notes[0]! };
  const left = missingFunnelDays(await readStoreMetricRows(ctx.db, ctx.key.userId, today), today);
  return { status: "ok", changed: false, ...(left > 0 ? { retryInMs: HISTORY_NEXT_STEP_MS } : {}) };
};

/** Сколько раз подряд возвращаемся к недостроенному отчёту, прежде чем подождать обычный срок. */
const PAID_STORAGE_MAX_STEPS = 20;
const PAID_STORAGE_STEP_PAUSE_MS = 3 * 60_000;

/**
 * Платное хранение WB собирается из 8 недельных окон, а задачу на отчёт можно создавать раз в минуту, поэтому за один проход
 * отчёт не достроить. Делаем по одному шагу за проход (как интерфейс, который шлёт несколько запросов подряд),
 * накопленное сохраняем и возвращаемся через несколько минут, пока отчёт не станет полным.
 */
const paidStorage: Job = async (ctx) => {
  const previous = await ctx.store.readSnapshot<SellerPaidStorageSnapshot>(ctx.key, "paid_storage");
  const cursor = await ctx.store.readCursor(ctx.key, "paid_storage");
  const steps = typeof cursor.steps === "number" ? cursor.steps : 0;
  const result = await fetchPaidStorage(ctx.token, previous?.payload ?? null);
  const hasData = Object.keys(result.byNm).length > 0;
  if (!hasData && result.status !== "ok") {
    await ctx.store.writeCursor(ctx.key, "paid_storage", { steps: steps + 1 });
    return { status: "partial", reason: result.error ?? "Отчёт о платном хранении ещё не готов" };
  }
  const changed = await ctx.store.publishSnapshot(ctx.key, "paid_storage", result);
  const waiting = result.status === "pending" || (result.pendingChunks?.length ?? 0) > 0;
  if (waiting && steps + 1 < PAID_STORAGE_MAX_STEPS) {
    await ctx.store.writeCursor(ctx.key, "paid_storage", { steps: steps + 1 });
    return { status: "ok", changed, retryInMs: PAID_STORAGE_STEP_PAUSE_MS };
  }
  await ctx.store.writeCursor(ctx.key, "paid_storage", {});
  return { status: "ok", changed };
};

export const JOBS: Record<SyncSourceId, Job> = {
  base,
  ads_stats: adsStats,
  funnel,
  stocks_report: stocksReport,
  paid_storage: paidStorage,
  realization,
  feedbacks,
  blocked,
  tariffs,
  news,
  history,
};
