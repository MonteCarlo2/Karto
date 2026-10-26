/**
 * Экономика товара за окно отчёта реализации.
 * Источники: строки WB + себестоимость/налог/цель продавца. Без типичных комиссий.
 */

export type RealizationWindowTotals = {
  /** Продано шт. = Σ qty продаж − Σ qty возвратов. */
  N: number;
  /** Выручка по цене продавца (retailPriceWithDisc × qty). */
  S: number;
  /** Сумма реализации WB (retailAmount). */
  RA: number;
  /** К перечислению (forPay продаж − возвратов). */
  Pay: number;
  /** Логистика deliveryService (без rebill). */
  L: number;
  /** Приёмка. */
  A: number;
  /** Разовые: penalty + deduction − additionalPayment. */
  Pen: number;
  /** rebillLogisticCost — только информация, не в P. */
  rebill: number;
  /** Хранение из строк реализации с nmId (обычно 0). */
  StRealization: number;
};

export type StorageResolution = {
  /** null — неизвестно, ноль не подставляем. */
  St: number | null;
  source: "realization" | "paid_storage" | "fbs_zero" | "unknown";
};

export type UnitEconomicsInput = {
  window: RealizationWindowTotals;
  storage: StorageResolution;
  /** Себестоимость за 1 шт., действовавшая в окне. */
  costPerUnit: number | null;
  /**
   * @deprecated Налог в маржу не входит. Параметр игнорируется.
   */
  taxRatePercent?: number | null;
  /** Текущая цена продавца (со скидкой) из каталога. */
  currentPrice: number | null;
};

export type UnitEconomics = {
  N: number;
  S: number;
  RA: number;
  Pay: number;
  Fee: number;
  L: number;
  St: number | null;
  A: number;
  Pen: number;
  rebill: number;
  C: number;
  Tax: number;
  taxSpecified: boolean;
  /** Операционная прибыль (без St, если хранение неизвестно). */
  P: number;
  /** P без хранения (всегда). */
  PWithoutStorage: number;
  u: number;
  m: number;
  /** Маржа без хранения. */
  mWithoutStorage: number;
  k: number;
  r: number;
  F: number;
  breakEvenPrice: number | null;
  breakEvenImpossible: boolean;
  priceForTarget: (g: number) => number | null;
  uNow: number | null;
  storageSource: StorageResolution["source"];
  storageExcluded: boolean;
  costPerUnit: number;
};

export type MarginDecomposition = {
  price: number;
  feeRate: number;
  logistics: number;
  storage: number;
  acceptance: number;
  cost: number;
  tax: number;
  sum: number;
  costTracked: boolean;
};

export function emptyWindowTotals(): RealizationWindowTotals {
  return { N: 0, S: 0, RA: 0, Pay: 0, L: 0, A: 0, Pen: 0, rebill: 0, StRealization: 0 };
}

export function resolveStorage(input: {
  stRealization: number;
  paidStorageRub: number | null;
  paidStorageLoaded: boolean;
  onWbWarehouse: boolean;
}): StorageResolution {
  if (input.stRealization > 0) {
    return { St: input.stRealization, source: "realization" };
  }
  if (input.paidStorageLoaded && input.paidStorageRub != null) {
    return { St: input.paidStorageRub, source: "paid_storage" };
  }
  if (input.paidStorageLoaded && input.paidStorageRub == null) {
    // Отчёт есть, по артикулу строк нет → 0 ₽ хранения в данных.
    return { St: 0, source: "paid_storage" };
  }
  if (!input.onWbWarehouse) {
    return { St: 0, source: "fbs_zero" };
  }
  return { St: null, source: "unknown" };
}

/**
 * Экономика за окно. null, если N≤0 или S≤0, или нет себестоимости.
 */
