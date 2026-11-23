import type { OrderSchedule } from "./types";

/**
 * Когда поручение запустится в следующий раз. Время в расписании московское (UTC+3, без перехода на летнее).
 * Возвращает ISO-время или null, если поручение закончилось (разовое отработало, вышел срок или число запусков).
 */

const MSK = 3 * 3_600_000;
const DAY = 24 * 3_600_000;

function atTime(dayStartUtcMs: number, time: string): number {
  const [h, m] = time.split(":").map(Number);
  return dayStartUtcMs + (h! * 60 + m!) * 60_000 - MSK;
}

/** Начало московских суток (в UTC-мс), в которые попадает момент ms. */
const mskDayStart = (ms: number): number => Math.floor((ms + MSK) / DAY) * DAY;

export function computeNextRun(schedule: OrderSchedule, afterMs: number, runsDone: number): string | null {
  const until = "until" in schedule && schedule.until ? Date.parse(schedule.until) : null;
  const maxRuns = "maxRuns" in schedule ? schedule.maxRuns : undefined;
  if (maxRuns != null && runsDone >= maxRuns) return null;
  let next: number | null = null;

  switch (schedule.type) {
    case "once":
      next = runsDone === 0 ? Date.parse(schedule.at) : null;
      break;
    case "every": {
      const step = schedule.everyHours * 3_600_000;
      const start = schedule.startAt ? Date.parse(schedule.startAt) : afterMs;
      next = runsDone === 0 && start > afterMs ? start : afterMs + step;
      break;
    }
    case "daily": {
      const today = mskDayStart(afterMs);
      next = atTime(today, schedule.time);
      if (next <= afterMs) next = atTime(today + DAY, schedule.time);
      break;
    }
    case "weekly": {
      const today = mskDayStart(afterMs);
      for (let i = 0; i < 8; i += 1) {
        const dayStart = today + i * DAY;
        // 1 = понедельник … 7 = воскресенье. 1 января 1970 (четверг) = 4.
        const weekday = ((Math.floor(dayStart / DAY) + 3) % 7) + 1;
        if (!schedule.weekdays.includes(weekday)) continue;
        const t = atTime(dayStart, schedule.time);
        if (t > afterMs) {
          next = t;
          break;
        }
      }
      break;
    }
    case "check":
      next = afterMs + schedule.everyMinutes * 60_000;
      break;
  }
  if (next == null) return null;
  if (until != null && next > until) return null;
  return new Date(next).toISOString();
}

/** Первое время запуска при создании поручения (от текущего момента). */
export function firstRun(schedule: OrderSchedule, nowMs: number): string | null {
  if (schedule.type === "check") return new Date(nowMs + 60_000).toISOString();
  return computeNextRun(schedule, nowMs, 0);
}
