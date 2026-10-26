import type { SellerOrderRow, SellerSupplyRow } from "@/lib/seller-hub/types";
import { isCanceledOrder } from "@/lib/seller-hub/orders-insights";

/** Правила действий над сборочными заданиями FBS. Только то, что WB позволяет на каждом этапе. */

const supplierOf = (row: Pick<SellerOrderRow, "supplierStatus">) => row.supplierStatus ?? "";
const wbOf = (row: Pick<SellerOrderRow, "wbStatus">) => row.wbStatus ?? "";

/** Новое задание: его можно добавить в поставку. */
export function isNewFbsOrder(row: SellerOrderRow): boolean {
  if (isCanceledOrder(row)) return false;
  if (wbOf(row) === "sold") return false;
  const supplier = supplierOf(row);
  return supplier === "" || supplier === "new";
}

/** Отменить можно, пока заказ не ушёл в доставку: новый или на сборке. */
export function canCancelFbsOrder(row: SellerOrderRow): boolean {
  if (isCanceledOrder(row)) return false;
  const wb = wbOf(row);
  if (wb === "sold" || wb === "sorted" || wb === "ready_for_pickup") return false;
  const supplier = supplierOf(row);
  return supplier === "" || supplier === "new" || supplier === "confirm";
}

/** Сколько часов заказ ждёт отгрузки. null — отгрузка не ждёт или время создания неизвестно. */
export function waitingHours(row: SellerOrderRow, nowMs: number): number | null {
  if (!canCancelFbsOrder(row)) return null;
  const created = row.createdAt ? Date.parse(row.createdAt) : NaN;
  if (!Number.isFinite(created)) return null;
  return Math.max(0, Math.round(((nowMs - created) / 3_600_000) * 10) / 10);
}

/**
 * Сколько суток охватывают заказы (от самого раннего до «сейчас», не меньше суток). Нужен для среднего спроса в день.
 * Обрезки сверху нет: если в выгрузке больше недели, спрос считается честно на весь охваченный срок.
 */
export function ordersSpanDays(orders: SellerOrderRow[], nowMs: number): number {
  const times = orders.map((o) => (o.createdAt ? Date.parse(o.createdAt) : NaN)).filter(Number.isFinite);
  if (times.length === 0) return 0;
  return Math.max(1, (nowMs - Math.min(...times)) / 86_400_000);
}

/** Открытые FBS-поставки, в которые ещё можно добавлять задания, самые свежие первыми. */
export function openFbsSupplies(supplies: SellerSupplyRow[] | undefined): SellerSupplyRow[] {
  return (supplies ?? [])
    .filter((row) => row.type === "fbs" && !row.done)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}
