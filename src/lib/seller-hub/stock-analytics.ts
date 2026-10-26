import type { SellerCatalogItem, SellerStocksReportNm, SellerStocksReportSnapshot } from "@/lib/seller-hub/types";

/**
 * Остатки и оборачиваемость по отчёту WB: что заканчивается, что залежалось, сколько упущено из-за отсутствия товара.
 * «На сколько дней хватит» (saleRate) и упущенные заказы считает WB, мы их не пересчитываем. Пороги ниже — наши и указаны на экране.
 */

/** Меньше стольких дней запаса — риск, что товар закончится. */
export const LOW_STOCK_DAYS = 14;
/** Больше стольких дней запаса (или остаток при нулевых продажах) — товар залёживается. */
export const OVERSTOCK_DAYS = 90;

export type StockStatus = "out" | "low" | "ok" | "over";

export type StockRow = {
  nmId: string;
  title: string;
  status: StockStatus;
  stock: number;
  /** На сколько дней хватит остатка по оценке WB; null — WB не рассчитал. */
  saleRateDays: number | null;
  /** Продаж нет совсем, поэтому «хватит» бесконечно. */
  noSales: boolean;
  /** Оборачиваемость, дней; null — не рассчитана. */
  turnoverDays: number | null;
  orders: number;
  lostOrders: number;
  lostSum: number;
  lostBuyouts: number;
  lostBuyoutsSum: number;
  /** Дней без товара на складах за период (WB). */
  missingDays: number | null;
  /** Собственная оценка WB запаса товара (deficient / actual / balanced / nonActual / nonLiquid / invalidData); null — WB не вернул. */
  availability: string | null;
  /** Остаток × себестоимость, ₽; null — себестоимость не указана. Для товаров, которые залёживаются, это замороженные деньги. */
  stockValue: number | null;
};

export type StockSummary = {
  out: number;
  low: number;
  over: number;
  ok: number;
  lostSum: number;
  lostOrders: number;
  lostBuyoutsSum: number;
  /** Деньги в остатках залёживающихся товаров (по себестоимости, где она указана). */
  frozenValue: number;
  /** У скольких залёживающихся товаров себестоимость не указана, то есть сумма неполная. */
  frozenWithoutCost: number;
};

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export type StockThresholds = { lowDays: number; overDays: number };
export const DEFAULT_STOCK_THRESHOLDS: StockThresholds = { lowDays: LOW_STOCK_DAYS, overDays: OVERSTOCK_DAYS };

export function buildStockAnalytics(
  report: SellerStocksReportSnapshot | null | undefined,
  items: SellerCatalogItem[],
  thresholds: StockThresholds = DEFAULT_STOCK_THRESHOLDS,
): { rows: StockRow[]; summary: StockSummary; truncated: boolean } | null {
  if (!report || report.error || !(report.status === "ok" || report.status === "partial")) return null;
  const itemOf = new Map(items.map((i) => [i.externalId, i]));
  const rows: StockRow[] = [];
  for (const [nmId, r] of Object.entries(report.byNm) as Array<[string, SellerStocksReportNm]>) {
    const item = itemOf.get(nmId);
    const stock = n(item?.totalStock ?? r.stockCount);
    const noSales = r.saleRateSpecial === "infinite";
    const saleRateDays = r.saleRateDays != null && Number.isFinite(r.saleRateDays) ? r.saleRateDays : null;
    const orders = n(r.ordersCount);
    const lostOrders = n(r.lostOrdersCount);
    let status: StockStatus = "ok";
    if (stock === 0 && (orders > 0 || lostOrders > 0)) status = "out";
    else if (saleRateDays != null && saleRateDays < thresholds.lowDays && stock > 0) status = "low";
    else if (stock > 0 && (noSales || (saleRateDays != null && saleRateDays > thresholds.overDays))) status = "over";
    const cost = item?.costPrice ?? null;
    rows.push({
      nmId,
      title: item?.title || item?.vendorCode || nmId,
      status,
      stock,
      saleRateDays,
      noSales,
      turnoverDays: r.avgStockTurnoverDays,
      orders,
      lostOrders,
      lostSum: n(r.lostOrdersSum),
      lostBuyouts: n(r.lostBuyoutsCount),
      lostBuyoutsSum: n(r.lostBuyoutsSum),
      missingDays: r.officeMissingTimeDays,
      availability: r.availability,
      stockValue: cost != null && cost > 0 ? stock * cost : null,
    });
  }
  const over = rows.filter((r) => r.status === "over");
  const summary: StockSummary = {
    out: rows.filter((r) => r.status === "out").length,
    low: rows.filter((r) => r.status === "low").length,
    over: over.length,
    ok: rows.filter((r) => r.status === "ok").length,
    lostSum: rows.reduce((s, r) => s + r.lostSum, 0),
    lostOrders: rows.reduce((s, r) => s + r.lostOrders, 0),
    lostBuyoutsSum: rows.reduce((s, r) => s + r.lostBuyoutsSum, 0),
    frozenValue: over.reduce((s, r) => s + (r.stockValue ?? 0), 0),
    frozenWithoutCost: over.filter((r) => r.stockValue == null).length,
  };
  const order: Record<StockStatus, number> = { out: 0, low: 1, over: 2, ok: 3 };
  rows.sort((a, b) => order[a.status] - order[b.status] || b.lostSum - a.lostSum || (a.saleRateDays ?? 1e9) - (b.saleRateDays ?? 1e9));
  return { rows, summary, truncated: report.truncated === true };
}
