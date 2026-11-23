"use client";

import { useMemo } from "react";
import { Clock, Receipt, Undo2 } from "lucide-react";
import { FBS_ORDERS_WINDOW_DAYS } from "@/lib/seller-hub/orders-window";
import { buildOrdersInsights } from "@/lib/seller-hub/orders-insights";
import { snapshotTimeMs } from "@/lib/seller-hub/complete-days";
import { ruPlural } from "@/lib/seller-hub/task-engine/ru-plural";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { formatInt, formatRub, hub, hubNumeric, hubSans } from "./hub-ui";
import { HubPanel, HubPanelHeader } from "./hub-fulfillment-ui";

const dayLabel = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

export function HubOrdersInsights({ snapshot }: { snapshot?: SellerCatalogSnapshot }) {
  const rows = snapshot?.orders?.orders;
  const nowMs = snapshotTimeMs(snapshot);
  const insights = useMemo(() => (rows && nowMs > 0 ? buildOrdersInsights(rows, nowMs) : null), [rows, nowMs]);
  const titles = useMemo(() => new Map((snapshot?.items ?? []).map((i) => [i.externalId, i.title])), [snapshot?.items]);
  if (!insights) return null;

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

  const maxDay = Math.max(1, ...insights.daily.map((d) => d.count));
  const mono = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.05em" } as const;
  const weekday = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("ru-RU", { weekday: "short" });
  const cancelPct = (Math.round(insights.cancelShare * 1000) / 10).toLocaleString("ru-RU");

  const facts = [
    { icon: Receipt, label: "Средний чек", value: insights.avgCheck != null ? formatRub(insights.avgCheck) : "—", note: "без отменённых заказов", tint: "#4F5BEA" },
    { icon: Undo2, label: "Доля отмен", value: `${cancelPct}%`, note: `${formatInt(insights.canceled)} из ${formatInt(insights.total)} заказов`, tint: insights.cancelShare >= 0.15 ? "#EF4444" : "#3B4248" },
  ];

  return (
    <div className="space-y-4">
      {notes.length > 0 ? (
        <ul className="space-y-2">
          {notes.map((line) => (
            <li key={line} className="rounded-[14px] px-5 py-3.5 text-[15.5px] leading-[1.5]" style={{ ...hubSans, backgroundColor: "rgba(1, 20, 8, 0.035)", color: hub.text, borderLeft: `3px solid ${hub.warn}` }}>
              {line}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-[14px] px-5 py-3.5 text-[15.5px]" style={{ ...hubSans, backgroundColor: "rgba(1, 20, 8, 0.035)", color: hub.text, borderLeft: `3px solid ${hub.green}` }}>
          Неотгруженных заказов нет, повторяющихся отмен не видно.
        </p>
      )}

      <HubPanel>
        <HubPanelHeader title="Заказы по дням" hint={`Последние ${FBS_ORDERS_WINDOW_DAYS} дн. Пунктир — день ещё не закончился: заказы набираются до конца суток`} />
        <div className="grid grid-cols-2 gap-2.5 p-4 sm:grid-cols-4 sm:p-5 xl:grid-cols-8">
          {insights.daily.map((d) => (
            <div key={d.date} className="rounded-[16px] border px-4 py-4" style={{ borderStyle: d.partial ? "dashed" : "solid", borderColor: "rgba(1, 20, 8, 0.14)", backgroundColor: `rgba(40, 52, 62, ${(0.02 + (d.count / maxDay) * 0.09).toFixed(3)})` }}>
              <p className="text-[13.5px] capitalize" style={{ ...hubSans, color: hub.textSubtle }}>
                {weekday(d.date)}, {dayLabel(d.date)}
              </p>
              <p className="mt-3 text-[38px] font-medium leading-none" style={{ ...mono, color: hub.text }}>
                {d.count}
              </p>
              <p className="mt-2 text-[14px]" style={{ ...hubSans, ...hubNumeric, color: hub.textMuted }}>
                {formatRub(d.sum)}
              </p>
              <div className="mt-4 h-[5px] rounded-full" style={{ backgroundColor: "rgba(1, 20, 8, 0.08)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(6, (d.count / maxDay) * 100)}%`, backgroundColor: "#3B4248" }} />
              </div>
            </div>
          ))}
        </div>
      </HubPanel>

      <div className="grid gap-3 md:grid-cols-3">
        {facts.map((f) => {
          const Icon = f.icon;
          return (
            <div key={f.label} className="flex items-start gap-4 rounded-[18px] border p-5" style={{ borderColor: "rgba(1, 20, 8, 0.12)", backgroundColor: hub.surface }}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${f.tint}1A`, color: f.tint }}>
                <Icon className="h-[22px] w-[22px]" />
              </span>
              <div className="min-w-0">
                <p className="text-[14.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                  {f.label}
                </p>
                <p className="mt-3 text-[32px] font-medium leading-none" style={{ ...mono, color: hub.text }}>
                  {f.value}
                </p>
                <p className="mt-3 text-[14px]" style={{ ...hubSans, color: hub.textMuted }}>
                  {f.note}
                </p>
              </div>
            </div>
          );
        })}
        <div className="flex items-start gap-4 rounded-[18px] border p-5" style={{ borderColor: "rgba(1, 20, 8, 0.12)", backgroundColor: hub.surface }}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(245, 158, 11, 0.16)", color: "#B4500A" }}>
            <Clock className="h-[22px] w-[22px]" />
          </span>
          <div className="min-w-0">
            <p className="text-[14.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
              Когда заказывают
            </p>
            {insights.peakHours.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {insights.peakHours.map((p) => (
                  <span key={p.hour} className="rounded-full px-3.5 py-1.5 text-[19px] font-medium leading-none" style={{ ...mono, backgroundColor: "rgba(1, 20, 8, 0.06)", color: hub.text }}>
                    {String(p.hour).padStart(2, "0")}:00
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-[30px] font-medium leading-none" style={{ ...mono, color: hub.text }}>
                —
              </p>
            )}
            <p className="mt-3 text-[14px]" style={{ ...hubSans, color: hub.textMuted }}>
              {insights.peakHours.length > 0 ? "самые частые часы, по Москве" : "мало заказов, чтобы назвать часы"}
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
