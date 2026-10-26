import type { TaskThresholds } from "./config";
import type { TaskEvidence, TaskSeverity } from "./types";

export type SeverityBasis =
  | "доля оборота"
  | "доля валовой прибыли"
  | "срочность"
  | "деньги неизвестны"
  | "хранение 0 ₽"
  | "неликвид: заморожено ≥ 1% оборота";

export type StoreMoneyContext = {
  /** Оборот 28д: воронка orderSum, иначе реализация. null — неизвестен. */
  turnoverRub: number | null;
  /** Валовая прибыль магазина, если себестоимость покрывает ≥ costCoverageShare оборота. */
  grossProfitRub: number | null;
  /** true — считать долю от валовой прибыли. */
  useGrossProfit: boolean;
};

export type SeverityDecision = {
  severity: TaskSeverity;
  basis: SeverityBasis;
  moneyAtRiskRub: number | null;
  shareOfTurnover: number | null;
  turnoverBaseRub: number | null;
};

/**
 * Оборот и (при покрытии себестоимостью) валовая прибыль магазина за 28 дней.
 * Оборот: sum(orderSum) воронки; иначе sum(retailSum) реализации.
 */
export function buildStoreMoneyContext(
  facts: Array<{
    orderSum: number | null;
    retailSum?: number | null;
    cost: number | null;
    marginRub: number | null;
    salesQty: number | null;
  }>,
  thresholds: TaskThresholds,
): StoreMoneyContext {
  let orderSumTotal = 0;
  let orderSumAny = false;
  let retailTotal = 0;
  let retailAny = false;
  let coveredTurnover = 0;
  let gross = 0;
  let grossAny = false;

  for (const fact of facts) {
    if (fact.orderSum != null && Number.isFinite(fact.orderSum)) {
      orderSumTotal += fact.orderSum;
      orderSumAny = true;
      if (fact.cost != null && fact.cost > 0) coveredTurnover += fact.orderSum;
    }
    if (fact.retailSum != null && Number.isFinite(fact.retailSum)) {
      retailTotal += fact.retailSum;
      retailAny = true;
    }
    if (
      fact.cost != null &&
      fact.cost > 0 &&
      fact.marginRub != null &&
      fact.salesQty != null &&
      fact.salesQty > 0
    ) {
      gross += fact.marginRub * fact.salesQty;
      grossAny = true;
    }
  }

  const turnoverRub = orderSumAny ? orderSumTotal : retailAny ? retailTotal : null;
  const coverageBase = orderSumAny ? orderSumTotal : retailAny ? retailTotal : 0;
  const coverage =
    coverageBase > 0 ? coveredTurnover / coverageBase : retailAny && orderSumAny === false ? 0 : 0;
  /** Без orderSum покрытие по retail не считаем — нет привязки cost к доле оборота воронки. */
  const useGrossProfit =
    orderSumAny &&
    coverage >= thresholds.severityCostCoverageShare &&
    grossAny &&
    gross > 0;

  return {
    turnoverRub,
    grossProfitRub: grossAny ? gross : null,
    useGrossProfit,
  };
}

/**
 * Уровень важности по деньгам под риском (стандарт §1).
 * Срочность задаётся отдельно через `urgencyCritical`.
 */
export function severityFromMoney(input: {
  moneyAtRiskRub: number | null;
  store: StoreMoneyContext;
  thresholds: TaskThresholds;
  /** Раздел 1(а): критично по срочности, независимо от доли. */
  urgencyCritical?: boolean;
}): SeverityDecision {
  if (input.urgencyCritical) {
    return {
      severity: "critical",
      basis: "срочность",
      moneyAtRiskRub: input.moneyAtRiskRub,
      shareOfTurnover:
        input.moneyAtRiskRub != null &&
        input.store.turnoverRub != null &&
        input.store.turnoverRub > 0
          ? input.moneyAtRiskRub / input.store.turnoverRub
          : null,
      turnoverBaseRub: input.store.useGrossProfit
        ? input.store.grossProfitRub
        : input.store.turnoverRub,
    };
  }

  const money = input.moneyAtRiskRub;
  if (money == null) {
    return {
      severity: "opportunity",
      basis: "деньги неизвестны",
      moneyAtRiskRub: null,
      shareOfTurnover: null,
      turnoverBaseRub: input.store.useGrossProfit
        ? input.store.grossProfitRub
        : input.store.turnoverRub,
    };
  }
  /** Известный ноль (FBS / WB не тарифицирует) — не «неизвестно». */
  if (!(money > 0)) {
    return {
      severity: "opportunity",
      basis: "хранение 0 ₽",
      moneyAtRiskRub: 0,
      shareOfTurnover: 0,
      turnoverBaseRub: input.store.useGrossProfit
        ? input.store.grossProfitRub
        : input.store.turnoverRub,
    };
  }

  if (input.store.useGrossProfit && input.store.grossProfitRub != null && input.store.grossProfitRub > 0) {
    const share = money / input.store.grossProfitRub;
    const severity: TaskSeverity =
      share >= input.thresholds.severityGrossCriticalShare
        ? "critical"
        : share >= input.thresholds.severityGrossImportantShare
          ? "important"
          : "opportunity";
    return {
      severity,
      basis: "доля валовой прибыли",
      moneyAtRiskRub: money,
      shareOfTurnover: share,
      turnoverBaseRub: input.store.grossProfitRub,
    };
  }

  if (input.store.turnoverRub == null || !(input.store.turnoverRub > 0)) {
    return {
      severity: "opportunity",
      basis: "деньги неизвестны",
      moneyAtRiskRub: money,
      shareOfTurnover: null,
      turnoverBaseRub: null,
    };
  }

  const share = money / input.store.turnoverRub;
  const severity: TaskSeverity =
    share >= input.thresholds.severityTurnoverCriticalShare
      ? "critical"
      : share >= input.thresholds.severityTurnoverImportantShare
        ? "important"
        : "opportunity";
  return {
    severity,
    basis: "доля оборота",
    moneyAtRiskRub: money,
    shareOfTurnover: share,
    turnoverBaseRub: input.store.turnoverRub,
  };
}

