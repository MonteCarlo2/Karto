"use client";

import { useMemo } from "react";
import { buildWeekdayProfile, MIN_DATES_PER_WEEKDAY } from "@/lib/seller-hub/weekday-profile";
import type { SellerRegionOrders } from "@/lib/seller-hub/types";
import { EmptyNote } from "./hub-analytics-ui";
import { FCard as Card } from "./hub-fulfillment-ui";
import { hub, hubSans } from "./hub-ui";

const mono = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.05em" } as const;

/** Сколько заказов в среднем приходит в каждый день недели (без отмен, законченные дни периода): семь плиток, самый загруженный день подчёркнут. */
export function HubWeekdayProfile({ orders, days }: { orders: SellerRegionOrders; days: number }) {
  const profile = useMemo(() => buildWeekdayProfile(orders.byWeekday, orders.weekdayDates), [orders.byWeekday, orders.weekdayDates]);
  if (!profile) {
    return orders.byWeekday ? (
      <Card title="Заказы по дням недели">
        <EmptyNote title="Заказов по дням недели пока мало">Для вывода нужно хотя бы {MIN_DATES_PER_WEEKDAY} разных дня каждого дня недели и 30 заказов за период. Выберите период длиннее.</EmptyNote>
      </Card>
    ) : null;
  }
  const busy = profile.days[profile.busiest]!;
  const quiet = profile.days[profile.quietest]!;
  const max = Math.max(0.1, ...profile.days.map((d) => d.avgPerDay));
  return (
    <Card
      first
      title="Заказы по дням недели"
      hint={`В среднем за день, без отмен, за ${days} дн. Больше всего заказов в ${busy.name} (${busy.avgPerDay.toLocaleString("ru-RU")} в день), меньше всего — в ${quiet.name} (${quiet.avgPerDay.toLocaleString("ru-RU")}${profile.ratio != null ? `, разница в ${profile.ratio.toLocaleString("ru-RU")} раза` : ""})`}
    >
      <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-7 sm:gap-3">
        {profile.days.map((d) => {
          const top = d.index === profile.busiest;
          return (
            <div key={d.index} title={`${d.name}: ${d.orders} заказов за ${d.dates} дн.`} className="relative rounded-[16px] border px-3 py-4" style={{ borderColor: top ? "rgba(18, 32, 26, 0.55)" : "rgba(1, 20, 8, 0.12)", backgroundColor: `rgba(18, 32, 26, ${(0.02 + (d.avgPerDay / max) * 0.07).toFixed(3)})` }}>
              {top ? (
                <span className="absolute -top-2.5 left-3 rounded-full px-2 py-0.5 text-[11.5px] font-bold" style={{ ...hubSans, backgroundColor: "#B9FF4B", color: hub.text }}>
                  пик
                </span>
              ) : null}
              <p className="text-[14.5px] font-semibold capitalize" style={{ ...hubSans, color: hub.textMuted }}>
                {d.short}
              </p>
              <p className="mt-4 text-[32px] font-semibold leading-none" style={{ ...mono, color: hub.text }}>
                {d.avgPerDay.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}
              </p>
              <p className="mt-3 text-[13.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                в день
              </p>
              <div className="mt-4 h-[5px] rounded-full" style={{ backgroundColor: "rgba(1, 20, 8, 0.08)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(6, (d.avgPerDay / max) * 100)}%`, backgroundColor: "#12201A" }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
