/**
 * Маржа на 1 продажу по доставкам за 90 дней (дополнение к промпту 13).
 * Факт окна Pay−L−St−A−C−Tax не трогаем — он в unit-economics.ts.
 */

export type DeliveryLogisticsAgg = {
  /** Σ deliveryAmount (число доставок к покупателю). */
  D: number;
  /** Σ deliveryService строк с deliveryAmount > 0. */
  deliveryCost: number;
  /** Σ returnAmount. */
  R: number;
  /** Σ deliveryService строк с returnAmount > 0. */
  returnCost: number;
  /** Логистика без deliveryAmount/returnAmount (коррекции). */
  otherL: number;
  /** Выручка продавца S за период (для k). */
  S: number;
  /** К перечислению Pay за период (для k). */
  Pay: number;
  /** Сумма реализации RA (для налога t·ρ·p, ρ=RA/S). */
  RA: number;
  /** Приёмка за период. */
  A: number;
  /** Хранение из строк реализации (обычно 0). */
  StRealization: number;
};

export type ShopDeliveryStats = {
  D: number;
  R: number;
  returnCost: number;
  /** b_shop = 1 − ΣR/ΣD. */
  bShop: number;
  /** r магазина, если у товара R=0. */
  rShop: number;
};

export type UnitSaleEconomicsInput = {
  logistics: DeliveryLogisticsAgg;
  shop: ShopDeliveryStats;
  /** paid_storage за 90 дней по nm; null — неизвестно (FBO), 0 — FBS или нет строк. */
  storageRub90: number | null;
  onWbWarehouse: boolean;
  /** Текущая цена продавца со скидкой. */
  currentPrice: number | null;
  costPerUnit: number | null;
  /**
   * @deprecated Налог в маржу не входит. Параметр игнорируется.
   */
  taxRatePercent?: number | null;
};

export type UnitSaleEconomics = {
  D: number;
  R: number;
  d: number;
  r: number;
  otherPerSale: number;
  b: number;
  bShop: number;
  /** Логистика на 1 продажу. */
  l: number;
  k: number;
  /** ρ = RA/S (справочно; в маржу налог не входит). */
  retailRatio: number;
  s: number | null;
  a: number;
  p: number;
  c: number | null;
  /** Всегда false: налог из маржи убран. */
  taxSpecified: boolean;
  /** u на 1 продажу; без себестоимости — u до c. */
  u: number | null;
  /** u до себестоимости (всегда при D>0 и k). */
  uBeforeCost: number;
  m: number | null;
  mBeforeCost: number;
  breakEvenPrice: number | null;
  breakEvenImpossible: boolean;
  storageExcluded: boolean;
  hasCost: boolean;
};

export function emptyDeliveryAgg(): DeliveryLogisticsAgg {
  return {
    D: 0,
    deliveryCost: 0,
    R: 0,
    returnCost: 0,
    otherL: 0,
    S: 0,
    Pay: 0,
    RA: 0,
    A: 0,
    StRealization: 0,
  };
}

