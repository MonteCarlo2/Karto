/** Периоды раздела «Аналитика», в днях. Сравнение всегда с предыдущим периодом такой же длины. */
export const ANALYTICS_PERIODS = [7, 14, 28, 60, 90] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];
export const DEFAULT_ANALYTICS_PERIOD: AnalyticsPeriod = 28;

export const isAnalyticsPeriod = (value: unknown): value is AnalyticsPeriod => typeof value === "number" && (ANALYTICS_PERIODS as readonly number[]).includes(value);

export const periodLabel = (days: number) => (days === 7 ? "7 дней" : days === 14 ? "14 дней" : `${days} дней`);