export function computeUnitEconomics(input: UnitEconomicsInput): UnitEconomics | null {
  const { window: w, storage, costPerUnit, taxRatePercent, currentPrice } = input;
  if (w.N <= 0 || w.S <= 0) return null;
  if (costPerUnit == null || !(costPerUnit > 0)) return null;

  void taxRatePercent;
  const Fee = w.S - w.Pay;
  const Tax = 0;
  const taxSpecified = false;
  const C = costPerUnit * w.N;
  const St = storage.St;
  const storageExcluded = St == null;

  // Маржа окна: Pay − L − St − A − C. Налог не входит.
  const PWithoutStorage = w.Pay - w.L - w.A - C;
  /** При неизвестном хранении P/u/m считаем без St (реальная маржа ниже); задачи 3/5 режутся флагом. */
  const P = storageExcluded ? PWithoutStorage : PWithoutStorage - (St as number);
  const u = P / w.N;
  const m = P / w.S;
  const mWithoutStorage = PWithoutStorage / w.S;
  const k = Fee / w.S;
  const r = w.RA / w.S;

  /** F без хранения: логистика+приёмка+себестоимость; для безубыточности при St=null. */
  const F =
    St == null
      ? (w.L + w.A) / w.N + costPerUnit
      : (w.L + St + w.A) / w.N + costPerUnit;

  const denomBase = 1 - k;
  const breakEvenImpossible = !(denomBase > 0);
  const breakEvenPrice = denomBase > 0 ? Math.ceil(F / denomBase) : null;

  function priceForTarget(g: number): number | null {
    const denom = 1 - k - g;
    if (!(denom > 0)) return null;
    return Math.ceil(F / denom);
  }

  const uNowResolved =
    currentPrice != null && currentPrice > 0 ? currentPrice * denomBase - F : null;

  return {
    N: w.N,
    S: w.S,
    RA: w.RA,
    Pay: w.Pay,
    Fee,
    L: w.L,
    St,
    A: w.A,
    Pen: w.Pen,
    rebill: w.rebill,
    C,
    Tax,
    taxSpecified,
    P,
    PWithoutStorage,
    u,
    m,
    mWithoutStorage,
    k,
    r,
    F,
    breakEvenPrice,
    breakEvenImpossible,
    priceForTarget,
    uNow: uNowResolved,
    storageSource: storage.source,
    storageExcluded,
    costPerUnit,
  };
}

/** Прибыль на 1 шт. при цене p: p·(1−k) − F. Параметры r,t оставлены для совместимости и игнорируются. */
export function unitProfitAtPrice(
  p: number,
  k: number,
  r: number,
  t: number,
  F: number,
): number {
  void r;
  void t;
  return p * (1 - k) - F;
}

/**
 * Разложение u₂ − u₁. Сумма слагаемых = Δu с точностью до 0.01.
 * p = S/N, l=L/N, s=St/N, a=A/N, c=cost, x=Tax/N, k=Fee/S.
 */
export function decomposeMarginChange(input: {
  prev: UnitEconomics;
  curr: UnitEconomics;
  costTracked: boolean;
}): MarginDecomposition | null {
  const a = input.prev;
  const b = input.curr;
  if (a.N <= 0 || b.N <= 0 || a.St == null || b.St == null || a.storageExcluded || b.storageExcluded) {
    return null;
  }
  const p1 = a.S / a.N;
  const p2 = b.S / b.N;
  const k1 = a.k;
  const k2 = b.k;
  const l1 = a.L / a.N;
  const l2 = b.L / b.N;
  const s1 = a.St / a.N;
  const s2 = b.St / b.N;
  const a1 = a.A / a.N;
  const a2 = b.A / b.N;
  const c1 = a.costPerUnit;
  const c2 = b.costPerUnit;
  const x1 = a.Tax / a.N;
  const x2 = b.Tax / b.N;

  const price = (p2 - p1) * (1 - k1);
  const feeRate = -(k2 - k1) * p2;
  const logistics = -(l2 - l1);
  const storage = -(s2 - s1);
  const acceptance = -(a2 - a1);
  const cost = input.costTracked ? -(c2 - c1) : 0;
  const tax = -(x2 - x1);
  const sum = price + feeRate + logistics + storage + acceptance + cost + tax;

  return {
    price,
    feeRate,
    logistics,
    storage,
    acceptance,
    cost,
    tax,
    sum,
    costTracked: input.costTracked,
  };
}

/** Деньги под риском при ухудшении маржи. */
export function deteriorationMoneyAtRisk(input: {
  decomp: MarginDecomposition;
  P1: number;
  P2: number;
  N2: number;
}): number {
  const { decomp, P1, P2, N2 } = input;
  const ext = decomp.feeRate + decomp.logistics + decomp.storage + decomp.acceptance + decomp.cost + decomp.tax;
  const priceLoss = P2 < P1 ? Math.max(0, -decomp.price) : 0;
  return (Math.max(0, -ext) + priceLoss) * N2;
}

/** Сверка отчёта: Σ(Pay − L − St − A − Pen) по товарам + без nm = bankPaymentSum. rebill не входит. */
export function reconcileBankPayment(input: {
  byNm: Array<{ Pay: number; L: number; St: number; A: number; Pen: number }>;
  noNm: { Pay: number; L: number; St: number; A: number; Pen: number };
  bankPaymentSum: number;
}): { sum: number; bank: number; delta: number; ok: boolean } {
  let sum = input.noNm.Pay - input.noNm.L - input.noNm.St - input.noNm.A - input.noNm.Pen;
  for (const row of input.byNm) {
    sum += row.Pay - row.L - row.St - row.A - row.Pen;
  }
  const delta = Math.round((sum - input.bankPaymentSum) * 100) / 100;
  return {
    sum: Math.round(sum * 100) / 100,
    bank: input.bankPaymentSum,
    delta,
    ok: Math.abs(delta) < 0.02,
  };
}
