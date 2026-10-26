import { TASK_CATEGORY_LABEL } from "./breakdown";
import type { SellerTask, TaskSeverity } from "./types";

const SEVERITY_LABEL: Record<TaskSeverity, string> = {
  critical: "Критическая",
  important: "Важная",
  opportunity: "Возможность",
};

const COLUMNS = ["Завершена", "Раздел", "Важность", "Задача", "Товар", "Артикул", "nmID", "Итог"] as const;

/** Ячейка CSV: кавычки удваиваем, а значения, которые Excel прочтёт как формулу, экранируем апострофом. */
export function csvCell(value: string | null | undefined): string {
  let text = (value ?? "").replace(/\r?\n/g, " ").trim();
  if (/^[=+\-@\t]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function ruDate(iso: string | null): string {
  if (!iso) return "";
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return "";
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow" }).format(new Date(parsed));
}

/** Отчёт о завершённых задачах: CSV с разделителем «;» и BOM, чтобы русский Excel открыл без настроек. */
export function completedTasksCsv(tasks: SellerTask[]): string {
  const rows = tasks
    .filter((task) => task.status === "completed")
    .sort((a, b) => (b.resolvedAt ?? b.updatedAt).localeCompare(a.resolvedAt ?? a.updatedAt))
    .map((task) =>
      [
        ruDate(task.resolvedAt ?? task.updatedAt),
        TASK_CATEGORY_LABEL[task.category],
        SEVERITY_LABEL[task.severity],
        task.title,
        task.productTitle,
        task.vendorCode,
        task.nmId,
        task.resolution,
      ]
        .map(csvCell)
        .join(";"),
    );
  return `﻿${[COLUMNS.map(csvCell).join(";"), ...rows].join("\r\n")}\r\n`;
}
