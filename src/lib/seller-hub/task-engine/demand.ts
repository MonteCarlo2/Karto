import { contentLeverSuffix } from "@/lib/seller-hub/product-signal";
import type { TaskThresholds } from "./config";
import { ageDays } from "./facts";
import {
  severityEvidence,
  severityFromMoney,
  whyImportantLine,
  type StoreMoneyContext,
} from "./severity";
import {
  benjaminiHochberg,
  bhAdjustedPValues,
  poissonRateTest,
  twoProportionTest,
} from "./stats";
import type {
  TaskBaseline,
  TaskDraft,
  TaskEventRef,
  TaskEvidence,
  TaskFact,
  TaskSeverity,
  TaskType,
} from "./types";

const DEMAND_TYPES = [
  "TASK_SALES_DROP",
  "TASK_SALES_GROWTH",
  "TASK_CONVERSION_DROP",
  "TASK_LOW_TRAFFIC",
] as const satisfies readonly TaskType[];

export type DemandTaskType = (typeof DEMAND_TYPES)[number];

export function isDemandTaskType(type: TaskType): type is DemandTaskType {
  return (DEMAND_TYPES as readonly string[]).includes(type);
}

export type ProbableCause = {
  kind: string;
  label: string;
  detail: string;
  from: string | null;
  to: string | null;
  at: string | null;
};

function rub(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function pieces(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} шт.`;
}

function pctRel(value: number): string {
  const rounded = Math.round(value * 1000) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("ru-RU")}%`;
}

