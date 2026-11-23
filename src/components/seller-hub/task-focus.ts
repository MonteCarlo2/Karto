import type { TaskCategory } from "@/lib/seller-hub/task-engine/types";

/**
 * Куда вести человека в «Задачах», когда он пришёл из другого раздела: категория и (по желанию) конкретная задача.
 * Лежит в памяти страницы, а не в хранилище браузера: так переход одинаков при каждом запуске, а после обновления страницы фильтры сбрасываются.
 */
export type TaskFocus = { category: TaskCategory; id?: string; type?: string; nmId?: string | null };

let pending: TaskFocus | null = null;

export function setTaskFocus(focus: TaskFocus): void {
  pending = focus;
}

export function peekTaskFocus(): TaskFocus | null {
  return pending;
}

export function clearTaskFocus(): void {
  pending = null;
}
