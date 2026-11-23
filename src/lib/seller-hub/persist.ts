/**
 * Последние хорошие ответы сервера, сохранённые в браузере (по пользователю). Нужны для одного: если сервер или связь
 * на секунду отвалились, человек видит последние данные, а не ошибку. Живут сутки, большие ответы не сохраняем.
 */
const PREFIX = "karto-hub:v1:";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRY_CHARS = 900_000;
let scope: string | null = null;

/** Пользователь, чьи данные сохраняем. Без него (не вошли) ничего не читаем и не пишем: чужие данные показать нельзя. */
export function setPersistScope(userId: string | null): void {
  scope = userId;
}

export function persistGet<T>(key: string): { at: number; value: T } | null {
  if (!scope || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${PREFIX}${scope}:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; value: T };
    if (typeof parsed.at !== "number" || Date.now() - parsed.at > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistSet(key: string, value: unknown): void {
  if (!scope || typeof window === "undefined") return;
  try {
    const raw = JSON.stringify({ at: Date.now(), value });
    if (raw.length > MAX_ENTRY_CHARS) return;
    window.localStorage.setItem(`${PREFIX}${scope}:${key}`, raw);
  } catch {
    // Хранилище переполнено или закрыто: работаем без него.
  }
}