export function severityEvidence(decision: SeverityDecision): TaskEvidence {
  return {
    money_at_risk_rub: decision.moneyAtRiskRub,
    share_of_turnover:
      decision.shareOfTurnover == null ? null : Math.round(decision.shareOfTurnover * 10000) / 10000,
    turnover_base_rub: decision.turnoverBaseRub,
    severity_basis: decision.basis,
  };
}

/** Подпись для UI: порог critical в рублях от оборота. */
export function severityTooltipLines(input: {
  severity: TaskSeverity;
  basis: SeverityBasis | string | null | undefined;
  turnoverRub: number | null;
  thresholds: TaskThresholds;
}): { short: string; detail: string } {
  if (input.basis === "срочность") {
    return {
      short: "Критично",
      detail: "Критично: деньги теряются прямо сейчас.",
    };
  }
  const turnover = input.turnoverRub;
  const critRub =
    turnover != null && turnover > 0
      ? Math.round(turnover * input.thresholds.severityTurnoverCriticalShare)
      : null;
  const impRub =
    turnover != null && turnover > 0
      ? Math.round(turnover * input.thresholds.severityTurnoverImportantShare)
      : null;

  switch (input.severity) {
    case "critical":
      return {
        short: "Критично",
        detail:
          critRub != null
            ? `Критично: потеря от ${(input.thresholds.severityTurnoverCriticalShare * 100).toLocaleString("ru-RU")}% вашего оборота, это от ${critRub.toLocaleString("ru-RU")} ₽ за 28 дней.`
            : "Критично: потеря от 5% оборота магазина за 28 дней.",
      };
    case "important":
      return {
        short: "Важно",
        detail:
          impRub != null
            ? `Важно: потеря от ${(input.thresholds.severityTurnoverImportantShare * 100).toLocaleString("ru-RU")}% до ${(input.thresholds.severityTurnoverCriticalShare * 100).toLocaleString("ru-RU")}% оборота (от ${impRub.toLocaleString("ru-RU")} ₽ за 28 дней).`
            : "Важно: потеря от 1% до 5% оборота магазина за 28 дней.",
      };
    case "opportunity":
      return {
        short: "Возможность",
        detail: "Возможность: потеря меньше 1% оборота, деньги неизвестны, или это потенциал роста.",
      };
    default: {
      const unexpected: never = input.severity;
      return unexpected;
    }
  }
}

export function whyImportantLine(decision: SeverityDecision): string | null {
  if (decision.basis === "срочность") {
    if (decision.moneyAtRiskRub != null && decision.moneyAtRiskRub > 0) {
      const sharePct =
        decision.shareOfTurnover != null
          ? `, ${(decision.shareOfTurnover * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}% вашего оборота`
          : "";
      return `Почему это важно: ≈ ${Math.round(decision.moneyAtRiskRub).toLocaleString("ru-RU")} ₽ за 28 дней${sharePct}. Деньги теряются прямо сейчас.`;
    }
    return "Почему это важно: деньги теряются прямо сейчас.";
  }
  if (decision.basis === "неликвид: заморожено ≥ 1% оборота") {
    return "Почему это важно: неликвид — заморожено ≥ 1% оборота магазина.";
  }
  if (decision.moneyAtRiskRub == null || !(decision.moneyAtRiskRub > 0)) return null;
  const sharePct =
    decision.shareOfTurnover != null
      ? `, ${(decision.shareOfTurnover * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}% вашего оборота`
      : "";
  return `Почему это важно: ≈ ${Math.round(decision.moneyAtRiskRub).toLocaleString("ru-RU")} ₽ за 28 дней${sharePct}.`;
}
