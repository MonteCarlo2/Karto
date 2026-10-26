import type { SellerTask, TaskEvidence, TaskEvidenceValue, TaskImpactType, TaskSeverity, TaskType } from "./types";

/**
 * Порядок уже созданных задач внутри одного severity.
 * Число не показывается и не пишется в базу.
 * Уровни impact идут с шагом 100. Надбавка за масштаб меньше двух ступеней,
 * поэтому крупная сумма поднимает задачу, но не перепрыгивает весь список.
 *
 * Не путать с scoreTask (scoring.ts): тот score только зажимает severity при создании.
 * Порядок списка и Top Actions считает только sortByPriority / compareByPriority.
 */

const IMPACT_BASE: Record<TaskImpactType, number> = {
  SALES_PROTECTION: 700,
  PROFIT_PROTECTION: 600,
  STOCK_RISK: 500,
  CAPITAL_RELEASE: 400,
  SALES_GROWTH: 300,
  PROFIT_GROWTH: 200,
  OPERATIONAL: 100,
};

const SEVERITY_ORDER: Record<TaskSeverity, number> = {
  critical: 0,
  important: 1,
  opportunity: 2,
};

export type PriorityRank = {
  severity: number;
  score: number;
  /** Подтверждённые рубли. null — суммы нет, это не 0 ₽. */
  money: number | null;
  salesUnits: number;
  urgency: number;
  age: number;
  contentGap: number;
};

