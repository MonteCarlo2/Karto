import type { SellerBlockedCard, SellerBlockedCards } from "@/lib/seller-hub/types";
import { WildberriesApiError } from "./client";

/** Только чтение: риски кабинета, о которых WB сообщает через отчёты (заблокированные карточки). */

const ANALYTICS_BASE = "https://seller-analytics-api.wildberries.ru";
const REQUEST_TIMEOUT_MS = 30_000;

function normalizeToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new WildberriesApiError("API-токен не указан", 400);
  return trimmed.startsWith("Bearer ") ? trimmed.slice(7).trim() : trimmed;
}

/** Заблокированные карточки продавца с причинами. */
export async function fetchWbBlockedCards(token: string): Promise<SellerBlockedCards> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${ANALYTICS_BASE}/api/v1/analytics/banned-products/blocked?sort=nmId&order=asc`, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json", Authorization: `Bearer ${normalizeToken(token)}` },
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      throw new WildberriesApiError(
        res.status === 429
          ? "WB ограничил запросы (заблокированные карточки). Повторите через минуту."
          : res.status === 401 || res.status === 403
            ? "Нет доступа к отчёту о заблокированных карточках: проверьте категории токена"
            : `Wildberries вернул ${res.status} (заблокированные карточки)`,
        res.status
      );
    }
    let payload: { report?: Array<{ nmId?: number; vendorCode?: string; title?: string; brand?: string; reason?: string }> } | null = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    const cards: SellerBlockedCard[] = (payload?.report ?? []).flatMap((row) =>
      row.nmId
        ? [{ nmId: String(row.nmId), vendorCode: row.vendorCode, title: row.title, brand: row.brand, reason: row.reason }]
        : []
    );
    return { loadedAt: new Date().toISOString(), cards };
  } catch (e) {
    if (e instanceof WildberriesApiError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new WildberriesApiError("Wildberries не ответил вовремя", 504);
    }
    throw new WildberriesApiError(e instanceof Error ? e.message : "Не удалось связаться с Wildberries", 502);
  } finally {
    clearTimeout(timeout);
  }
}
