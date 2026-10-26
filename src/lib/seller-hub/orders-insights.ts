import { moscowDateKey } from "@/lib/seller-hub/complete-days";
import type { SellerOrderRow } from "@/lib/seller-hub/types";

/**
 * Что видно по потоку FBS-заказов: ритм, что ждёт отгрузки, отмены, на чём держится оборот.
 * Только данные заказов WB. Сроков отгрузки WB мы не знаем и не придумываем: показываем возраст самого старого
 * неотгруженного заказа в часах, оценку «опаздываете или нет» продавец делает по правилам своего склада.
 */

export function isCanceledOrder(row: Pick<SellerOrderRow, "supplierStatus" | "wbStatus">): boolean {
  const supplier = row.supplierStatus ?? "";
  const wb = row.wbStatus ?? "";
  return supplier === "cancel" || supplier === "cancel_carrier" || wb.startsWith("cancel") || wb === "declined_by_client";
}

const isWaiting = (row: SellerOrderRow): boolean => {
  if (isCanceledOrder(row)) return false;
  const supplier = row.supplierStatus ?? "";
  const wb = row.wbStatus ?? "";
  if (wb === "sold" || wb === "sorted" || wb === "ready_for_pickup") return false;
  return supplier === "" || supplier === "new" || supplier === "confirm";
};

export type OrderDay = { date: string; count: number; sum: number; partial: boolean };
export type OrderProduct = { nmId: string; orders: number; sum: number; canceled: number };

export type OrdersInsights = {
  total: number;
  canceled: number;
  /** Доля отмен, 0–1. */
  cancelShare: number;
  /** Заказы, которые ещё не ушли в доставку. */
  waiting: { count: number; oldestHours: number | null; newCount: number; assemblyCount: number };
  /** По дням, самый старый первым. Сегодняшний день помечен как неполный. */
  daily: OrderDay[];
  /** Часы суток по Москве, в которые чаще всего приходят заказы. Пусто, если заказов мало. */
  peakHours: Array<{ hour: number; count: number }>;
  products: OrderProduct[];
  /** Сколько артикулов дают 80% заказов. */
  concentration: { products: number; of: number } | null;
  avgCheck: number | null;
  /** Артикулы с повторяющимися отменами: 2 и больше отмен и доля отмен выше средней по магазину. */
  cancelHot: OrderProduct[];
};

/** Меньше стольких заказов: часы пиков не показываем, это шум. */
const MIN_FOR_HOURS = 20;

export function buildOrdersInsights(rows: SellerOrderRow[], nowMs: number): OrdersInsights | null {
  if (rows.length === 0) return null;
  const today = moscowDateKey(nowMs);
  const dayMap = new Map<string, OrderDay>();
  const hourMap = new Map<number, number>();
  const productMap = new Map<string, OrderProduct>();
  let canceled = 0;
  let sumAll = 0;
  let countForCheck = 0;
  let newCount = 0;
  let assemblyCount = 0;
  let waitingCount = 0;
  let oldestMs: number | null = null;

  for (const row of rows) {
    const isCancel = isCanceledOrder(row);
    if (isCancel) canceled += 1;
    const created = row.createdAt ? Date.parse(row.createdAt) : NaN;
    if (Number.isFinite(created)) {
      const date = moscowDateKey(created);
      const day = dayMap.get(date) ?? { date, count: 0, sum: 0, partial: date === today };
      day.count += 1;
      day.sum += row.price ?? 0;
      dayMap.set(date, day);
      const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow", hour: "2-digit", hour12: false }).format(created)) % 24;
      hourMap.set(hour, (hourMap.get(hour) ?? 0) + 1);
    }
    if (row.nmId != null) {
      const key = String(row.nmId);
      const p = productMap.get(key) ?? { nmId: key, orders: 0, sum: 0, canceled: 0 };
      p.orders += 1;
      p.sum += row.price ?? 0;
      if (isCancel) p.canceled += 1;
      productMap.set(key, p);
    }
    if (!isCancel && row.price != null) {
      sumAll += row.price;
      countForCheck += 1;
    }
    if (isWaiting(row)) {
      waitingCount += 1;
      if ((row.supplierStatus ?? "") === "confirm") assemblyCount += 1;
      else newCount += 1;
      if (Number.isFinite(created) && (oldestMs == null || created < oldestMs)) oldestMs = created;
    }
  }

  const products = [...productMap.values()].sort((a, b) => b.orders - a.orders || b.sum - a.sum);
  let concentration: OrdersInsights["concentration"] = null;
  if (products.length >= 3 && rows.length >= 10) {
    let acc = 0;
    let n = 0;
    for (const p of products) {
      acc += p.orders;
      n += 1;
      if (acc >= rows.length * 0.8) break;
    }
    concentration = { products: n, of: products.length };
  }
  const cancelShare = canceled / rows.length;
  const hours = [...hourMap.entries()].map(([hour, count]) => ({ hour, count })).sort((a, b) => b.count - a.count || a.hour - b.hour);

  return {
    total: rows.length,
    canceled,
    cancelShare,
    waiting: {
      count: waitingCount,
      oldestHours: oldestMs == null ? null : Math.max(0, Math.round(((nowMs - oldestMs) / 3_600_000) * 10) / 10),
      newCount,
      assemblyCount,
    },
    daily: [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    peakHours: rows.length >= MIN_FOR_HOURS ? hours.slice(0, 3) : [],
    products,
    concentration,
    avgCheck: countForCheck > 0 ? Math.round(sumAll / countForCheck) : null,
    cancelHot: products.filter((p) => p.canceled >= 2 && p.canceled / p.orders > cancelShare),
  };
}
