import { isDemandTaskType } from "./demand";
import type { TaskDraft, TaskEvidence, TaskSeverity, TaskType } from "./types";

const RANK: Record<TaskSeverity, number> = {
  opportunity: 0,
  important: 1,
  critical: 2,
};

const BASE: Record<TaskSeverity, number> = {
  critical: 300,
  important: 200,
  opportunity: 100,
};

function num(evidence: TaskEvidence, key: string): number | null {
  const value = evidence[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampSeverity(score: number, floor: TaskSeverity, ceiling: TaskSeverity): TaskSeverity {
  let severity: TaskSeverity = score >= 320 ? "critical" : score >= 180 ? "important" : "opportunity";
  if (RANK[severity] < RANK[floor]) severity = floor;
  if (RANK[severity] > RANK[ceiling]) severity = ceiling;
  return severity;
}

/**
 * Для четырёх задач спроса severity уже выставлена правилом по доле оборота магазина
 * (или рост+короткий запас). scoreTask не пересчитывает её вверх/вниз по старым бонусам —
 * только закрепляет baseSeverity, чтобы «критично» значило одно и то же для любого кабинета.
 */
function scoreDemandTask(draft: TaskDraft): { severity: TaskSeverity; score: number } {
  const severity = draft.baseSeverity;
  return {
    score: BASE[severity],
    severity: clampSeverity(BASE[severity], draft.severityFloor, draft.severityCeiling),
  };
}

/**
 * База — уровень правила. Сверху: масштаб продаж, срочность запаса, сумма зависшей закупки,
 * уверенность маржи. Потолок и пол не дают росту продаж стать критическим, а нулевому остатку — советом.
 * Возвращаемый score пишется в задачу и нужен только для зажима severity при создании.
 * Порядок списка / Top Actions — sortByPriority в priority.ts, не это число.
 */
export function scoreTask(draft: TaskDraft): { severity: TaskSeverity; score: number } {
  if (isDemandTaskType(draft.type as TaskType)) {
    return scoreDemandTask(draft);
  }
  let score = BASE[draft.baseSeverity];
  const units = num(draft.evidence, "sales_delta_units");
  if (units != null) score += Math.min(40, Math.abs(units));
  const cover = num(draft.evidence, "cover_days");
  const lowDays = num(draft.evidence, "low_stock_days");
  if (cover != null && lowDays != null && cover < lowDays) score += Math.min(30, (lowDays - cover) * 5);
  const capital = num(draft.evidence, "sitting_rub");
  if (capital != null && capital > 0) score += Math.min(40, capital / 5000);
  if (draft.evidence.margin_source === "account") score -= 15;
  const change = num(draft.evidence, "change_percent");
  if (change != null && change <= -50) score += 20;
  const rounded = Math.round(score);
  return {
    score: rounded,
    severity: clampSeverity(rounded, draft.severityFloor, draft.severityCeiling),
  };
}
