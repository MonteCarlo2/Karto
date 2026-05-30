import type { InboxReviewItem } from "./inbox-demo-data";

const CACHE_TTL_MS = 24 * 60 * 60_000;

export type InboxClientCachePayload = {
  items: InboxReviewItem[];
  sellerName: string;
  savedAt: string;
  unansweredCount?: number;
  fetchComplete?: boolean;
};

function storageKey(
  shopId: string,
  marketplaceId: string,
  apiKey: string,
  secondaryId?: string
): string {
  const tail = apiKey.trim().slice(-12);
  const secondary = secondaryId?.trim() ? `:${secondaryId.trim()}` : "";
  return `karto-inbox:v2:${shopId}:${marketplaceId}:${tail}${secondary}`;
}

export function inboxCacheSecondaryId(
  marketplaceId: string,
  connection: { clientId?: string; campaignId?: string }
): string | undefined {
  if (marketplaceId === "ozon") return connection.clientId?.trim() || undefined;
  if (marketplaceId === "yandex") return connection.campaignId?.trim() || undefined;
  return undefined;
}

function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  const fromLocal = localStorage.getItem(key);
  if (fromLocal) return fromLocal;
  const fromSession = sessionStorage.getItem(key);
  if (!fromSession) return null;
  try {
    localStorage.setItem(key, fromSession);
    sessionStorage.removeItem(key);
  } catch {
    return fromSession;
  }
  return fromSession;
}

export function isInboxClientCacheFresh(savedAt: string, maxAgeMs = CACHE_TTL_MS): boolean {
  const ts = Date.parse(savedAt);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < maxAgeMs;
}

export function loadInboxClientCache(
  shopId: string,
  marketplaceId: string,
  apiKey: string,
  secondaryId?: string
): InboxClientCachePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const key = storageKey(shopId, marketplaceId, apiKey, secondaryId);
    let raw = readRaw(key);
    if (!raw) {
      const legacyKey = `karto-inbox:${marketplaceId}:${apiKey.trim().slice(-12)}`;
      raw = readRaw(legacyKey);
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InboxClientCachePayload;
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) return null;
    if (!isInboxClientCacheFresh(parsed.savedAt)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveInboxClientCache(
  shopId: string,
  marketplaceId: string,
  apiKey: string,
  payload: Omit<InboxClientCachePayload, "savedAt">,
  secondaryId?: string
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      storageKey(shopId, marketplaceId, apiKey, secondaryId),
      JSON.stringify({ ...payload, savedAt: new Date().toISOString() })
    );

    void import("./auto-replies-sync").then(({ syncAutoReplyInboxSnapshot }) => {
      void syncAutoReplyInboxSnapshot({
        shopId,
        marketplaceId: marketplaceId as import("./types").AutoRepliesMarketplaceId,
        items: payload.items,
        sellerName: payload.sellerName,
        unansweredCount: payload.unansweredCount,
      });
    });
  } catch {
    // localStorage может быть недоступен — не блокируем UI
  }
}

/** Удаляет локальный кэш ленты для площадки (все ключи с разными API-хвостами). */
export function clearInboxClientCacheForMarketplace(shopId: string, marketplaceId: string) {
  if (typeof window === "undefined") return;
  const prefix = `karto-inbox:v2:${shopId}:${marketplaceId}:`;
  const legacyPrefix = `karto-inbox:${marketplaceId}:`;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith(prefix) || key.startsWith(legacyPrefix)) keys.push(key);
  }
  for (const key of keys) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      /* noop */
    }
  }
}

export function clearInboxClientCacheForShop(shopId: string) {
  if (typeof window === "undefined") return;
  const prefix = `karto-inbox:v2:${shopId}:`;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith(prefix)) keys.push(key);
  }
  for (const key of keys) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      /* noop */
    }
  }
}
