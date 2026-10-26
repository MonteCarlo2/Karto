import { isCanceledOrder } from "@/lib/seller-hub/orders-insights";
import { canCancelFbsOrder, ordersSpanDays } from "@/lib/seller-hub/fbs-actions";
import type { SellerOrderRow } from "@/lib/seller-hub/types";

/**
 * Заказы FBS в разрезе товара: сколько заказали, сколько отменили, сколько ждёт отгрузки и на сколько дней хватит своего склада.
 * Только заказы WB и остаток из каталога кабинета; спрос — заказы без отмен за фактически охваченные дни (не больше 7).
 */

export type ProductOrderRow = {
  nmId: string;
  title: string;
  article: string;
  orders: number;
  canceled: number;
  /** Ждут отгрузки: новые и на сборке. */
  waiting: number;
  inDelivery: number;
  sold: number;
  revenue: number;
  /** Заказов без отмен в день. */
  dailyDemand: number;
  stockFbs: number | null;
  /** На сколько дней хватит остатка своего склада; null — остаток неизвестен или спроса нет. */
  coverDays: number | null;
};

type Item = { externalId: string; title: string; vendorCode?: string; stockFbs?: number | null };

export function buildOrdersByProduct(orders: SellerOrderRow[], items: Item[], nowMs: number): ProductOrderRow[] {
  if (orders.length === 0) return [];
  const spanDays = ordersSpanDays(orders, nowMs) || 1;
  const itemOf = new Map(items.map((i) => [i.externalId, i]));
  const map = new Map<string, ProductOrderRow>();

  for (const o of orders) {
    if (o.nmId == null) continue;
    const key = String(o.nmId);
    const item = itemOf.get(key);
    const row =
      map.get(key) ??
      {
        nmId: key,
        title: item?.title || o.article || `Артикул ${key}`,
        article: item?.vendorCode || o.article || "",
        orders: 0,
        canceled: 0,
        waiting: 0,
        inDelivery: 0,
        sold: 0,
        revenue: 0,
        dailyDemand: 0,
        stockFbs: item?.stockFbs ?? null,
        coverDays: null,
      };
    row.orders += 1;
    if (isCanceledOrder(o)) row.canceled += 1;
    else {
      row.revenue += o.price ?? 0;
      if (o.wbStatus === "sold") row.sold += 1;
      else if (canCancelFbsOrder(o)) row.waiting += 1;
      else row.inDelivery += 1;
    }
    map.set(key, row);
  }

  return [...map.values()]
    .map((row) => {
      const active = row.orders - row.canceled;
      const dailyDemand = Math.round((active / spanDays) * 100) / 100;
      const coverDays = row.stockFbs != null && dailyDemand > 0 ? Math.round((row.stockFbs / dailyDemand) * 10) / 10 : null;
      return { ...row, dailyDemand, coverDays };
    })
    .sort((a, b) => b.orders - a.orders || b.revenue - a.revenue);
}
