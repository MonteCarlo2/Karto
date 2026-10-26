import type { SupabaseClient } from "@supabase/supabase-js";
import { parseEventReconcileInput } from "@/lib/seller-hub/event-history";
import { eventReadingsFromSnapshot } from "@/lib/seller-hub/event-engine";
import { reconcileSellerHubEventHistory } from "@/lib/seller-hub/event-history-server";
import { applyCostPricesToSnapshot, loadLatestCostPrices } from "@/lib/seller-hub/cost-history";
import { taskFactsFromSnapshot } from "@/lib/seller-hub/task-engine/facts";
import { parseTaskReconcileBody } from "@/lib/seller-hub/task-engine/parse";
import { reconcileSellerHubTasks } from "@/lib/seller-hub/task-engine/repository";
import type {
  SellerAdsStats,
  SellerBoxTariffs,
  SellerBlockedCards,
  SellerCatalogSnapshot,
  SellerFunnelSnapshot,
  SellerPaidStorageSnapshot,
  SellerRealizationSnapshot,
  SellerStocksReportSnapshot,
} from "@/lib/seller-hub/types";
import type { SellerFeedbacksSnapshot } from "@/lib/seller-hub/feedbacks/types";
import type { CabinetKey, SyncStore } from "./store";
import type { SyncSourceId } from "./sources";

/**
 * Серверный пересчёт событий и задач по свежим снимкам кабинета.
 * Собирает тот же снимок, что в браузере (база + реализация, воронка, остатки, хранение, отзывы, статистика рекламы,
 * блокировки + себестоимость из базы), и отдаёт его тем же движкам и тем же разбору пакета, что использует интерфейс.
 */

export type DeriveResult = { tasks: number; events: number; sources: SyncSourceId[] };

const ALL_SOURCES: SyncSourceId[] = ["base", "realization", "funnel", "stocks_report", "paid_storage", "feedbacks", "ads_stats", "blocked", "tariffs"];

export async function composeSnapshot(store: SyncStore, db: SupabaseClient, key: CabinetKey): Promise<{ snapshot: SellerCatalogSnapshot; sources: SyncSourceId[] } | null> {
  // Два обращения к базе параллельно: все снимки одним запросом и себестоимость.
  const [rows, costs] = await Promise.all([store.readSnapshots(key, ALL_SOURCES), loadLatestCostPrices(db, key.userId, key.marketplaceId)]);
  const base = rows.get("base");
  if (!base) return null;
  const sources = ALL_SOURCES.filter((source) => rows.has(source));
  const read = <T>(source: SyncSourceId): T | undefined => rows.get(source)?.payload as T | undefined;
  const ads = read<{ current: SellerAdsStats | null; prev: SellerAdsStats | null }>("ads_stats");
  const snapshot = applyCostPricesToSnapshot(
    {
      ...(base.payload as SellerCatalogSnapshot),
      // Время чтения не входит в сравнение содержимого, поэтому в снимке может лежать старое: настоящее время берём из записи.
      syncedAt: new Date(base.loadedAt).toISOString(),
      realization: read<SellerRealizationSnapshot>("realization"),
      funnel: read<SellerFunnelSnapshot>("funnel"),
      stocksReport: read<SellerStocksReportSnapshot>("stocks_report"),
      paidStorage: read<SellerPaidStorageSnapshot>("paid_storage"),
      feedbacks: read<SellerFeedbacksSnapshot>("feedbacks"),
      adsStats: ads?.current ?? undefined,
      adsStatsPrev: ads?.prev ?? undefined,
      blockedCards: read<SellerBlockedCards>("blocked"),
      tariffs: read<SellerBoxTariffs>("tariffs"),
    },
    costs,
  );
  return { snapshot, sources };
}

export async function deriveForCabinet(store: SyncStore, db: SupabaseClient, key: CabinetKey): Promise<DeriveResult | null> {
  const composed = await composeSnapshot(store, db, key);
  if (!composed) return null;
  const { snapshot, sources } = composed;

  // Через JSON и тот же разбор, что на сервере для запросов из браузера: нормализация и ограничения совпадают.
  const facts = taskFactsFromSnapshot(snapshot, { taxRatePercent: null });
  const taskBody = parseTaskReconcileBody(JSON.parse(JSON.stringify({ marketplaceId: snapshot.marketplaceId, products: facts.products, store: facts.store })));
  if (!taskBody) throw new Error("Пакет для задач не прошёл разбор");
  const tasks = await reconcileSellerHubTasks(key.userId, taskBody);

  const readings = eventReadingsFromSnapshot(snapshot);
  const eventInput = parseEventReconcileInput(JSON.parse(JSON.stringify({ marketplaceId: snapshot.marketplaceId, products: readings.products, store: readings.store })));
  if (!eventInput) throw new Error("Пакет для событий не прошёл разбор");
  const events = await reconcileSellerHubEventHistory(key.userId, eventInput);

  return { tasks: tasks.length, events: events.length, sources };
}
