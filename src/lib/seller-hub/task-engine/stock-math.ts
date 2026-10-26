/**
 * Спрос в день, доступный запас, страховой запас — стандарт §3.1–3.3.
 * Поля stocks-report (в пути, упущенные) опциональны: нет в снимке → осторожная оценка.
 */

export type DemandBasis =
  | "дни наличия"
  | "заказы / 28 без обнуления"
  | "прошлое окно воронки"
  | "orders_56d"
  | "неизвестно";

export type DailyDemandResult = {
  demandPerDay: number | null;
  basis: DemandBasis;
  daysInStock: number | null;
  ordersInStockDays: number | null;
};

/**
 * Спрос в день.
 * Если известны дни наличия и заказы в них — делим.
 * Иначе: без обнуления в окне → orders/28; с обнулением → pastOrdersPerDay.
 * Текущее 0 и прошлое > 0 без OOS → (текущие+прошлые)/56.
 */
export function dailyDemand(input: {
  orders28: number | null;
  priorOrders28?: number | null;
  daysInStock: number | null;
  ordersInStockDays: number | null;
  hadStockOutInWindow: boolean;
  pastOrdersPerDay: number | null;
  windowDays?: number;
}): DailyDemandResult {
  const windowDays = input.windowDays ?? 28;
  if (
    input.daysInStock != null &&
    input.daysInStock > 0 &&
    input.ordersInStockDays != null &&
    input.ordersInStockDays >= 0
  ) {
    return {
      demandPerDay: input.ordersInStockDays / input.daysInStock,
      basis: "дни наличия",
      daysInStock: input.daysInStock,
      ordersInStockDays: input.ordersInStockDays,
    };
  }
  if (input.hadStockOutInWindow) {
    if (input.pastOrdersPerDay != null && input.pastOrdersPerDay > 0) {
      return {
        demandPerDay: input.pastOrdersPerDay,
        basis: "прошлое окно воронки",
        daysInStock: null,
        ordersInStockDays: null,
      };
    }
    return {
      demandPerDay: null,
      basis: "неизвестно",
      daysInStock: null,
      ordersInStockDays: null,
    };
  }
  const prior = input.priorOrders28;
  if (
    input.orders28 === 0 &&
    prior != null &&
    prior > 0
  ) {
    return {
      demandPerDay: (input.orders28 + prior) / (windowDays * 2),
      basis: "orders_56d",
      daysInStock: null,
      ordersInStockDays: null,
    };
  }
  if (input.orders28 != null && input.orders28 >= 0) {
    return {
      demandPerDay: input.orders28 / windowDays,
      basis: "заказы / 28 без обнуления",
      daysInStock: null,
      ordersInStockDays: null,
    };
  }
  return {
    demandPerDay: null,
    basis: "неизвестно",
    daysInStock: null,
    ordersInStockDays: null,
  };
}

export type BuyoutSource = "smoothed_shop" | "product_only" | "stocks_report" | "realization" | null;

const BUYOUT_SMOOTH_K = 20;

export type ShopBuyoutContext = {
  bShop: number | null;
  shopPastOrders: number | null;
  shopPastBuyouts: number | null;
  /** funnel_past | realization | null — откуда b_shop */
  bShopSource: "funnel_past" | "realization" | null;
};

/**
 * b_shop = Σ выкупов / Σ заказов прошлого окна; ≥ 20 заказов.
 * Иначе попытка через реализацию (если переданы shopRealization*).
 */
export function buildShopBuyoutContext(input: {
  products: Array<{ pastOrders: number | null; pastBuyouts: number | null }>;
  /** Заказы/выкупы магазина из реализации за 28д — только если оба числа известны. */
  realizationOrders?: number | null;
  realizationBuyouts?: number | null;
}): ShopBuyoutContext {
  let orders = 0;
  let buyouts = 0;
  let any = false;
  for (const p of input.products) {
    if (p.pastOrders == null || !(p.pastOrders >= 0)) continue;
    if (p.pastBuyouts == null || !(p.pastBuyouts >= 0)) continue;
    orders += p.pastOrders;
    buyouts += p.pastBuyouts;
    any = true;
  }
  if (any && orders >= BUYOUT_SMOOTH_K) {
    return {
      bShop: buyouts / orders,
      shopPastOrders: orders,
      shopPastBuyouts: buyouts,
      bShopSource: "funnel_past",
    };
  }
  const rOrders = input.realizationOrders;
  const rBuyouts = input.realizationBuyouts;
  if (rOrders != null && rOrders >= BUYOUT_SMOOTH_K && rBuyouts != null && rBuyouts >= 0) {
    return {
      bShop: rBuyouts / rOrders,
      shopPastOrders: rOrders,
      shopPastBuyouts: rBuyouts,
      bShopSource: "realization",
    };
  }
  return { bShop: null, shopPastOrders: any ? orders : null, shopPastBuyouts: any ? buyouts : null, bShopSource: null };
}

