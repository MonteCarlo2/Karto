/** Минус-фразы рекламной кампании: проверка запроса и слияние со списком, который уже стоит в WB. */

export const AD_MINUS_MAX_PER_REQUEST = 50;
const MAX_PHRASE_LENGTH = 200;

export type AdMinusRequest = {
  advertId: number;
  nmId: number;
  /** Что добавить. Уже стоящие в WB фразы сервер подтянет сам и не потеряет. */
  queries: string[];
};

export type AdMinusParse = { ok: true; request: AdMinusRequest } | { ok: false; error: string };

/** Фразы сравниваем без учёта регистра, ё = е и без лишних пробелов, как это делает WB при показах. */
export function normalizeMinusPhrase(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

export function parseAdMinusRequest(body: unknown): AdMinusParse {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Нужен JSON" };
  const { advertId, nmId, queries, confirmCount } = body as Record<string, unknown>;
  if (typeof advertId !== "number" || !Number.isInteger(advertId) || advertId <= 0) {
    return { ok: false, error: "Укажите кампанию" };
  }
  if (typeof nmId !== "number" || !Number.isInteger(nmId) || nmId <= 0) {
    return { ok: false, error: "Укажите артикул" };
  }
  if (!Array.isArray(queries) || queries.length === 0) {
    return { ok: false, error: "Нет фраз для добавления" };
  }
  const clean: string[] = [];
  const seen = new Set<string>();
  for (const raw of queries) {
    if (typeof raw !== "string") return { ok: false, error: "Фразы должны быть текстом" };
    const phrase = raw.replace(/\s+/g, " ").trim();
    if (phrase.length === 0 || phrase.length > MAX_PHRASE_LENGTH) {
      return { ok: false, error: "Фраза пустая или слишком длинная" };
    }
    const key = normalizeMinusPhrase(phrase);
    if (!seen.has(key)) {
      seen.add(key);
      clean.push(phrase);
    }
  }
  if (clean.length > AD_MINUS_MAX_PER_REQUEST) {
    return { ok: false, error: `За раз можно добавить не больше ${AD_MINUS_MAX_PER_REQUEST} фраз` };
  }
  if (confirmCount !== clean.length) {
    return { ok: false, error: "Количество фраз не подтверждено" };
  }
  return { ok: true, request: { advertId, nmId, queries: clean } };
}

/**
 * Итоговый список для WB: уже стоящие фразы плюс новые, без повторов.
 * WB заменяет список целиком, поэтому существующие фразы обязаны остаться.
 */
export function mergeMinusPhrases(existing: string[], add: string[]): { merged: string[]; added: string[] } {
  const merged = [...existing];
  const seen = new Set(existing.map(normalizeMinusPhrase));
  const added: string[] = [];
  for (const phrase of add) {
    const key = normalizeMinusPhrase(phrase);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(phrase);
      added.push(phrase);
    }
  }
  return { merged, added };
}
