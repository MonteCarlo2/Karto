/** Защита от двойного клика — не блокируем генерацию на минуты. */
export const BATCH_DEBOUNCE_MS =
  Number(process.env.WAVESPEED_BATCH_DEBOUNCE_MS) || 4_000;

/** In-memory lock: одна генерация на session_id в рамках процесса Node. */
const batchLockBySession = new Set<string>();
const batchLockStartedAt = new Map<string, number>();

export function isBatchLockStale(sessionId: string): boolean {
  const started = batchLockStartedAt.get(sessionId);
  if (!started) return true;
  return Date.now() - started > BATCH_DEBOUNCE_MS;
}

export function acquireBatchLock(sessionId: string): boolean {
  if (batchLockBySession.has(sessionId) && !isBatchLockStale(sessionId)) {
    return false;
  }
  if (batchLockBySession.has(sessionId)) {
    releaseBatchLock(sessionId);
  }
  batchLockBySession.add(sessionId);
  batchLockStartedAt.set(sessionId, Date.now());
  return true;
}

export function releaseBatchLock(sessionId: string): void {
  batchLockBySession.delete(sessionId);
  batchLockStartedAt.delete(sessionId);
}

export function isBatchLocked(sessionId: string): boolean {
  if (!batchLockBySession.has(sessionId)) return false;
  if (isBatchLockStale(sessionId)) {
    releaseBatchLock(sessionId);
    return false;
  }
  return true;
}

export function batchLockAgeMs(sessionId: string): number | null {
  const started = batchLockStartedAt.get(sessionId);
  if (!started) return null;
  return Date.now() - started;
}
