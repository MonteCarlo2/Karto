import { contentLeverSuffix } from "@/lib/seller-hub/product-signal";
import {
  DEFAULT_TASK_THRESHOLDS,
  thresholdsFor,
  type TaskSettings,
  type TaskThresholds,
} from "./config";
import {
  applyFdrToCandidates,
  candidateConversionDrop,
  candidateLowTraffic,
  candidateSalesDrop,
  candidateSalesGrowth,
  conversionTrafficLine,
  type DemandRuleContext,
} from "./demand";
import { ageDays } from "./facts";
import {
  buildStoreMoneyContext,
  severityEvidence,
  severityFromMoney,
  whyImportantLine,
  type StoreMoneyContext,
} from "./severity";
import {
  finalizeNoSalesDiagnosis,
  noSalesStageTests,
  runNoSalesBh,
  shopConversionExcluding,
  NO_SALES_BH_Q,
  type NoSalesDiagnosis,
} from "./no-sales-diag";
import { formatCartAdds, formatOpens, formatOrders } from "./ru-plural";
import { poissonRateTest } from "./stats";
import {
  availableStock,
  coverDaysFromBurn,
  coverDaysFromDemand,
  dailyDemand,
  excessUnits,
  resolveNetBurnPerDay,
  reorderQty,
  resolveStorageMoneyAtRisk,
  safetyStock,
  smoothProductBuyout,
  type ShopBuyoutContext,
} from "./stock-math";
import { unitSaleMoneyAtRisk } from "@/lib/seller-hub/unit-sale-economics";
import type { StoreTaskFacts, TaskBaseline, TaskDraft, TaskEventRef, TaskFact } from "./types";

export { buildStoreMoneyContext };

export { conversionTrafficLine };

