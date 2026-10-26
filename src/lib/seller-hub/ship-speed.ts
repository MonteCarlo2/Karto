/**
 * Скорость отгрузки FBS: сколько проходит от появления заказа до передачи поставки в доставку.
 * Всё считается по реальным датам WB: createdAt задания и closedAt поставки. Ничего не оцениваем.
 * Если у поставки нет даты закрытия или задания пришли без даты — они в расчёт не входят.
 */

export type SupplyOrdersInput = {
  supplyId: string;
  supplyName?: string;
  /** Когда поставку передали в доставку (closedAt WB). */
  closedAt: string;
  orders: Array<{ id: number; createdAt?: string; nmId?: number; article?: string }>;
};

export type SupplySpeed = {
  supplyId: string;
  supplyName?: string;
  closedAt: string;
  orders: number;
  /** Среднее время «заказ → передача в доставку» по поставке, часы. */
  avgHours: number;
  /** Самый долгий заказ в поставке, часы. */
  maxHours: number;
};

export type ShipBucket = { id: "h6" | "h12" | "h24" | "h48" | "over"; label: string; count: number };

export type ShipSpeed = {
  orders: number;
  supplies: number;
  avgHours: number;
  medianHours: number;
  p90Hours: number;
  buckets: ShipBucket[];
  /** Доля заказов, переданных в доставку дольше чем за 24 часа, 0–1. */
  over24Share: number;
  perSupply: SupplySpeed[];
  /** Медиана за последние 7 суток и за 7 суток до них; null — мало данных. */
  trend: { recentMedian: number; previousMedian: number } | null;
  /** Ритм по дням недели (по Москве, 0 — понедельник): когда закрываете поставки и сколько ждут заказы, пришедшие в этот день. */
  weekdays: WeekdayShipping[];
};

export type WeekdayShipping = {
  index: number;
  /** Сколько поставок из выборки закрыто в этот день недели. */
  suppliesClosed: number;
  /** Сколько заказов из выборки пришло в этот день недели. */
  ordersCreated: number;
  /** Типичное ожидание заказов этого дня до передачи в доставку, часы; null — мало заказов (меньше MIN_WEEKDAY_ORDERS). */
  medianWait: number | null;
};

/** Меньше стольких заказов в день недели — типичное ожидание по нему не показываем. */
export const MIN_WEEKDAY_ORDERS = 3;

const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Moscow", weekday: "short" });
/** День недели по Москве: 0 — понедельник … 6 — воскресенье. */
export const mskWeekday = (ms: number): number => WEEKDAY_INDEX[weekdayFmt.format(ms)] ?? 0;

const round1 = (n: number) => Math.round(n * 10) / 10;

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

const MIN_TREND_ORDERS = 5;

export function buildShipSpeed(inputs: SupplyOrdersInput[], nowMs: number): ShipSpeed | null {
  const all: Array<{ hours: number; closedMs: number; createdMs: number }> = [];
  const perSupply: SupplySpeed[] = [];

  for (const supply of inputs) {
    const closedMs = Date.parse(supply.closedAt);
    if (!Number.isFinite(closedMs)) continue;
    const hours: number[] = [];
    const createdList: number[] = [];
    for (const order of supply.orders) {
      const created = order.createdAt ? Date.parse(order.createdAt) : NaN;
      if (!Number.isFinite(created) || created > closedMs) continue;
      hours.push((closedMs - created) / 3_600_000);
      createdList.push(created);
    }
    if (hours.length === 0) continue;
    hours.forEach((h, i) => all.push({ hours: h, closedMs, createdMs: createdList[i]! }));
    perSupply.push({
      supplyId: supply.supplyId,
      supplyName: supply.supplyName,
      closedAt: supply.closedAt,
      orders: hours.length,
      avgHours: round1(hours.reduce((a, b) => a + b, 0) / hours.length),
      maxHours: round1(Math.max(...hours)),
    });
  }
  if (all.length === 0) return null;

  const sorted = all.map((x) => x.hours).sort((a, b) => a - b);
  const count = (pred: (h: number) => boolean) => sorted.filter(pred).length;
  const buckets: ShipBucket[] = [
    { id: "h6", label: "до 6 ч", count: count((h) => h <= 6) },
    { id: "h12", label: "6–12 ч", count: count((h) => h > 6 && h <= 12) },
    { id: "h24", label: "12–24 ч", count: count((h) => h > 12 && h <= 24) },
    { id: "h48", label: "1–2 суток", count: count((h) => h > 24 && h <= 48) },
    { id: "over", label: "дольше 2 суток", count: count((h) => h > 48) },
  ];

  const week = 7 * 86_400_000;
  const recent = all.filter((x) => nowMs - x.closedMs <= week).map((x) => x.hours).sort((a, b) => a - b);
  const previous = all.filter((x) => nowMs - x.closedMs > week && nowMs - x.closedMs <= 2 * week).map((x) => x.hours).sort((a, b) => a - b);
  const trend =
    recent.length >= MIN_TREND_ORDERS && previous.length >= MIN_TREND_ORDERS
      ? { recentMedian: round1(quantile(recent, 0.5)), previousMedian: round1(quantile(previous, 0.5)) }
      : null;

  const weekdays: WeekdayShipping[] = Array.from({ length: 7 }, (_, index) => {
    const waits = all.filter((x) => mskWeekday(x.createdMs) === index).map((x) => x.hours).sort((a, b) => a - b);
    return {
      index,
      suppliesClosed: perSupply.filter((s) => mskWeekday(Date.parse(s.closedAt)) === index).length,
      ordersCreated: waits.length,
      medianWait: waits.length >= MIN_WEEKDAY_ORDERS ? round1(quantile(waits, 0.5)) : null,
    };
  });

  return {
    orders: sorted.length,
    supplies: perSupply.length,
    avgHours: round1(sorted.reduce((a, b) => a + b, 0) / sorted.length),
    medianHours: round1(quantile(sorted, 0.5)),
    p90Hours: round1(quantile(sorted, 0.9)),
    buckets,
    over24Share: count((h) => h > 24) / sorted.length,
    perSupply: perSupply.sort((a, b) => b.closedAt.localeCompare(a.closedAt)),
    trend,
    weekdays,
  };
}