function finite(value: TaskEvidenceValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Подтверждённые рубли. Порог stagnant_capital_rub — не сумма проблемы. */
function confirmedRubles(evidence: TaskEvidence): number | null {
  const sitting = finite(evidence.sitting_rub);
  if (sitting != null && sitting > 0) return sitting;
  const margin = finite(evidence.margin_rub);
  if (margin != null && margin < 0) return Math.abs(margin);
  return null;
}

/** 40 очков — меньше одной ступени impact. 160 — максимум, около полутора ступеней. */
function moneyBonus(rubles: number): number {
  if (rubles >= 100_000) return 160;
  if (rubles >= 50_000) return 120;
  if (rubles >= 20_000) return 80;
  if (rubles >= 5_000) return 40;
  if (rubles > 0) return 20;
  return 0;
}

function unitsBonus(units: number): number {
  const count = Math.abs(units);
  if (count >= 100) return 80;
  if (count >= 30) return 50;
  if (count >= 10) return 30;
  if (count >= 5) return 15;
  if (count > 0) return 5;
  return 0;
}

function dropPercentBonus(percent: number | null): number {
  if (percent == null || percent >= 0) return 0;
  const fall = Math.abs(percent);
  if (fall >= 50) return 25;
  if (fall >= 25) return 10;
  return 0;
}

function lowCoverBonus(coverDays: number | null): number {
  if (coverDays == null || coverDays < 0) return 0;
  if (coverDays <= 2) return 80;
  if (coverDays <= 5) return 50;
  if (coverDays <= 7) return 25;
  if (coverDays <= 14) return 15;
  return 0;
}

/**
 * Длина запаса без суммы. Потолок ниже минимальной надбавки за подтверждённые рубли,
 * поэтому одни только дни не обгоняют известную сумму на том же типе эффекта.
 * Между задачами без суммы длинный запас по-прежнему выше короткого.
 */
function excessCoverBonus(coverDays: number | null): number {
  if (coverDays == null) return 0;
  if (coverDays >= 1000) return 15;
  if (coverDays >= 365) return 10;
  if (coverDays > 180) return 5;
  return 0;
}

function stockBonus(stock: number | null): number {
  if (stock == null || stock <= 0) return 0;
  if (stock >= 100) return 16;
  if (stock >= 20) return 8;
  return 4;
}

function ageBonus(ageDays: number | null): number {
  if (ageDays == null || ageDays < 0) return 0;
  if (ageDays >= 180) return 12;
  if (ageDays >= 90) return 8;
  if (ageDays >= 28) return 4;
  return 0;
}

function contentScoreBonus(evidence: TaskEvidence): number {
  const score = finite(evidence.content_score);
  if (score != null) return Math.max(0, Math.min(50, Math.round((100 - score) / 2)));
  const photos = finite(evidence.photo_count);
  if (photos == null) return 0;
  if (photos <= 2) return 20;
  if (photos <= 4) return 10;
  return 0;
}

function salesCountBonus(units: number | null): number {
  if (units == null || units <= 0) return 0;
  if (units >= 50) return 60;
  if (units >= 10) return 30;
  return 10;
}

function storeBonus(evidence: TaskEvidence): number {
  const count = finite(evidence.unanswered_questions) ?? finite(evidence.unanswered_feedbacks);
  if (count == null || count <= 0) return 0;
  return Math.min(20, Math.round(count));
}

function marginDropBonus(evidence: TaskEvidence): number {
  const points = finite(evidence.margin_drop_points);
  if (points == null || points <= 0) return 0;
  if (points >= 20) return 30;
  if (points >= 10) return 15;
  if (points >= 5) return 8;
  return 0;
}

function scaleBonus(type: TaskType, evidence: TaskEvidence, money: number | null): number {
  const cover = finite(evidence.cover_days);
  const stock = finite(evidence.stock);
  const age = finite(evidence.age_days);
  const delta = finite(evidence.sales_delta_units);
  const current = finite(evidence.current_sales_28d);
  const sales = finite(evidence.sales_28d);
  switch (type) {
    case "TASK_STOCK_OUT":
      return 0;
    case "TASK_LOW_STOCK":
      return lowCoverBonus(cover);
    case "TASK_EXCESS_STOCK":
      return money == null ? excessCoverBonus(cover) : 0;
    case "TASK_STAGNANT_CAPITAL":
      return 0;
    case "TASK_SALES_DROP":
    case "TASK_CONVERSION_DROP":
    case "TASK_LOW_TRAFFIC": {
      const lost = delta != null && delta < 0 ? Math.abs(delta) : 0;
      return unitsBonus(lost) + dropPercentBonus(finite(evidence.change_percent));
    }
    case "TASK_SALES_GROWTH": {
      const grown = delta != null && delta > 0 ? delta : current != null && current > 0 ? current : 0;
      const percent = finite(evidence.change_percent);
      const percentBonus = percent != null && percent > 0 ? (percent >= 50 ? 25 : percent >= 25 ? 10 : 0) : 0;
      return unitsBonus(grown) + percentBonus + lowCoverBonus(cover);
    }
    case "TASK_NO_SALES":
      return stockBonus(stock) + ageBonus(age);
    case "TASK_NEGATIVE_MARGIN":
    case "TASK_MARGIN_NEAR_ZERO":
    case "TASK_LOW_MARGIN":
    case "TASK_MARGIN_DETERIORATION":
    case "TASK_COST_MISSING":
      return marginDropBonus(evidence);
    case "TASK_LOW_CONTENT_SCORE":
    case "TASK_LOW_PHOTO_COUNT":
      return contentScoreBonus(evidence);
    case "TASK_CONTENT_OPPORTUNITY":
      return salesCountBonus(sales ?? current);
    case "TASK_UNANSWERED_REVIEWS":
    case "TASK_UNANSWERED_QUESTIONS":
    case "TASK_UNANSWERED_NEGATIVE_REVIEW":
    case "TASK_UNANSWERED_QUESTION":
    case "TASK_UNANSWERED_POSITIVE_REVIEWS":
    case "TASK_NEGATIVE_SHARE_UP":
    case "TASK_FEEDBACKS_ACCESS":
      return storeBonus(evidence);
    case "TASK_PROMO_LOSS":
    case "TASK_PROMO_OPPORTUNITY":
    case "TASK_AD_NO_ORDERS":
    case "TASK_AD_DRR_OVER_MARGIN":
    case "TASK_AD_CAMPAIGN_STOPPED":
    case "TASK_AD_NO_STOCK":
    case "TASK_AD_EFFICIENCY_DROP":
    case "TASK_AD_WEAK_CARD":
    case "TASK_AD_SCALE_UP":
    case "TASK_LOW_BUYOUT":
    case "TASK_LOW_RATING":
    case "TASK_COSTS_EAT_MARGIN":
    case "TASK_FROM_EVENT":
      return 0;
    default: {
      const unexpected: never = type;
      return unexpected;
    }
  }
}

function urgencyKey(type: TaskType, evidence: TaskEvidence): number {
  const cover = finite(evidence.cover_days);
  if (cover == null) return 0;
  if (type === "TASK_LOW_STOCK" || type === "TASK_SALES_GROWTH") return 100_000 - cover;
  if (type === "TASK_EXCESS_STOCK") return cover;
  return 0;
}

function salesUnitsKey(type: TaskType, evidence: TaskEvidence): number {
  const delta = finite(evidence.sales_delta_units);
  const current = finite(evidence.current_sales_28d);
  const sales = finite(evidence.sales_28d);
  if (type === "TASK_SALES_DROP" || type === "TASK_CONVERSION_DROP" || type === "TASK_LOW_TRAFFIC") {
    return delta != null && delta < 0 ? Math.abs(delta) : 0;
  }
  if (type === "TASK_SALES_GROWTH") return delta != null && delta > 0 ? delta : current != null && current > 0 ? current : 0;
  if (type === "TASK_CONTENT_OPPORTUNITY") return sales != null && sales > 0 ? sales : 0;
  return 0;
}

export function priorityRank(task: SellerTask): PriorityRank {
  const money = confirmedRubles(task.evidence);
  const contentScore = finite(task.evidence.content_score);
  return {
    severity: SEVERITY_ORDER[task.severity],
    score: IMPACT_BASE[task.businessImpactType] + (money == null ? 0 : moneyBonus(money)) + scaleBonus(task.type, task.evidence, money),
    money,
    salesUnits: salesUnitsKey(task.type, task.evidence),
    urgency: urgencyKey(task.type, task.evidence),
    age: task.type === "TASK_NO_SALES" ? finite(task.evidence.age_days) ?? 0 : 0,
    contentGap: task.type === "TASK_LOW_CONTENT_SCORE" && contentScore != null ? 100 - contentScore : 0,
  };
}

function compareConfirmedMoney(left: number | null, right: number | null): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return right - left;
}

export function compareByPriority(left: SellerTask, right: SellerTask): number {
  const a = priorityRank(left);
  const b = priorityRank(right);
  if (a.severity !== b.severity) return a.severity - b.severity;
  if (a.score !== b.score) return b.score - a.score;
  const moneyOrder = compareConfirmedMoney(a.money, b.money);
  if (moneyOrder !== 0) return moneyOrder;
  if (a.salesUnits !== b.salesUnits) return b.salesUnits - a.salesUnits;
  if (a.urgency !== b.urgency) return b.urgency - a.urgency;
  if (a.age !== b.age) return b.age - a.age;
  if (a.contentGap !== b.contentGap) return b.contentGap - a.contentGap;
  return left.id.localeCompare(right.id);
}

export function sortByPriority(tasks: readonly SellerTask[]): SellerTask[] {
  return [...tasks].sort(compareByPriority);
}
