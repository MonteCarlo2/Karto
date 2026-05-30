import type { AutoRepliesAdvancedSettings } from "./settings-types";

export const RESTRICTION_LIMITS = {
  stopWordsMax: 20,
  minusWordsMax: 20,
  wordMaxLength: 20,
} as const;

/** Одно слово без пробелов, до 20 символов. */
export function normalizeWordToken(raw: string): string | null {
  const w = raw.trim();
  if (!w || /\s/.test(w) || w.length > RESTRICTION_LIMITS.wordMaxLength) return null;
  return w;
}

function parseLegacyWordList(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((part) => normalizeWordToken(part))
    .filter((w): w is string => Boolean(w));
}

export function dedupeWords(words: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    const key = w.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

export function defaultAdvancedSettings(): AutoRepliesAdvancedSettings {
  return {
    stopWordsEnabled: false,
    stopWords: [],
    minusWordsEnabled: false,
    minusWords: [],
  };
}

type LegacyAdvancedSettings = Partial<AutoRepliesAdvancedSettings> & {
  forbiddenWords?: string;
  notifyOnNegative?: boolean;
  dailyAnswerLimit?: number | null;
  blockExternalLinks?: boolean;
  avoidUnverifiedPromises?: boolean;
};

export type { LegacyAdvancedSettings };

export function normalizeAdvancedSettings(raw: LegacyAdvancedSettings | undefined): AutoRepliesAdvancedSettings {
  const base = defaultAdvancedSettings();
  if (!raw) return base;

  let stopWords = Array.isArray(raw.stopWords)
    ? dedupeWords(
        raw.stopWords
          .map((w) => normalizeWordToken(String(w)))
          .filter((w): w is string => Boolean(w))
      ).slice(0, RESTRICTION_LIMITS.stopWordsMax)
    : base.stopWords;

  let stopWordsEnabled =
    typeof raw.stopWordsEnabled === "boolean" ? raw.stopWordsEnabled : base.stopWordsEnabled;

  if (typeof raw.forbiddenWords === "string" && raw.forbiddenWords.trim() && stopWords.length === 0) {
    stopWords = dedupeWords(parseLegacyWordList(raw.forbiddenWords)).slice(0, RESTRICTION_LIMITS.stopWordsMax);
    if (stopWords.length) stopWordsEnabled = true;
  }

  const minusWords = Array.isArray(raw.minusWords)
    ? dedupeWords(
        raw.minusWords
          .map((w) => normalizeWordToken(String(w)))
          .filter((w): w is string => Boolean(w))
      ).slice(0, RESTRICTION_LIMITS.minusWordsMax)
    : base.minusWords;

  let minusWordsEnabled =
    typeof raw.minusWordsEnabled === "boolean" ? raw.minusWordsEnabled : base.minusWordsEnabled;
  if (minusWords.length > 0 && raw.minusWordsEnabled === undefined) {
    minusWordsEnabled = true;
  }

  return { stopWordsEnabled, stopWords, minusWordsEnabled, minusWords };
}

export function addRestrictionWord(
  words: string[],
  raw: string,
  max: number
): { words: string[]; added: boolean; reason?: "duplicate" | "invalid" | "limit" | "too_long" | "spaces" } {
  const trimmed = raw.trim();
  if (!trimmed) return { words, added: false, reason: "invalid" };
  if (/\s/.test(trimmed)) return { words, added: false, reason: "spaces" };
  if (trimmed.length > RESTRICTION_LIMITS.wordMaxLength) {
    return { words, added: false, reason: "too_long" };
  }

  const token = normalizeWordToken(trimmed);
  if (!token) return { words, added: false, reason: "invalid" };
  if (words.length >= max) return { words, added: false, reason: "limit" };
  if (words.some((w) => w.toLowerCase() === token.toLowerCase())) {
    return { words, added: false, reason: "duplicate" };
  }

  return { words: [...words, token], added: true };
}

export function removeRestrictionWord(words: string[], word: string): string[] {
  const key = word.toLowerCase();
  return words.filter((w) => w.toLowerCase() !== key);
}

/** Стоп-слово в тексте отзыва — перед генерацией нужно подтверждение. */
export function findStopWordHitsInReview(reviewText: string, stopWords: string[]): string[] {
  if (!reviewText.trim() || !stopWords.length) return [];
  const lower = reviewText.toLowerCase();
  return stopWords.filter((w) => lower.includes(w.toLowerCase()));
}

/** @deprecated используйте findStopWordHitsInReview */
export function findStopWordHits(text: string, stopWords: string[]): string[] {
  return findStopWordHitsInReview(text, stopWords);
}
