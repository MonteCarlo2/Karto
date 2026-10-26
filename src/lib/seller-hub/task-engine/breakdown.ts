import type { SellerTask, TaskCategory, TaskSeverity } from "./types";

export const TASK_CATEGORY_LABEL: Record<TaskCategory, string> = {
  economics: "Цены и маржа",
  stock: "Склад и запас",
  sales: "Продажи и спрос",
  content: "Контент карточек",
  reviews: "Отзывы и вопросы",
};

const CATEGORY_ORDER: TaskCategory[] = ["economics", "stock", "sales", "content", "reviews"];

export type TaskCategoryRow = {
  category: TaskCategory;
  label: string;
  critical: number;
  important: number;
  opportunity: number;
  total: number;
};

/** Сколько задач каждого уровня важности в каждом разделе. Разделы без задач не возвращаются. */
export function taskCategoryBreakdown(
  tasks: Pick<SellerTask, "category" | "severity">[],
): TaskCategoryRow[] {
  const rows = new Map<TaskCategory, TaskCategoryRow>();
  for (const task of tasks) {
    const row =
      rows.get(task.category) ??
      {
        category: task.category,
        label: TASK_CATEGORY_LABEL[task.category],
        critical: 0,
        important: 0,
        opportunity: 0,
        total: 0,
      };
    const level: TaskSeverity = task.severity;
    row[level] += 1;
    row.total += 1;
    rows.set(task.category, row);
  }
  return CATEGORY_ORDER.flatMap((category) => {
    const row = rows.get(category);
    return row ? [row] : [];
  });
}
