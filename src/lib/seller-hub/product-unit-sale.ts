import type {
  SellerPaidStorageSnapshot,
  SellerRealizationDelivery90,
  SellerRealizationSnapshot,
} from "@/lib/seller-hub/types";
import {
  computeUnitSaleEconomics,
  type DeliveryLogisticsAgg,
  type UnitSaleEconomics,
} from "@/lib/seller-hub/unit-sale-economics";

function asAgg(row: SellerRealizationDelivery90 | undefined): DeliveryLogisticsAgg | null {
  if (!row || !(row.D > 0)) return null;
  return {
    D: row.D,
    deliveryCost: row.deliveryCost,
    R: row.R,
    returnCost: row.returnCost,
    otherL: row.otherL,
    S: row.S,
    Pay: row.Pay,
    RA: row.RA,
    A: row.A,
    StRealization: row.StRealization,
  };
}

function storageRub90(
  paid: SellerPaidStorageSnapshot | null | undefined,
  nmId: string,
): number | null {
  if (!paid || (paid.version ?? 0) < 1) return null;
  // pending/partial/ok: берём последний успешный byNm, пока новый отчёт догружается.
  if (!(paid.status === "ok" || paid.status === "partial" || paid.status === "pending")) return null;
  if (Object.keys(paid.byNm).length === 0) return null;
  const row = paid.byNm[nmId];
  if (!row) return 0;
  // current+prior окна paid_storage ≈ 56д; если загружено — сумма доступных окон.
  const cur = row.currentWindowRub;
  const prior = row.priorWindowRub;
  if (cur != null || prior != null) return (cur ?? 0) + (prior ?? 0);
  return row.totalStorageRub ?? 0;
}

/** Маржа на 1 продажу за 90 дней доставок. */
export function productUnitSaleEconomics(input: {
  realization: SellerRealizationSnapshot | null | undefined;
  paidStorage: SellerPaidStorageSnapshot | null | undefined;
  nmId: string;
  costPerUnit: number | null | undefined;
  taxRatePercent: number | null | undefined;
  currentPrice: number | null | undefined;
  stockFbo: number | null | undefined;
}): UnitSaleEconomics | null {
  if (!input.realization || input.realization.error) return null;
  const d90 = input.realization.delivery90?.[input.nmId];
  const logistics = asAgg(d90);
  if (!logistics) return null;
  const shop = input.realization.shopDelivery90;
  if (!shop) return null;
  return computeUnitSaleEconomics({
    logistics,
    shop: {
      D: shop.D,
      R: shop.R,
      returnCost: shop.returnCost,
      bShop: shop.bShop,
      rShop: shop.rShop,
    },
    storageRub90: storageRub90(input.paidStorage, input.nmId),
    onWbWarehouse: (input.stockFbo ?? 0) > 0,
    currentPrice: input.currentPrice ?? null,
    costPerUnit: input.costPerUnit ?? null,
    taxRatePercent: input.taxRatePercent ?? null,
  });
}

/**
 * Маржа на 1 продажу по доставкам окна 28д при b и b_shop за 90д.
 * Для DETERIORATION: одно сглаживание выкупа, разные d/r/k окон.
 */
export function productUnitSaleEconomicsForWindow(input: {
  realization: SellerRealizationSnapshot | null | undefined;
  paidStorage: SellerPaidStorageSnapshot | null | undefined;
  nmId: string;
  which: "current" | "prior";
  costPerUnit: number | null | undefined;
  taxRatePercent: number | null | undefined;
  currentPrice: number | null | undefined;
  stockFbo: number | null | undefined;
}): UnitSaleEconomics | null {
  if (!input.realization || input.realization.error) return null;
  const own = input.realization.byNm[input.nmId];
  const row = input.which === "current" ? own?.delivery : own?.priorDelivery;
  const logistics = asAgg(row);
  if (!logistics) return null;
  const shop = input.realization.shopDelivery90;
  if (!shop) return null;
  // Хранение на окно: доля paid_storage окна / (D−R) окна.
  const paid = input.paidStorage;
  let storageRub: number | null = null;
  if (
    paid &&
    (paid.status === "ok" || paid.status === "partial" || paid.status === "pending") &&
    Object.keys(paid.byNm).length > 0
  ) {
    const p = paid.byNm[input.nmId];
    if (!p) storageRub = 0;
    else {
      storageRub =
        input.which === "current"
          ? p.currentWindowRub ?? p.totalStorageRub ?? 0
          : p.priorWindowRub ?? 0;
    }
  }
  return computeUnitSaleEconomics({
    logistics,
    shop: {
      D: shop.D,
      R: shop.R,
      returnCost: shop.returnCost,
      bShop: shop.bShop,
      rShop: shop.rShop,
    },
    storageRub90: storageRub,
    onWbWarehouse: (input.stockFbo ?? 0) > 0,
    currentPrice: input.currentPrice ?? null,
    costPerUnit: input.costPerUnit ?? null,
    taxRatePercent: input.taxRatePercent ?? null,
  });
}
