import type { SellerSupplyRow } from "@/lib/seller-hub/types";
import { WildberriesApiError } from "./client";

const SUPPLIES_BASE = "https://supplies-api.wildberries.ru";
const REQUEST_TIMEOUT_MS = 45_000;
const SUPPLIES_MIN_INTERVAL_MS = 2100;

let lastSuppliesCallAt = 0;

const FBW_STATUS: Record<number, string> = {
  1: "Не запланировано",
  2: "Запланировано",
  3: "Отгрузка разрешена",
  4: "Идёт приёмка",
  5: "Принято",
  6: "Отгружено",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new WildberriesApiError("API-токен не указан", 400);
  return trimmed.startsWith("Bearer ") ? trimmed.slice(7).trim() : trimmed;
}

async function suppliesFetch(
  token: string,
  path: string,
  body?: unknown
): Promise<{ status: number; ok: boolean; text: string }> {
  const now = Date.now();
  const wait = Math.max(0, SUPPLIES_MIN_INTERVAL_MS - (now - lastSuppliesCallAt));
  if (wait > 0) await sleep(wait);
  lastSuppliesCallAt = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${SUPPLIES_BASE}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${normalizeToken(token)}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    return { status: res.status, ok: res.ok, text: await res.text() };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new WildberriesApiError("Wildberries Supplies не ответил вовремя", 504);
    }
    throw new WildberriesApiError(
      e instanceof Error ? e.message : "Не удалось связаться с Wildberries Supplies",
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

type FbwSupplyRow = {
  supplyID?: number | null;
  preorderID?: number;
  createDate?: string;
  supplyDate?: string;
  factDate?: string;
  statusID?: number;
  quantity?: number;
  warehouseName?: string | null;
  actualWarehouseName?: string | null;
};

/** FBO-поставки на склады WB за последние 60 дней. */
export async function fetchWbFbwSupplies(token: string): Promise<SellerSupplyRow[]> {
  const from = new Date();
  from.setDate(from.getDate() - 60);

  const res = await suppliesFetch(token, "/api/v1/supplies", {
    dates: [
      {
        from: from.toISOString(),
        till: new Date().toISOString(),
        type: "createDate",
      },
    ],
  });

  if (!res.ok) {
    throw new WildberriesApiError(
      res.status === 401 || res.status === 403
        ? "Нет доступа к категории «Поставки» для FBO"
        : `Wildberries Supplies API вернул ${res.status}`,
      res.status
    );
  }

  const payload = parseJson<FbwSupplyRow[] | { data?: FbwSupplyRow[] }>(res.text);
  const rows = Array.isArray(payload) ? payload : (payload?.data ?? []);

  return rows
    .map((row): SellerSupplyRow | null => {
      const id = row.supplyID ?? row.preorderID;
      if (id == null) return null;
      const statusId = row.statusID;
      const done = statusId != null && statusId >= 5;
      return {
        id: String(id),
        name: row.supplyID ? `Поставка ${row.supplyID}` : `Предзаказ ${row.preorderID}`,
        done,
        createdAt: row.createDate,
        plannedAt: row.supplyDate,
        closedAt: row.factDate,
        type: "fbw",
        statusId,
        status: statusId != null ? (FBW_STATUS[statusId] ?? `Статус ${statusId}`) : undefined,
        quantity: row.quantity,
        warehouseName: row.warehouseName?.trim() || undefined,
        actualWarehouseName: row.actualWarehouseName?.trim() || undefined,
      };
    })
    .filter((row): row is SellerSupplyRow => row != null);
}