function money(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isReturnOper(oper: string): boolean {
  const lower = oper.toLowerCase();
  return lower.includes("возврат") && !lower.includes("возмещен");
}

function isSaleOper(oper: string): boolean {
  const lower = oper.toLowerCase();
  return lower.includes("продаж") || lower.includes("коррекц");
}

/** Одна строка detailed → агрегаты доставок / S / Pay / A. */
export function absorbDeliveryRow(
  row: Record<string, unknown>,
  bucket: DeliveryLogisticsAgg,
): void {
  const deliveryAmount = money(row.deliveryAmount);
  const returnAmount = money(row.returnAmount);
  const deliveryService = money(row.deliveryService);
  const qty = Math.abs(money(row.quantity));
  const oper = String(row.sellerOperName ?? "");

  if (deliveryAmount > 0) {
    bucket.D += deliveryAmount;
    bucket.deliveryCost += deliveryService;
  } else if (returnAmount > 0) {
    bucket.R += returnAmount;
    bucket.returnCost += deliveryService;
  } else if (deliveryService !== 0) {
    bucket.otherL += deliveryService;
  }

  bucket.A += money(row.paidAcceptance);
  bucket.StRealization += money(row.paidStorage);

  if (isReturnOper(oper)) {
    bucket.S -= money(row.retailPriceWithDisc) * qty;
    bucket.Pay -= money(row.forPay);
    bucket.RA -= money(row.retailAmount);
  } else if (isSaleOper(oper) || (qty > 0 && money(row.retailAmount) > 0)) {
    bucket.S += money(row.retailPriceWithDisc) * qty;
    bucket.Pay += money(row.forPay);
    bucket.RA += money(row.retailAmount);
  }
}

export function shopDeliveryStats(all: DeliveryLogisticsAgg[]): ShopDeliveryStats {
  let D = 0;
  let R = 0;
  let returnCost = 0;
  for (const row of all) {
    D += row.D;
    R += row.R;
    returnCost += row.returnCost;
  }
  const bShop = D > 0 ? 1 - R / D : 0;
  const rShop = R > 0 ? returnCost / R : 0;
  return { D, R, returnCost, bShop, rShop };
}

/**
 * Маржа на 1 продажу. null, если D=0 или нет S для k.
 */
export function computeUnitSaleEconomics(input: UnitSaleEconomicsInput): UnitSaleEconomics | null {
  const { logistics: g, shop, currentPrice, costPerUnit } = input;
  if (!(g.D > 0)) return null;
  if (!(g.S > 0)) return null;
  if (currentPrice == null || !(currentPrice > 0)) return null;

  const d = g.deliveryCost / g.D;
  const r = g.R > 0 ? g.returnCost / g.R : shop.rShop;
  const netDeliveries = g.D - g.R;
  const otherPerSale = netDeliveries > 0 ? g.otherL / netDeliveries : 0;
  const b = (g.D - g.R + 20 * shop.bShop) / (g.D + 20);
  if (!(b > 0)) return null;

  const l = d / b + (r * (1 - b)) / b + otherPerSale;
  const k = (g.S - g.Pay) / g.S;
  const retailRatio = g.S > 0 ? g.RA / g.S : 0;

  let s: number | null;
  let storageExcluded = false;
  if (!input.onWbWarehouse) {
    s = 0;
  } else if (input.storageRub90 != null && netDeliveries > 0) {
    s = input.storageRub90 / netDeliveries;
  } else if (input.storageRub90 != null && netDeliveries <= 0) {
    s = 0;
  } else if (g.StRealization > 0 && netDeliveries > 0) {
    s = g.StRealization / netDeliveries;
  } else {
    s = null;
    storageExcluded = true;
  }

  const a = netDeliveries > 0 ? g.A / netDeliveries : 0;
  const p = currentPrice;
  const sUse = s ?? 0;
  // Маржа = цена − услуги WB − себестоимость. Налог не входит.
  const uBeforeCost = p * (1 - k) - l - sUse - a;
  const hasCost = costPerUnit != null && costPerUnit > 0;
  const c = hasCost ? costPerUnit : null;
  const u = hasCost ? uBeforeCost - (c as number) : null;
  const m = u != null ? u / p : null;
  const mBeforeCost = uBeforeCost / p;

  const F = l + sUse + a + (c ?? 0);
  const denom = 1 - k;
  const breakEvenImpossible = !(denom > 0);
  const breakEvenPrice = hasCost && denom > 0 ? Math.ceil(F / denom) : null;

  return {
    D: g.D,
    R: g.R,
    d,
    r,
    otherPerSale,
    b,
    bShop: shop.bShop,
    l,
    k,
    retailRatio,
    s,
    a,
    p,
    c,
    taxSpecified: false,
    u,
    uBeforeCost,
    m,
    mBeforeCost,
    breakEvenPrice,
    breakEvenImpossible,
    storageExcluded,
    hasCost,
  };
}

/** Деньги под риском: |u| × чистые продажи 28д; если 0 — продажи 90д × 28/90. */
export function unitSaleMoneyAtRisk(input: {
  u: number | null;
  uBeforeCost: number;
  hasCost: boolean;
  netSales28: number | null;
  netSales90: number | null;
}): number {
  const unit = input.hasCost && input.u != null ? Math.abs(input.u) : Math.abs(input.uBeforeCost);
  if (!(unit > 0)) return 0;
  const n28 = input.netSales28 ?? 0;
  if (n28 > 0) return unit * n28;
  const n90 = input.netSales90 ?? 0;
  if (n90 > 0) return unit * n90 * (28 / 90);
  return 0;
}
