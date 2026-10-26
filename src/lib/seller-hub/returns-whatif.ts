import { productUnitSaleEconomics } from "@/lib/seller-hub/product-unit-sale";
import type { SellerPaidStorageSnapshot, SellerRealizationSnapshot } from "@/lib/seller-hub/types";

/**
 * «Что если вдвое меньше возвратов»: сколько в месяц вы сохранили бы на логистике по каждому товару.
 * Берём утверждённую маржу на 1 продажу (она же в «Товарах» и «Задачах»), считаем её дважды — с реальными возвратами за 90 дней и с вдвое
 * меньшим числом возвратов и их стоимостью — и умножаем разницу на темп чистых продаж. Это гипотеза, а не прогноз:
 * считается только экономия на логистике, выручка с сохранённых продаж не добавляется (оценка заведомо осторожная).
 */

/** Меньше стольких доставок за 90 дней — доля возвратов случайна. */
export const WHATIF_MIN_DELIVERIES = 15;
/** Меньше стольких возвратов — улучшать нечего. */
export const WHATIF_MIN_RETURNS = 3;
/** Во сколько раз сокращаем возвраты в гипотезе. */
export const WHATIF_FACTOR = 0.5;

export type ReturnsWhatIf = {
  nmId: string;
  title: string;
  deliveries90: number;
  returns90: number;
  returnRate: number;
  /** Прибыль на 1 продажу сейчас и в гипотезе, ₽. */
  profitNow: number;
  profitWhatIf: number;
  /** Чистых продаж в месяц (по темпу за 90 дней). */
  salesPerMonth: number;
  /** Экономия в месяц, ₽. */
  gainPerMonth: number;
};

type Item = { externalId: string; title?: string; vendorCode?: string; costPrice?: number | null; discountedPrice?: number | null; stockFbo?: number | null };

export function buildReturnsWhatIf(input: {
  realization: SellerRealizationSnapshot | null | undefined;
  paidStorage: SellerPaidStorageSnapshot | null | undefined;
  items: Item[];
}): ReturnsWhatIf[] {
  const { realization } = input;
  if (!realization || realization.error || !realization.delivery90 || !realization.shopDelivery90) return [];
  const out: ReturnsWhatIf[] = [];
  for (const item of input.items) {
    const nmId = item.externalId;
    const d = realization.delivery90[nmId];
    if (!d || d.D < WHATIF_MIN_DELIVERIES || d.R < WHATIF_MIN_RETURNS) continue;
    const price = item.discountedPrice ?? null;
    const cost = item.costPrice ?? null;
    if (price == null || !(price > 0) || cost == null || !(cost > 0)) continue;
    const args = { paidStorage: input.paidStorage, nmId, costPerUnit: cost, taxRatePercent: null, currentPrice: price, stockFbo: item.stockFbo ?? null };
    const now = productUnitSaleEconomics({ realization, ...args });
    if (!now || now.u == null) continue;
    const hypothetical: SellerRealizationSnapshot = {
      ...realization,
      delivery90: { ...realization.delivery90, [nmId]: { ...d, R: d.R * WHATIF_FACTOR, returnCost: d.returnCost * WHATIF_FACTOR } },
    };
    const next = productUnitSaleEconomics({ realization: hypothetical, ...args });
    if (!next || next.u == null) continue;
    const salesPerMonth = (Math.max(0, d.netSalesQty) / 90) * 30;
    const gain = (next.u - now.u) * salesPerMonth;
    if (!(gain > 0)) continue;
    out.push({
      nmId,
      title: item.title || item.vendorCode || nmId,
      deliveries90: d.D,
      returns90: d.R,
      returnRate: d.R / d.D,
      profitNow: Math.round(now.u * 100) / 100,
      profitWhatIf: Math.round(next.u * 100) / 100,
      salesPerMonth: Math.round(salesPerMonth * 10) / 10,
      gainPerMonth: Math.round(gain),
    });
  }
  return out.sort((a, b) => b.gainPerMonth - a.gainPerMonth);
}
