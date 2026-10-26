import type {
  SellerPaidStorageSnapshot,
  SellerRealizationNm,
  SellerRealizationSnapshot,
  SellerRealizationWindow,
} from "@/lib/seller-hub/types";
import {
  computeUnitEconomics,
  emptyWindowTotals,
  resolveStorage,
  type UnitEconomics,
} from "@/lib/seller-hub/unit-economics";

export function windowOf(
  own: SellerRealizationNm | undefined,
  which: "current" | "prior",
): SellerRealizationWindow {
  if (which === "current") {
    if (own?.current) return own.current;
    if (!own) return emptyWindowTotals();
    // Снимок < v4: приближение из retail/net/qty (штрафы внутри net — только fallback).
    return {
      N: own.qty,
      S: own.retail,
      RA: own.retail,
      Pay: own.net,
      L: 0,
      A: 0,
      Pen: 0,
      rebill: 0,
      StRealization: own.storage ?? 0,
    };
  }
  if (own?.prior) return own.prior;
  if (!own) return emptyWindowTotals();
  return {
    N: own.priorQty ?? 0,
    S: own.priorRetail ?? 0,
    RA: own.priorRetail ?? 0,
    Pay: own.priorNet ?? 0,
    L: 0,
    A: 0,
    Pen: 0,
    rebill: 0,
    StRealization: 0,
  };
}

function paidStorageUsable(
  paid: SellerPaidStorageSnapshot | null | undefined,
): boolean {
  return (
    Boolean(paid) &&
    (paid?.version ?? 0) >= 1 &&
    ((paid?.status === "ok" || paid?.status === "pending" || paid?.status === "partial") &&
      Object.keys(paid.byNm).length > 0)
  );
}

/** Окно + хранение без требования себестоимости. */
export function productWindowEconomics(input: {
  realization: SellerRealizationSnapshot | null | undefined;
  paidStorage: SellerPaidStorageSnapshot | null | undefined;
  nmId: string;
  stockFbo: number | null | undefined;
  which?: "current" | "prior";
}): {
  window: SellerRealizationWindow;
  storage: ReturnType<typeof resolveStorage>;
  /** Pay − L − St − A (St=0 если неизвестно — реальный минус только ниже). */
  beforeCostP: number;
} | null {
  if (!input.realization || input.realization.error) return null;
  const which = input.which ?? "current";
  const own = input.realization.byNm[input.nmId];
  const w = windowOf(own, which);
  if (w.N <= 0 && w.S <= 0) return null;
  const paid = input.paidStorage;
  const paidLoaded = paidStorageUsable(paid);
  const paidRub =
    which === "current"
      ? paid?.byNm[input.nmId]?.currentWindowRub ??
        (paidLoaded && paid?.byNm[input.nmId] == null ? 0 : paid?.byNm[input.nmId]?.totalStorageRub ?? null)
      : paid?.byNm[input.nmId]?.priorWindowRub ??
        (paidLoaded && paid?.byNm[input.nmId] == null ? 0 : null);

  const storage = resolveStorage({
    stRealization: w.StRealization,
    paidStorageRub: paidRub,
    paidStorageLoaded: paidLoaded,
    onWbWarehouse: (input.stockFbo ?? 0) > 0,
  });
  const St = storage.St ?? 0;
  const beforeCostP = w.Pay - w.L - St - w.A;
  return { window: w, storage, beforeCostP };
}

export function productUnitEconomics(input: {
  realization: SellerRealizationSnapshot | null | undefined;
  paidStorage: SellerPaidStorageSnapshot | null | undefined;
  nmId: string;
  costPerUnit: number | null | undefined;
  taxRatePercent: number | null | undefined;
  currentPrice: number | null | undefined;
  stockFbo: number | null | undefined;
  which?: "current" | "prior";
}): UnitEconomics | null {
  const base = productWindowEconomics(input);
  if (!base) return null;

  return computeUnitEconomics({
    window: base.window,
    storage: base.storage,
    costPerUnit: input.costPerUnit ?? null,
    taxRatePercent: input.taxRatePercent ?? null,
    currentPrice: input.currentPrice ?? null,
  });
}

/** Средние k / логистика / хранение на 1 шт. по кабинету — только для подписи в Товарах, не для задач. */
export function accountUnitAverages(realization: SellerRealizationSnapshot): {
  k: number;
  logisticsPerUnit: number;
  storagePerUnit: number;
  acceptancePerUnit: number;
  N: number;
  S: number;
} | null {
  let N = 0;
  let S = 0;
  let Fee = 0;
  let L = 0;
  let St = 0;
  let A = 0;
  for (const row of Object.values(realization.byNm)) {
    const w = row.current;
    if (!w || w.N <= 0 || w.S <= 0) continue;
    N += w.N;
    S += w.S;
    Fee += w.S - w.Pay;
    L += w.L;
    St += w.StRealization;
    A += w.A;
  }
  if (N <= 0 || S <= 0) return null;
  return {
    k: Fee / S,
    logisticsPerUnit: L / N,
    storagePerUnit: St / N,
    acceptancePerUnit: A / N,
    N,
    S,
  };
}
