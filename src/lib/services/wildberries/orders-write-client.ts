import { WildberriesApiError } from "./client";

const MARKETPLACE_BASE = "https://marketplace-api.wildberries.ru";
const REQUEST_TIMEOUT_MS = 30_000;

function normalizeToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new WildberriesApiError("API-токен не указан", 400);
  return trimmed.startsWith("Bearer ") ? trimmed.slice(7).trim() : trimmed;
}

async function wbFetch(
  token: string,
  url: string,
  init?: { method?: "GET" | "POST" | "PUT" | "PATCH"; body?: unknown }
): Promise<{ status: number; ok: boolean; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${normalizeToken(token)}`,
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    return { status: res.status, ok: res.ok, text: await res.text() };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new WildberriesApiError("Wildberries не ответил вовремя", 504);
    }
    throw new WildberriesApiError(
      e instanceof Error ? e.message : "Не удалось связаться с Wildberries",
      502
    );
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson<T>(text: string): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Create a new FBS supply.
 * POST https://marketplace-api.wildberries.ru/api/v3/supplies
 */
export async function createWbSupply(
  token: string,
  name: string
): Promise<{ ok: boolean; supplyId?: string; error?: string }> {
  const res = await wbFetch(token, `${MARKETPLACE_BASE}/api/v3/supplies`, {
    method: "POST",
    body: { name },
  });

  if (!res.ok) {
    const body = parseJson<{ title?: string; detail?: string; message?: string }>(res.text);
    const msg = body?.detail ?? body?.title ?? body?.message ?? `Ошибка ${res.status}`;
    return { ok: false, error: msg };
  }

  const body = parseJson<{ id?: string }>(res.text);
  return { ok: true, supplyId: body?.id };
}

/**
 * Add orders to an existing supply.
 * PATCH https://marketplace-api.wildberries.ru/api/v3/supplies/{supplyId}/orders
 */
export async function addOrdersToSupply(
  token: string,
  supplyId: string,
  orderIds: number[]
): Promise<{ ok: boolean; error?: string }> {
  if (orderIds.length === 0) return { ok: true };

  const res = await wbFetch(
    token,
    `${MARKETPLACE_BASE}/api/marketplace/v3/supplies/${encodeURIComponent(supplyId)}/orders`,
    { method: "PATCH", body: { orders: orderIds } }
  );

  if (!res.ok) {
    const body = parseJson<{ title?: string; detail?: string; message?: string }>(res.text);
    const msg = body?.detail ?? body?.title ?? body?.message ?? `Ошибка ${res.status}`;
    return { ok: false, error: msg };
  }

  return { ok: true };
}

/**
 * Close (mark as delivered) an existing supply.
 * PATCH https://marketplace-api.wildberries.ru/api/v3/supplies/{supplyId}/deliver
 */
export async function closeWbSupply(
  token: string,
  supplyId: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await wbFetch(
    token,
    `${MARKETPLACE_BASE}/api/v3/supplies/${encodeURIComponent(supplyId)}/deliver`,
    { method: "PATCH" }
  );

  if (!res.ok) {
    const body = parseJson<{ title?: string; detail?: string; message?: string }>(res.text);
    const msg = body?.detail ?? body?.title ?? body?.message ?? `Ошибка ${res.status}`;
    return { ok: false, error: msg };
  }

  return { ok: true };
}

export type WbSupplyBarcode = {
  barcode?: string;
  fileBase64?: string;
};

/** QR-код поставки (после передачи в доставку). */
export async function getWbSupplyBarcode(
  token: string,
  supplyId: string,
  type: "png" | "svg" = "png"
): Promise<{ ok: boolean; barcode?: WbSupplyBarcode; error?: string }> {
  const params = new URLSearchParams({ type });
  const res = await wbFetch(
    token,
    `${MARKETPLACE_BASE}/api/v3/supplies/${encodeURIComponent(supplyId)}/barcode?${params}`
  );

  if (!res.ok) {
    const body = parseJson<{ title?: string; detail?: string; message?: string }>(res.text);
    const msg = body?.detail ?? body?.title ?? body?.message ?? `Ошибка ${res.status}`;
    return { ok: false, error: msg };
  }

  const body = parseJson<{ barcode?: string; file?: string }>(res.text);
  return { ok: true, barcode: { barcode: body?.barcode, fileBase64: body?.file } };
}

export type WbOrderSticker = {
  orderId: number;
  partA?: string;
  partB?: string;
  barcode?: string;
  fileBase64?: string;
};

/** Стикеры сборочных заданий (confirm / complete). */
export async function getWbOrderStickers(
  token: string,
  orderIds: number[],
  type: "png" | "svg" = "png"
): Promise<{ ok: boolean; stickers?: WbOrderSticker[]; error?: string }> {
  if (orderIds.length === 0) return { ok: true, stickers: [] };

  const params = new URLSearchParams({ type, width: "58", height: "40" });
  const res = await wbFetch(
    token,
    `${MARKETPLACE_BASE}/api/v3/orders/stickers?${params}`,
    { method: "POST", body: { orders: orderIds } }
  );

  if (!res.ok) {
    const body = parseJson<{ title?: string; detail?: string; message?: string }>(res.text);
    const msg = body?.detail ?? body?.title ?? body?.message ?? `Ошибка ${res.status}`;
    return { ok: false, error: msg };
  }

  const body = parseJson<{ stickers?: WbOrderSticker[] }>(res.text);
  return { ok: true, stickers: body?.stickers ?? [] };
}

/**
 * Отменить одно сборочное задание (только новое или на сборке).
 * PATCH https://marketplace-api.wildberries.ru/api/v3/orders/{orderId}/cancel
 */
export async function cancelWbOrder(
  token: string,
  orderId: number
): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${MARKETPLACE_BASE}/api/v3/orders/${orderId}/cancel`, {
      method: "PATCH",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${normalizeToken(token)}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      const body = parseJson<{ title?: string; detail?: string; message?: string }>(text);
      const msg = body?.detail ?? body?.title ?? body?.message ?? `Ошибка ${res.status}`;
      return { ok: false, error: msg };
    }

    return { ok: true };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new WildberriesApiError("Wildberries не ответил вовремя", 504);
    }
    throw new WildberriesApiError(
      e instanceof Error ? e.message : "Не удалось связаться с Wildberries",
      502
    );
  } finally {
    clearTimeout(timeout);
  }
}