/**
 * b = (выкупы + K×b_shop) / (заказы + K).
 * Без b_shop: только при заказах ≥ K, иначе null.
 * 0 заказов при известном b_shop → b_shop (не «нет данных»).
 */
export function smoothProductBuyout(input: {
  pastOrders: number | null;
  pastBuyouts: number | null;
  bShop: number | null;
}): { percent: number | null; source: BuyoutSource; productOrders: number | null } {
  const orders = input.pastOrders;
  const buyouts = input.pastBuyouts;
  if (orders == null || !(orders >= 0) || buyouts == null || !(buyouts >= 0)) {
    if (input.bShop != null && Number.isFinite(input.bShop)) {
      return { percent: input.bShop, source: "smoothed_shop", productOrders: orders };
    }
    return { percent: null, source: null, productOrders: orders };
  }
  if (input.bShop != null && Number.isFinite(input.bShop)) {
    const percent = (buyouts + BUYOUT_SMOOTH_K * input.bShop) / (orders + BUYOUT_SMOOTH_K);
    return { percent, source: "smoothed_shop", productOrders: orders };
  }
  if (orders >= BUYOUT_SMOOTH_K) {
    return { percent: buyouts / orders, source: "product_only", productOrders: orders };
  }
  return { percent: null, source: null, productOrders: orders };
}

/** @deprecated для спроса; выкуп теперь через smoothProductBuyout. */
export function resolveBuyoutPercent(input: {
  funnelPastBuyoutPercent: number | null | undefined;
  stocksBuyoutPercent: number | null | undefined;
  realizationBuyoutPercent: number | null | undefined;
  smoothed?: { percent: number | null; source: BuyoutSource } | null;
}): { percent: number | null; source: BuyoutSource } {
  if (input.smoothed && input.smoothed.percent != null) {
    return { percent: input.smoothed.percent, source: input.smoothed.source };
  }
  const clamp = (v: number | null | undefined): number | null => {
    if (v == null || !Number.isFinite(v)) return null;
    if (v > 1 && v <= 100) return v / 100;
    if (v >= 0 && v <= 1) return v;
    return null;
  };
  const stocks = clamp(input.stocksBuyoutPercent);
  if (stocks != null) return { percent: stocks, source: "stocks_report" };
  const real = clamp(input.realizationBuyoutPercent);
  if (real != null) return { percent: real, source: "realization" };
  return { percent: null, source: null };
}

export type AvailableStockResult = {
  available: number;
  onHand: number;
  fromClient: number;
  toClientExpectedReturn: number;
  composition: string;
  cautious: boolean;
};

/**
 * Доступный запас = остаток + fromClient + toClient × (1 − выкуп).
 * Нет полей в пути или выкупа → только остаток.
 */
export function availableStock(input: {
  stock: number | null;
  fromClientCount: number | null | undefined;
  toClientCount: number | null | undefined;
  buyoutPercent: number | null;
}): AvailableStockResult {
  const onHand = Math.max(0, input.stock ?? 0);
  const hasPath =
    (input.fromClientCount != null && Number.isFinite(input.fromClientCount)) ||
    (input.toClientCount != null && Number.isFinite(input.toClientCount));
  if (!hasPath || input.buyoutPercent == null) {
    return {
      available: onHand,
      onHand,
      fromClient: 0,
      toClientExpectedReturn: 0,
      composition: "только остаток на складах (полей в пути или % выкупа нет)",
      cautious: true,
    };
  }
  const fromClient = Math.max(0, input.fromClientCount ?? 0);
  const toClient = Math.max(0, input.toClientCount ?? 0);
  const expectedReturn = toClient * (1 - input.buyoutPercent);
  const available = onHand + fromClient + expectedReturn;
  return {
    available,
    onHand,
    fromClient,
    toClientExpectedReturn: expectedReturn,
    composition: `остаток ${onHand} + от клиента ${fromClient} + ожидаемый возврат ${Math.round(expectedReturn * 10) / 10}`,
    cautious: false,
  };
}

