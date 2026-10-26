/**
 * Белый список запросов рекламы: запросы, которые продавец решил оставить (не добавлять в минус-фразы).
 * Хранится в настройках пользователя (Supabase) одной JSON-строкой «артикул:запрос».
 */

export const KEEP_QUERIES_MAX = 300;

export const keepKey = (nmId: string | number, query: string): string => `${nmId}:${query.trim().toLowerCase()}`;

export function parseKeepQueries(raw: string): string[] {
  try {
    const data = JSON.parse(raw) as unknown;
    return Array.isArray(data) ? data.filter((v): v is string => typeof v === "string").slice(0, KEEP_QUERIES_MAX) : [];
  } catch {
    return [];
  }
}

export function serializeKeepQueries(keys: string[]): string {
  return JSON.stringify([...new Set(keys)].slice(-KEEP_QUERIES_MAX));
}

/** Проверка значения для сохранения в настройках: JSON-массив строк разумной длины. */
export function isValidKeepQueries(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 30_000) return false;
  try {
    const data = JSON.parse(value) as unknown;
    return Array.isArray(data) && data.length <= KEEP_QUERIES_MAX && data.every((v) => typeof v === "string" && v.length <= 200);
  } catch {
    return false;
  }
}
