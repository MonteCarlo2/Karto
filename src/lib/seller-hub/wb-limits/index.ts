import { WB_LIMIT_ROWS, WB_METHODS_WITHOUT_LIMIT, type RawWbLimit } from "./limits.generated";

/**
 * Лимиты WB API по методам. Источник: официальная спецификация (docs/wb-api/swagger), таблицы «Лимит запросов на один аккаунт продавца».
 * Реестр создаёт scripts/gen-wb-limits.mjs: чтобы обновить его после новой выгрузки спецификации, запустите скрипт.
 * Лимит считается на токен (кабинет). Тип токена влияет на цифры: персональный сейчас, сервисный после одобрения WB.
 */

export type WbTokenKind = "personal" | "service";

export type WbLimit = {
  /** Ключ общей очереди: у методов одной категории лимит общий («Контент», «Цены и скидки»…), иначе свой у метода. */
  key: string;
  /** Не чаще одного запроса за столько мс. */
  intervalMs: number;
  /** Не больше стольких запросов за период. */
  perPeriod: number;
  periodMs: number;
  /** Сколько запросов можно отправить подряд без пауз. */
  burst: number;
  /** Метод только читает, меняет ли он данные в кабинете (для агентов важно). */
  readOnly: boolean;
};

/** Если метода нет в спецификации или у него нет лимита, идём осторожно: 1 запрос в секунду, без всплесков. */
export const FALLBACK_LIMIT: Omit<WbLimit, "key"> = { intervalMs: 1000, perPeriod: 30, periodMs: 60_000, burst: 1, readOnly: false };

type Entry = {
  method: string;
  segments: string[];
  group: string | null;
  readOnly: boolean;
  personal: RawWbLimit;
  service: RawWbLimit;
  path: string;
};

const entries: Entry[] = WB_LIMIT_ROWS.map(([method, path, group, readOnly, personal, service]) => ({
  method,
  path,
  group,
  readOnly: readOnly === 1,
  personal,
  service,
  segments: path.split("/").filter(Boolean),
}));

const withoutLimit = new Set(WB_METHODS_WITHOUT_LIMIT);

function normalizePath(raw: string): string[] {
  // Без хоста, строки запроса и хвостового слэша.
  const noQuery = raw.split("?")[0] ?? "";
  const noHost = noQuery.replace(/^https?:\/\/[^/]+/i, "");
  return noHost.split("/").filter(Boolean);
}

function matches(entry: Entry, segments: string[]): boolean {
  if (entry.segments.length !== segments.length) return false;
  for (let i = 0; i < segments.length; i += 1) {
    const want = entry.segments[i]!;
    if (want.startsWith("{") && want.endsWith("}")) continue;
    if (want !== segments[i]) return false;
  }
  return true;
}

/** Больше постоянных сегментов значит точнее: «/orders/new» важнее «/orders/{id}». */
function specificity(entry: Entry): number {
  return entry.segments.filter((s) => !s.startsWith("{")).length;
}

/**
 * Лимит метода по HTTP-методу и пути (можно с хостом и строкой запроса).
 * Нет в спецификации: возвращает осторожный запасной лимит и `known: false`.
 */
export function wbLimitFor(method: string, rawPath: string, token: WbTokenKind = "personal"): WbLimit & { known: boolean } {
  const upper = method.toUpperCase();
  const segments = normalizePath(rawPath);
  let best: Entry | null = null;
  for (const entry of entries) {
    if (entry.method !== upper || !matches(entry, segments)) continue;
    if (!best || specificity(entry) > specificity(best)) best = entry;
  }
  const normalized = `/${segments.join("/")}`;
  if (!best) {
    const known = false;
    return { key: `${upper} ${normalized}`, ...FALLBACK_LIMIT, known };
  }
  const raw = token === "service" ? best.service : best.personal;
  if (!raw || withoutLimit.has(`${best.method} ${best.path}`)) {
    return { key: best.group ?? `${best.method} ${best.path}`, ...FALLBACK_LIMIT, readOnly: best.readOnly, known: false };
  }
  const [periodMs, perPeriod, intervalMs, burst] = raw;
  return { key: best.group ? `group:${best.group}` : `${best.method} ${best.path}`, intervalMs, perPeriod, periodMs, burst, readOnly: best.readOnly, known: true };
}