export function coverDaysFromDemand(available: number, demandPerDay: number | null): number | null {
  if (demandPerDay == null || !(demandPerDay > 0) || available < 0) return null;
  return available / demandPerDay;
}

export function safetyStock(demandPerDay: number, leadTimeDays: number, z: number): number {
  if (!(demandPerDay > 0) || !(leadTimeDays > 0) || !(z > 0)) return 0;
  return z * Math.sqrt(demandPerDay * leadTimeDays);
}

export function netBurnPerDay(demandPerDay: number, buyoutPercent: number | null): number | null {
  if (!(demandPerDay > 0)) return null;
  if (buyoutPercent == null) return null;
  return demandPerDay * buyoutPercent;
}

/**
 * Чистый расход, шт./день.
 * Спрос × b; если b нет — темп выкупов из отчёта реализации; иначе null.
 */
export function resolveNetBurnPerDay(input: {
  demandPerDay: number | null;
  buyoutPercent: number | null;
  /** Выкупы/день из реализации за 28 дней (qty/28). Не процент. */
  realizationBuyoutsPerDay: number | null;
}): { burn: number | null; basis: "demand×buyout" | "realization_buyouts" | null } {
  if (input.demandPerDay != null && input.demandPerDay > 0 && input.buyoutPercent != null) {
    const burn = input.demandPerDay * input.buyoutPercent;
    if (burn > 0) return { burn, basis: "demand×buyout" };
  }
  if (input.realizationBuyoutsPerDay != null && input.realizationBuyoutsPerDay > 0) {
    return { burn: input.realizationBuyoutsPerDay, basis: "realization_buyouts" };
  }
  return { burn: null, basis: null };
}

/** Дни запаса = доступный запас / чистый расход. null, если расход null или 0. */
export function coverDaysFromBurn(available: number, netBurnPerDay: number | null): number | null {
  if (netBurnPerDay == null || !(netBurnPerDay > 0) || available < 0) return null;
  return available / netBurnPerDay;
}

/**
 * Хранение 1 шт. в день, ₽ = сумма хранения / (средний остаток × дни периода).
 * Нет данных → null, никогда 0 из «пусто».
 */
export function storagePerUnitDay(input: {
  totalStorageRub: number | null;
  avgStock: number | null;
  periodDays: number | null;
}): number | null {
  if (
    input.totalStorageRub == null ||
    !(input.totalStorageRub >= 0) ||
    input.avgStock == null ||
    !(input.avgStock > 0) ||
    input.periodDays == null ||
    !(input.periodDays > 0)
  ) {
    return null;
  }
  return input.totalStorageRub / (input.avgStock * input.periodDays);
}

/**
 * Ставка ₽/шт./день из paid_storage:
 * Σ warehousePrice / Σ barcodesCount по строкам nmId.
 * Σ barcodesCount = 0 → null (товара не было на складах).
 */
export function storagePerUnitDayFromPaidRows(rows: Array<{
  warehousePrice: number;
  barcodesCount: number;
}>): number | null {
  let totalPrice = 0;
  let totalUnits = 0;
  for (const row of rows) {
    if (!Number.isFinite(row.warehousePrice) || !Number.isFinite(row.barcodesCount)) continue;
    totalPrice += row.warehousePrice;
    totalUnits += row.barcodesCount;
  }
  if (!(totalUnits > 0)) return null;
  return totalPrice / totalUnits;
}

/** Деньги под риском за 28 дней = излишек × хранение 1 шт./день × 28. */
export function storageMoneyAtRisk28d(
  excessOrStockUnits: number,
  storagePerUnitPerDay: number | null,
): number | null {
  if (storagePerUnitPerDay == null || !(storagePerUnitPerDay >= 0)) return null;
  if (!(excessOrStockUnits > 0)) return null;
  return excessOrStockUnits * storagePerUnitPerDay * 28;
}

