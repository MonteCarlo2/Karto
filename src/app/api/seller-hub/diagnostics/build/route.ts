import { writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { applyCostPricesToCatalog, loadLatestCostPrices } from "@/lib/seller-hub/cost-history";
import { buildSellerHubDiagnostics } from "@/lib/seller-hub/diagnostics";
import { DEFAULT_TASK_SETTINGS } from "@/lib/seller-hub/task-engine/config";
import { taskFactsFromSnapshot } from "@/lib/seller-hub/task-engine/facts";
import {
  buildStoreMoneyContext,
  collectDrafts,
  finalizeNoSalesDrafts,
} from "@/lib/seller-hub/task-engine/rules";
import type { SellerTask } from "@/lib/seller-hub/task-engine/types";
import { requireSellerHubWbToken, wbRouteError } from "@/lib/seller-hub/wb-token-http";
import { safeSellerHubMessage } from "@/lib/seller-hub/wb-token";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { createServerClient } from "@/lib/supabase/server";
import {
  fetchPaidStorage,
  fetchSalesFunnel,
  fetchStocksReport,
} from "@/lib/services/wildberries/analytics-client";
import { WildberriesApiError } from "@/lib/services/wildberries/client";
import { syncWildberriesCatalog } from "@/lib/services/wildberries/content-client";
import {
  fetchBankPaymentSumForMonth,
  fetchRealizationMarginBundle,
  fetchRealizationReconcile,
} from "@/lib/services/wildberries/realization-margin";

/** Каталог + реализация + воронка/остатки/хранение + пауза finance list. */
export const maxDuration = 600;

const MONTH_RECONCILE_FROM = "2026-09-01";
const MONTH_RECONCILE_TO = "2026-09-30";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Development: полный прогон синхронизации + диагностика + запись karto-diagnostics.json.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Только в development" }, { status: 403 });
  }
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  try {
    const catalog = await syncWildberriesCatalog(access.token);
    // Себестоимость только в seller_hub_cost_history (localStorage — кэш UI). WB не отдаёт.
    const costs = await loadLatestCostPrices(createServerClient(), access.userId);
    catalog.items = applyCostPricesToCatalog(catalog.items, costs);

    // Finance отдельно от Analytics: параллельно с воронкой ок.
    // Funnel / stocks / paid_storage — строго по очереди (общий throttle 21 с).
    const realizationPromise = fetchRealizationMarginBundle(access.token);
    const funnel = await fetchSalesFunnel(access.token);
    const stocksReport = await fetchStocksReport(access.token);
    // Async paid_storage: несколько коротких проходов, не один длинный poll.
    let paidStorage = await fetchPaidStorage(access.token, null);
    for (let i = 0; i < 6 && (paidStorage.status === "pending" || (paidStorage.pendingChunks?.length ?? 0) > 0); i += 1) {
      await sleep(8_000);
      paidStorage = await fetchPaidStorage(access.token, paidStorage);
    }
    const realizationBundle = await realizationPromise;

    // Сверка недели уже в bundle; если list не успел — повтор после паузы.
    let weekReconcile = realizationBundle.snapshot.reconcile ?? null;
    if (weekReconcile?.bankPaymentSum == null && weekReconcile?.ok !== true) {
      await sleep(65_000);
      weekReconcile = await fetchRealizationReconcile(
        access.token,
        realizationBundle.rawRows,
      );
    }
    await sleep(65_000);
    const monthBankFetch = await fetchBankPaymentSumForMonth(
      access.token,
      MONTH_RECONCILE_FROM,
      MONTH_RECONCILE_TO,
    );

    const realization = {
      ...realizationBundle.snapshot,
      reconcile: weekReconcile,
    };

    const snapshot: SellerCatalogSnapshot = {
      ...catalog,
      realization,
      funnel,
      stocksReport,
      paidStorage,
    };

    const { products } = taskFactsFromSnapshot(snapshot);
    const storeMoney = buildStoreMoneyContext(products, DEFAULT_TASK_SETTINGS.thresholds);
    const now = new Date().toISOString();
    const noSalesDrafts = finalizeNoSalesDrafts(
      products,
      DEFAULT_TASK_SETTINGS,
      now,
      storeMoney,
      [],
    );
    const noSalesNmIds = new Set(
      noSalesDrafts.map((d) => d.nmId).filter((id): id is string => Boolean(id)),
    );
    const drafts = [
      ...noSalesDrafts,
      ...products.flatMap((fact) =>
        collectDrafts(
          fact,
          null,
          DEFAULT_TASK_SETTINGS,
          now,
          storeMoney,
          [],
          null,
          true,
          noSalesNmIds,
        ),
      ),
    ];

    const tasks: SellerTask[] = drafts.map((draft, index) => ({
      id: `diag-${draft.type}-${draft.nmId ?? "store"}-${index}`,
      storeId: "wildberries",
      nmId: draft.nmId,
      itemId: draft.itemId,
      productTitle: draft.productTitle,
      vendorCode: draft.vendorCode,
      type: draft.type,
      category: draft.category,
      severity: draft.baseSeverity,
      status: "active",
      title: draft.title,
      description: draft.description,
      reason: draft.reason,
      evidence: draft.evidence,
      recommendation: draft.recommendation,
      actionType: draft.actionType,
      businessImpactType: draft.businessImpactType,
      score: 0,
      sourceEventId: null,
      createdAt: now,
      updatedAt: now,
      snoozeUntil: null,
      resolvedAt: null,
      resolution: null,
    }));

    const diagnostics = buildSellerHubDiagnostics({
      snapshot,
      tasks,
      events: [],
      now,
      realizationRawRows: realizationBundle.rawRows,
      monthBank: {
        monthFrom: MONTH_RECONCILE_FROM,
        monthTo: MONTH_RECONCILE_TO,
        sum: monthBankFetch.sum,
        reports: monthBankFetch.reports,
        error: monthBankFetch.error ?? null,
      },
    });

    const filePath = path.join(process.cwd(), "karto-diagnostics.json");
    await writeFile(filePath, `${JSON.stringify(diagnostics, null, 2)}\n`, "utf8");

    return NextResponse.json({
      ok: true,
      path: filePath,
      meta: diagnostics.meta,
      taskCount: diagnostics.tasks.length,
      productCount: diagnostics.products.length,
      rawRealizationSampleNm: diagnostics.rawRealizationSample?.picked.map((p) => p.nmId) ?? [],
      rawRealizationSampleRows: diagnostics.rawRealizationSample?.rows.length ?? 0,
      monthReconcileComputed: diagnostics.meta.monthReconcile?.computed ?? null,
      monthReconcileBank: diagnostics.meta.monthReconcile?.bankPaymentSum ?? null,
      paidStorageStatus: paidStorage.status,
      paidStorageError: paidStorage.error
        ? safeSellerHubMessage(paidStorage.error, access.token)
        : undefined,
      paidStorageNmCount: Object.keys(paidStorage.byNm).length,
    });
  } catch (error) {
    if (error instanceof WildberriesApiError) {
      return wbRouteError(error, access.token, error.status >= 400 ? error.status : 502);
    }
    throw error;
  }
}
