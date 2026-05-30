type CacheEntry<T> = { expiresAt: number; value: T };
type CooldownEntry = { until: number; message: string };

const verifyOkCache = new Map<string, CacheEntry<unknown>>();
const verifyCooldown = new Map<string, CooldownEntry>();
const syncCache = new Map<string, CacheEntry<unknown>>();

export function ozonCredentialsKey(clientId: string, apiKey: string): string {
  const cid = clientId.trim();
  const key = apiKey.trim();
  return `${cid.slice(0, 6)}…${key.slice(-8)}`;
}

export function getOzonVerifyCooldown(key: string): CooldownEntry | null {
  const entry = verifyCooldown.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.until) {
    verifyCooldown.delete(key);
    return null;
  }
  return entry;
}

export function setOzonVerifyCooldown(key: string, seconds: number, message: string) {
  verifyCooldown.set(key, { until: Date.now() + seconds * 1000, message });
}

export function getCachedOzonVerify<T>(key: string): T | null {
  const entry = verifyOkCache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    verifyOkCache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setCachedOzonVerify<T>(key: string, value: T, ttlMs: number) {
  verifyOkCache.set(key, { expiresAt: Date.now() + ttlMs, value });
}

export function getCachedOzonSync<T>(key: string): T | null {
  const entry = syncCache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    return null;
  }
  return entry.value as T;
}

/** Последний успешный sync — отдать при ошибке API, даже если TTL истёк. */
export function getStaleOzonSync<T>(key: string): T | null {
  const entry = syncCache.get(key);
  if (!entry) return null;
  return entry.value as T;
}

export function setCachedOzonSync<T>(key: string, value: T, ttlMs: number) {
  syncCache.set(key, { expiresAt: Date.now() + ttlMs, value });
}

export function cooldownRetryAfterSec(entry: CooldownEntry): number {
  return Math.max(1, Math.ceil((entry.until - Date.now()) / 1000));
}