export type StorageMoneyBasis =
  | "paid_storage"
  | "seller_warehouse"
  | "wb_zero_confirmed"
  | "partial_wb"
  | "unknown";

export type StorageMoneyResolution = {
  moneyAtRiskRub: number | null;
  /** Эффективная ставка для evidence (0 при FBS-only). */
  effectiveRate: number | null;
  storageSource: "paid_storage" | "seller_warehouse" | "wb_zero" | null;
  basis: StorageMoneyBasis;
  note: string | null;
  stockFbo: number | null;
  stockFbs: number | null;
  wbShare: number | null;
  unitsCharged: number | null;
};

/**
 * Хранение WB только по штукам на складах WB.
 * Целиком FBS → 0 ₽ (не null). Ставку магазина не подставляем.
 */
export function resolveStorageMoneyAtRisk(input: {
  excessOrStockUnits: number;
  storagePerUnitDay: number | null;
  stockFbo: number | null;
  stockFbs: number | null;
}): StorageMoneyResolution {
  const fbo = input.stockFbo;
  const fbs = input.stockFbs;
  const excess = input.excessOrStockUnits;
  const base = {
    stockFbo: fbo,
    stockFbs: fbs,
  };

  if (fbo != null && fbs != null && fbo === 0 && fbs > 0) {
    return {
      ...base,
      moneyAtRiskRub: 0,
      effectiveRate: 0,
      storageSource: "seller_warehouse",
      basis: "seller_warehouse",
      note: "Товар хранится на вашем складе, WB за хранение не берёт; риск в том, что деньги заморожены в товаре",
      wbShare: 0,
      unitsCharged: 0,
    };
  }

  const total =
    fbo != null || fbs != null ? (fbo ?? 0) + (fbs ?? 0) : null;
  const wbShare =
    total != null && total > 0 && fbo != null ? fbo / total : fbo != null && fbo > 0 ? 1 : null;

  if (wbShare != null && wbShare > 0 && wbShare < 1 && input.storagePerUnitDay != null) {
    const unitsCharged = excess * wbShare;
    const money = storageMoneyAtRisk28d(unitsCharged, input.storagePerUnitDay);
    return {
      ...base,
      moneyAtRiskRub: money,
      effectiveRate: input.storagePerUnitDay,
      storageSource: "paid_storage",
      basis: "partial_wb",
      note: `хранение только по доле на складах WB (${Math.round(wbShare * 1000) / 10}%)`,
      wbShare,
      unitsCharged,
    };
  }

  if (input.storagePerUnitDay != null && input.storagePerUnitDay === 0) {
    return {
      ...base,
      moneyAtRiskRub: 0,
      effectiveRate: 0,
      storageSource: "wb_zero",
      basis: "wb_zero_confirmed",
      note: "WB не начисляет хранение (ставка 0 в отчёте)",
      wbShare: wbShare ?? 1,
      unitsCharged: 0,
    };
  }

  if (input.storagePerUnitDay != null && input.storagePerUnitDay > 0) {
    const unitsCharged = wbShare != null && wbShare > 0 ? excess * wbShare : excess;
    const money = storageMoneyAtRisk28d(unitsCharged, input.storagePerUnitDay);
    return {
      ...base,
      moneyAtRiskRub: money,
      effectiveRate: input.storagePerUnitDay,
      storageSource: "paid_storage",
      basis: wbShare != null && wbShare < 1 ? "partial_wb" : "paid_storage",
      note: null,
      wbShare: wbShare ?? 1,
      unitsCharged,
    };
  }

  return {
    ...base,
    moneyAtRiskRub: null,
    effectiveRate: null,
    storageSource: null,
    basis: "unknown",
    note: null,
    wbShare,
    unitsCharged: null,
  };
}

export function reorderQty(input: {
  demandPerDay: number;
  leadTimeDays: number;
  supplyCoverDays: number;
  safety: number;
  available: number;
}): number {
  const need =
    input.demandPerDay * (input.leadTimeDays + input.supplyCoverDays) + input.safety - input.available;
  return Math.max(0, Math.ceil(need));
}

export function excessUnits(input: {
  available: number;
  netBurnPerDay: number;
  excessCoverDays: number;
}): number {
  return Math.max(0, input.available - input.netBurnPerDay * input.excessCoverDays);
}
