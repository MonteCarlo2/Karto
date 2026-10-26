import type { TaskStatus } from "./types";

/** Ручное «Выполнено». Пока условие не исчезло, пересчёт не открывает задачу снова. */
export const USER_COMPLETED_RESOLUTION = "Пользователь отметил задачу выполненной.";

/** Тип задач (или задачи по этому товару) отключили в настройках: открытые задачи закрываются сразу, без ожидания. */
export const DISABLED_BY_SETTINGS_RESOLUTION = "Такие задачи отключены в настройках.";

/** Условие само перестало выполняться. Это не то же самое, что ручное завершение. */
export const CONDITION_CLEARED_RESOLUTION = "Условие задачи больше не выполняется.";

/**
 * Сколько условие задачи должно отсутствовать подряд, чтобы задачу закрыли («условие больше не выполняется»).
 * Меньший срок давал мерцание: на промежуточных снимках данные неполные, и задача закрывалась и сразу открывалась заново.
 */
export const ABSENT_GRACE_MS = 30 * 60_000;
/** Ключ в доказательствах задачи: с какого момента условие не подтверждается. Сбрасывается, когда условие вернулось. */
export const ABSENT_SINCE_KEY = "absent_since";

export const SETTABLE_TASK_STATUSES: readonly TaskStatus[] = ["active", "in_progress", "snoozed"];

export type TaskStatusPatch =
  | { status: "completed" }
  | { status: "snoozed"; snoozeUntil: string };

export type TaskStatusWriteDecision = "apply" | "missing" | "closed";

export function isUserCompleted(task: { status: TaskStatus; resolution: string | null }): boolean {
  return task.status === "completed" && task.resolution === USER_COMPLETED_RESOLUTION;
}

/** Будущий срок, пустая или нечитаемая дата держат откладывание. Наступивший срок — уже нет. */
export function snoozeStillHeld(snoozeUntil: string | null, nowMs: number): boolean {
  if (!snoozeUntil) return true;
  const at = Date.parse(snoozeUntil);
  if (!Number.isFinite(at)) return true;
  return at > nowMs;
}

export function isActionableTask(
  task: { status: TaskStatus; snoozeUntil: string | null },
  nowMs: number,
): boolean {
  if (task.status === "active" || task.status === "in_progress") return true;
  if (task.status === "snoozed") return !snoozeStillHeld(task.snoozeUntil, nowMs);
  return false;
}

export function isPendingSnooze(
  task: { status: TaskStatus; snoozeUntil: string | null },
  nowMs: number,
): boolean {
  return task.status === "snoozed" && snoozeStillHeld(task.snoozeUntil, nowMs);
}

export function actionableTasks<T extends { status: TaskStatus; snoozeUntil: string | null }>(
  tasks: readonly T[],
  nowMs: number,
): T[] {
  return tasks.filter((task) => isActionableTask(task, nowMs));
}

/**
 * Строку можно перезаписать пересчётом, только если с момента чтения её никто не менял.
 * Новая строка пишется. Пропавшая из базы — нет, чтобы не восстановить чужое решение.
 */
export function reconcileRowWritable(loadedUpdatedAt: string | undefined, freshUpdatedAt: string | null): boolean {
  if (loadedUpdatedAt == null) return freshUpdatedAt == null;
  return freshUpdatedAt === loadedUpdatedAt;
}

export function statusUpdateAllowed(rowUserId: string | null, sessionUserId: string): boolean {
  return rowUserId != null && rowUserId === sessionUserId;
}

export function taskStatusWriteDecision(
  row: { userId: string; marketplaceId: string; status: TaskStatus } | null,
  session: { userId: string; marketplaceId: string },
): TaskStatusWriteDecision {
  if (!row || !statusUpdateAllowed(row.userId, session.userId) || row.marketplaceId !== session.marketplaceId) {
    return "missing";
  }
  if (!SETTABLE_TASK_STATUSES.includes(row.status)) return "closed";
  return "apply";
}

export function parseTaskStatusPatch(
  body: unknown,
  nowMs: number,
): { ok: true; patch: TaskStatusPatch } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Нужен JSON" };
  const raw = body as Record<string, unknown>;
  if (raw.status === "completed") return { ok: true, patch: { status: "completed" } };
  if (raw.status === "snoozed") {
    if (typeof raw.snoozeUntil !== "string" || !raw.snoozeUntil.trim()) {
      return { ok: false, error: "Нужна дата, до которой отложить задачу" };
    }
    const at = Date.parse(raw.snoozeUntil);
    if (!Number.isFinite(at) || at <= nowMs) {
      return { ok: false, error: "Срок откладывания должен быть в будущем" };
    }
    return { ok: true, patch: { status: "snoozed", snoozeUntil: new Date(at).toISOString() } };
  }
  return { ok: false, error: "Такой статус сохранить нельзя" };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Сроки для кнопки «Отложить». Время хранится в ISO. */
export function snoozeChoices(from: Date): Array<{ label: string; until: string }> {
  const tomorrow = new Date(from.getTime());
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return [
    { label: "До завтра", until: tomorrow.toISOString() },
    { label: "На 3 дня", until: new Date(from.getTime() + 3 * DAY_MS).toISOString() },
    { label: "На 7 дней", until: new Date(from.getTime() + 7 * DAY_MS).toISOString() },
  ];
}