function rub(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function pieces(value: number): string {
  /** Без точки в конце — точку ставит окружающее предложение (иначе «84 шт..»). */
  return `${Math.round(value).toLocaleString("ru-RU")} шт`;
}

function draft(
  fact: TaskFact | null,
  partial: Omit<TaskDraft, "nmId" | "itemId" | "productTitle" | "vendorCode" | "severityFloor" | "severityCeiling"> &
    Partial<Pick<TaskDraft, "severityFloor" | "severityCeiling">>,
): TaskDraft {
  return {
    nmId: fact?.nmId ?? null,
    itemId: fact?.itemId ?? null,
    productTitle: fact?.title ?? null,
    vendorCode: fact?.vendorCode ?? null,
    severityFloor: partial.severityFloor ?? partial.baseSeverity,
    severityCeiling: partial.severityCeiling ?? partial.baseSeverity,
    ...partial,
  };
}

function paceBeforeOut(baseline: TaskBaseline | null): number | null {
  if (!baseline || baseline.stock == null || baseline.stock <= 0 || baseline.coverDays == null || baseline.coverDays <= 0) {
    return null;
  }
  return Math.round((baseline.stock / baseline.coverDays) * 10) / 10;
}

export type StockOutPaceChoice = {
  pace: number | null;
  /** Какой период взят для оценки. */
  period: string | null;
};

/**
 * Темп до обнуления: прошлые 28 дней воронки (не разбавлены днями OOS),
 * иначе штуки/день из baseline остатка до перехода в 0.
 * Текущий avgOrdersCountPerDay не берём — в окно уже входят дни без товара.
 */
export function stockOutPace(fact: TaskFact, baseline: TaskBaseline | null): StockOutPaceChoice {
  if (fact.priorOrdersPerDay != null && fact.priorOrdersPerDay > 0) {
    return {
      pace: Math.round(fact.priorOrdersPerDay * 10) / 10,
      period: "прошлые 28 дней воронки WB",
    };
  }
  const fromBaseline = paceBeforeOut(baseline);
  if (fromBaseline != null) {
    return { pace: fromBaseline, period: "остаток и дни запаса до обнуления" };
  }
  return { pace: null, period: null };
}

/** Дни без остатка с stockOutAt (момент перехода >0 → 0). Меньше суток — null. */
export function daysOutOfStockSince(stockOutAt: string | null | undefined, now: string): number | null {
  if (!stockOutAt) return null;
  const from = Date.parse(stockOutAt);
  const at = Date.parse(now);
  if (!Number.isFinite(from) || !Number.isFinite(at) || at < from) return null;
  const days = Math.floor((at - from) / 86_400_000);
  return days >= 1 ? days : null;
}

/** @deprecated используйте daysOutOfStockSince(stockOutAt) — updatedAt baseline сбрасывается каждый sync. */
export function daysOutOfStock(baseline: TaskBaseline | null, now: string): number | null {
  return daysOutOfStockSince(baseline?.stockOutAt, now);
}

export function missedOrdersEstimate(
  pace: number | null,
  daysOos: number | null,
): number | null {
  if (pace == null || !(pace > 0) || daysOos == null || !(daysOos > 0)) return null;
  return Math.round(pace * daysOos * 10) / 10;
}

function productPastOrders(fact: TaskFact): number | null {
  if (fact.pastOrderCount != null) return fact.pastOrderCount;
  return fact.priorOrders;
}

function productPastBuyouts(fact: TaskFact): number | null {
  if (fact.pastBuyoutCount != null) return fact.pastBuyoutCount;
  /** Если заказов 0 — выкупов тоже 0 для сглаживания к b_shop. */
  const orders = productPastOrders(fact);
  if (orders === 0) return 0;
  return null;
}

function productBuyout(fact: TaskFact, shop: ShopBuyoutContext | null = null) {
  const pastOrders = productPastOrders(fact);
  const pastBuyouts = productPastBuyouts(fact);
  const smoothed = smoothProductBuyout({
    pastOrders,
    pastBuyouts,
    bShop: shop?.bShop ?? null,
  });
  if (smoothed.percent != null) return smoothed;
  /** Оба счётчика известны → null осознанный (мало заказов без b_shop), не подставляем долю. */
  if (pastOrders != null && pastBuyouts != null) return smoothed;
  /** Счётчиков нет — доля из воронки / stocks (тесты и старые снимки). */
  const clamp = (v: number | null | undefined): number | null => {
    if (v == null || !Number.isFinite(v)) return null;
    if (v > 1 && v <= 100) return v / 100;
    if (v >= 0 && v <= 1) return v;
    return null;
  };
  const past = clamp(fact.buyoutPercentFunnelPast);
  if (past != null) return { percent: past, source: "product_only" as const, productOrders: pastOrders };
  const stocks = clamp(fact.buyoutPercentStocks);
  if (stocks != null) return { percent: stocks, source: "stocks_report" as const, productOrders: pastOrders };
  return smoothed;
}

function productDemand(fact: TaskFact, hadStockOutInWindow: boolean) {
  return dailyDemand({
    orders28: fact.orders,
    priorOrders28: fact.priorOrders,
    daysInStock: fact.daysInStock,
    ordersInStockDays: fact.ordersInStockDays,
    hadStockOutInWindow,
    pastOrdersPerDay: fact.priorOrdersPerDay,
  });
}

function productStorageMoney(fact: TaskFact, excessOrStockUnits: number) {
  return resolveStorageMoneyAtRisk({
    excessOrStockUnits,
    storagePerUnitDay: fact.storagePerUnitDay,
    stockFbo: fact.stockFbo,
    stockFbs: fact.stockFbs,
  });
}

/** Остаток для доступного запаса: stockCount из отчёта, иначе каталог. */
function onHandStock(fact: TaskFact): number | null {
  if (fact.stockCountReport != null) return fact.stockCountReport;
  return fact.stock;
}

function productAvailable(fact: TaskFact, buyoutPercent: number | null) {
  return availableStock({
    stock: onHandStock(fact),
    fromClientCount: fact.fromClientCount,
    toClientCount: fact.toClientCount,
    buyoutPercent,
  });
}

/** Темп выкупов из реализации, шт./день (salesQty / 28). */
function realizationBuyoutsPerDay(fact: TaskFact): number | null {
  if (!fact.salesKnown || fact.salesQty == null || fact.salesQty < 0) return null;
  return fact.salesQty / 28;
}

function productNetBurn(
  fact: TaskFact,
  hadStockOutInWindow: boolean,
  shop: ShopBuyoutContext | null = null,
) {
  const buyout = productBuyout(fact, shop);
  const demand = productDemand(fact, hadStockOutInWindow);
  /** Отчёт реализации для чистого расхода — только когда b = null. */
  const resolved = resolveNetBurnPerDay({
    demandPerDay: demand.demandPerDay,
    buyoutPercent: buyout.percent,
    realizationBuyoutsPerDay: buyout.percent == null ? realizationBuyoutsPerDay(fact) : null,
  });
  return { buyout, demand, ...resolved };
}

const ILLIQUID_COVER_DAYS = 365;
const PRESENCE_WINDOW_DAYS = 56;

/**
 * Риск неликвида: дни > 365 и заморожено ≥ 1% оборота → не выше «Важно».
 * Без себестоимости — верхняя граница по цене продажи.
 */
function illiquidRaise(input: {
  coverDays: number | null;
  excessOrStockUnits: number;
  cost: number | null;
  salePrice: number | null;
  store: StoreMoneyContext;
  thresholds: TaskThresholds;
  current: ReturnType<typeof severityFromMoney>;
}): {
  decision: ReturnType<typeof severityFromMoney>;
  raised: boolean;
  frozenRub: number | null;
  frozenBasis: "cost" | "sale_price_upper" | null;
  upperBoundNote: boolean;
} {
  const turnover = input.store.turnoverRub;
  const importantShare = input.thresholds.severityTurnoverImportantShare;
  if (
    input.coverDays == null ||
    !(input.coverDays > ILLIQUID_COVER_DAYS) ||
    turnover == null ||
    !(turnover > 0)
  ) {
    return {
      decision: input.current,
      raised: false,
      frozenRub: null,
      frozenBasis: null,
      upperBoundNote: false,
    };
  }
  const thresholdRub = turnover * importantShare;
  if (input.cost != null && input.cost > 0) {
    const frozen = input.excessOrStockUnits * input.cost;
    if (frozen >= thresholdRub && input.current.severity === "opportunity") {
      return {
        decision: {
          ...input.current,
          severity: "important",
          basis: "неликвид: заморожено ≥ 1% оборота",
        },
        raised: true,
        frozenRub: frozen,
        frozenBasis: "cost",
        upperBoundNote: false,
      };
    }
    return {
      decision: input.current,
      raised: false,
      frozenRub: frozen,
      frozenBasis: "cost",
      upperBoundNote: false,
    };
  }
  const price = input.salePrice;
  if (price != null && price > 0) {
    const upper = input.excessOrStockUnits * price;
    if (upper >= thresholdRub && input.current.severity === "opportunity") {
      return {
        decision: {
          ...input.current,
          severity: "important",
          basis: "неликвид: заморожено ≥ 1% оборота",
        },
        raised: true,
        frozenRub: upper,
        frozenBasis: "sale_price_upper",
        upperBoundNote: true,
      };
    }
    return {
      decision: input.current,
      raised: false,
      frozenRub: upper,
      frozenBasis: "sale_price_upper",
      upperBoundNote: false,
    };
  }
  return {
    decision: input.current,
    raised: false,
    frozenRub: null,
    frozenBasis: null,
    upperBoundNote: false,
  };
}

function monthsFromCoverDays(coverDays: number): number {
  return Math.round((coverDays / 30) * 10) / 10;
}

function isReadableEventTime(value: string | null | undefined): value is string {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

/**
 * Стандарт §3.4: блокируем только stock_out **с датой** в окне.
 * Событие без даты / с нечитаемой датой не считаем доказательством обнуления —
 * задачу создаём, но в тексте остаётся пометка о непроверенном наличии.
 */
function stockOutInPresenceWindow(
  events: TaskEventRef[],
  nmId: string,
  now: string,
  windowDays = PRESENCE_WINDOW_DAYS,
): boolean {
  const at = Date.parse(now);
  if (!Number.isFinite(at)) return false;
  const from = at - windowDays * 86_400_000;
  return events.some((event) => {
    if (event.nmId !== nmId || event.kind !== "stock_out") return false;
    if (!isReadableEventTime(event.createdAt)) return false;
    const created = Date.parse(event.createdAt);
    return created >= from && created <= at;
  });
}

/** stock_out есть, но дату поставить в окно нельзя — наличие за период всё равно не доказано. */
function hasUndatedStockOut(events: TaskEventRef[], nmId: string): boolean {
  return events.some(
    (event) => event.nmId === nmId && event.kind === "stock_out" && !isReadableEventTime(event.createdAt),
  );
}

/**
 * Наличие за окно «Не продаётся» (§3.4):
 * — undated stock_out → не подтверждено, пометка;
 * — история снимков кабинета короче окна → не подтверждено, пометка;
 * — история ≥ окна и датированного stock_out в окне нет → подтверждено, без пометки.
 * (Датированный stock_out в окне отсекает задачу раньше, в qualifies.)
 */
export function resolveNoSalesPresence(input: {
  events: TaskEventRef[];
  nmId: string;
  now: string;
  windowDays: number;
  /** Начало отслеживания остатков кабинета (min created_at снимков). */
  stockHistorySince: string | null | undefined;
}): {
  presenceVerified: boolean;
  presenceCaveat: string;
  undatedStockOut: boolean;
  stockHistoryDays: number | null;
  historyCoversWindow: boolean;
} {
  const undatedStockOut = hasUndatedStockOut(input.events, input.nmId);
  const stockHistoryDays = ageDays(input.stockHistorySince ?? null, input.now);
  const historyCoversWindow =
    stockHistoryDays != null && stockHistoryDays >= input.windowDays;
  const presenceVerified = !undatedStockOut && historyCoversWindow;
  return {
    presenceVerified,
    presenceCaveat: presenceVerified
      ? ""
      : " Мы не можем проверить, был ли товар в наличии весь период.",
    undatedStockOut,
    stockHistoryDays,
    historyCoversWindow,
  };
}

function lowOrdersFactLine(fact: TaskFact): string {
  const cur = fact.orders;
  const prior = fact.priorOrders;
  if (cur == null || prior == null) return "";
  if (!(cur > 0) || cur > 5) return "";
  let line = ` Заказов: ${cur} за последние 28 дней, ${prior} за предыдущие.`;
  const test = poissonRateTest(prior, 28, cur, 28);
  if (test.status === "ok" && test.pValue != null && test.pValue >= 0.05) {
    line += " На таком объёме изменение может быть случайным.";
  }
  return line;
}

function stocksEvidenceExtras(fact: TaskFact): TaskDraft["evidence"] {
  return {
    stock_count_report: fact.stockCountReport,
    catalog_stock: fact.stock,
    wb_office_missing_time_days: fact.officeMissingTime,
    wb_office_missing_time_special: fact.officeMissingTimeSpecial,
    wb_lost_buyouts_count: fact.lostBuyoutsCount,
    wb_lost_buyouts_sum: fact.lostBuyoutsSum,
    wb_avg_orders: fact.stocksAvgOrders,
    wb_orders_count: fact.stocksOrdersCount,
    wb_sale_rate_days: fact.saleRateDays,
    wb_avg_stock_turnover_days: fact.avgStockTurnoverDays,
    /** officeMissingTime не идёт в дни наличия: агрегация по складам в спеке не описана. */
    days_in_stock_from_wb: null,
  };
}

/**
 * Переход >0→0 или продолжающийся OOS (stockOutAt уже записан).
 * Первый снимок с нулём без истории — не задача.
 * Стандарт §3.1.
 */
export function ruleStockOut(
  fact: TaskFact,
  baseline: TaskBaseline | null,
  thresholds: TaskThresholds,
  store: StoreMoneyContext,
  now: string = new Date().toISOString(),
  shop: ShopBuyoutContext | null = null,
): TaskDraft | null {
  if (fact.stock == null || fact.stock !== 0) return null;
  const justTransitioned = Boolean(baseline && baseline.stock != null && baseline.stock > 0);
  const ongoing = Boolean(baseline?.stockOutAt);
  if (!justTransitioned && !ongoing) return null;
  const stockOutAt = baseline?.stockOutAt ?? (justTransitioned ? now : null);
  const paced = stockOutPace(fact, baseline);
  const daysOos = daysOutOfStockSince(stockOutAt, now);
  const buyout = productBuyout(fact, shop);
  const demandPerDay = paced.pace;
  const hadDemandBefore = demandPerDay != null && demandPerDay > 0;
  const missedOrders = missedOrdersEstimate(demandPerDay, daysOos);
  const avgPrice = fact.avgOrderPrice ?? fact.promoPrice;
  const buyoutFactor = buyout.percent ?? 1;
  const ourMissedRub =
    missedOrders != null && avgPrice != null && avgPrice > 0
      ? Math.round(missedOrders * buyoutFactor * avgPrice)
      : null;
  const wbCount = fact.lostOrdersCount;
  const wbSum = fact.lostOrdersSum;
  const wbMissing = fact.officeMissingTime;
  const useWb = wbSum != null || wbCount != null;
  const moneyAtRisk = useWb && wbSum != null ? wbSum : ourMissedRub;
  const decision = severityFromMoney({
    moneyAtRiskRub: moneyAtRisk,
    store,
    thresholds,
    urgencyCritical: hadDemandBefore,
  });
  const level = hadDemandBefore ? decision.severity : "opportunity";
  const why =
    hadDemandBefore
      ? whyImportantLine({ ...decision, severity: level })
      : "Почему это важно: товар закончился, продаж за прошлые 28 дней не было.";
  const paceLine =
    demandPerDay != null
      ? ` Темп до обнуления ${demandPerDay.toLocaleString("ru-RU")} шт. в день${paced.period ? ` (${paced.period})` : ""}.`
      : "";
  const missingNote =
    wbMissing != null
      ? `, время отсутствия по WB ≈ ${wbMissing.toLocaleString("ru-RU")} дн.`
      : fact.officeMissingTimeSpecial
        ? `, время отсутствия WB: ${fact.officeMissingTimeSpecial}`
        : "";
  const missedLine = useWb
    ? ` Упущенные заказы по данным WB: ${wbCount != null ? pieces(wbCount) : "—"}${
        wbSum != null ? ` ≈ ${rub(wbSum)}` : ""
      }${missingNote}.`
    : missedOrders != null
      ? ` Оценка упущенных заказов: ${pieces(missedOrders)}${ourMissedRub != null ? ` ≈ ${rub(ourMissedRub)}` : ""} за ${daysOos} дн. без остатка.`
      : "";
  const noSalesLine = hadDemandBefore
    ? ""
    : " Продаж за прошлые 28 дней не было.";
  return draft(fact, {
    type: "TASK_STOCK_OUT",
    category: "stock",
    baseSeverity: level,
    severityFloor: level,
    severityCeiling: level,
    title: "Товар закончился",
    description: `${fact.title}: остаток 0.${paceLine}${missedLine}${noSalesLine}`,
    reason: justTransitioned
      ? "Предыдущий остаток был больше нуля, сейчас остаток 0."
      : "Остаток по-прежнему 0 с момента зафиксированного обнуления.",
    evidence: {
      previous_stock: baseline?.stock ?? null,
      stock: fact.stock,
      sales_28d: fact.salesQty,
      recent_sales_7d: fact.recentSalesQty,
      pace_before_per_day: demandPerDay,
      pace_period: paced.period,
      demand_basis: paced.period,
      days_out_of_stock: daysOos,
      missed_orders_est: missedOrders,
      missed_orders_rub_est: ourMissedRub,
      wb_lost_orders_count: wbCount,
      wb_lost_orders_sum: wbSum,
      wb_figures_primary: useWb,
      buyout_percent: buyout.percent,
      buyout_source: buyout.source,
      avg_order_price: avgPrice,
      stock_out_at: stockOutAt,
      ...stocksEvidenceExtras(fact),
      ...severityEvidence({ ...decision, severity: level, basis: hadDemandBefore ? "срочность" : "деньги неизвестны" }),
      why_important: why,
    },
    recommendation: hadDemandBefore
      ? "Проверьте необходимость срочного пополнения запаса."
      : "Товар закончился. Продаж за прошлые 28 дней не было — сначала решите, нужен ли он в ассортименте.",
    actionType: "OPEN_SUPPLIES",
    businessImpactType: "SALES_PROTECTION",
    eventKind: "stock_out",
  });
}

/** Стандарт §3.2: страховой запас и срок поставки. */
export function ruleLowStock(
  fact: TaskFact,
  thresholds: TaskThresholds,
  store: StoreMoneyContext,
  hadStockOutInWindow = false,
  shop: ShopBuyoutContext | null = null,
): TaskDraft | null {
  const onHand = onHandStock(fact);
  if (onHand == null || onHand <= 0) return null;
  const buyout = productBuyout(fact, shop);
  const demand = productDemand(fact, hadStockOutInWindow);
  if (demand.demandPerDay == null || !(demand.demandPerDay > 0)) return null;
  const stock = productAvailable(fact, buyout.percent);
  const cover = coverDaysFromDemand(stock.available, demand.demandPerDay);
  if (cover == null) return null;
  const L = thresholds.leadTimeDays;
  const z = thresholds.serviceLevelZ;
  const review = thresholds.reorderReviewDays;
  const safety = safetyStock(demand.demandPerDay, L, z);
  const reorderPoint = demand.demandPerDay * (L + review) + safety;
  const critical = cover < L;
  const important = stock.available < reorderPoint;
  if (!critical && !important) return null;
  const need = reorderQty({
    demandPerDay: demand.demandPerDay,
    leadTimeDays: L,
    supplyCoverDays: thresholds.supplyCoverDays,
    safety,
    available: stock.available,
  });
  const avgPrice = fact.avgOrderPrice ?? fact.promoPrice;
  const buyoutFactor = buyout.percent ?? 1;
  const moneyAtRisk =
    avgPrice != null && avgPrice > 0
      ? Math.round(demand.demandPerDay * buyoutFactor * avgPrice * Math.max(0, L - Math.min(cover, L)))
      : null;
  const decision = severityFromMoney({
    moneyAtRiskRub: moneyAtRisk,
    store,
    thresholds,
    urgencyCritical: critical,
  });
  const level = critical ? "critical" : "important";
  const why = whyImportantLine({
    ...decision,
    severity: level,
    basis: critical ? "срочность" : decision.basis,
  });
  return draft(fact, {
    type: "TASK_LOW_STOCK",
    category: "stock",
    baseSeverity: level,
    severityFloor: level,
    severityCeiling: level,
    title: "Запас скоро закончится",
    description: `${fact.title}: доступный запас ${pieces(stock.available)} (${stock.composition}), ≈ ${Math.round(cover * 10) / 10} дн. при спросе ${Math.round(demand.demandPerDay * 100) / 100} шт./день.`,
    reason: critical
      ? `Дней запаса (${Math.round(cover * 10) / 10}) меньше срока поставки ${L} дн. — поставка уже не успеет.`
      : `Запас ниже точки заказа: спрос × (${L}+${review}) + страховой ${Math.round(safety * 10) / 10}.`,
    evidence: {
      stock: onHand,
      available_stock: Math.round(stock.available * 10) / 10,
      stock_composition: stock.composition,
      stock_cautious: stock.cautious,
      cover_days: Math.round(cover * 10) / 10,
      demand_per_day: Math.round(demand.demandPerDay * 1000) / 1000,
      demand_basis: demand.basis,
      buyout_percent: buyout.percent,
      buyout_source: buyout.source,
      safety_stock: Math.round(safety * 100) / 100,
      lead_time_days: L,
      reorder_review_days: review,
      supply_cover_days: thresholds.supplyCoverDays,
      reorder_point: Math.round(reorderPoint * 10) / 10,
      replenish_units: need,
      sales_28d: fact.salesQty,
      ...stocksEvidenceExtras(fact),
      ...severityEvidence({
        ...decision,
        severity: level,
        basis: critical ? "срочность" : decision.basis,
      }),
      why_important: why,
    },
    recommendation:
      need > 0
        ? `Проверьте поставку: по модели нужно привезти около ${pieces(need)} (срок ${L} дн. + покрытие ${thresholds.supplyCoverDays} дн. + страховой запас).`
        : `Проверьте поставку: запас короче срока ${L} дн.`,
    actionType: "OPEN_SUPPLIES",
    businessImpactType: "STOCK_RISK",
    eventKind: "low_stock",
  });
}

/** Стандарт §3.3: излишек в днях продаж; деньги = хранение лишнего × 28. */
export function ruleExcessStock(
  fact: TaskFact,
  thresholds: TaskThresholds,
  store: StoreMoneyContext,
  hadStockOutInWindow = false,
  shop: ShopBuyoutContext | null = null,
): TaskDraft | null {
  const onHand = onHandStock(fact);
  if (onHand == null || onHand <= 0) return null;
  const { buyout, demand, burn, basis: burnBasis } = productNetBurn(fact, hadStockOutInWindow, shop);
  if (burn == null || !(burn > 0)) return null;
  const stock = productAvailable(fact, buyout.percent);
  const excess = excessUnits({
    available: stock.available,
    netBurnPerDay: burn,
    excessCoverDays: thresholds.excessCoverDays,
  });
  if (!(excess > 0)) return null;
  const coverDays = coverDaysFromBurn(stock.available, burn);
  const storage = productStorageMoney(fact, excess);
  const moneyRounded =
    storage.moneyAtRiskRub == null ? null : Math.round(storage.moneyAtRiskRub * 10) / 10;
  let decision = severityFromMoney({
    moneyAtRiskRub: moneyRounded,
    store,
    thresholds,
  });
  const salePrice = fact.promoPrice ?? fact.price;
  const illiquid = illiquidRaise({
    coverDays,
    excessOrStockUnits: excess,
    cost: fact.cost,
    salePrice,
    store,
    thresholds,
    current: decision,
  });
  decision = illiquid.decision;
  /** «Критично» только по деньгам на хранении — illiquidRaise не поднимает выше important. */
  const wbAvail = fact.availability;
  const wbSaysDeficient = wbAvail === "deficient";
  if (wbSaysDeficient && decision.severity !== "opportunity") {
    decision = { ...decision, severity: "opportunity" };
  }
  const frozenRub =
    illiquid.frozenRub != null
      ? illiquid.frozenRub
      : fact.cost != null && fact.cost > 0
        ? excess * fact.cost
        : null;
  const frozenBasis =
    illiquid.frozenBasis ??
    (fact.cost != null && fact.cost > 0 ? ("cost" as const) : null);
  const months = coverDays != null ? monthsFromCoverDays(coverDays) : null;
  const burnRounded = Math.round(burn * 1000) / 1000;
  const excessRounded = Math.round(excess * 10) / 10;
  const coverLine =
    months != null
      ? `Запаса хватит примерно на ${months.toLocaleString("ru-RU")} мес. продаж (продаётся ${burnRounded.toLocaleString("ru-RU")} шт. в день с учётом возвратов). Лишних примерно ${pieces(excessRounded)}.`
      : `Лишних примерно ${pieces(excessRounded)} сверх ${thresholds.excessCoverDays} дн. чистого расхода (${burnRounded.toLocaleString("ru-RU")} шт./день).`;
  const storageLine =
    storage.basis === "seller_warehouse"
      ? ` ${storage.note}.`
      : moneyRounded != null && moneyRounded > 0
        ? ` Хранение лишнего обходится примерно в ${rub(moneyRounded)} за 28 дней.`
        : moneyRounded === 0
          ? " Хранение WB за лишнее: 0 ₽."
          : " Стоимость хранения неизвестна.";
  const frozenLine =
    frozenBasis === "cost" && frozenRub != null
      ? ` Заморожено около ${rub(frozenRub)} по себестоимости.`
      : illiquid.upperBoundNote
        ? " Сумма оценена по цене продажи, это верхняя граница; введите себестоимость для точной оценки."
        : " Введите себестоимость, чтобы видеть сумму.";
  const upperNote = "";
  const wbLine =
    wbAvail === "nonLiquid"
      ? " WB тоже оценивает товар как неликвид."
      : wbSaysDeficient
        ? " Оценка WB (deficient) расходится с нашей — важность не выше «Возможность»."
        : "";
  const seasonLine = " Если вы запаслись под сезон, это может быть нормально.";
  const ordersLine = lowOrdersFactLine(fact);
  const why = whyImportantLine(decision);
  const demandOrders56 =
    demand.basis === "orders_56d" && fact.orders != null && fact.priorOrders != null
      ? fact.orders + fact.priorOrders
      : null;
  return draft(fact, {
    type: "TASK_EXCESS_STOCK",
    category: "stock",
    baseSeverity: decision.severity,
    severityFloor: decision.severity,
    severityCeiling: decision.severity,
    title: "Излишек запаса",
    description: `${fact.title}: ${coverLine}${storageLine}${frozenLine}${upperNote}${wbLine}${seasonLine}${ordersLine}${
      demandOrders56 != null ? ` ${formatOrders(demandOrders56)} за последние 56 дней.` : ""
    }`,
    reason: `Доступный запас минус чистый расход × ${thresholds.excessCoverDays} дн. Важность — по хранению лишнего за 28 дней, не по замороженному капиталу.`,
    evidence: {
      stock: onHand,
      available_stock: Math.round(stock.available * 10) / 10,
      stock_composition: stock.composition,
      stock_fbo: fact.stockFbo,
      stock_fbs: fact.stockFbs,
      demand_per_day:
        demand.demandPerDay == null ? null : Math.round(demand.demandPerDay * 1000) / 1000,
      demand_basis: demand.basis,
      net_burn_per_day: burnRounded,
      net_burn_basis: burnBasis,
      buyout_percent: buyout.percent,
      buyout_source: buyout.source,
      buyout_product_orders: buyout.productOrders,
      b_shop: shop?.bShop ?? null,
      b_shop_source: shop?.bShopSource ?? null,
      cover_days_burn: coverDays == null ? null : Math.round(coverDays * 10) / 10,
      excess_units: excessRounded,
      excess_cover_days: thresholds.excessCoverDays,
      storage_per_unit_day: storage.effectiveRate ?? fact.storagePerUnitDay,
      storage_source: storage.storageSource ?? fact.storageSource,
      storage_basis: storage.basis,
      storage_note: storage.note,
      storage_wb_share: storage.wbShare,
      storage_money_28d: moneyRounded,
      frozen_rub: frozenRub == null ? null : Math.round(frozenRub),
      frozen_basis: frozenBasis,
      illiquid_raise: illiquid.raised,
      upper_bound_note: illiquid.upperBoundNote,
      availability: wbAvail,
      wb_deficient_cap: wbSaysDeficient,
      sitting_rub: fact.sittingRub,
      sales_28d: fact.salesQty,
      orders_28d: fact.orders,
      prior_orders_28d: fact.priorOrders,
      realization_loaded_at: burnBasis === "realization_buyouts" ? fact.realizationLoadedAt : null,
      ...stocksEvidenceExtras(fact),
      ...severityEvidence(decision),
      why_important: why,
    },
    recommendation:
      storage.basis === "seller_warehouse"
        ? "Товар на вашем складе: риск — замороженные деньги, не плата WB за хранение. Проверьте пополнение и сезонность."
        : "Проверьте пополнение и сезонность: скидку из излишка само по себе не следует. Хранение лишнего — реальные деньги WB.",
    actionType: "OPEN_STOCKS",
    businessImpactType: "CAPITAL_RELEASE",
    eventKind: null,
  });
}

/**
 * Объединено с TASK_EXCESS_STOCK (§3.3). Новые задачи не создаём —
 * открытые закроет движок как «условие изменилось».
 */
export function ruleStagnantCapital(
  _fact: TaskFact,
  _thresholds: TaskThresholds,
): TaskDraft | null {
  return null;
}

function demandCtx(
  baseline: TaskBaseline | null,
  patch: Partial<DemandRuleContext> = {},
): DemandRuleContext {
  const storeOrderSum = patch.storeOrderSum ?? patch.store?.turnoverRub ?? null;
  const store: StoreMoneyContext = patch.store ?? {
    turnoverRub: storeOrderSum,
    grossProfitRub: null,
    useGrossProfit: false,
  };
  return {
    now: patch.now ?? "2026-10-13T12:00:00.000Z",
    events: patch.events ?? [],
    baseline,
    storeOrderSum,
    store,
    hadStockOutAt: patch.hadStockOutAt ?? Boolean(baseline?.stockOutAt),
  };
}

/** Одиночный прогон с FDR из одного кандидата (для тестов правила). */
function acceptCandidate(
  candidate: ReturnType<typeof candidateSalesDrop>,
  q: number,
): TaskDraft | null {
  if (!candidate) return null;
  return applyFdrToCandidates([candidate], q)[0] ?? null;
}

export function ruleSalesDrop(
  fact: TaskFact,
  baseline: TaskBaseline | null,
  thresholds: TaskThresholds,
  ctx: Partial<DemandRuleContext> = {},
): TaskDraft | null {
  return acceptCandidate(candidateSalesDrop(fact, demandCtx(baseline, ctx), thresholds), thresholds.demandFdrQ);
}

export function ruleSalesGrowth(
  fact: TaskFact,
  thresholds: TaskThresholds,
  ctx: Partial<DemandRuleContext> = {},
): TaskDraft | null {
  return acceptCandidate(candidateSalesGrowth(fact, demandCtx(null, ctx), thresholds), thresholds.demandFdrQ);
}

export function ruleConversionDrop(
  fact: TaskFact,
  thresholds: TaskThresholds,
  ctx: Partial<DemandRuleContext> = {},
): TaskDraft | null {
  return acceptCandidate(candidateConversionDrop(fact, demandCtx(null, ctx), thresholds), thresholds.demandFdrQ);
}

export function ruleLowTraffic(
  fact: TaskFact,
  thresholds: TaskThresholds,
  ctx: Partial<DemandRuleContext> = {},
): TaskDraft | null {
  return acceptCandidate(candidateLowTraffic(fact, demandCtx(null, ctx), thresholds), thresholds.demandFdrQ);
}

export type NoSalesContext = {
  now: string;
  store: StoreMoneyContext;
  events?: TaskEventRef[];
  /** Начало истории снимков остатков кабинета (ISO). null — истории нет / неизвестна. */
  stockHistorySince?: string | null;
  /** Готовый диагноз после BH; без него — legacy-факт (тесты одиночного правила). */
  diagnosis?: NoSalesDiagnosis;
};

export function qualifiesNoSales(
  fact: TaskFact,
  thresholds: TaskThresholds,
  ctx: Pick<NoSalesContext, "now" | "events">,
): boolean {
  const onHand = onHandStock(fact);
  if (onHand == null || onHand <= 0) return false;
  const age = ageDays(fact.createdAt, ctx.now);
  if (age == null || age < thresholds.noSalesDays) return false;
  const funnelOk =
    fact.funnelStatus === "ok" ||
    (fact.funnelStatus === "partial" && fact.orders != null && fact.priorOrders != null);
  if (!funnelOk) return false;
  if (fact.orders !== 0 || fact.priorOrders !== 0) return false;
  const events = ctx.events ?? [];
  if (stockOutInPresenceWindow(events, fact.nmId, ctx.now, thresholds.noSalesDays)) return false;
  return true;
}

/**
 * Стандарт §3.4: 0 заказов в обоих окнах воронки, возраст ≥ 56, остаток > 0.
 * Диагноз — сравнение с магазином + Пуассон + BH (см. finalizeNoSalesDrafts).
 */
export function ruleNoSales(
  fact: TaskFact,
  thresholds: TaskThresholds,
  ctx: NoSalesContext,
): TaskDraft | null {
  if (!qualifiesNoSales(fact, thresholds, ctx)) return null;
  const onHand = onHandStock(fact)!;
  const age = ageDays(fact.createdAt, ctx.now)!;
  const events = ctx.events ?? [];
  const presence = resolveNoSalesPresence({
    events,
    nmId: fact.nmId,
    now: ctx.now,
    windowDays: thresholds.noSalesDays,
    stockHistorySince: ctx.stockHistorySince,
  });
  const { presenceCaveat, undatedStockOut } = presence;

  const opens = (fact.openCount ?? 0) + (fact.priorOpenCount ?? 0);
  const carts = (fact.cartCount ?? 0) + (fact.priorCartCount ?? 0);

  let diagnosis: NoSalesDiagnosis;
  if (ctx.diagnosis) {
    diagnosis = ctx.diagnosis;
  } else if (opens <= 0) {
    diagnosis = {
      kind: "no_opens",
      text: `Карточку не видят: ${formatOpens(0)} за 56 дней`,
      levers: "продвижение, акция, название и характеристики для поиска",
      cA: null,
      cB: null,
      E_c: null,
      E_o: null,
      p_cart: null,
      p_order: null,
      q_cart: null,
      q_order: null,
      bh_rank_cart: null,
      bh_rank_order: null,
      M: null,
      method: "zero_opens",
    };
  } else if (carts <= 0) {
    diagnosis = {
      kind: "no_carts",
      text: `Карточку смотрят, но не кладут в корзину: ${formatOpens(opens)}, ${formatCartAdds(0)}`,
      levers: "цена, фото, рейтинг и отзывы",
      cA: null,
      cB: null,
      E_c: null,
      E_o: null,
      p_cart: null,
      p_order: null,
      q_cart: null,
      q_order: null,
      bh_rank_cart: null,
      bh_rank_order: null,
      M: null,
      method: "legacy_insufficient_shop",
    };
  } else {
    diagnosis = {
      kind: "no_orders",
      text: `Кладут в корзину, но не заказывают: ${formatCartAdds(carts)}, ${formatOrders(0)}`,
      levers: "цена, срок доставки",
      cA: null,
      cB: null,
      E_c: null,
      E_o: null,
      p_cart: null,
      p_order: null,
      q_cart: null,
      q_order: null,
      bh_rank_cart: null,
      bh_rank_order: null,
      M: null,
      method: "legacy_insufficient_shop",
    };
  }

  const storage = productStorageMoney(fact, onHand);
  const moneyRounded =
    storage.moneyAtRiskRub == null ? null : Math.round(storage.moneyAtRiskRub * 10) / 10;
  let decision = severityFromMoney({
    moneyAtRiskRub: moneyRounded,
    store: ctx.store,
    thresholds,
  });
  const salePrice = fact.promoPrice ?? fact.price;
  /** Товар без продаж с запасом — всегда риск неликвида (как дни > 365). */
  const illiquid = illiquidRaise({
    coverDays: ILLIQUID_COVER_DAYS + 1,
    excessOrStockUnits: onHand,
    cost: fact.cost,
    salePrice,
    store: ctx.store,
    thresholds,
    current: decision,
  });
  decision = illiquid.decision;
  const frozenRub =
    illiquid.frozenRub != null
      ? illiquid.frozenRub
      : fact.cost != null && fact.cost > 0
        ? onHand * fact.cost
        : null;
  const storageLine =
    storage.basis === "seller_warehouse"
      ? ` ${storage.note}.`
      : moneyRounded != null && moneyRounded > 0
        ? ` Хранение обходится примерно в ${rub(moneyRounded)} за 28 дней.`
        : moneyRounded === 0
          ? " Хранение WB: 0 ₽."
          : " Стоимость хранения неизвестна.";
  const frozenLine =
    fact.cost != null && fact.cost > 0 && frozenRub != null
      ? ` Заморожено около ${rub(frozenRub)} по себестоимости.`
      : illiquid.upperBoundNote
        ? " Сумма оценена по цене продажи, это верхняя граница; введите себестоимость для точной оценки."
        : " Введите себестоимость, чтобы видеть сумму.";
  const wbLine =
    fact.availability === "nonLiquid" ? " WB тоже оценивает товар как неликвид." : "";
  const why = whyImportantLine(decision);
  const illiquidFrozenNote =
    illiquid.raised && illiquid.frozenBasis === "cost"
      ? " (по себестоимости)"
      : illiquid.raised && illiquid.frozenBasis === "sale_price_upper"
        ? " (по цене продажи)"
        : "";
  const contentLevers =
    diagnosis.kind === "no_carts" ? contentLeverSuffix(fact.contentGaps, 3) : "";
  return draft(fact, {
    type: "TASK_NO_SALES",
    category: "sales",
    baseSeverity: decision.severity,
    severityFloor: decision.severity,
    severityCeiling: decision.severity,
    title: "Товар не продаётся",
    description: `${fact.title}: остаток ${pieces(onHand)}, ${formatOrders(0)} за 56 дней (оба окна воронки). ${diagnosis.text}.${storageLine}${frozenLine}${wbLine}${presenceCaveat} Если вы запаслись под сезон, это может быть нормально.${contentLevers}`,
    reason: `Возраст карточки ${age} дн. Воронка загружена. Рычаги: ${diagnosis.levers}.`,
    evidence: {
      stock: onHand,
      stock_fbo: fact.stockFbo,
      stock_fbs: fact.stockFbs,
      age_days: age,
      no_sales_days: thresholds.noSalesDays,
      orders_28d: fact.orders,
      prior_orders_28d: fact.priorOrders,
      open_56d: opens,
      cart_56d: carts,
      diagnosis: diagnosis.kind,
      diagnosis_text: diagnosis.text,
      diagnosis_method: diagnosis.method,
      cA: diagnosis.cA,
      cB: diagnosis.cB,
      E_c: diagnosis.E_c,
      E_o: diagnosis.E_o,
      p_cart: diagnosis.p_cart,
      p_order: diagnosis.p_order,
      q_cart: diagnosis.q_cart,
      q_order: diagnosis.q_order,
      bh_rank_cart: diagnosis.bh_rank_cart,
      bh_rank_order: diagnosis.bh_rank_order,
      M: diagnosis.M,
      presence_verified: presence.presenceVerified,
      undated_stock_out: undatedStockOut,
      stock_history_since: ctx.stockHistorySince ?? null,
      stock_history_days: presence.stockHistoryDays,
      storage_per_unit_day: storage.effectiveRate ?? fact.storagePerUnitDay,
      storage_source: storage.storageSource ?? fact.storageSource,
      storage_basis: storage.basis,
      storage_note: storage.note,
      storage_money_28d: moneyRounded,
      frozen_rub: frozenRub == null ? null : Math.round(frozenRub),
      frozen_basis: illiquid.frozenBasis,
      illiquid_raise: illiquid.raised,
      illiquid_basis_detail: illiquid.raised ? `${decision.basis}${illiquidFrozenNote}` : null,
      upper_bound_note: illiquid.upperBoundNote,
      availability: fact.availability,
      cost: fact.cost,
      content_levers:
        diagnosis.kind === "no_carts"
          ? (fact.contentGaps ?? []).slice(0, 3).join(" | ") || null
          : null,
      ...severityEvidence(decision),
      why_important: why,
    },
    recommendation: `Проверьте: ${diagnosis.levers}.`,
    actionType: "OPEN_PRODUCT",
    businessImpactType: "CAPITAL_RELEASE",
    eventKind: null,
  });
}

/**
 * Собирает TASK_NO_SALES по магазину: конверсии без товара, Пуассон, один BH на все тесты.
 */
export function finalizeNoSalesDrafts(
  facts: TaskFact[],
  settings: TaskSettings,
  now: string,
  store: StoreMoneyContext,
  events: TaskEventRef[] = [],
  stockHistorySince: string | null = null,
): TaskDraft[] {
  type Row = {
    fact: TaskFact;
    thresholds: TaskThresholds;
    opens: number;
    carts: number;
    rates: ReturnType<typeof shopConversionExcluding>;
    stages: ReturnType<typeof noSalesStageTests>;
  };
  const rows: Row[] = [];
  for (const fact of facts) {
    const thresholds = thresholdsFor(settings, fact.nmId, "TASK_NO_SALES");
    if (!thresholds) continue;
    if (!qualifiesNoSales(fact, thresholds, { now, events })) continue;
    const opens = (fact.openCount ?? 0) + (fact.priorOpenCount ?? 0);
    const carts = (fact.cartCount ?? 0) + (fact.priorCartCount ?? 0);
    const rates = shopConversionExcluding(facts, fact.nmId);
    const stages = rates.applicable
      ? noSalesStageTests({ opens, carts, cA: rates.cA, cB: rates.cB })
      : noSalesStageTests({ opens, carts, cA: 0, cB: 0 });
    rows.push({ fact, thresholds, opens, carts, rates, stages });
  }

  const bhEntries: Array<{ draftIndex: number; stage: "open_to_cart" | "cart_to_order"; pValue: number }> =
    [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (!row.rates.applicable) continue;
    for (const stage of row.stages) {
      if (!stage.tested || !Number.isFinite(stage.pValue)) continue;
      bhEntries.push({ draftIndex: i, stage: stage.stage, pValue: stage.pValue });
    }
  }
  const bh = runNoSalesBh(bhEntries, NO_SALES_BH_Q);

  const drafts: TaskDraft[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const cartStage = row.stages.find((s) => s.stage === "open_to_cart");
    const orderStage = row.stages.find((s) => s.stage === "cart_to_order");
    let cartSignificant = false;
    let orderSignificant = false;
    let p_cart: number | null = cartStage?.tested ? cartStage.pValue : null;
    let p_order: number | null = orderStage?.tested ? orderStage.pValue : null;
    let q_cart: number | null = null;
    let q_order: number | null = null;
    let bh_rank_cart: number | null = null;
    let bh_rank_order: number | null = null;
    for (let e = 0; e < bhEntries.length; e++) {
      const entry = bhEntries[e]!;
      if (entry.draftIndex !== i) continue;
      if (entry.stage === "open_to_cart") {
        cartSignificant = bh.rejected[e]!;
        q_cart = bh.adjusted[e]!;
        bh_rank_cart = bh.ranks[e]!;
      } else {
        orderSignificant = bh.rejected[e]!;
        q_order = bh.adjusted[e]!;
        bh_rank_order = bh.ranks[e]!;
      }
    }
    const E_c = cartStage?.expected ?? 0;
    const E_o = orderStage?.expected ?? 0;
    const diagnosis = finalizeNoSalesDiagnosis({
      opens: row.opens,
      carts: row.carts,
      rates: row.rates,
      cartSignificant,
      orderSignificant,
      p_cart,
      p_order,
      q_cart,
      q_order,
      bh_rank_cart,
      bh_rank_order,
      E_c,
      E_o,
    });
    const draftRow = ruleNoSales(row.fact, row.thresholds, {
      now,
      store,
      events,
      stockHistorySince,
      diagnosis,
    });
    if (draftRow) drafts.push(draftRow);
  }
  return drafts;
}

function marginPct(value: number): string {
  return `${(Math.round(value * 10) / 10).toLocaleString("ru-RU")}%`;
}

function notAccountEstimate(fact: TaskFact): boolean {
  return fact.marginSource !== "account";
}

function moneyAtRiskFromUnit(fact: TaskFact, unitLoss: number): number {
  return unitSaleMoneyAtRisk({
    u: -Math.abs(unitLoss),
    uBeforeCost: -Math.abs(unitLoss),
    hasCost: true,
    netSales28: fact.salesQty,
    netSales90: fact.unitSaleNetSales90,
  });
}

function logisticsBreakdown(fact: TaskFact): string | null {
  if (
    fact.logisticsPerUnit == null ||
    fact.unitSaleDeliveryUnit == null ||
    fact.unitSaleReturnUnit == null ||
    fact.unitSaleB == null ||
    fact.unitSaleD == null
  ) {
    return fact.logisticsPerUnit != null ? `логистика на 1 продажу ${rub(fact.logisticsPerUnit)}` : null;
  }
  const bPct = (Math.round(fact.unitSaleB * 1000) / 10).toLocaleString("ru-RU");
  return `логистика на 1 продажу ${rub(fact.logisticsPerUnit)} (доставка ${rub(fact.unitSaleDeliveryUnit)}, обратная доставка ${rub(fact.unitSaleReturnUnit)}, выкуп ${bPct}%, по ${fact.unitSaleD.toLocaleString("ru-RU")} доставкам за 90 дней)`;
}

/**
 * Убыточная цена / около нуля.
 * m ≤ −2% и u < 0 на 1 продажу → Убыточная; −2% < m < 0 → около нуля.
 * Без себестоимости: если u до закупки < 0 — тоже Убыточная.
 */
export function ruleNegativeMargin(
  fact: TaskFact,
  store: StoreMoneyContext = { turnoverRub: null, grossProfitRub: null, useGrossProfit: false },
  thresholds: TaskThresholds = DEFAULT_TASK_THRESHOLDS,
): TaskDraft | null {
  if (!notAccountEstimate(fact)) return null;
  if (fact.unitSaleNoDeliveries) return null;
  if (fact.promoPrice == null) return null;

  const beforeCost = fact.marginBeforeCostP;

  // Без себестоимости: уже минус до C (налог в маржу не входит).
  if (fact.cost == null) {
    if (beforeCost == null || !(beforeCost < 0)) return null;
    const loss = moneyAtRiskFromUnit(fact, beforeCost);
    const decision = severityFromMoney({ moneyAtRiskRub: loss, store, thresholds });
    let severity = decision.severity;
    const importantShare = store.useGrossProfit
      ? thresholds.severityGrossImportantShare
      : thresholds.severityTurnoverImportantShare;
    const base = store.useGrossProfit ? store.grossProfitRub : store.turnoverRub;
    if (base != null && base > 0 && loss / base >= importantShare) {
      severity = "critical";
    } else if (severity === "opportunity") {
      severity = "important";
    }
    const storageNote = fact.storageExcluded
      ? " Без учёта хранения: данных WB о хранении нет, реальная маржа ниже."
      : "";
    const logLine = logisticsBreakdown(fact);
    return draft(fact, {
      type: "TASK_NEGATIVE_MARGIN",
      category: "economics",
      baseSeverity: severity,
      severityFloor: severity,
      severityCeiling: severity,
      title: "Убыточная цена",
      description: `${fact.title}: на 1 продажу до себестоимости уже ${rub(beforeCost)}${
        logLine ? `; ${logLine}` : ""
      } — в минусе уже до закупки, она только увеличит убыток.${storageNote}`,
      reason: "u до себестоимости < 0: закупка только углубит убыток.",
      evidence: {
        ...severityEvidence(decision),
        margin_before_cost_u: beforeCost,
        sales_qty: fact.salesQty,
        price: fact.promoPrice,
        cost: null,
        loss_rub: loss,
        storage_excluded: fact.storageExcluded,
        logistics_per_unit: fact.logisticsPerUnit,
        fee_rate_k: fact.feeRateK,
      },
      recommendation: "Укажите себестоимость и поднимите цену, пока на 1 продажу уже минус до закупки.",
      actionType: "OPEN_PRICE_EDITOR",
      businessImpactType: "PROFIT_PROTECTION",
      eventKind: null,
    });
  }

  if (fact.marginPercent == null || fact.marginRub == null) {
    return null;
  }

  const m = fact.marginPercent / 100;
  const uNow = fact.marginRub;
  if (m > -0.02 || !(uNow < 0)) return null;

  const loss = moneyAtRiskFromUnit(fact, uNow);
  const storageNote = fact.storageExcluded
    ? " Без учёта хранения: данных WB о хранении нет, реальная маржа ниже."
    : "";
  const dropNote =
    fact.priorMarginPercent != null && fact.priorMarginPercent > fact.marginPercent
      ? ` Маржа упала с ${marginPct(fact.priorMarginPercent)} до ${marginPct(fact.marginPercent)}.`
      : "";
  const unitLines = [
    `цена продавца ${rub(fact.promoPrice)}`,
    fact.feeRateK != null ? `удержания WB ${(fact.feeRateK * 100).toLocaleString("ru-RU")}%` : null,
    logisticsBreakdown(fact),
    fact.storagePerUnit != null ? `хранение ${rub(fact.storagePerUnit)}` : "хранение: нет данных",
    fact.acceptancePerUnit != null ? `приёмка ${rub(fact.acceptancePerUnit)}` : null,
    `себестоимость ${rub(fact.cost)}`,
    `итог на 1 продажу ${rub(uNow)}`,
  ]
    .filter(Boolean)
    .join("; ");

  const decision = severityFromMoney({
    moneyAtRiskRub: loss,
    store,
    thresholds,
  });
  let severity = decision.severity;
  const importantShare = store.useGrossProfit
    ? thresholds.severityGrossImportantShare
    : thresholds.severityTurnoverImportantShare;
  const base = store.useGrossProfit ? store.grossProfitRub : store.turnoverRub;
  if (base != null && base > 0 && loss / base >= importantShare) {
    severity = "critical";
  } else if (severity === "opportunity") {
    severity = "important";
  }

  const be =
    fact.breakEvenImpossible
      ? "при текущих удержаниях выйти в плюс ценой нельзя"
      : fact.breakEvenPrice != null
        ? `безубыточность ${rub(fact.breakEvenPrice)}`
        : "";

  return draft(fact, {
    type: "TASK_NEGATIVE_MARGIN",
    category: "economics",
    baseSeverity: severity,
    severityFloor: severity,
    severityCeiling: severity,
    title: "Убыточная цена",
    description: `${fact.title}: ${unitLines}; маржа на 1 продажу ${marginPct(fact.marginPercent)}; деньги под риском ${rub(loss)}${
      be ? `; ${be}` : ""
    }.${dropNote}${storageNote}`,
    reason: "Маржа на 1 продажу ≤ −2% при текущей цене. Штрафы в маржу не входят.",
    evidence: {
      ...severityEvidence(decision),
      margin_percent: fact.marginPercent,
      margin_rub: uNow,
      sales_qty: fact.salesQty,
      price: fact.promoPrice,
      cost: fact.cost,
      break_even_price: fact.breakEvenPrice,
      loss_rub: loss,
      storage_excluded: fact.storageExcluded,
    },
    recommendation:
      fact.breakEvenPrice != null
        ? `Поставьте цену не ниже ${rub(fact.breakEvenPrice)}.`
        : "Пересмотрите цену или себестоимость: при текущих удержаниях WB выйти в плюс ценой нельзя.",
    actionType: "OPEN_PRICE_EDITOR",
    businessImpactType: "PROFIT_PROTECTION",
    eventKind: null,
  });
}

export function ruleMarginNearZero(fact: TaskFact): TaskDraft | null {
  if (!notAccountEstimate(fact)) return null;
  if (fact.unitSaleNoDeliveries) return null;
  if (fact.marginPercent == null || fact.promoPrice == null || fact.cost == null) return null;
  const m = fact.marginPercent / 100;
  if (!(m > -0.02 && m < 0)) return null;
  const storageNote = fact.storageExcluded
    ? " Без учёта хранения: данных WB о хранении нет, реальная маржа ниже."
    : "";
  return draft(fact, {
    type: "TASK_MARGIN_NEAR_ZERO",
    category: "economics",
    baseSeverity: "opportunity",
    severityFloor: "opportunity",
    severityCeiling: "opportunity",
    title: "Маржа около нуля",
    description: `${fact.title}: маржа на 1 продажу ${marginPct(fact.marginPercent)}.${storageNote}`,
    reason: "Убыток меньше 2% на 1 продажу.",
    evidence: {
      margin_percent: fact.marginPercent,
      sales_qty: fact.salesQty,
      price: fact.promoPrice,
      cost: fact.cost,
    },
    recommendation: "Следите за следующим отчётом: если убыток углубится ниже −2%, поднимите цену.",
    actionType: "OPEN_PRICE_EDITOR",
    businessImpactType: "PROFIT_PROTECTION",
    eventKind: null,
  });
}

export function ruleLowMargin(
  fact: TaskFact,
  thresholds: TaskThresholds,
  store: StoreMoneyContext = { turnoverRub: null, grossProfitRub: null, useGrossProfit: false },
): TaskDraft | null {
  if (thresholds.lowMarginPercent == null) return null;
  if (!notAccountEstimate(fact)) return null;
  if (fact.unitSaleNoDeliveries) return null;
  if (fact.storageExcluded) return null;
  if (fact.marginPercent == null || fact.promoPrice == null || fact.cost == null) return null;
  if (fact.marginRub == null) return null;

  const m = fact.marginPercent / 100;
  const g = thresholds.lowMarginPercent / 100;
  if (m < 0 || m >= g) return null;
  const pNow = fact.promoPrice;
  if (!(pNow > 0)) return null;
  const mNow = fact.marginRub / pNow;
  if (mNow >= g) return null;

  const unitGap = (g - m) * pNow;
  const gap = moneyAtRiskFromUnit(fact, -unitGap);
  const decision = severityFromMoney({
    moneyAtRiskRub: gap,
    store,
    thresholds,
  });
  if (decision.severity === "critical") decision.severity = "important";
  const z = estimateTargetPrice(fact, g);

  return draft(fact, {
    type: "TASK_LOW_MARGIN",
    category: "economics",
    baseSeverity: decision.severity,
    severityFloor: "opportunity",
    severityCeiling: "important",
    title: "Маржа ниже целевой",
    description: `${fact.title}: маржа на 1 продажу ${marginPct(fact.marginPercent)} при цели ${marginPct(thresholds.lowMarginPercent)}.${
      z != null ? ` Для цели нужна цена не ниже ${rub(z)} (сейчас ${rub(pNow)}).` : ""
    }`,
    reason: "Целевая маржа задана продавцом. Это цель, не доказанная потеря — не выше «Важно».",
    evidence: {
      margin_percent: fact.marginPercent,
      target_margin_percent: thresholds.lowMarginPercent,
      gap_rub: Math.round(gap),
      price: pNow,
      target_price: z,
      sales_qty: fact.salesQty,
      severity_basis: decision.basis,
    },
    recommendation: z != null ? `Поднимите цену до ${rub(z)} или выше.` : "Поднимите цену до целевой маржи.",
    actionType: "OPEN_PRICE_EDITOR",
    businessImpactType: "PROFIT_GROWTH",
    eventKind: null,
  });
}

function estimateTargetPrice(fact: TaskFact, g: number): number | null {
  if (fact.promoPrice == null || fact.marginRub == null || fact.feeRateK == null) return null;
  if (fact.breakEvenImpossible) return null;
  const p = fact.promoPrice;
  const u = fact.marginRub;
  const k = fact.feeRateK;
  const denomNow = 1 - k;
  if (!(denomNow > 0)) return null;
  const F = p * denomNow - u;
  const denomTarget = 1 - k - g;
  if (!(denomTarget > 0)) return null;
  return Math.ceil(F / denomTarget);
}

export function ruleMarginDeterioration(
  fact: TaskFact,
  _baseline: TaskBaseline | null,
  thresholds: TaskThresholds,
  store: StoreMoneyContext = { turnoverRub: null, grossProfitRub: null, useGrossProfit: false },
): TaskDraft | null {
  if (!notAccountEstimate(fact)) return null;
  if (fact.unitSaleNoDeliveries) return null;
  if (fact.storageExcluded) return null;
  if (fact.unitSaleWindowMarginPercent == null || fact.priorMarginPercent == null) return null;
  if (fact.unitSaleWindowMarginRub == null || fact.priorMarginWindowU == null) return null;
  if (fact.cost == null) return null;

  const m2 = fact.unitSaleWindowMarginPercent / 100;
  const m1 = fact.priorMarginPercent / 100;
  if (m1 - m2 < thresholds.marginDropPoints / 100) return null;
  if (m2 <= -0.02) return null; // ведёт убыточная
  const u2 = fact.unitSaleWindowMarginRub;
  const u1 = fact.priorMarginWindowU;
  if (u2 >= u1) return null;

  const du = u2 - u1;
  const money = moneyAtRiskFromUnit(fact, du);
  if (money <= 0) return null;

  const decision = severityFromMoney({
    moneyAtRiskRub: money,
    store,
    thresholds,
  });
  if (decision.severity === "critical") decision.severity = "important";

  const dropPts =
    Math.round((fact.priorMarginPercent - fact.unitSaleWindowMarginPercent) * 10) / 10;

  return draft(fact, {
    type: "TASK_MARGIN_DETERIORATION",
    category: "economics",
    baseSeverity: decision.severity,
    severityFloor: "opportunity",
    severityCeiling: "important",
    title: "Маржа ухудшилась",
    description: `${fact.title}: маржа на 1 продажу упала с ${marginPct(fact.priorMarginPercent)} до ${marginPct(fact.unitSaleWindowMarginPercent)} (Δ ${dropPts.toLocaleString("ru-RU")} п.п.) при одном выкупе b за 90 дней. На 1 продажу прибыль изменилась на ${rub(du)}. Изменения себестоимости не отслеживаются.`,
    reason: `Падение маржи на 1 продажу ≥ ${thresholds.marginDropPoints} п.п. между окнами доставок при общем b₉₀.`,
    evidence: {
      previous_margin_percent: fact.priorMarginPercent,
      margin_percent: fact.unitSaleWindowMarginPercent,
      margin_drop_points: dropPts,
      money_at_risk: Math.round(money),
      sales_qty: fact.salesQty,
      prior_sales_qty: fact.priorSalesQty,
      severity_basis: decision.basis,
    },
    recommendation: "Разберите, что выросло: удержания WB, логистика или цена.",
    actionType: "OPEN_PRICE_EDITOR",
    businessImpactType: "PROFIT_PROTECTION",
    eventKind: null,
  });
}

/** Одна задача на магазин: нет себестоимости у товаров с продажами. */
export function ruleCostMissing(
  products: TaskFact[],
  store: StoreMoneyContext,
): TaskDraft | null {
  const missing = products.filter(
    (f) =>
      f.salesQty != null &&
      f.salesQty > 0 &&
      (f.cost == null || !(f.cost > 0)) &&
      f.salesKnown,
  );
  if (missing.length === 0) return null;
  const withRevenue = missing
    .map((f) => ({
      nmId: f.nmId,
      title: f.title,
      S: f.sellerRevenueS ?? f.retailSum ?? 0,
    }))
    .sort((a, b) => b.S - a.S);
  const missingS = withRevenue.reduce((sum, row) => sum + row.S, 0);
  const totalS =
    products.reduce((sum, f) => sum + (f.sellerRevenueS ?? f.retailSum ?? 0), 0) ||
    store.turnoverRub ||
    0;
  const share = totalS > 0 ? Math.round((missingS / totalS) * 1000) / 10 : null;
  const list = withRevenue
    .slice(0, 12)
    .map((row) => `${row.title} (${row.nmId})`)
    .join("; ");
  return draft(null, {
    type: "TASK_COST_MISSING",
    category: "economics",
    baseSeverity: "opportunity",
    severityFloor: "opportunity",
    severityCeiling: "opportunity",
    title: "Не введена себестоимость",
    description: `Маржа не считается для ${missing.length} товаров${
      share != null ? `, это ${share.toLocaleString("ru-RU")}% выручки за 28 дней` : ""
    }. Введите себестоимость, начиная с самых продаваемых: ${list}.`,
    reason: "Без закупки операционная маржа не считается. Типичные комиссии не подставляем.",
    evidence: {
      missing_count: missing.length,
      missing_revenue_share_percent: share,
      missing_revenue_rub: Math.round(missingS),
    },
    recommendation: "Впишите себестоимость у товаров с наибольшей выручкой.",
    actionType: "OPEN_PRICE_EDITOR",
    businessImpactType: "PROFIT_PROTECTION",
    eventKind: null,
  });
}

function contentGapBody(fact: TaskFact): string {
  const lines = fact.contentGaps?.length
    ? fact.contentGaps
    : fact.contentGap
      ? fact.contentGap.split("\n").filter(Boolean)
      : [];
  const list = lines.length > 0 ? `\n${lines.join("\n")}` : "";
  const peer = fact.contentPeerLine ? `\n${fact.contentPeerLine}` : "";
  return `${list}${peer}`;
}

export function ruleContent(fact: TaskFact, thresholds: TaskThresholds): TaskDraft | null {
  if (fact.contentScore == null || fact.contentScore >= thresholds.lowContentScore) return null;
  const withSales = fact.salesQty != null && fact.salesQty > 0;
  const gaps = contentGapBody(fact);
  if (withSales) {
    return draft(fact, {
      type: "TASK_CONTENT_OPPORTUNITY",
      category: "content",
      baseSeverity: "opportunity",
      severityFloor: "opportunity",
      severityCeiling: "opportunity",
      title: "Карточка имеет потенциал для улучшения",
      description: `${fact.title}: контент ${fact.contentScore} из 100 при продажах ${pieces(fact.salesQty!)}.${gaps}`,
      reason: `Контент ниже ${thresholds.lowContentScore}, и в отчёте есть продажи. Рост продаж от правки не обещается.`,
      evidence: {
        content_score: fact.contentScore,
        low_content_score: thresholds.lowContentScore,
        content_gap: fact.contentGap,
        content_gaps: (fact.contentGaps ?? []).join("\n") || null,
        content_peer: fact.contentPeerLine ?? null,
        sales_28d: fact.salesQty,
        photo_count: fact.photoCount,
      },
      recommendation: "Карточку можно улучшить. Это не обещание, что продажи вырастут.",
      actionType: "OPEN_CONTENT_EDITOR",
      businessImpactType: "SALES_GROWTH",
      eventKind: null,
    });
  }
  /** Решение 5: контент без рублёвой оценки — не выше «Возможности». */
  return draft(fact, {
    type: "TASK_LOW_CONTENT_SCORE",
    category: "content",
    baseSeverity: "opportunity",
    severityFloor: "opportunity",
    severityCeiling: "opportunity",
    title: "Контент карточки ниже порога",
    description: `${fact.title}: контент ${fact.contentScore} из 100.${gaps}`,
    reason: `Контент-скор ниже ${thresholds.lowContentScore}. Без оценки влияния в рублях важность не выше «Возможности».`,
    evidence: {
      content_score: fact.contentScore,
      low_content_score: thresholds.lowContentScore,
      content_gap: fact.contentGap,
      content_gaps: (fact.contentGaps ?? []).join("\n") || null,
      content_peer: fact.contentPeerLine ?? null,
      photo_count: fact.photoCount,
      sales_28d: fact.salesQty,
      severity_cap: "opportunity_no_money",
    },
    recommendation: fact.contentGaps?.length
      ? `Проверьте карточку.\n${fact.contentGaps.join("\n")}`
      : fact.contentGap
        ? `Проверьте карточку. ${fact.contentGap}`
        : "Проверьте карточку: контент ниже заданного порога.",
    actionType: "OPEN_CONTENT_EDITOR",
    businessImpactType: "OPERATIONAL",
    eventKind: null,
  });
}

export function ruleLowPhoto(fact: TaskFact, thresholds: TaskThresholds): TaskDraft | null {
  if (fact.photoCount == null || fact.contentScore == null) return null;
  if (fact.photoCount >= thresholds.fullPhotoCount) return null;
  if (fact.contentScore < thresholds.lowContentScore) return null;
  return draft(fact, {
    type: "TASK_LOW_PHOTO_COUNT",
    category: "content",
    baseSeverity: "opportunity",
    severityFloor: "opportunity",
    severityCeiling: "opportunity",
    title: "В карточке мало фото",
    description: `${fact.title}: фото ${fact.photoCount}. Полный балл медиа в текущей шкале начинается с ${thresholds.fullPhotoCount}.`,
    reason: "Число фото известно и ниже порога полного балла. Общий контент при этом не ниже порога, поэтому это отдельная проверка, а не повтор слабой карточки.",
    evidence: {
      photo_count: fact.photoCount,
      full_photo_count: thresholds.fullPhotoCount,
      content_score: fact.contentScore,
    },
    recommendation: `Проверьте фото: для полного балла медиа нужно ${thresholds.fullPhotoCount} снимков. Сейчас ${fact.photoCount}.`,
    actionType: "OPEN_CONTENT_EDITOR",
    businessImpactType: "SALES_GROWTH",
    eventKind: null,
  });
}

export function ruleUnansweredReviews(store: StoreTaskFacts): TaskDraft | null {
  if (store.unansweredFeedbacks == null || store.unansweredFeedbacks <= 0) return null;
  return draft(null, {
    type: "TASK_UNANSWERED_REVIEWS",
    category: "reviews",
    baseSeverity: "important",
    severityFloor: "opportunity",
    severityCeiling: "important",
    title: "Есть отзывы без ответа",
    description: `Неотвеченных отзывов в кабинете: ${store.unansweredFeedbacks}. К артикулу счётчик не привязан.`,
    reason: "API отдал общий счётчик неотвеченных отзывов. Список по товарам в этом снимке нет.",
    evidence: { unanswered_feedbacks: store.unansweredFeedbacks },
    recommendation: "Ответьте на новые отзывы покупателей.",
    actionType: "OPEN_REVIEW_RESPONSES",
    businessImpactType: "OPERATIONAL",
    eventKind: "reviews_unanswered",
  });
}

export function ruleUnansweredQuestions(store: StoreTaskFacts): TaskDraft | null {
  if (store.unansweredQuestions == null || store.unansweredQuestions <= 0) return null;
  return draft(null, {
    type: "TASK_UNANSWERED_QUESTIONS",
    category: "reviews",
    baseSeverity: "important",
    severityFloor: "opportunity",
    severityCeiling: "important",
    title: "Есть вопросы без ответа",
    description: `Неотвеченных вопросов в кабинете: ${store.unansweredQuestions}. К артикулу счётчик не привязан.`,
    reason: "API отдал общий счётчик неотвеченных вопросов.",
    evidence: { unanswered_questions: store.unansweredQuestions },
    recommendation: "Ответьте на новые вопросы покупателей.",
    actionType: "OPEN_QUESTIONS",
    businessImpactType: "OPERATIONAL",
    eventKind: "questions_unanswered",
  });
}

export function collectDrafts(
  fact: TaskFact,
  baseline: TaskBaseline | null,
  settings: TaskSettings,
  now: string,
  store: StoreMoneyContext = { turnoverRub: null, grossProfitRub: null, useGrossProfit: false },
  events: TaskEventRef[] = [],
  shop: ShopBuyoutContext | null = null,
  /** Если true — TASK_NO_SALES уже собран магазином (finalizeNoSalesDrafts). */
  skipNoSales = false,
  /** nmId с TASK_NO_SALES — излишек не создаём. */
  noSalesNmIds: ReadonlySet<string> | null = null,
  stockHistorySince: string | null = null,
): TaskDraft[] {
  const hadStockOut = Boolean(baseline?.stockOutAt);
  function run(type: TaskDraft["type"], build: (thresholds: TaskThresholds) => TaskDraft | null): TaskDraft | null {
    const thresholds = thresholdsFor(settings, fact.nmId, type);
    if (!thresholds) return null;
    const row = build(thresholds);
    if (!row || row.type !== type) return null;
    return row;
  }
  const blockedByNoSales = noSalesNmIds?.has(fact.nmId) ?? false;
  /** «Не продаётся» исключает «Излишек» по тому же артикулу. */
  const noSales = skipNoSales
    ? null
    : run("TASK_NO_SALES", (thresholds) =>
        ruleNoSales(fact, thresholds, { now, store, events, stockHistorySince }),
      );
  const excludeExcess = Boolean(noSales) || blockedByNoSales;
  /** Спрос собирает engine через finalizeDemandDrafts (FDR по магазину). */
  const found = [
    run("TASK_STOCK_OUT", (thresholds) =>
      ruleStockOut(fact, baseline, thresholds, store, now, shop),
    ),
    run("TASK_LOW_STOCK", (thresholds) =>
      ruleLowStock(fact, thresholds, store, hadStockOut, shop),
    ),
    excludeExcess
      ? null
      : run("TASK_EXCESS_STOCK", (thresholds) =>
          ruleExcessStock(fact, thresholds, store, hadStockOut, shop),
        ),
    // TASK_STAGNANT_CAPITAL: §3.3 объединено с EXCESS — новых не создаём.
    noSales,
    run("TASK_LOW_CONTENT_SCORE", (thresholds) => ruleContent(fact, thresholds)),
    run("TASK_CONTENT_OPPORTUNITY", (thresholds) => ruleContent(fact, thresholds)),
  ];
  const base = found.filter((row): row is TaskDraft => row != null);
  // Маржа: Убыточная > Около нуля > Ухудшилась > Ниже целевой.
  const negative = run("TASK_NEGATIVE_MARGIN", (thresholds) =>
    ruleNegativeMargin(fact, store, thresholds),
  );
  if (negative) return [...base, negative];
  const near = run("TASK_MARGIN_NEAR_ZERO", () => ruleMarginNearZero(fact));
  if (near) return [...base, near];
  const det = run("TASK_MARGIN_DETERIORATION", (thresholds) =>
    ruleMarginDeterioration(fact, baseline, thresholds, store),
  );
  if (det) return [...base, det];
  const low = run("TASK_LOW_MARGIN", (thresholds) => ruleLowMargin(fact, thresholds, store));
  if (low) return [...base, low];
  return base;
}

/** Магазинные задачи маржи (себестоимость). */
export function collectStoreMarginDrafts(
  products: TaskFact[],
  settings: TaskSettings,
  store: StoreMoneyContext,
): TaskDraft[] {
  const thresholds = thresholdsFor(settings, null, "TASK_COST_MISSING");
  if (!thresholds) return [];
  const row = ruleCostMissing(products, store);
  return row ? [row] : [];
}
