/**
 * Заказы по дням недели: сколько заказов в среднем приходит в понедельник, вторник и т. д.
 * Берутся заказы без отмен за законченные дни периода (отчёт «Заказы» WB); средняя считается на один такой день недели,
 * чтобы неравное число дней в периоде не искажало картину.
 */

export const WEEKDAY_NAMES = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"] as const;
export const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

/** Меньше стольких разных дат каждого дня недели — вывод о дне ненадёжен. */
export const MIN_DATES_PER_WEEKDAY = 3;
/** Меньше стольких заказов всего — картина случайна. */
export const MIN_TOTAL_ORDERS = 30;

export type WeekdayProfile = {
  days: Array<{ index: number; name: string; short: string; orders: number; dates: number; avgPerDay: number; share: number }>;
  busiest: number;
  quietest: number;
  /** Во сколько раз самый загруженный день больше самого тихого; null, если тихий день без заказов. */
  ratio: number | null;
};

export function buildWeekdayProfile(byWeekday: number[] | undefined, weekdayDates: number[] | undefined): WeekdayProfile | null {
  if (!byWeekday || !weekdayDates || byWeekday.length !== 7 || weekdayDates.length !== 7) return null;
  const total = byWeekday.reduce((a, b) => a + b, 0);
  if (total < MIN_TOTAL_ORDERS) return null;
  if (weekdayDates.some((d) => d < MIN_DATES_PER_WEEKDAY)) return null;
  const avg = byWeekday.map((n, i) => n / weekdayDates[i]!);
  const avgTotal = avg.reduce((a, b) => a + b, 0);
  const days = byWeekday.map((orders, i) => ({
    index: i,
    name: WEEKDAY_NAMES[i]!,
    short: WEEKDAY_SHORT[i]!,
    orders,
    dates: weekdayDates[i]!,
    avgPerDay: Math.round(avg[i]! * 10) / 10,
    share: avgTotal > 0 ? avg[i]! / avgTotal : 0,
  }));
  let busiest = 0;
  let quietest = 0;
  for (let i = 1; i < 7; i += 1) {
    if (avg[i]! > avg[busiest]!) busiest = i;
    if (avg[i]! < avg[quietest]!) quietest = i;
  }
  return { days, busiest, quietest, ratio: avg[quietest]! > 0 ? Math.round((avg[busiest]! / avg[quietest]!) * 10) / 10 : null };
}
