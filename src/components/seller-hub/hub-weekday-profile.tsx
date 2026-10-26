"use client";

import { useMemo } from "react";
import { buildWeekdayProfile, MIN_DATES_PER_WEEKDAY } from "@/lib/seller-hub/weekday-profile";
import type { SellerRegionOrders } from "@/lib/seller-hub/types";
import { hub, hubSans } from "./hub-ui";

/** Сколько заказов в среднем приходит в каждый день недели (без отмен, законченные дни периода). */
export function HubWeekdayProfile({ orders, days }: { orders: SellerRegionOrders; days: number }) {
  const profile = useMemo(() => buildWeekdayProfile(orders.byWeekday, orders.weekdayDates), [orders.byWeekday, orders.weekdayDates]);
  if (!profile) {
    return orders.byWeekday ? (
      <p className="rounded-2xl px-4 py-3 text-[12.5px] leading-5" style={{ ...hubSans, backgroundColor: hub.surface, color: hub.textMuted }}>
        Заказов по дням недели пока мало: для вывода нужно хотя бы {MIN_DATES_PER_WEEKDAY} разных дня каждого дня недели и 30 заказов за период. Выберите период длиннее.
      </p>
    ) : null;
  }
  const max = Math.max(...profile.days.map((d) => d.avgPerDay), 0.1);
  const busy = profile.days[profile.busiest]!;
  const quiet = profile.days[profile.quietest]!;
  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: hub.surface }}>
      <p className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
        Заказы по дням недели
      </p>
      <p className="mb-3 mt-0.5 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
        В среднем за день, без отмен, за {days} дн. Больше всего заказов в {busy.name} ({busy.avgPerDay.toLocaleString("ru-RU")} в день), меньше всего — в {quiet.name} ({quiet.avgPerDay.toLocaleString("ru-RU")}
        {profile.ratio != null ? `, разница в ${profile.ratio.toLocaleString("ru-RU")} раза` : ""}).
      </p>
      <div className="flex items-end gap-2" style={{ height: 96 }}>
        {profile.days.map((d) => (
          <div key={d.index} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${d.name}: ${d.orders} заказов за ${d.dates} дн.`}>
            <span className="text-[12px] font-semibold tabular-nums" style={{ ...hubSans, color: hub.text }}>
              {d.avgPerDay.toLocaleString("ru-RU")}
            </span>
            <div className="w-full rounded-t-md" style={{ height: `${Math.max(4, Math.round((d.avgPerDay / max) * 56))}px`, backgroundColor: d.index === profile.busiest ? hub.green : hub.blue }} />
            <span className="text-[11px]" style={{ ...hubSans, color: hub.textMuted }}>
              {d.short}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
