/** Календарная дата YYYY-MM-DD по Москве: WB отдаёт дневные ряды по московскому времени. */
export function moscowDateKey(nowMs: number): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" }).format(new Date(nowMs));
}

/** Момент выгрузки снимка: от него считается, какой день ещё не закончился (чистая функция для рендера). */
export function snapshotTimeMs(snapshot: { syncedAt?: string | null } | null | undefined): number {
  const parsed = snapshot?.syncedAt ? Date.parse(snapshot.syncedAt) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Дневной ряд без текущего (неполного) дня.
 * Сегодняшний день набран лишь частично, поэтому сравнение «сегодня к вчера» всегда показывает ложное падение.
 */
export function withoutIncompleteDay<T extends { date: string }>(points: T[], nowMs: number): T[] {
  if (points.length === 0) return points;
  const today = moscowDateKey(nowMs);
  const last = points[points.length - 1]!;
  return last.date.slice(0, 10) >= today ? points.slice(0, -1) : points;
}

/** Последние N полных дней по Москве, без сегодняшнего: [dateFrom, dateTo] в формате ГГГГ-ММ-ДД. */
export function lastFullDaysRange(nowMs: number, days: number): { dateFrom: string; dateTo: string } {
  const today = moscowDateKey(nowMs);
  const base = Date.parse(`${today}T00:00:00Z`);
  const iso = (offsetDays: number) => new Date(base - offsetDays * 86_400_000).toISOString().slice(0, 10);
  return { dateFrom: iso(days), dateTo: iso(1) };
}
