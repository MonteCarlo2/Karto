import type { SellerFunnelSnapshot, SellerStocksReportSnapshot } from "@/lib/seller-hub/types";

/**
 * История показателей по дням. Одна строка = один день + один артикул (nm_id), строка магазина — nm_id "".
 * Воронка берётся за один законченный день (WB позволяет любой период), поэтому прошлые дни можно докачать.
 * Остатки на склад на конкретный день задним числом не восстановить, их пишем только в день снимка.
 */

export const STORE_NM_ID = "";
/** Глубже 90 дней аналитика WB не отдаёт. */
export const HISTORY_HORIZON_DAYS = 90;
/** За один вызов докачиваем не больше дней: у WB лимит один запрос в 21 секунду. */
export const BACKFILL_PER_CALL = 3;

export type DailyMetrics = {
  opens: number | null;
  carts: number | null;
  orders: number | null;
  orderSum: number | null;
  buyouts: number | null;
  cancels: number | null;
  /** Остаток на WB в момент снимка. Только для дня снимка. */
  stock?: number | null;
};

export type DailyRow = { metricDate: string; nmId: string; metrics: DailyMetrics };

const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function shiftDay(dayKey: string, delta: number): string {
  const d = new Date(`${dayKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Какие законченные дни (до вчера включительно) ещё не сохранены. Сначала самые свежие. */
export function missingDays(stored: Iterable<string>, todayKey: string, horizon = HISTORY_HORIZON_DAYS, limit = BACKFILL_PER_CALL): string[] {
  const have = new Set(stored);
  const out: string[] = [];
  for (let back = 1; back <= horizon && out.length < limit; back += 1) {
    const day = shiftDay(todayKey, -back);
    if (!have.has(day)) out.push(day);
  }
  return out;
}

const sumKnown = (values: Array<number | null>) => values.reduce<number | null>((acc, v) => (v == null ? acc : (acc ?? 0) + v), null);

/**
 * Строки дня из воронки за один этот день. Строка магазина — сумма по артикулам; если WB отдал не все карточки (truncated),
 * итог по магазину был бы занижен, поэтому его не пишем.
 */
export function rowsFromFunnelDay(funnel: SellerFunnelSnapshot, day: string): DailyRow[] {
  if (funnel.error || funnel.status === "error" || funnel.status === "rate_limited" || funnel.status === "forbidden" || funnel.status === "jam_required") return [];
  const rows: DailyRow[] = [];
  const all: DailyMetrics[] = [];
  for (const [nmId, nm] of Object.entries(funnel.byNm)) {
    const s = nm.selected;
    const metrics: DailyMetrics = {
      opens: num(s.openCount),
      carts: num(s.cartCount),
      orders: num(s.orderCount),
      orderSum: num(s.orderSum),
      buyouts: num(s.buyoutCount),
      cancels: num(s.cancelCount),
    };
    all.push(metrics);
    rows.push({ metricDate: day, nmId, metrics });
  }
  if (!funnel.truncated && all.length > 0) {
    rows.push({
      metricDate: day,
      nmId: STORE_NM_ID,
      metrics: {
        opens: sumKnown(all.map((m) => m.opens)),
        carts: sumKnown(all.map((m) => m.carts)),
        orders: sumKnown(all.map((m) => m.orders)),
        orderSum: sumKnown(all.map((m) => m.orderSum)),
        buyouts: sumKnown(all.map((m) => m.buyouts)),
        cancels: sumKnown(all.map((m) => m.cancels)),
      },
    });
  }
  return rows;
}

/** Остатки на день снимка: добавляются в метрики того же дня, не затирая воронку. */
export function stockByNm(report: SellerStocksReportSnapshot): Map<string, number> {
  const out = new Map<string, number>();
  if (report.error || report.status === "error" || report.status === "rate_limited" || report.status === "forbidden" || report.status === "jam_required") return out;
  for (const [nmId, nm] of Object.entries(report.byNm)) if (nm.stockCount != null && Number.isFinite(nm.stockCount)) out.set(nmId, nm.stockCount);
  return out;
}

export type HistoryPoint = { date: string } & DailyMetrics;

export type HistoryMetric = "orders" | "opens" | "carts" | "orderSum" | "cartConv" | "orderConv";

/** Значение метрики за день. Конверсии считаются из сохранённых чисел дня; нет базы (ноль просмотров или корзин) — null, не 0. */
export function metricValue(p: HistoryPoint, metric: HistoryMetric): number | null {
  const ratio = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null || b <= 0 ? null : (a / b) * 100);
  switch (metric) {
    case "orders": return p.orders;
    case "opens": return p.opens;
    case "carts": return p.carts;
    case "orderSum": return p.orderSum;
    case "cartConv": return ratio(p.carts, p.opens);
    case "orderConv": return ratio(p.orders, p.carts);
  }
}

/** Ряд магазина по дням из строк БД: только реально сохранённые дни, пропуски не заполняются нулями. */
export function storeSeries(rows: Array<{ metric_date: string; nm_id: string; metrics: DailyMetrics }>): HistoryPoint[] {
  return rows
    .filter((r) => r.nm_id === STORE_NM_ID)
    .map((r) => ({ date: r.metric_date, ...r.metrics }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
