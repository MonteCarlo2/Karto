type CacheEntry<T> = { expiresAt: number; value: T };
type CooldownEntry = { until: number; message: string };

const verifyOkCache = new Map<string, CacheEntry<unknown>>();
const verifyCooldown = new Map<string, CooldownEntry>();
const syncCache = new Map<string, CacheEntry<unknown>>();

export function yandexCredentialsKey(apiKey: string, campaignId: string): string {
  const key = apiKey.trim();
  const cid = campaignId.trim();
  const keyPart = key.length <= 24 ? key : `${key.slice(0, 8)}…${key.slice(-8)}`;
  return `${cid}:${keyPart}`;
}

export function getYandexVerifyCooldown(key: string): CooldownEntry | null {
  const entry = verifyCooldown.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.until) {
    verifyCooldown.delete(key);
    return null;
  }
  return entry;
}

export function setYandexVerifyCooldown(key: string, seconds: number, message: string) {
  verifyCooldown.set(key, { until: Date.now() + seconds * 1000, message });
}

export function getCachedYandexVerify<T>(key: string): T | null {
  const entry = verifyOkCache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    verifyOkCache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setCachedYandexVerify<T>(key: string, value: T, ttlMs: number) {
  verifyOkCache.set(key, { expiresAt: Date.now() + ttlMs, value });
}

export function getCachedYandexSync<T>(key: string): T | null {
  const entry = syncCache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    syncCache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function getStaleYandexSync<T>(key: string): T | null {
  const entry = syncCache.get(key);
  if (!entry) return null;
  return entry.value as T;
}

export function setCachedYandexSync<T>(key: string, value: T, ttlMs: number) {
  syncCache.set(key, { expiresAt: Date.now() + ttlMs, value });
}

export function cooldownRetryAfterSec(entry: CooldownEntry): number {
  return Math.max(1, Math.ceil((entry.until - Date.now()) / 1000));
}
