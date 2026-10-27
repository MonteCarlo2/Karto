import type { SupabaseClient } from "@supabase/supabase-js";
import { parseEventReconcileInput } from "@/lib/seller-hub/event-history";
import { eventReadingsFromSnapshot } from "@/lib/seller-hub/event-engine";
import { reconcileSellerHubEventHistory } from "@/lib/seller-hub/event-history-server";
import { applyCostPricesToSnapshot, loadLatestCostPrices } from "@/lib/seller-hub/cost-history";
import { measureDueOutcomes, syncAgentProposals } from "@/lib/seller-hub/agent/repository";
import { runAutopilot } from "@/lib/seller-hub/agent/autopilot";
import { runReportRoutine, runRoutines } from "@/lib/seller-hub/agent/routines";
import { runObserver } from "@/lib/seller-hub/agent/ai-observer-run";
import { runSolver } from "@/lib/seller-hub/agent/ai-solver-run";
import { loadScenarioProducts } from "@/lib/seller-hub/agent/scenario-inputs";
import { taskFactsFromSnapshot } from "@/lib/seller-hub/task-engine/facts";
import { parseTaskReconcileBody } from "@/lib/seller-hub/task-engine/parse";
import { reconcileSellerHubTasks } from "@/lib/seller-hub/task-engine/repository";
import type {
  SellerAdsStats,
  SellerBoxTariffs,
  SellerBlockedCards,
  SellerCatalogSnapshot,
  SellerFunnelSnapshot,
  SellerJamSubscription,
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

export type DeriveResult = { tasks: number; events: number; proposals: number | null; sources: SyncSourceId[] };

const ALL_SOURCES: SyncSourceId[] = ["base", "realization", "funnel", "stocks_report", "paid_storage", "feedbacks", "ads_stats", "blocked", "tariffs", "subscription"];

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
      jam: read<SellerJamSubscription>("subscription"),
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

  // Предложения агента: отдельный шаг, его сбой не должен ронять задачи и события.
  let proposals: number | null = null;
  try {
    proposals = (await syncAgentProposals(db, key.userId, snapshot)).open;
  } catch (error) {
    console.error("[seller-hub-sync] предложения агента не пересчитались:", error instanceof Error ? error.message : String(error));
  }
  // Автопилот: безопасные шаги принятых планов, у которых он включён владельцем, выполняются сами в рамках правил и суточных пределов. Сбой не должен ронять пересчёт.
  try {
    const auto = await runAutopilot({ db, userId: key.userId, nowMs: Date.now() });
    if (auto.executed > 0 || auto.failed > 0) console.info(`[seller-hub-sync] автопилот: выполнено ${auto.executed}, ошибок ${auto.failed}, пропущено ${auto.skipped.length}`);
  } catch (error) {
    console.error("[seller-hub-sync] автопилот не отработал:", error instanceof Error ? error.message : String(error));
  }
  // Регулярные задачи автопилота (раз в сутки): только если владелец их включил.
  try {
    const routine = await runRoutines({ db, userId: key.userId, snapshot, nowMs: Date.now() });
    if (routine.executed > 0 || routine.failed > 0) console.info(`[seller-hub-sync] регулярные задачи: выполнено ${routine.executed}, ошибок ${routine.failed}`);
  } catch (error) {
    console.error("[seller-hub-sync] регулярные задачи не отработали:", error instanceof Error ? error.message : String(error));
  }
  // Недельный отчёт о работе агентов (если включён владельцем).
  try {
    if (await runReportRoutine(db, key.userId, Date.now())) console.info("[seller-hub-sync] недельный отчёт агентов создан");
  } catch (error) {
    console.error("[seller-hub-sync] недельный отчёт не создан:", error instanceof Error ? error.message : String(error));
  }
  // Результат действий агента: у решений, у которых прошло окно наблюдения, меряем, что стало с заказами.
  try {
    await measureDueOutcomes(db, key.userId);
  } catch (error) {
    console.error("[seller-hub-sync] результаты действий агента не измерились:", error instanceof Error ? error.message : String(error));
  }

  // ИИ разбирает сигналы алгоритмов (новые и изменившиеся задачи): проблема ли это в контексте кабинета и каков план решения. Платный, включается отдельно.
  // Свободный просмотр кабинета ИИ (узкий наблюдатель) выключен по умолчанию и включается SELLER_HUB_AGENT_SCAN=1.
  if (process.env.SELLER_HUB_AGENT_AI === "1") {
    try {
      const nowMs = Date.now();
      const products = await loadScenarioProducts(db, key.userId, snapshot, nowMs);
      const active = tasks.filter((t) => t.status === "active" || t.status === "in_progress");
      await runSolver({
        db,
        userId: key.userId,
        products,
        tasks: active.map((t) => ({ taskId: t.id, nmId: t.nmId, type: t.type, title: t.title, severity: t.severity, description: t.description, reason: t.reason, recommendation: t.recommendation, evidence: t.evidence, score: t.score })),
        nowMs,
      });
      if (process.env.SELLER_HUB_AGENT_SCAN === "1") {
        await runObserver({
          db,
          userId: key.userId,
          products,
          tasks: active.map((t) => ({ type: t.type, title: t.title, nmId: t.nmId, severity: t.severity })),
          events: events.filter((e) => Date.parse(e.createdAt) >= nowMs - 48 * 3_600_000).map((e) => ({ kind: e.kind, title: e.title, detail: e.detail, nmId: e.nmId, at: e.createdAt })),
          nowMs,
        });
      }
    } catch (error) {
      console.error("[seller-hub-sync] ИИ-разбор не отработал:", error instanceof Error ? error.message : String(error));
    }
  }

  return { tasks: tasks.length, events: events.length, proposals, sources };
}