function formatDateRu(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso.length <= 10 ? `${iso}T12:00:00.000Z` : iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function demandPeriodCaption(fact: TaskFact, sourceLabel: string): string {
  const curFrom = formatDateRu(fact.funnelDateFrom);
  const curTo = formatDateRu(fact.funnelDateTo);
  const pastFrom = formatDateRu(fact.funnelPastDateFrom);
  const pastTo = formatDateRu(fact.funnelPastDateTo);
  if (curFrom && curTo && pastFrom && pastTo) {
    return `${sourceLabel}, ${curFrom}–${curTo} против ${pastFrom}–${pastTo}`;
  }
  return `${sourceLabel}, текущие 28 дней против прошлых 28`;
}

function draftShell(
  fact: TaskFact,
  partial: Omit<TaskDraft, "nmId" | "itemId" | "productTitle" | "vendorCode">,
): TaskDraft {
  return {
    nmId: fact.nmId,
    itemId: fact.itemId,
    productTitle: fact.title,
    vendorCode: fact.vendorCode,
    ...partial,
  };
}

export function storeOrderSum28d(facts: TaskFact[]): number | null {
  let sum = 0;
  let any = false;
  for (const fact of facts) {
    if (fact.orderSum != null && Number.isFinite(fact.orderSum)) {
      sum += fact.orderSum;
      any = true;
    }
  }
  return any ? sum : null;
}

/**
 * Важность по доле денежного эффекта — тонкая обёртка над severityFromMoney (§1).
 * @deprecated для новой логики вызывайте severityFromMoney напрямую.
 */
export function demandSeverityFromMoney(
  moneyRub: number | null,
  storeTurnoverRub: number | null,
  thresholds: TaskThresholds,
): TaskSeverity {
  return severityFromMoney({
    moneyAtRiskRub: moneyRub,
    store: {
      turnoverRub: storeTurnoverRub,
      grossProfitRub: null,
      useGrossProfit: false,
    },
    thresholds,
  }).severity;
}

export function lostOrdersEstimate(prior: number, current: number, windowDays: number): number {
  const priorRate = prior / windowDays;
  const currentRate = current / windowDays;
  return Math.max(0, (priorRate - currentRate) * windowDays);
}

function enoughEvents(prior: number, current: number, min: number): boolean {
  return prior + current >= min;
}

function stockRiskBlocksDemand(fact: TaskFact, thresholds: TaskThresholds): boolean {
  if (fact.stock != null && fact.stock <= 0) return true;
  if (fact.stock != null && fact.coverDays != null && fact.coverDays < thresholds.lowStockDays) return true;
  return false;
}

function hasStockIssueEvent(events: TaskEventRef[], nmId: string): boolean {
  return events.some(
    (event) =>
      event.nmId === nmId && (event.kind === "stock_out" || event.kind === "low_stock"),
  );
}

/**
 * OOS / короткий запас в окне: без известных дней в наличии сравнение блокируем.
 * Дней в наличии в Hub нет → при событии stock_out/low_stock или текущем риске задачу не создаём.
 */
export function demandBlockedByStock(
  fact: TaskFact,
  events: TaskEventRef[],
  thresholds: TaskThresholds,
  hadStockOutAt: boolean,
): boolean {
  if (stockRiskBlocksDemand(fact, thresholds)) return true;
  if (hasStockIssueEvent(events, fact.nmId)) return true;
  if (hadStockOutAt) return true;
  return false;
}

export type DemandRuleContext = {
  now: string;
  events: TaskEventRef[];
  baseline: TaskBaseline | null;
  /** @deprecated используйте store.turnoverRub */
  storeOrderSum: number | null;
  store?: StoreMoneyContext;
  /** Был ли товар без остатка в серии (baseline.stockOutAt). */
  hadStockOutAt: boolean;
};

export function findProbableCause(
  fact: TaskFact,
  baseline: TaskBaseline | null,
  events: TaskEventRef[],
  thresholds: TaskThresholds,
): ProbableCause | null {
  const nmEvents = events.filter((event) => event.nmId === fact.nmId);
  const priceKinds = new Set(["price_changed", "discount_changed", "promo_price_changed"]);
  const contentKinds = new Set(["content_score_changed", "photos_changed", "card_title_changed", "card_description_changed", "card_characteristics_changed", "card_video_changed"]);

  if (
    baseline?.promoPrice != null &&
    fact.promoPrice != null &&
    baseline.promoPrice > 0
  ) {
    const change = ((fact.promoPrice - baseline.promoPrice) / baseline.promoPrice) * 100;
    if (Math.abs(change) >= thresholds.priceCausePercent) {
      const event = nmEvents.find((row) => priceKinds.has(row.kind));
      return {
        kind: "promo_price_changed",
        label: "изменилась цена со скидкой",
        detail: `${rub(baseline.promoPrice)} → ${rub(fact.promoPrice)} (${pctRel(change / 100)})`,
        from: String(baseline.promoPrice),
        to: String(fact.promoPrice),
        at: event?.id ?? null,
      };
    }
  }

  for (const event of nmEvents) {
    if (priceKinds.has(event.kind)) {
      return {
        kind: event.kind,
        label:
          event.kind === "discount_changed"
            ? "изменилась скидка"
            : event.kind === "price_changed"
              ? "изменилась цена"
              : "изменилась цена со скидкой",
        detail: event.id,
        from: null,
        to: null,
        at: event.id,
      };
    }
  }

  for (const event of nmEvents) {
    if (contentKinds.has(event.kind)) {
      return {
        kind: event.kind,
        label: event.kind === "photos_changed" ? "изменилось число фото" : "изменился контент",
        detail: event.id,
        from: null,
        to: null,
        at: event.id,
      };
    }
  }

  return null;
}

function causeEvidence(cause: ProbableCause | null): TaskEvidence {
  if (!cause) {
    return {
      probable_cause: null,
      probable_cause_kind: null,
      probable_cause_detail: null,
    };
  }
  return {
    probable_cause: cause.label,
    probable_cause_kind: cause.kind,
    probable_cause_detail: cause.detail,
    probable_cause_from: cause.from,
    probable_cause_to: cause.to,
    probable_cause_note: "Вероятная причина по данным Hub, не доказанная.",
  };
}

function causeSentence(cause: ProbableCause | null): string {
  if (!cause) return "";
  return ` Вероятная причина по данным Hub: ${cause.label} (${cause.detail}). Это не доказательство.`;
}

function volumesSentence(opens: number | null, orders: number | null): string {
  const parts: string[] = [];
  if (opens != null) parts.push(`${pieces(opens).replace(" шт.", "")} переходов`);
  if (orders != null) parts.push(`${pieces(orders)} заказов`);
  if (parts.length === 0) return "";
  return `на основе ${parts.join(" и ")} за 28 дней`;
}

function resolveMoneyStore(store: StoreMoneyContext | null | undefined, turnoverFallback: number | null): StoreMoneyContext {
  if (store) return store;
  return { turnoverRub: turnoverFallback, grossProfitRub: null, useGrossProfit: false };
}

function applySeverity(
  draft: TaskDraft,
  moneyRub: number | null,
  ctx: Pick<DemandRuleContext, "store" | "storeOrderSum">,
  thresholds: TaskThresholds,
  growthStockWarn: boolean,
): TaskDraft {
  const moneyStore = resolveMoneyStore(ctx.store, ctx.storeOrderSum);
  if (draft.type === "TASK_SALES_GROWTH") {
    const level: TaskSeverity = growthStockWarn ? "important" : "opportunity";
    const why = growthStockWarn
      ? "Почему это важно: рост спроса при коротком запасе — риск обнуления."
      : null;
    return {
      ...draft,
      baseSeverity: level,
      severityFloor: level,
      severityCeiling: level,
      evidence: {
        ...draft.evidence,
        money_impact_rub: moneyRub,
        store_order_sum_28d: moneyStore.turnoverRub,
        store_turnover_share: null,
        demand_severity_basis: growthStockWarn ? "growth_with_short_cover" : "growth_opportunity",
        severity_basis: growthStockWarn ? "срочность" : "деньги неизвестны",
        why_important: why,
      },
    };
  }
  const decision = severityFromMoney({
    moneyAtRiskRub: moneyRub,
    store: moneyStore,
    thresholds,
  });
  const why = whyImportantLine(decision);
  return {
    ...draft,
    baseSeverity: decision.severity,
    severityFloor: decision.severity,
    severityCeiling: decision.severity,
    evidence: {
      ...draft.evidence,
      money_impact_rub: moneyRub,
      store_order_sum_28d: moneyStore.turnoverRub,
      store_turnover_share: decision.shareOfTurnover,
      demand_severity_basis: decision.basis,
      ...severityEvidence(decision),
      why_important: why,
    },
  };
}

export type DemandCandidate = {
  draft: TaskDraft;
  pValue: number;
};

function tooYoung(fact: TaskFact, now: string, thresholds: TaskThresholds): boolean {
  const age = ageDays(fact.createdAt, now);
  if (age == null) return false;
  return age < thresholds.demandMinAgeDays;
}

function salesSeries(fact: TaskFact): {
  current: number;
  prior: number;
  source: "orders" | "realization";
  sourceLabel: string;
} | null {
  if (fact.funnelStatus === "ok" && fact.orders != null && fact.priorOrders != null) {
    return {
      current: fact.orders,
      prior: fact.priorOrders,
      source: "orders",
      sourceLabel: "воронка WB",
    };
  }
  if (fact.salesQty == null || fact.priorSalesQty == null) return null;
  return {
    current: fact.salesQty,
    prior: fact.priorSalesQty,
    source: "realization",
    sourceLabel: "отчёт реализации",
  };
}

export function candidateSalesDrop(
  fact: TaskFact,
  ctx: DemandRuleContext,
  thresholds: TaskThresholds,
): DemandCandidate | null {
  if (tooYoung(fact, ctx.now, thresholds)) return null;
  if (demandBlockedByStock(fact, ctx.events, thresholds, ctx.hadStockOutAt)) {
    return null;
  }
  const series = salesSeries(fact);
  if (!series) return null;
  if (!enoughEvents(series.prior, series.current, thresholds.demandMinEvents)) return null;
  const t = thresholds.demandWindowDays;
  const test = poissonRateTest(series.prior, t, series.current, t);
  if (test.status !== "ok") return null;
  if (!(test.relativeChange <= -thresholds.salesChangePercent / 100)) return null;
  // Недостоверные (высокий p) не тащим в FDR-пул — иначе шум раздувает m.
  if (!(test.pValue <= thresholds.demandFdrQ)) return null;
  const lostUnits = lostOrdersEstimate(series.prior, series.current, t);
  const money =
    fact.avgOrderPrice != null && fact.avgOrderPrice > 0
      ? Math.round(lostUnits * fact.avgOrderPrice)
      : null;
  const cause = findProbableCause(fact, ctx.baseline, ctx.events, thresholds);
  const period = demandPeriodCaption(fact, series.sourceLabel);
  const opensTotal =
    series.source === "orders" && fact.openCount != null && fact.priorOpenCount != null
      ? fact.openCount + fact.priorOpenCount
      : null;
  const volumes = volumesSentence(opensTotal, series.prior + series.current);
  const metric = series.source === "orders" ? "заказы" : "выкупы";
  let draft = draftShell(fact, {
    type: "TASK_SALES_DROP",
    category: "sales",
    baseSeverity: "opportunity",
    severityFloor: "opportunity",
    severityCeiling: "critical",
    title: series.source === "orders" ? "Проверить падение заказов" : "Проверить падение продаж",
    description: `${fact.title}: ${metric} снизились ${pctRel(test.relativeChange)} (${pieces(series.prior)} → ${pieces(series.current)})${volumes ? `, ${volumes}` : ""}. Период: ${period}. Оценка потерь: ${pieces(lostUnits)}${money != null ? ` ≈ ${rub(money)}` : ""} (оценка).${causeSentence(cause)}`,
    reason: `Статистически достоверное падение ${metric} при относительной существенности ≥ ${thresholds.salesChangePercent}% (${series.sourceLabel}).`,
    evidence: {
      current_sales_28d: series.current,
      previous_sales_28d: series.prior,
      sales_delta_units: series.current - series.prior,
      change_percent: Math.round(test.relativeChange * 1000) / 10,
      relative_change: test.relativeChange,
      lost_orders_est: Math.round(lostUnits * 10) / 10,
      lost_money_est: money,
      money_is_estimate: true,
      p_value: test.pValue,
      p_adjusted: null,
      test: test.test,
      demand_source: series.sourceLabel,
      volume_opens: fact.openCount != null && fact.priorOpenCount != null
        ? fact.openCount + fact.priorOpenCount
        : null,
      volume_orders: series.prior + series.current,
      period_caption: period,
      ...causeEvidence(cause),
      price_changed: cause?.kind.includes("price") || cause?.kind.includes("discount") || false,
    },
    recommendation: `Проверьте карточку, цену и запас: ${metric} упали достоверно.${causeSentence(cause)}`,
    actionType: "OPEN_PRODUCT",
    businessImpactType: "SALES_PROTECTION",
    eventKind: "sales_down",
  });
  draft = applySeverity(draft, money, ctx, thresholds, false);
  return { draft, pValue: test.pValue };
}

export function candidateSalesGrowth(
  fact: TaskFact,
  ctx: DemandRuleContext,
  thresholds: TaskThresholds,
): DemandCandidate | null {
  if (tooYoung(fact, ctx.now, thresholds)) return null;
  const series = salesSeries(fact);
  if (!series) return null;
  if (!enoughEvents(series.prior, series.current, thresholds.demandMinEvents)) return null;
  const t = thresholds.demandWindowDays;
  const test = poissonRateTest(series.prior, t, series.current, t);
  if (test.status !== "ok") return null;
  if (!(test.relativeChange >= thresholds.salesChangePercent / 100)) return null;
  if (!(test.pValue <= thresholds.demandFdrQ)) return null;
  const cause = findProbableCause(fact, ctx.baseline, ctx.events, thresholds);
  const period = demandPeriodCaption(fact, series.sourceLabel);
  const metric = series.source === "orders" ? "заказы" : "выкупы";
  const growthStockWarn =
    fact.coverDays != null && fact.coverDays < thresholds.lowStockDays && (fact.stock ?? 0) > 0;
  let draft = draftShell(fact, {
    type: "TASK_SALES_GROWTH",
    category: "sales",
    baseSeverity: "opportunity",
    severityFloor: "opportunity",
    severityCeiling: "important",
    title: series.source === "orders" ? "Рост заказов стоит сверить с запасом" : "Растущий спрос стоит сверить с запасом",
    description: `${fact.title}: ${metric} выросли ${pctRel(test.relativeChange)} (${pieces(series.prior)} → ${pieces(series.current)}). Период: ${period}.${causeSentence(cause)}`,
    reason: `Статистически достоверный рост ${metric} при относительной существенности ≥ ${thresholds.salesChangePercent}%.`,
    evidence: {
      current_sales_28d: series.current,
      previous_sales_28d: series.prior,
      sales_delta_units: series.current - series.prior,
      change_percent: Math.round(test.relativeChange * 1000) / 10,
      relative_change: test.relativeChange,
      p_value: test.pValue,
      p_adjusted: null,
      test: test.test,
      demand_source: series.sourceLabel,
      cover_days: fact.coverDays,
      stock: fact.stock,
      period_caption: period,
      ...causeEvidence(cause),
    },
    recommendation: growthStockWarn
      ? "Запас короткий относительно темпа: проверьте поставку, чтобы рост не обернулся нулём."
      : "Проверьте запас, чтобы рост спроса не привёл к дефициту.",
    actionType: "OPEN_STOCKS",
    businessImpactType: "SALES_GROWTH",
    eventKind: "sales_up",
  });
  draft = applySeverity(draft, null, ctx, thresholds, growthStockWarn);
  return { draft, pValue: test.pValue };
}

export function conversionTrafficLine(trafficRelativeChange: number): string {
  if (trafficRelativeChange > 0.05) {
    return "переходов стало больше, но в корзину и заказ они конвертируются хуже";
  }
  return "при стабильных переходах";
}

export function candidateConversionDrop(
  fact: TaskFact,
  ctx: DemandRuleContext,
  thresholds: TaskThresholds,
): DemandCandidate | null {
  if (tooYoung(fact, ctx.now, thresholds)) return null;
  if (demandBlockedByStock(fact, ctx.events, thresholds, ctx.hadStockOutAt)) return null;
  if (fact.funnelStatus !== "ok") return null;
  if (fact.orders == null || fact.priorOrders == null) return null;
  if (!enoughEvents(fact.priorOrders, fact.orders, thresholds.demandMinEvents)) return null;

  const t = thresholds.demandWindowDays;
  const ordersTest = poissonRateTest(fact.priorOrders, t, fact.orders, t);
  if (ordersTest.status !== "ok") return null;
  if (!(ordersTest.relativeChange <= -thresholds.salesChangePercent / 100)) return null;
  if (!(ordersTest.pValue <= thresholds.demandFdrQ)) return null;

  if (fact.openCount == null || fact.priorOpenCount == null) return null;
  if (!enoughEvents(fact.priorOpenCount, fact.openCount, thresholds.demandMinEvents)) return null;
  const trafficTest = poissonRateTest(fact.priorOpenCount, t, fact.openCount, t);
  if (trafficTest.status !== "ok") return null;
  // Трафик не должен сам объяснить падение заказов: переходы не упали сильнее порога трафика.
  if (trafficTest.relativeChange <= -thresholds.trafficDropPercent / 100) return null;

  type Stage = {
    which: "add_to_cart" | "cart_to_order";
    label: string;
    test: ReturnType<typeof twoProportionTest>;
    fromPct: number | null;
    toPct: number | null;
  };
  const stages: Stage[] = [];
  if (fact.cartCount != null && fact.priorCartCount != null) {
    const cart = twoProportionTest(
      fact.priorCartCount,
      fact.priorOpenCount,
      fact.cartCount,
      fact.openCount,
    );
    stages.push({
      which: "add_to_cart",
      label: "конверсия в корзину (переходы → корзина)",
      test: cart,
      fromPct: fact.priorAddToCartPercent,
      toPct: fact.addToCartPercent,
    });
  }
  if (fact.cartCount != null && fact.priorCartCount != null) {
    const order = twoProportionTest(
      fact.priorOrders,
      fact.priorCartCount,
      fact.orders,
      fact.cartCount,
    );
    stages.push({
      which: "cart_to_order",
      label: "конверсия в заказ (корзина → заказ)",
      test: order,
      fromPct: fact.priorCartToOrderPercent,
      toPct: fact.cartToOrderPercent,
    });
  }

  const usable = stages.filter(
    (stage) =>
      stage.test.status === "ok" &&
      stage.test.relativeChange <= -thresholds.conversionDropPercent / 100 &&
      stage.test.pValue <= thresholds.demandFdrQ,
  );
  if (usable.length === 0) return null;
  usable.sort((a, b) => {
    const ra = a.test.status === "ok" ? a.test.relativeChange : 0;
    const rb = b.test.status === "ok" ? b.test.relativeChange : 0;
    return ra - rb;
  });
  const best = usable[0]!;
  if (best.test.status !== "ok") return null;

  const lostUnits = lostOrdersEstimate(fact.priorOrders, fact.orders, t);
  const money =
    fact.avgOrderPrice != null && fact.avgOrderPrice > 0
      ? Math.round(lostUnits * fact.avgOrderPrice)
      : null;
  const cause = findProbableCause(fact, ctx.baseline, ctx.events, thresholds);
  const period = demandPeriodCaption(fact, "воронка WB");
  const trafficLine = conversionTrafficLine(trafficTest.relativeChange);
  const trafficLead =
    trafficTest.relativeChange > 0.05
      ? `заказы упали — ${trafficLine}`
      : `заказы упали ${trafficLine}`;
  const opensTotal = fact.priorOpenCount + fact.openCount;
  const ordersTotal = fact.priorOrders + fact.orders;

  const contentLevers =
    best.which === "add_to_cart" ? contentLeverSuffix(fact.contentGaps, 3) : "";
  let draft = draftShell(fact, {
    type: "TASK_CONVERSION_DROP",
    category: "sales",
    baseSeverity: "opportunity",
    severityFloor: "opportunity",
    severityCeiling: "critical",
    title: "Упала конверсия карточки",
    description: `${fact.title}: ${trafficLead}. ${best.label}: ${best.fromPct ?? "—"}% → ${best.toPct ?? "—"}%. На основе ${pieces(opensTotal).replace(" шт.", "")} переходов и ${pieces(ordersTotal)} заказов за 28 дней. Период: ${period}. Оценка потерь: ${pieces(lostUnits)}${money != null ? ` ≈ ${rub(money)}` : ""} (оценка).${causeSentence(cause)}${contentLevers}`,
    reason: `Достоверное падение заказов при недостоверном/слабом падении переходов и достоверном падении ${best.label} ≥ ${thresholds.conversionDropPercent}% относительно.`,
    evidence: {
      current_sales_28d: fact.orders,
      previous_sales_28d: fact.priorOrders,
      sales_delta_units: fact.orders - fact.priorOrders,
      change_percent: Math.round(ordersTest.relativeChange * 1000) / 10,
      relative_change: ordersTest.relativeChange,
      open_count: fact.openCount,
      prior_open_count: fact.priorOpenCount,
      cart_count: fact.cartCount,
      prior_cart_count: fact.priorCartCount,
      add_to_cart_percent: fact.addToCartPercent,
      prior_add_to_cart_percent: fact.priorAddToCartPercent,
      cart_to_order_percent: fact.cartToOrderPercent,
      prior_cart_to_order_percent: fact.priorCartToOrderPercent,
      conversion_stage: best.which,
      content_levers:
        best.which === "add_to_cart"
          ? (fact.contentGaps ?? []).slice(0, 3).join(" | ") || null
          : null,
      conversion_relative_change: best.test.relativeChange,
      lost_orders_est: Math.round(lostUnits * 10) / 10,
      lost_money_est: money,
      money_is_estimate: true,
      p_value: best.test.pValue,
      p_adjusted: null,
      test: best.test.test,
      orders_p_value: ordersTest.pValue,
      traffic_relative_change: trafficTest.relativeChange,
      demand_source: "воронка WB",
      volume_opens: opensTotal,
      volume_orders: ordersTotal,
      period_caption: period,
      ...causeEvidence(cause),
    },
    recommendation:
      trafficTest.relativeChange > 0.05
        ? "Проверьте карточку и цену: переходов больше, но в корзину и заказ кладут реже."
        : "Проверьте карточку и цену: при стабильных переходах в заказ или корзину стали класть реже.",
    actionType: "OPEN_PRODUCT",
    businessImpactType: "SALES_PROTECTION",
    eventKind: null,
  });
  draft = applySeverity(draft, money, ctx, thresholds, false);
  return { draft, pValue: best.test.pValue };
}

export function candidateLowTraffic(
  fact: TaskFact,
  ctx: DemandRuleContext,
  thresholds: TaskThresholds,
): DemandCandidate | null {
  if (tooYoung(fact, ctx.now, thresholds)) return null;
  if (demandBlockedByStock(fact, ctx.events, thresholds, ctx.hadStockOutAt)) return null;
  if (fact.funnelStatus !== "ok") return null;
  if (fact.orders == null || fact.priorOrders == null) return null;
  if (fact.openCount == null || fact.priorOpenCount == null) return null;
  if (!enoughEvents(fact.priorOrders, fact.orders, thresholds.demandMinEvents)) return null;
  if (!enoughEvents(fact.priorOpenCount, fact.openCount, thresholds.demandMinEvents)) return null;

  const t = thresholds.demandWindowDays;
  const ordersTest = poissonRateTest(fact.priorOrders, t, fact.orders, t);
  if (ordersTest.status !== "ok") return null;
  if (!(ordersTest.relativeChange <= -thresholds.salesChangePercent / 100)) return null;
  if (!(ordersTest.pValue <= thresholds.demandFdrQ)) return null;

  const trafficTest = poissonRateTest(fact.priorOpenCount, t, fact.openCount, t);
  if (trafficTest.status !== "ok") return null;
  if (!(trafficTest.relativeChange <= -thresholds.trafficDropPercent / 100)) return null;
  if (!(trafficTest.pValue <= thresholds.demandFdrQ)) return null;

  // Конверсии не должны сами быть достоверным объяснением.
  if (fact.cartCount != null && fact.priorCartCount != null) {
    const cart = twoProportionTest(
      fact.priorCartCount,
      fact.priorOpenCount,
      fact.cartCount,
      fact.openCount,
    );
    if (
      cart.status === "ok" &&
      cart.relativeChange <= -thresholds.conversionDropPercent / 100
    ) {
      return null;
    }
    const order = twoProportionTest(
      fact.priorOrders,
      fact.priorCartCount,
      fact.orders,
      fact.cartCount,
    );
    if (
      order.status === "ok" &&
      order.relativeChange <= -thresholds.conversionDropPercent / 100
    ) {
      return null;
    }
  }

  const lostUnits = lostOrdersEstimate(fact.priorOrders, fact.orders, t);
  const money =
    fact.avgOrderPrice != null && fact.avgOrderPrice > 0
      ? Math.round(lostUnits * fact.avgOrderPrice)
      : null;
  const cause = findProbableCause(fact, ctx.baseline, ctx.events, thresholds);
  const period = demandPeriodCaption(fact, "воронка WB");
  const opensTotal = fact.priorOpenCount + fact.openCount;
  const ordersTotal = fact.priorOrders + fact.orders;

  let draft = draftShell(fact, {
    type: "TASK_LOW_TRAFFIC",
    category: "sales",
    baseSeverity: "opportunity",
    severityFloor: "opportunity",
    severityCeiling: "critical",
    title: "Карточку стали реже видеть",
    description: `${fact.title}: заказы упали вместе с переходами. Переходы: ${pieces(fact.priorOpenCount)} → ${pieces(fact.openCount)}. На основе ${pieces(opensTotal).replace(" шт.", "")} переходов и ${pieces(ordersTotal)} заказов за 28 дней. Период: ${period}. Оценка потерь: ${pieces(lostUnits)}${money != null ? ` ≈ ${rub(money)}` : ""} (оценка).${causeSentence(cause)}`,
    reason: `Достоверное падение заказов и переходов (≥ ${thresholds.trafficDropPercent}% относительно) без достоверного падения конверсий.`,
    evidence: {
      current_sales_28d: fact.orders,
      previous_sales_28d: fact.priorOrders,
      sales_delta_units: fact.orders - fact.priorOrders,
      change_percent: Math.round(ordersTest.relativeChange * 1000) / 10,
      open_count: fact.openCount,
      prior_open_count: fact.priorOpenCount,
      traffic_change_percent: Math.round(trafficTest.relativeChange * 1000) / 10,
      traffic_relative_change: trafficTest.relativeChange,
      lost_orders_est: Math.round(lostUnits * 10) / 10,
      lost_money_est: money,
      money_is_estimate: true,
      p_value: trafficTest.pValue,
      p_adjusted: null,
      test: trafficTest.test,
      orders_p_value: ordersTest.pValue,
      demand_source: "воронка WB",
      volume_opens: opensTotal,
      volume_orders: ordersTotal,
      period_caption: period,
      ...causeEvidence(cause),
    },
    recommendation: "Проверьте видимость карточки: переходов стало меньше, конверсия при этом не объясняет падение.",
    actionType: "OPEN_PRODUCT",
    businessImpactType: "SALES_PROTECTION",
    eventKind: null,
  });
  draft = applySeverity(draft, money, ctx, thresholds, false);
  return { draft, pValue: trafficTest.pValue };
}

/** FDR внутри одного типа; пишет p_adjusted. */
export function applyFdrToCandidates(
  candidates: DemandCandidate[],
  q: number,
): TaskDraft[] {
  if (candidates.length === 0) return [];
  const pValues = candidates.map((row) => row.pValue);
  const rejected = benjaminiHochberg(pValues, q);
  const adjusted = bhAdjustedPValues(pValues);
  const kept: TaskDraft[] = [];
  for (let i = 0; i < candidates.length; i++) {
    if (!rejected[i]) continue;
    const draft = candidates[i]!.draft;
    kept.push({
      ...draft,
      evidence: {
        ...draft.evidence,
        p_adjusted: adjusted[i] ?? null,
        fdr_q: q,
        fdr_rejected: true,
      },
    });
  }
  return kept;
}

/**
 * Собирает кандидатов спроса по факту (без FDR и без взаимного исключения типов).
 */
export function collectDemandCandidates(
  fact: TaskFact,
  ctx: DemandRuleContext,
  thresholds: TaskThresholds,
  enabled: Partial<Record<DemandTaskType, boolean>>,
): DemandCandidate[] {
  const out: DemandCandidate[] = [];
  if (enabled.TASK_CONVERSION_DROP !== false) {
    const row = candidateConversionDrop(fact, ctx, thresholds);
    if (row) out.push(row);
  }
  if (enabled.TASK_LOW_TRAFFIC !== false) {
    const row = candidateLowTraffic(fact, ctx, thresholds);
    if (row) out.push(row);
  }
  if (enabled.TASK_SALES_DROP !== false) {
    const row = candidateSalesDrop(fact, ctx, thresholds);
    if (row) out.push(row);
  }
  if (enabled.TASK_SALES_GROWTH !== false) {
    const row = candidateSalesGrowth(fact, ctx, thresholds);
    if (row) out.push(row);
  }
  return out;
}

/** После FDR: conversion > traffic > sales_drop на одном nmId. Growth не конфликтует. */
export function resolveDemandMutualExclusion(drafts: TaskDraft[]): TaskDraft[] {
  const byNm = new Map<string, TaskDraft[]>();
  const rest: TaskDraft[] = [];
  for (const draft of drafts) {
    if (!isDemandTaskType(draft.type) || !draft.nmId) {
      rest.push(draft);
      continue;
    }
    const list = byNm.get(draft.nmId) ?? [];
    list.push(draft);
    byNm.set(draft.nmId, list);
  }
  const picked: TaskDraft[] = [];
  for (const list of byNm.values()) {
    const growth = list.filter((row) => row.type === "TASK_SALES_GROWTH");
    const drop = list.filter((row) => row.type !== "TASK_SALES_GROWTH");
    picked.push(...growth);
    const conversion = drop.find((row) => row.type === "TASK_CONVERSION_DROP");
    const traffic = drop.find((row) => row.type === "TASK_LOW_TRAFFIC");
    const sales = drop.find((row) => row.type === "TASK_SALES_DROP");
    if (conversion) picked.push(conversion);
    else if (traffic) picked.push(traffic);
    else if (sales) picked.push(sales);
  }
  return [...rest, ...picked];
}

export function finalizeDemandDrafts(
  candidates: DemandCandidate[],
  q: number,
): TaskDraft[] {
  const byType = new Map<DemandTaskType, DemandCandidate[]>();
  for (const row of candidates) {
    const type = row.draft.type as DemandTaskType;
    const list = byType.get(type) ?? [];
    list.push(row);
    byType.set(type, list);
  }
  const afterFdr: TaskDraft[] = [];
  for (const type of DEMAND_TYPES) {
    afterFdr.push(...applyFdrToCandidates(byType.get(type) ?? [], q));
  }
  return resolveDemandMutualExclusion(afterFdr);
}
