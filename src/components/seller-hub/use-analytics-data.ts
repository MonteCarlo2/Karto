"use client";

import { useMemo } from "react";
import { abcSummary, buildInsights, buildProductRows, buildStoreKpis, topMovers, type ProductExtras } from "@/lib/seller-hub/analytics-core";
import { buildLogisticsCost } from "@/lib/seller-hub/logistics-cost";
import { buildMoneyAnalytics } from "@/lib/seller-hub/money-analytics";
import { buildMoneyLeaks } from "@/lib/seller-hub/money-leaks";
import { buildMonitoring, type MonitorFact } from "@/lib/seller-hub/monitoring";
import { buildStockAnalytics, LOW_STOCK_DAYS, OVERSTOCK_DAYS } from "@/lib/seller-hub/stock-analytics";
import { taskFactsFromSnapshot } from "@/lib/seller-hub/task-engine/facts";
import type { SellerCatalogSnapshot, SellerFunnelSnapshot, SellerStocksReportSnapshot } from "@/lib/seller-hub/types";
import { useUserSetting } from "./use-user-setting";

/**
 * Данные раздела «Аналитика»: показатели магазина, таблица товаров, выводы, мониторинг. Маржа на 1 продажу берётся из того же расчёта,
 * что в «Товарах» и «Задачах» (формулы не дублируем и не меняем).
 */
export function useAnalyticsData(snapshot: SellerCatalogSnapshot | undefined, period: { days: number; funnel: SellerFunnelSnapshot | undefined; stocksReport: SellerStocksReportSnapshot | undefined }) {
  // Воронка и отчёт об остатках — за выбранный период (для 28 дней это данные снимка кабинета).
  const { funnel, stocksReport, days } = period;
  const items = snapshot?.items;
  const [lowDays] = useUserSetting<number>("analytics.lowStockDays", LOW_STOCK_DAYS);
  const [overDays] = useUserSetting<number>("analytics.overStockDays", OVERSTOCK_DAYS);

  const kpis = useMemo(() => buildStoreKpis(funnel, stocksReport, items?.length ?? 0), [funnel, stocksReport, items]);

  /** Факты по товарам из общего расчёта задач (маржа, прошлая маржа, оценка контента). Тяжёлый расчёт: один раз на снимок. */
  const taskProducts = useMemo(() => (snapshot ? taskFactsFromSnapshot(snapshot).products : []), [snapshot]);
  const facts = useMemo<MonitorFact[]>(
    () => taskProducts.map((p) => ({ nmId: p.nmId, marginPercent: p.marginPercent, priorMarginPercent: p.priorMarginPercent, contentGrade: p.contentGrade ?? null })),
    [taskProducts],
  );
  const realization = snapshot?.realization;
  const extras = useMemo<ProductExtras | undefined>(() => {
    if (!realization || realization.error) return undefined;
    return new Map(taskProducts.map((p) => [p.nmId, { marginRub: p.marginRub, marginPercent: p.marginPercent }]));
  }, [realization, taskProducts]);

  const rows = useMemo(() => buildProductRows({ funnel, stocksReport, items: items ?? [], extras }), [funnel, stocksReport, items, extras]);
  const insights = useMemo(() => buildInsights(kpis, rows, days), [kpis, rows, days]);
  const abc = useMemo(() => abcSummary(rows), [rows]);
  const movers = useMemo(() => topMovers(rows, 5), [rows]);

  const money = useMemo(() => buildMoneyAnalytics(realization, items ?? [], days), [realization, items, days]);
  const stockAnalytics = useMemo(() => buildStockAnalytics(stocksReport, items ?? [], { lowDays, overDays }), [stocksReport, items, lowDays, overDays]);

  /** Стоимость логистики из отчёта реализации (окна 28+28): нужна и мониторингу, и блоку «Где теряются деньги». */
  const logisticsCosts = useMemo(() => {
    const titles = new Map((items ?? []).map((i) => [i.externalId, i.title || i.vendorCode || i.externalId]));
    return buildLogisticsCost(realization, (id) => titles.get(id) ?? `Артикул ${id}`);
  }, [realization, items]);
  const leaks = useMemo(() => buildMoneyLeaks({ kpis, money, costs: logisticsCosts, days }), [kpis, money, logisticsCosts, days]);

  const monitoring = useMemo(() => {
    const costs = logisticsCosts;
    const stock = stockAnalytics?.rows ?? null;
    // Без отчёта реализации маржа не считается: направление «Финансы» честно показывает «нет данных», а контент оценивается по каталогу.
    const usable = realization && !realization.error ? facts : facts.map((f) => ({ ...f, marginPercent: null, priorMarginPercent: null }));
    return buildMonitoring({ rows, facts: usable, costs, stock });
  }, [rows, facts, realization, stockAnalytics, logisticsCosts]);

  return { kpis, rows, insights, abc, movers, monitoring, money, leaks, stockSummary: stockAnalytics?.summary ?? null };
}

export type AnalyticsData = ReturnType<typeof useAnalyticsData>;
