"use client";

import { useMemo } from "react";
import { buildOrdersInsights } from "@/lib/seller-hub/orders-insights";
import { snapshotTimeMs } from "@/lib/seller-hub/complete-days";
import { ruPlural } from "@/lib/seller-hub/task-engine/ru-plural";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { formatInt, formatRub, hub, HubPanel, HubPanelHeader, hubSans } from "./hub-ui";

const dayLabel = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

export function HubOrdersInsights({ snapshot }: { snapshot?: SellerCatalogSnapshot }) {
  const rows = snapshot?.orders?.orders;
  const nowMs = snapshotTimeMs(snapshot);
  const insights = useMemo(() => (rows && nowMs > 0 ? buildOrdersInsights(rows, nowMs) : null), [rows, nowMs]);
  const titles = useMemo(() => new Map((snapshot?.items ?? []).map((i) => [i.externalId, i.title])), [snapshot?.items]);
  if (!insights) return null;

  const maxDay = Math.max(1, ...insights.daily.map((d) => d.count));
  const titleOf = (nmId: string) => titles.get(nmId) ?? `Артикул ${nmId}`;
  const notes: string[] = [];
  if (insights.waiting.count > 0) {
    notes.push(
      `Ждут отгрузки: ${insights.waiting.count} ${ruPlural(insights.waiting.count, "заказ", "заказа", "заказов")} (${insights.waiting.newCount} новых, ${insights.waiting.assemblyCount} на сборке)${
        insights.waiting.oldestHours != null ? `. Самому старому ${insights.waiting.oldestHours.toLocaleString("ru-RU")} ч.` : "."
      }`,
    );
  }
  if (insights.cancelHot.length > 0) {
    notes.push(
      `Отмены повторяются у ${insights.cancelHot.length} ${ruPlural(insights.cancelHot.length, "артикула", "артикулов", "артикулов")}: ${insights.cancelHot
        .slice(0, 3)
        .map((p) => `${titleOf(p.nmId)} (${p.canceled} из ${p.orders})`)
        .join("; ")}. Чаще всего причина — расхождение карточки с товаром, сроки или цена, которая упала после заказа.`,
    );
  }

  return (
    <HubPanel>
      <HubPanelHeader title="Поток заказов" hint="Что происходит с заказами за период: ритм, отгрузка, отмены и на чём держится оборот. Только данные WB." />
      <div className="space-y-5 px-5 py-4 sm:px-6">
        {notes.length > 0 ? (
          <ul className="space-y-1.5">
            {notes.map((line) => (
              <li key={line} className="rounded-lg px-3 py-2 text-[13px] leading-5" style={{ ...hubSans, backgroundColor: hub.warnSoft, color: hub.warn }}>
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg px-3 py-2 text-[13px] leading-5" style={{ ...hubSans, backgroundColor: hub.greenSoft, color: hub.green }}>
            Неотгруженных заказов нет, повторяющихся отмен не видно.
          </p>
        )}

        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
            Заказы по дням
          </p>
          <div className="mt-2 flex items-end gap-2" style={{ height: 88 }}>
            {insights.daily.map((day) => (
              <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${formatRub(day.sum)}`}>
                <span className="text-[12px] font-semibold tabular-nums" style={{ ...hubSans, color: hub.text }}>
                  {day.count}
                </span>
                <div
                  className="w-full rounded-t-md"
                  style={{ height: `${Math.max(4, Math.round((day.count / maxDay) * 52))}px`, backgroundColor: day.partial ? hub.border : hub.blue }}
                />
                <span className="text-[11px]" style={{ ...hubSans, color: hub.textMuted }}>
                  {dayLabel(day.date)}
                  {day.partial ? "*" : ""}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[11.5px]" style={{ ...hubSans, color: hub.textMuted }}>
            * неполный день: заказы набираются до конца суток.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
              Средний чек
            </p>
            <p className="mt-1 text-[20px] font-semibold tabular-nums" style={{ ...hubSans, color: hub.text }}>
              {insights.avgCheck != null ? formatRub(insights.avgCheck) : "—"}
            </p>
            <p className="text-[12px]" style={{ ...hubSans, color: hub.textMuted }}>
              без отменённых
            </p>
          </div>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
              Доля отмен
            </p>
            <p className="mt-1 text-[20px] font-semibold tabular-nums" style={{ ...hubSans, color: hub.text }}>
              {(Math.round(insights.cancelShare * 1000) / 10).toLocaleString("ru-RU")}%
            </p>
            <p className="text-[12px]" style={{ ...hubSans, color: hub.textMuted }}>
              {formatInt(insights.canceled)} из {formatInt(insights.total)}
            </p>
          </div>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
              Когда заказывают
            </p>
            <p className="mt-1 text-[20px] font-semibold tabular-nums" style={{ ...hubSans, color: hub.text }}>
              {insights.peakHours.length > 0 ? insights.peakHours.map((p) => `${String(p.hour).padStart(2, "0")}:00`).join(", ") : "—"}
            </p>
            <p className="text-[12px]" style={{ ...hubSans, color: hub.textMuted }}>
              {insights.peakHours.length > 0 ? "самые частые часы по Москве" : "мало заказов для вывода"}
            </p>
          </div>
        </div>

        {insights.products.length > 0 ? (
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
              На чём держится оборот
            </p>
            {insights.concentration ? (
              <p className="mt-1 text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
                {insights.concentration.products} из {insights.concentration.of} {ruPlural(insights.concentration.of, "артикула", "артикулов", "артикулов")} дают 80% заказов.
              </p>
            ) : null}
            <ul className="mt-2 space-y-1.5">
              {insights.products.slice(0, 5).map((p) => (
                <li key={p.nmId} className="flex items-baseline justify-between gap-3 text-[13px]" style={{ ...hubSans, color: hub.text }}>
                  <span className="min-w-0 truncate">{titleOf(p.nmId)}</span>
                  <span className="shrink-0 tabular-nums" style={{ color: hub.textMuted }}>
                    {p.orders} шт. · {formatRub(p.sum)}
                    {p.canceled > 0 ? ` · отмен ${p.canceled}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </HubPanel>
  );
}
