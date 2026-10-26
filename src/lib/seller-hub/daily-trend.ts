import type { SellerRegionDailyOrders } from "@/lib/seller-hub/types";

/**
 * Динамика заказов по дням за длинный период (отчёт «Заказы» WB). Сегодняшний неполный день не сравниваем с законченными.
 * «Заказы без отмен» = заказы − отменённые; сумма — по цене продавца (priceWithDisc) без отменённых.
 * В ответе WB нет дней без заказов, поэтому ряд дополняется нулями от первого дня периода: иначе среднее и половины периода считались бы по неверному числу дней.
 */

export type TrendDay = SellerRegionDailyOrders & { net: number; partial: boolean };

export type DailyTrend = {
  days: TrendDay[];
  /** Законченные дни периода, включая дни без заказов. */
  completeDays: number;
  totals: { orders: number; cancelled: number; net: number; sum: number; cancelShare: number | null; avgPerDay: number; avgCheck: number | null };
  /** Вторая половина периода против первой, по равному числу законченных дней; null — мало дней. */
  halves: { first: { net: number; sum: number }; second: { net: number; sum: number }; days: number; netChange: number | null; sumChange: number | null } | null;
  best: TrendDay | null;
  worst: TrendDay | null;
};

/** Меньше стольких законченных дней — половины периода сравнивать нельзя. */
export const MIN_DAYS_FOR_HALVES = 14;

const pct = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

const DAY_MS = 86_400_000;
const addDays = (key: string, delta: number) => new Date(Date.parse(`${key}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);

/** Все даты от from до to включительно. */
function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * @param dateFrom первый день запрошенного периода; если не задан, ряд начинается с первого дня, в котором были заказы.
 * @param todayKey сегодняшняя дата по Москве: этот день считается неполным.
 */
export function buildDailyTrend(daily: SellerRegionDailyOrders[] | undefined, todayKey: string, dateFrom?: string): DailyTrend | null {
  if (!daily || daily.length === 0) return null;
  const byDate = new Map(daily.map((d) => [d.date, d]));
  const start = dateFrom && dateFrom < daily[0]!.date ? dateFrom : daily[0]!.date;
  const end = daily.at(-1)!.date > todayKey ? daily.at(-1)!.date : todayKey;
  const days: TrendDay[] = dateRange(start, end).map((date) => {
    const row = byDate.get(date) ?? { date, orders: 0, cancelled: 0, sum: 0 };
    return { ...row, net: row.orders - row.cancelled, partial: date >= todayKey };
  });
  const complete = days.filter((d) => !d.partial);
  if (complete.length === 0) return null;
  const orders = complete.reduce((s, d) => s + d.orders, 0);
  const cancelled = complete.reduce((s, d) => s + d.cancelled, 0);
  const net = orders - cancelled;
  const sum = complete.reduce((s, d) => s + d.sum, 0);
  let halves: DailyTrend["halves"] = null;
  if (complete.length >= MIN_DAYS_FOR_HALVES) {
    // Половины одинаковой длины: при нечётном числе дней самый старый отбрасываем, иначе вторая половина длиннее и «растёт» сама по себе.
    const usable = complete.length % 2 === 0 ? complete : complete.slice(1);
    const half = usable.length / 2;
    const agg = (list: TrendDay[]) => ({ net: list.reduce((s, d) => s + d.net, 0), sum: list.reduce((s, d) => s + d.sum, 0) });
    const first = agg(usable.slice(0, half));
    const second = agg(usable.slice(half));
    halves = { first, second, days: half, netChange: pct(second.net, first.net), sumChange: pct(second.sum, first.sum) };
  }
  const ranked = [...complete].sort((x, y) => y.sum - x.sum || y.net - x.net);
  return {
    days,
    completeDays: complete.length,
    totals: { orders, cancelled, net, sum, cancelShare: orders > 0 ? cancelled / orders : null, avgPerDay: net / complete.length, avgCheck: net > 0 ? sum / net : null },
    halves,
    best: ranked[0] ?? null,
    worst: ranked.length > 1 ? ranked[ranked.length - 1]! : null,
  };
}
