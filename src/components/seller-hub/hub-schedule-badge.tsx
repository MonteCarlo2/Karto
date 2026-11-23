"use client";

import { useState } from "react";
import { upcomingRuns } from "@/lib/seller-hub/orders/preview";
import { WEEKDAY_SHORT, type OrderSchedule } from "@/lib/seller-hub/orders/types";
import { hub, hubSans } from "./hub-ui";

/**
 * Расписание наглядно: дни недели кружками, время тёмной плашкой «10:00 МСК», повторы и ближайшие запуски.
 * Всё время московское: так оно и работает на сервере.
 */

const MSK = 3 * 3_600_000;
const pad = (n: number) => String(n).padStart(2, "0");

function Pill({ children, dark, soft, lg }: { children: React.ReactNode; dark?: boolean; soft?: boolean; lg?: boolean }) {
  return (
    <span className={`inline-flex ${lg ? "h-[34px] px-4 text-[15px]" : "h-[26px] px-3 text-[13px]"} items-center whitespace-nowrap rounded-full font-medium`} style={{ ...hubSans, backgroundColor: dark ? hub.ink : soft ? "rgba(185,255,75,0.3)" : "rgba(1,20,8,0.06)", color: dark ? "#fff" : hub.text }}>
      {children}
    </span>
  );
}

function repeats(s: OrderSchedule): string | null {
  if ("maxRuns" in s && s.maxRuns) return `${s.maxRuns} раз`;
  if ("until" in s && s.until) {
    const d = new Date(Date.parse(s.until) - 1 + MSK);
    return `до ${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}`;
  }
  return null;
}

export function ScheduleBadge({ schedule, showNext = true, size = "md" }: { schedule: OrderSchedule; showNext?: boolean; size?: "md" | "lg" }) {
  const lg = size === "lg";
  const [now] = useState(() => Date.now());
  const next = showNext ? upcomingRuns(schedule, now, 3) : [];
  const rep = repeats(schedule);
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {schedule.type === "once" ? (
          <>
            <Pill soft lg={lg}>Один раз</Pill>
            <Pill dark lg={lg}>
              {(() => {
                const d = new Date(Date.parse(schedule.at) + MSK);
                return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)} · ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} МСК`;
              })()}
            </Pill>
          </>
        ) : null}
        {schedule.type === "daily" ? (
          <>
            <Pill soft lg={lg}>Каждый день</Pill>
            <Pill dark lg={lg}>{schedule.time} МСК</Pill>
          </>
        ) : null}
        {schedule.type === "weekly" ? (
          <>
            <span className={`flex items-center ${lg ? "gap-1.5" : "gap-1"}`} role="img" aria-label={`Дни: ${schedule.weekdays.map((d) => WEEKDAY_SHORT[d - 1]).join(", ")}`}>
              {WEEKDAY_SHORT.map((d, i) => {
                const on = schedule.weekdays.includes(i + 1);
                return (
                  <span key={d} className={`flex ${lg ? "h-[36px] w-[36px] text-[13px]" : "h-[26px] w-[26px] text-[11.5px]"} items-center justify-center rounded-full font-semibold uppercase`} style={{ ...hubSans, backgroundColor: on ? "#2E5A43" : "rgba(1,20,8,0.05)", color: on ? "#fff" : hub.textSubtle }}>
                    {d.slice(0, 2)}
                  </span>
                );
              })}
            </span>
            <Pill dark lg={lg}>{schedule.time} МСК</Pill>
          </>
        ) : null}
        {schedule.type === "every" ? (
          <Pill soft lg={lg}>{schedule.everyHours >= 24 && schedule.everyHours % 24 === 0 ? (schedule.everyHours === 24 ? "Каждый день" : `Каждые ${schedule.everyHours / 24} дн.`) : `Каждые ${schedule.everyHours} ч`}</Pill>
        ) : null}
        {schedule.type === "check" ? <Pill soft lg={lg}>Проверка каждые {schedule.everyMinutes >= 60 ? `${Math.round(schedule.everyMinutes / 60)} ч` : `${schedule.everyMinutes} мин`}</Pill> : null}
        {rep ? <Pill lg={lg}>{rep}</Pill> : null}
      </div>
      {next.length > 0 ? (
        <p className={`${lg ? "text-[14px]" : "text-[13px]"} leading-[1.5]`} style={{ ...hubSans, color: hub.textMuted }}>
          Ближайшие: {next.join(" · ")} <span style={{ color: hub.textSubtle }}>по Москве</span>
        </p>
      ) : null}
    </div>
  );
}
