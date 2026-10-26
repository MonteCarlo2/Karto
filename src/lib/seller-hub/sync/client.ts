import { autoRepliesAuthorizedFetch } from "@/lib/auto-replies/auto-replies-fetch";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { serverSnapshotVersion } from "./version";

export { serverSnapshotVersion };

/**
 * Браузерная часть фонового сбора: берём готовый снимок кабинета с сервера вместо того, чтобы заново читать WB при каждом открытии.
 */

export type ServerSnapshot = {
  snapshot: SellerCatalogSnapshot;
  /** Время последнего успешного чтения каждого источника (ISO), null — ещё не читался. */
  loadedAt: Record<string, string | null>;
  /** Когда воркер последний раз начинал чтение любого источника кабинета. */
  lastActivityAt: string | null;
  /** Время сервера в момент ответа, мс. */
  serverNow: number | null;
};

export type ServerSnapshotResult =
  | { ok: true; data: ServerSnapshot }
  | { ok: false; reason: "background_off" | "no_snapshot" | "error" };

export async function loadServerSnapshot(marketplaceId = "wildberries"): Promise<ServerSnapshotResult> {
  try {
    const res = await autoRepliesAuthorizedFetch(`/api/seller-hub/sync/snapshot?marketplaceId=${encodeURIComponent(marketplaceId)}`, {
      method: "GET",
      timeoutMs: 30_000,
    });
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; reason?: string; snapshot?: SellerCatalogSnapshot; loadedAt?: Record<string, string | null>; lastActivityAt?: string | null; serverNow?: number }
      | null;
    if (!res.ok || !body) return { ok: false, reason: "error" };
    if (body.ok && body.snapshot) {
      return { ok: true, data: { snapshot: body.snapshot, loadedAt: body.loadedAt ?? {}, lastActivityAt: body.lastActivityAt ?? null, serverNow: typeof body.serverNow === "number" ? body.serverNow : null } };
    }
    return { ok: false, reason: body.reason === "background_off" ? "background_off" : body.reason === "no_snapshot" ? "no_snapshot" : "error" };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Просит сервер перечитать кабинет (воркер сделает это за минуту). WB из браузера не вызывается. */
export async function requestServerRefresh(marketplaceId = "wildberries"): Promise<{ ok: boolean; requestedAt: number }> {
  const requestedAt = Date.now();
  try {
    const res = await autoRepliesAuthorizedFetch("/api/seller-hub/sync/refresh", {
      method: "POST",
      body: JSON.stringify({ marketplaceId }),
      timeoutMs: 15_000,
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return { ok: res.ok && body?.ok === true, requestedAt };
  } catch {
    return { ok: false, requestedAt };
  }
}

/**
 * Можно ли заменить показанные данные серверным снимком.
 * Нельзя, если человек после чтения снимка что-то изменил в кабинете (цена, пауза кампании): сервер ещё мог не успеть
 * перечитать кабинет, и старый снимок на секунды вернул бы прежнее значение, пока воркер не догонит.
 */
export function shouldApplyServerSnapshot(input: { baseLoadedAt: string | null | undefined; lastLocalChangeAt: number }): boolean {
  if (!input.baseLoadedAt) return false;
  const loaded = Date.parse(input.baseLoadedAt);
  if (!Number.isFinite(loaded)) return false;
  return loaded > input.lastLocalChangeAt;
}


/** Возраст данных в минутах и пояснение для интерфейса. */
export function describeDataAge(baseLoadedAt: string | null | undefined, now: number): { minutes: number | null; label: string; stale: boolean } {
  if (!baseLoadedAt) return { minutes: null, label: "данных ещё нет", stale: true };
  const loaded = Date.parse(baseLoadedAt);
  if (!Number.isFinite(loaded)) return { minutes: null, label: "данных ещё нет", stale: true };
  const minutes = Math.max(0, Math.round((now - loaded) / 60_000));
  // Базовый снимок читается каждые 15 минут; вдвое дольше без обновления считаем отставанием фона.
  const stale = minutes > 40;
  const label = minutes < 1 ? "только что" : minutes < 60 ? `${minutes} мин назад` : `${Math.floor(minutes / 60)} ч ${minutes % 60} мин назад`;
  return { minutes, label, stale };
}

/**
 * Лёгкая проверка «появились ли новые данные»: только время последнего чтения каждого источника, без самого снимка.
 * Браузер опрашивает её раз в минуту и скачивает снимок целиком, только если версия изменилась.
 */
export async function loadServerVersion(marketplaceId = "wildberries"): Promise<{ ok: true; loadedAt: Record<string, string | null>; errors: Record<string, string> } | { ok: false }> {
  try {
    const res = await autoRepliesAuthorizedFetch(`/api/seller-hub/sync/status?marketplaceId=${encodeURIComponent(marketplaceId)}`, { method: "GET", timeoutMs: 15_000 });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; backgroundEnabled?: boolean; sources?: Array<{ source?: string; lastOkAt?: string | null; lastError?: string | null }> } | null;
    if (!res.ok || !body?.ok || !body.backgroundEnabled) return { ok: false };
    const loadedAt: Record<string, string | null> = {};
    const errors: Record<string, string> = {};
    for (const row of body.sources ?? []) {
      if (!row.source) continue;
      loadedAt[row.source] = row.lastOkAt ?? null;
      if (row.lastError) errors[row.source] = row.lastError;
    }
    return { ok: true, loadedAt, errors };
  } catch {
    return { ok: false };
  }
}
