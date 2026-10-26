import type { SellerTask } from "./types";

/**
 * «Завершённые» задачи: одна строка на пару «тип + товар». Одна и та же задача может открываться и закрываться много раз
 * (раньше из-за мерцания, теперь из-за реальных колебаний данных), и десять одинаковых строк подряд не помогают.
 * Показываем самую свежую и сколько раз задача повторялась; полный список остаётся в CSV-отчёте.
 */

export type CompletedGroup = { task: SellerTask; repeats: number };

const closedAt = (t: SellerTask) => Date.parse(t.resolvedAt ?? t.updatedAt) || 0;

export function collapseCompleted(tasks: SellerTask[]): CompletedGroup[] {
  const groups = new Map<string, CompletedGroup>();
  for (const task of tasks) {
    const key = `${task.type}:${task.nmId ?? ""}`;
    const current = groups.get(key);
    if (!current) groups.set(key, { task, repeats: 1 });
    else {
      current.repeats += 1;
      if (closedAt(task) > closedAt(current.task)) current.task = task;
    }
  }
  return [...groups.values()].sort((a, b) => closedAt(b.task) - closedAt(a.task));
}
