import { WildberriesApiError } from "./client";

const MARKETPLACE_BASE = "https://marketplace-api.wildberries.ru";
const REQUEST_TIMEOUT_MS = 30_000;
const STOCK_BATCH = 1000;

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

export type WbWarehouse = {
  id: number;
  name: string;
};

export type StockUpdate = {
  chrtId: number;
  amount: number;
};

type StockRow = {
  sku?: string;
  chrtId?: number;
  chrtID?: number;
  amount?: number;
  quantity?: number;
};

function rowChrtId(row: StockRow & Record<string, unknown>): number | undefined {
  const raw = row.chrtId ?? row.chrtID ?? row.sizeID ?? row.sizeId;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function stockQty(row: StockRow): number {
  return row.amount ?? row.quantity ?? 0;
}

/**
 * Fetch seller FBS warehouses.
 * GET https://marketplace-api.wildberries.ru/api/v3/warehouses
 */
export async function getWbWarehouses(token: string): Promise<WbWarehouse[]> {
  const res = await wbFetch(token, `${MARKETPLACE_BASE}/api/v3/warehouses`);

  if (!res.ok) {
    const body = parseJson<{ title?: string; detail?: string }>(res.text);
    throw new WildberriesApiError(
      body?.detail ?? body?.title ?? `Ошибка получения складов: ${res.status}`,
      res.status
    );
  }

  type WarehouseRow = { id?: number; name?: string };
  const payload = parseJson<
    WarehouseRow[] | { warehouses?: WarehouseRow[] } | { data?: WarehouseRow[] }
  >(res.text);

  let rows: WarehouseRow[] = [];
  if (Array.isArray(payload)) {
    rows = payload;
  } else if (payload && "warehouses" in payload && Array.isArray(payload.warehouses)) {
    rows = payload.warehouses;
  } else if (payload && "data" in payload && Array.isArray(payload.data)) {
    rows = payload.data;
  }

  return rows
    .filter((w): w is WarehouseRow & { id: number } => w.id != null)
    .map((w) => ({ id: w.id, name: w.name?.trim() || `Склад ${w.id}` }));
}

async function readWbFbsStocks(
  token: string,
  warehouseId: number,
  chrtIds: number[]
): Promise<Map<number, number>> {
  const amounts = new Map<number, number>();
  if (chrtIds.length === 0) return amounts;

  for (let i = 0; i < chrtIds.length; i += STOCK_BATCH) {
    const batch = chrtIds.slice(i, i + STOCK_BATCH);
    const res = await wbFetch(token, `${MARKETPLACE_BASE}/api/v3/stocks/${warehouseId}`, {
      method: "POST",
      body: { chrtIds: batch },
    });
    if (!res.ok) continue;

    const payload = parseJson<{ stocks?: StockRow[] }>(res.text);
    for (const row of payload?.stocks ?? []) {
      const id = rowChrtId(row);
      if (id != null) amounts.set(id, stockQty(row));
    }
  }

  return amounts;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyStockUpdates(
  token: string,
  warehouseId: number,
  updates: StockUpdate[]
): Promise<{ verified: boolean; mismatch: string[] }> {
  const chrtIds = updates.map((u) => u.chrtId);
  const mismatch: string[] = [];

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) await sleep(500);
    const readBack = await readWbFbsStocks(token, warehouseId, chrtIds);
    mismatch.length = 0;

    for (const update of updates) {
      const expected = Math.max(0, Math.round(update.amount));
      const actual = readBack.get(update.chrtId);
      if (actual !== expected) {
        mismatch.push(`размер ${update.chrtId}: ожидали ${expected}, на WB ${actual ?? "—"}`);
      }
    }

    if (mismatch.length === 0) return { verified: true, mismatch: [] };
  }

  return { verified: false, mismatch };
}

/**
 * Update FBS stock amounts for a warehouse (только chrtId — sku с 2026-05 больше не работает).
 * PUT https://marketplace-api.wildberries.ru/api/v3/stocks/{warehouseId}
 */
export async function updateWbFbsStocks(
  token: string,
  warehouseId: number,
  updates: StockUpdate[]
): Promise<{ ok: boolean; errors?: string[]; verified?: boolean }> {
  const normalized = updates
    .filter((u) => u.chrtId != null && Number.isFinite(u.chrtId))
    .map((u) => ({
      chrtId: u.chrtId,
      amount: Math.max(0, Math.round(u.amount)),
    }));

  if (normalized.length === 0) {
    return {
      ok: false,
      errors: [
        "Не найден chrtID размера. WB больше не принимает баркод для остатков — нужен ID размера из карточки.",
      ],
    };
  }

  const res = await wbFetch(
    token,
    `${MARKETPLACE_BASE}/api/v3/stocks/${warehouseId}`,
    { method: "PUT", body: { stocks: normalized } }
  );

  if (!res.ok) {
    const body = parseJson<{ title?: string; detail?: string; message?: string; code?: string }>(
      res.text
    );
    const msg = body?.detail ?? body?.title ?? body?.message ?? `Ошибка ${res.status}`;
    const codeHint = body?.code ? ` (${body.code})` : "";
    return { ok: false, errors: [`${msg}${codeHint}`] };
  }

  const body = parseJson<{ errors?: string[] }>(res.text);
  const errors = body?.errors?.filter(Boolean);
  if (errors && errors.length > 0) {
    return { ok: false, errors };
  }

  const { verified, mismatch } = await verifyStockUpdates(token, warehouseId, normalized);

  if (!verified) {
    return {
      ok: false,
      verified: false,
      errors: [
        "WB не подтвердил изменение остатка. Проверьте склад FBS и категорию «Маркетплейс» в токене.",
        ...mismatch.slice(0, 3),
      ],
    };
  }

  return { ok: true, verified: true };
}
