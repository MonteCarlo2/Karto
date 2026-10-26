import { SYNC_SOURCES, type SyncSource, type SyncSourceId } from "./sources";

/**
 * Расписание фонового сбора: чистые функции без обращения к базе и сети, всё время передаётся снаружи.
 * Воркер читает состояние из seller_hub_sync_state, спрашивает отсюда, что делать, и записывает результат обратно.
 */

export type SyncStateRow = {
  source: SyncSourceId;
  nextDueAt: number;
  failCount: number;
  /** Пока в будущем, источник читает владелец аренды. Защита от двойного запуска (повторный тик расписания, перезапуск сервера). */
  leaseUntil: number | null;
  leaseOwner: string | null;
};

/** Первая пауза после ошибки; дальше удваивается. */
const BACKOFF_BASE_MS = 60_000;
/** Как долго воркер держит источник за собой. С запасом на прогон с ожиданием лимитов WB (реклама читается минутами). */
export const LEASE_MS = 10 * 60_000;

/** Разброс момента следующего чтения (до 10% периода): кабинеты не должны стучаться в WB все в одну секунду. */
function jitter(everyMs: number, seed: number): number {
  const unit = Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1;
  return Math.floor(everyMs * 0.1 * unit);
}

/** Когда читать источник в следующий раз после успеха. */
export function nextDueAfterSuccess(source: SyncSource, now: number, seed = 0): number {
  return now + source.everyMs + jitter(source.everyMs, seed);
}

/**
 * Когда повторить после ошибки. Пауза растёт вдвое с каждой неудачей, но не больше обычного периода источника.
 * Если WB назвал паузу (429, Retry-After), ждём не меньше неё.
 */
export function nextDueAfterFailure(source: SyncSource, failCount: number, now: number, retryAfterMs: number | null = null): number {
  const attempts = Math.max(1, failCount);
  const backoff = Math.min(source.everyMs, BACKOFF_BASE_MS * 2 ** (attempts - 1));
  const wait = Math.max(backoff, retryAfterMs != null && retryAfterMs > 0 ? retryAfterMs : 0);
  return now + wait;
}

export function leaseIsFree(row: Pick<SyncStateRow, "leaseUntil">, now: number): boolean {
  return row.leaseUntil == null || row.leaseUntil <= now;
}

/**
 * Источники, которые пора читать сейчас, в порядке чтения: сначала важные для работы (доступ, цены, остатки, заказы, реклама),
 * внутри одного уровня сначала просроченные дольше всех. Источники с занятой арендой пропускаются.
 * Нет строки состояния (кабинет только что подключили) — источник читается сразу.
 */
export function dueSources(rows: SyncStateRow[], now: number): SyncSource[] {
  const byId = new Map(rows.map((row) => [row.source, row]));
  const due: Array<{ source: SyncSource; since: number }> = [];
  for (const source of SYNC_SOURCES) {
    const row = byId.get(source.id);
    if (!row) {
      due.push({ source, since: 0 });
      continue;
    }
    if (!leaseIsFree(row, now)) continue;
    if (row.nextDueAt <= now) due.push({ source, since: row.nextDueAt });
  }
  return due.sort((a, b) => a.source.priority - b.source.priority || a.since - b.since).map((d) => d.source);
}

/**
 * Если вместо доступа к WB пришла ошибка авторизации (401/403), остальные источники читать бессмысленно:
 * кабинет получает статус «токен потерян», и сбор останавливается до ручного исправления.
 */
export function isAuthFailure(status: number | null | undefined): boolean {
  return status === 401 || status === 403;
}
