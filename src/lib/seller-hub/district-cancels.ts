import { normalizeDistrict } from "@/lib/seller-hub/logistics";
import type { SellerRegionOrdersRow } from "@/lib/seller-hub/types";

/**
 * Где покупатели отменяют заказы чаще. Заказы по округам покупателей из отчёта «Заказы» WB: всего и отменённых.
 * Причину отмены WB не сообщает; частые отмены в дальних округах обычно связаны с долгой доставкой, и это только наблюдение.
 */

/** Меньше стольких заказов в округе — доля отмен случайна. */
export const MIN_DISTRICT_ORDERS = 10;
/** Минимум отмен и во сколько раз выше среднего по магазину, чтобы выделить округ. */
export const MIN_DISTRICT_CANCELS = 3;
export const CANCEL_ABOVE_SHOP = 1.5;

export type DistrictCancel = {
  district: string;
  orders: number;
  cancelled: number;
  /** Доля отмен, 0–1. */
  cancelShare: number;
  /** Округ с заметно повышенной долей отмен. */
  high: boolean;
};

export function districtCancels(rows: SellerRegionOrdersRow[]): { shopShare: number | null; districts: DistrictCancel[] } {
  const acc = new Map<string, { orders: number; cancelled: number }>();
  let orders = 0;
  let cancelled = 0;
  for (const row of rows) {
    const district = normalizeDistrict(row.district) || "Не определён";
    const cur = acc.get(district) ?? { orders: 0, cancelled: 0 };
    cur.orders += row.orders;
    cur.cancelled += row.cancelled;
    acc.set(district, cur);
    orders += row.orders;
    cancelled += row.cancelled;
  }
  const shopShare = orders > 0 ? cancelled / orders : null;
  const districts: DistrictCancel[] = [...acc.entries()]
    .filter(([, v]) => v.orders >= MIN_DISTRICT_ORDERS)
    .map(([district, v]) => {
      const cancelShare = v.cancelled / v.orders;
      return {
        district,
        orders: v.orders,
        cancelled: v.cancelled,
        cancelShare,
        high: shopShare != null && v.cancelled >= MIN_DISTRICT_CANCELS && cancelShare >= shopShare * CANCEL_ABOVE_SHOP,
      };
    })
    .sort((a, b) => b.cancelShare - a.cancelShare || b.orders - a.orders);
  return { shopShare, districts };
}
