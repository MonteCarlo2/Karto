import type { WbVerifyResult } from "@/lib/services/wildberries/types";

type CacheEntry<T> = { expiresAt: number; value: T };
type CooldownEntry = { until: number; message: string };

const verifyOkCache = new Map<string, CacheEntry<WbVerifyResult>>();
const verifyCooldown = new Map<string, CooldownEntry>();
const syncCooldown = new Map<string, CooldownEntry>();
const syncCache = new Map<string, CacheEntry<unknown>>();

/** Короткий отпечаток токена — не храним целиком. */
export function wildberriesTokenKey(apiKey: string): string {
  const t = apiKey.trim();
  if (t.length <= 24) return t;
  return `${t.slice(0, 10)}…${t.slice(-10)}`;
}

export function getWildberriesVerifyCooldown(key: string): CooldownEntry | null {
  const entry = verifyCooldown.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.until) {
    verifyCooldown.delete(key);
    return null;
  }
  return entry;
}

export function setWildberriesVerifyCooldown(key: string, seconds: number, message: string) {
  verifyCooldown.set(key, {
    until: Date.now() + seconds * 1000,
    message,
  });
}

export function getWildberriesSyncCooldown(key: string): CooldownEntry | null {
  const entry = syncCooldown.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.until) {
    syncCooldown.delete(key);
    return null;
  }
  return entry;
}

export function setWildberriesSyncCooldown(key: string, seconds: number, message: string) {
  syncCooldown.set(key, {
    until: Date.now() + seconds * 1000,
    message,
  });
}

export function clearWildberriesSyncCooldown(key: string) {
  syncCooldown.delete(key);
}

export function clearWildberriesVerifyCooldown(key: string) {
  verifyCooldown.delete(key);
}

export function getCachedWildberriesVerify(key: string): WbVerifyResult | null {
  const entry = verifyOkCache.get(key);
  if (!entry || Date.now() >= entry.expiresAt) return null;
  return entry.value;
}

/** Последняя успешная verify — отдать при cooldown WB. */
export function getStaleWildberriesVerify(key: string): WbVerifyResult | null {
  const entry = verifyOkCache.get(key);
  return entry?.value ?? null;
}

export function setCachedWildberriesVerify(key: string, value: WbVerifyResult, ttlMs: number) {
  verifyOkCache.set(key, { expiresAt: Date.now() + ttlMs, value });
}

export function getCachedWildberriesSync<T>(key: string): T | null {
  const entry = syncCache.get(key);
  if (!entry || Date.now() >= entry.expiresAt) return null;
  return entry.value as T;
}

/** Последний успешный sync — отдать при 429, даже если TTL истёк. */
export function getStaleWildberriesSync<T>(key: string): T | null {
  const entry = syncCache.get(key);
  if (!entry) return null;
  return entry.value as T;
}

export function setCachedWildberriesSync<T>(key: string, value: T, ttlMs: number) {
  syncCache.set(key, { expiresAt: Date.now() + ttlMs, value });
}

export function cooldownRetryAfterSec(entry: CooldownEntry): number {
  return Math.max(1, Math.ceil((entry.until - Date.now()) / 1000));
}

const syncInflight = new Map<string, Promise<unknown>>();

const verifyInflight = new Map<string, Promise<unknown>>();

/** Один verify на токен — параллельные запросы ждут тот же результат. */
export function coalesceWildberriesVerify<T>(key: string, run: () => Promise<T>): Promise<T> {
  const inflight = verifyInflight.get(key) as Promise<T> | undefined;
  if (inflight) return inflight;

  const promise = run().finally(() => {
    verifyInflight.delete(key);
  });
  verifyInflight.set(key, promise);
  return promise;
}

/** Один sync на токен — параллельные запросы ждут тот же результат. */
export function coalesceWildberriesSync<T>(key: string, run: () => Promise<T>): Promise<T> {
  const inflight = syncInflight.get(key) as Promise<T> | undefined;
  if (inflight) return inflight;

  const promise = run().finally(() => {
    syncInflight.delete(key);
  });
  syncInflight.set(key, promise);
  return promise;
}
