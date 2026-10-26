"use client";

import { useMemo } from "react";
import { CheckCircle2 } from "lucide-react";
import { taskFactsFromSnapshot } from "@/lib/seller-hub/task-engine/facts";
import type { SellerTask } from "@/lib/seller-hub/task-engine/types";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { formatInt, hub, HubPanel, hubSans } from "./hub-ui";

const WEEK_MS = 7 * 86_400_000;

/**
 * Экран «Магазин в порядке»: когда активных задач нет, показываем, что именно проверено и что хорошо.
 * Раздел задач не должен выглядеть сломанным или пустым. Только данные снимка и завершённые задачи.
 */
export function HubTasksOk({
  snapshot,
  tasks,
  nowMs,
}: {
  snapshot: SellerCatalogSnapshot;
  tasks: SellerTask[];
  nowMs: number;
}) {
  const summary = useMemo(() => {
    const products = snapshot.items.length > 0 ? taskFactsFromSnapshot(snapshot).products : [];
    const withMargin = products.filter((p) => p.marginRub != null);
    const positive = withMargin.filter((p) => (p.marginRub ?? 0) > 0);
    const scores = products.map((p) => p.contentScore).filter((s): s is number => s != null);
    const avgContent = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const doneWeek = tasks.filter(
      (t) => t.status === "completed" && t.resolvedAt != null && nowMs - Date.parse(t.resolvedAt) <= WEEK_MS,
    ).length;
    return { total: products.length, withMargin: withMargin.length, positive: positive.length, avgContent, doneWeek };
  }, [snapshot, tasks, nowMs]);

  const checks: Array<{ title: string; detail: string }> = [
    {
      title: "Цены и маржа",
      detail:
        summary.withMargin > 0
          ? `Маржа на 1 продажу положительная у ${formatInt(summary.positive)} из ${formatInt(summary.withMargin)} товаров с известной маржой.`
          : "Маржа посчитается, когда будет себестоимость и данные о доставках.",
    },
    { title: "Остатки и запас", detail: `Проверено товаров: ${formatInt(summary.total)}. Срочных рисков нет.` },
    {
      title: "Спрос и конверсия",
      detail:
        snapshot.funnel?.status === "ok" || snapshot.funnel?.status === "partial"
          ? "Резких падений заказов и конверсии не найдено."
          : "Воронка WB сейчас не загружена: спрос и конверсию не проверяли.",
    },
    {
      title: "Карточки",
      detail: summary.avgContent != null ? `Средний балл контента ${summary.avgContent} из 100.` : "Балл контента появится после выгрузки каталога.",
    },
    {
      title: "Отзывы",
      detail:
        snapshot.feedbacks?.status === "ok" || snapshot.feedbacks?.status === "partial"
          ? "Отзывов без ответа, требующих срочной реакции, нет."
          : "Отзывы сейчас не загружены: их не проверяли.",
    },
  ];

  return (
    <HubPanel className="px-5 py-6">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" style={{ color: hub.greenDark }} />
        <div>
          <h2 className="text-[18px] font-semibold" style={{ ...hubSans, color: hub.text }}>
            Магазин в порядке
          </h2>
          <p className="mt-1 text-[14px] leading-6" style={{ ...hubSans, color: hub.textMuted }}>
            Активных задач нет. Мы продолжаем следить за ценами, остатками, спросом, карточками и отзывами и сообщим, как
            только что-то изменится.
            {summary.doneWeek > 0 ? ` За последнюю неделю вы закрыли задач: ${formatInt(summary.doneWeek)}.` : ""}
          </p>
        </div>
      </div>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {checks.map((check) => (
          <li key={check.title} className="rounded-xl border px-4 py-3" style={{ borderColor: hub.border }}>
            <p className="text-[13.5px] font-semibold" style={{ ...hubSans, color: hub.text }}>
              <span style={{ color: hub.greenDark }}>✓ </span>
              {check.title}
            </p>
            <p className="mt-1 text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
              {check.detail}
            </p>
          </li>
        ))}
      </ul>
    </HubPanel>
  );
}
