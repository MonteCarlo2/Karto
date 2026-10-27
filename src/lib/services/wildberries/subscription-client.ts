import type { SellerJamSubscription } from "@/lib/seller-hub/types";
import { WildberriesApiError } from "./client";

/**
 * Только чтение: подписка продавца «Джем». Официальный метод `GET /api/common/v1/subscriptions` (common-api), 1 запрос в минуту.
 * Пустой ответ 200: подписку никогда не подключали. Иначе даты since и till: подписка действует, пока till не прошёл.
 * От подписки зависят расширенные данные (поиск, позиции, рынок, воронка за длинные периоды), поэтому агент и интерфейс узнают о ней из этого снимка.
 */

const COMMON_BASE = "https://common-api.wildberries.ru";
const REQUEST_TIMEOUT_MS = 20_000;

const isoOrNull = (v: unknown): string | null => {
  if (typeof v !== "string" || !v.trim()) return null;
  return Number.isFinite(Date.parse(v)) ? v : null;
};

export function parseJamSubscription(payload: unknown, nowMs: number): Omit<SellerJamSubscription, "loadedAt" | "status" | "httpStatus"> {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const since = isoOrNull(root.since);
  const till = isoOrNull(root.till);
  if (!since && !till) return { active: false, since: null, till: null, state: "never" };
  const active = till != null && Date.parse(till) >= nowMs;
  return { active, since, till, state: active ? "active" : "inactive" };
}

export async function fetchWbJamSubscription(token: string, now = Date.now()): Promise<SellerJamSubscription> {
  const loadedAt = new Date(now).toISOString();
  const trimmed = token.trim();
  if (!trimmed) throw new WildberriesApiError("API-токен не указан", 400);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${COMMON_BASE}/api/common/v1/subscriptions`, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json", Authorization: trimmed.startsWith("Bearer ") ? trimmed : `Bearer ${trimmed}` },
      cache: "no-store",
    });
    // Метод может быть недоступен для токена (401, 402, 403): подписку тогда считаем неизвестной, а не отсутствующей.
    if (res.status === 401 || res.status === 402 || res.status === 403) return { loadedAt, status: "unavailable", active: null, since: null, till: null, state: "unknown", httpStatus: res.status };
    if (!res.ok) throw new WildberriesApiError(res.status === 429 ? "WB ограничил запросы (подписка). Повторите через минуту." : `Wildberries вернул ${res.status} (подписка)`, res.status);
    const text = await res.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    return { loadedAt, status: "ok", httpStatus: res.status, ...parseJamSubscription(payload, now) };
  } catch (e) {
    if (e instanceof WildberriesApiError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") throw new WildberriesApiError("Wildberries не ответил вовремя", 504);
    throw new WildberriesApiError(e instanceof Error ? e.message : "Не удалось связаться с Wildberries", 502);
  } finally {
    clearTimeout(timeout);
  }
}
