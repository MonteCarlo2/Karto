import type { SellerOrdersSummary, SellerOrderRow, SellerSuppliesSnapshot, SellerSupplyRow } from "@/lib/seller-hub/types";
import { WildberriesApiError } from "./client";

const MARKETPLACE_BASE = "https://marketplace-api.wildberries.ru";
const REQUEST_TIMEOUT_MS = 45_000;
const MARKETPLACE_MIN_INTERVAL_MS = 220;

let lastMarketplaceCallAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new WildberriesApiError("API-токен не указан", 400);
  return trimmed.startsWith("Bearer ") ? trimmed.slice(7).trim() : trimmed;
}

async function marketplaceFetch(
  token: string,
  path: string,
  init?: { method?: "GET" | "POST"; body?: unknown }
): Promise<{ status: number; ok: boolean; text: string }> {
  const now = Date.now();
  const wait = Math.max(0, MARKETPLACE_MIN_INTERVAL_MS - (now - lastMarketplaceCallAt));
  if (wait > 0) await sleep(wait);
  lastMarketplaceCallAt = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${MARKETPLACE_BASE}${path}`, {
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
      throw new WildberriesApiError("Wildberries Marketplace не ответил вовремя", 504);
    }
    throw new WildberriesApiError(
      e instanceof Error ? e.message : "Не удалось связаться с Wildberries Marketplace",
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

type WbAssemblyOrder = {
  id?: number;
  nmId?: number;
  article?: string;
  createdAt?: string;
  finalPrice?: number;
  price?: number;
  deliveryType?: string;
  /** Офисы (СЦ, ПВЗ), куда нужно довезти товар по заданию. */
  offices?: string[] | null;
};

type WbOrderStatus = {
  id?: number;
  supplierStatus?: string;
  wbStatus?: string;
};

function normalizeMoney(raw: unknown): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (Number.isInteger(n) && n >= 50_000) return Math.round(n / 100);
  return n;
}

function mapOrderRow(
  order: WbAssemblyOrder,
  status?: WbOrderStatus
): SellerOrderRow | null {
  if (!order.id) return null;
  return {
    id: String(order.id),
    externalId: order.id,
    nmId: order.nmId,
    article: order.article,
    createdAt: order.createdAt,
    price: normalizeMoney(order.finalPrice ?? order.price),
    supplierStatus: status?.supplierStatus,
    wbStatus: status?.wbStatus,
    deliveryType: order.deliveryType,
  };
}

export function isWbOrderCanceled(row: SellerOrderRow): boolean {
  const supplier = row.supplierStatus ?? "";
  const wb = row.wbStatus ?? "";
  return (
    supplier === "cancel" ||
    supplier === "cancel_carrier" ||
    wb.startsWith("cancel") ||
    wb === "declined_by_client"
  );
}

function categorizeOrder(row: SellerOrderRow): keyof Pick<
  SellerOrdersSummary,
  "newCount" | "inAssembly" | "inDelivery" | "delivered" | "canceled"
> {
  const supplier = row.supplierStatus ?? "";
  const wb = row.wbStatus ?? "";

  if (isWbOrderCanceled(row)) {
    return "canceled";
  }
  if (wb === "sold") return "delivered";
  if (supplier === "complete" || wb === "sorted" || wb === "ready_for_pickup") {
    return "inDelivery";
  }
  if (supplier === "confirm") return "inAssembly";
  return "newCount";
}

async function fetchOrderStatuses(token: string, orderIds: number[]): Promise<Map<number, WbOrderStatus>> {
  const map = new Map<number, WbOrderStatus>();
  for (let i = 0; i < orderIds.length; i += 1000) {
    const batch = orderIds.slice(i, i + 1000);
    const res = await marketplaceFetch(token, "/api/v3/orders/status", {
      method: "POST",
      body: { orders: batch },
    });
    if (!res.ok) continue;
    const payload = parseJson<{ orders?: WbOrderStatus[] }>(res.text);
    for (const row of payload?.orders ?? []) {
      if (row.id) map.set(row.id, row);
    }
  }
  return map;
}

/** FBS-сборочные задания за последние 7 дней + новые. */
/** Названия офисов из заданий за неделю: куда продавец реально возит товар. Без дублей, не больше 60. */
function collectOfficeNames(orders: Iterable<WbAssemblyOrder>): string[] {
  const names = new Set<string>();
  for (const order of orders) {
    for (const office of order.offices ?? []) {
      const name = typeof office === "string" ? office.trim() : "";
      if (name) names.add(name);
      if (names.size >= 60) return [...names];
    }
  }
  return [...names];
}

export async function fetchWbOrdersSummary(token: string): Promise<SellerOrdersSummary> {
  const nowSec = Math.floor(Date.now() / 1000);
  const weekAgoSec = nowSec - 7 * 24 * 60 * 60;

  const orderMap = new Map<number, WbAssemblyOrder>();

  const newRes = await marketplaceFetch(token, "/api/v3/orders/new");
  if (newRes.ok) {
    const payload = parseJson<{ orders?: WbAssemblyOrder[] }>(newRes.text);
    for (const order of payload?.orders ?? []) {
      if (order.id) orderMap.set(order.id, order);
    }
  } else if (newRes.status === 401 || newRes.status === 403) {
    throw new WildberriesApiError(
      "Нет доступа к категории «Маркетплейс» для заказов FBS",
      newRes.status
    );
  }

  let next = 0;
  for (let page = 0; page < 5; page += 1) {
    const params = new URLSearchParams({
      limit: "1000",
      next: String(next),
      dateFrom: String(weekAgoSec),
      dateTo: String(nowSec),
    });
    const res = await marketplaceFetch(token, `/api/v3/orders?${params}`);
    if (!res.ok) break;
    const payload = parseJson<{ orders?: WbAssemblyOrder[]; next?: number }>(res.text);
    for (const order of payload?.orders ?? []) {
      if (order.id) orderMap.set(order.id, order);
    }
    const nextVal = payload?.next;
    if (nextVal == null || nextVal === next) break;
    next = nextVal;
  }

  const ids = [...orderMap.keys()];
  const statuses = await fetchOrderStatuses(token, ids);

  const rows: SellerOrderRow[] = [];
  for (const [id, order] of orderMap) {
    const mapped = mapOrderRow(order, statuses.get(id));
    if (mapped) rows.push(mapped);
  }

  rows.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  const summary: SellerOrdersSummary = {
    newCount: 0,
    inAssembly: 0,
    inDelivery: 0,
    delivered: 0,
    canceled: 0,
    total: rows.length,
    orders: rows.slice(0, 500),
    officeNames: collectOfficeNames(orderMap.values()),
  };

  for (const row of rows) {
    summary[categorizeOrder(row)] += 1;
  }

  return summary;
}

export type WbSupplyOrder = { id: number; createdAt?: string; nmId?: number; article?: string };

/** Задания, лежащие в FBS-поставке (GET /api/v3/supplies/{supplyId}/orders). Только чтение. */
export async function fetchWbSupplyOrders(token: string, supplyId: string): Promise<WbSupplyOrder[]> {
  const res = await marketplaceFetch(token, `/api/v3/supplies/${encodeURIComponent(supplyId)}/orders`);
  if (res.status === 404 || res.status === 405 || res.status === 410) {
    // Старая ручка состава может не отдавать поставку: пробуем новую, она возвращает только номера заданий (даты берём из выгрузки заказов).
    const ids = await marketplaceFetch(token, `/api/marketplace/v3/supplies/${encodeURIComponent(supplyId)}/order-ids`);
    if (ids.ok) {
      const body = parseJson<{ orderIds?: number[]; orderIDs?: number[]; orders?: number[] }>(ids.text);
      const list = body?.orderIds ?? body?.orderIDs ?? body?.orders ?? [];
      return list.filter((id): id is number => typeof id === "number").map((id) => ({ id }));
    }
  }
  if (!res.ok) {
    throw new WildberriesApiError(
      res.status === 429
        ? "WB ограничил запросы к поставкам. Повторите через минуту."
        : res.status === 401 || res.status === 403
          ? "Нет доступа к категории «Маркетплейс» для поставок FBS"
          : `Wildberries вернул ${res.status} при чтении состава поставки`,
      res.status,
    );
  }
  const payload = parseJson<{ orders?: WbAssemblyOrder[] }>(res.text);
  const out: WbSupplyOrder[] = [];
  for (const order of payload?.orders ?? []) {
    if (!order.id) continue;
    out.push({ id: order.id, createdAt: order.createdAt, nmId: order.nmId, article: order.article });
  }
  return out;
}

export function dedupeSupplyRows(rows: SellerSupplyRow[]): SellerSupplyRow[] {
  const seen = new Set<string>();
  const result: SellerSupplyRow[] = [];
  for (const row of rows) {
    const key = `${row.type}:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

/** FBS-поставки (сборочные задания, сгруппированные в отгрузки). */
export async function fetchWbFbsSupplies(token: string): Promise<SellerSupplyRow[]> {
  const supplies: SellerSupplyRow[] = [];
  const seenIds = new Set<string>();
  let next = 0;

  for (let page = 0; page < 5; page += 1) {
    const params = new URLSearchParams({ limit: "1000", next: String(next) });
    const res = await marketplaceFetch(token, `/api/v3/supplies?${params}`);
    if (!res.ok) {
      if (page === 0 && (res.status === 401 || res.status === 403)) {
        throw new WildberriesApiError(
          "Нет доступа к категории «Маркетплейс» для поставок FBS",
          res.status
        );
      }
      break;
    }

    const payload = parseJson<{
      supplies?: Array<{
        id?: string;
        name?: string;
        done?: boolean;
        createdAt?: string;
        closedAt?: string;
        scanDt?: string;
      }>;
      next?: number;
    }>(res.text);

    let newOnPage = 0;
    for (const row of payload?.supplies ?? []) {
      if (!row.id || seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      newOnPage += 1;
      supplies.push({
        id: row.id,
        name: row.name,
        done: Boolean(row.done),
        createdAt: row.createdAt,
        closedAt: row.closedAt ?? row.scanDt,
        type: "fbs",
        status: row.done ? "Закрыта" : "Открыта",
      });
    }

    const nextVal = payload?.next;
    if (nextVal == null || nextVal === next || newOnPage === 0) break;
    next = nextVal;
  }

  return supplies;
}

export function buildFbsSuppliesSnapshot(rows: SellerSupplyRow[]): SellerSuppliesSnapshot {
  const openCount = rows.filter((r) => !r.done).length;
  return {
    openCount,
    closedCount: rows.length - openCount,
    supplies: rows,
  };
}
