import type { SellerBoxTariffs, SellerWarehouseTariff } from "@/lib/seller-hub/types";
import { WildberriesApiError } from "./client";

/** Только чтение: тарифы WB для коробов по складам (логистика, хранение). Официальный метод `GET /api/v1/tariffs/box`, лимит 60 запросов в минуту. */

const COMMON_BASE = "https://common-api.wildberries.ru";
const REQUEST_TIMEOUT_MS = 30_000;

function normalizeToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new WildberriesApiError("API-токен не указан", 400);
  return trimmed.startsWith("Bearer ") ? trimmed.slice(7).trim() : trimmed;
}

/** WB отдаёт числа строками с запятой («11,2»), а «-» значит «нет тарифа». */
export function parseTariffNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const value = Number(raw.replace(/\s/g, "").replace(",", "."));
  return raw.trim() !== "" && Number.isFinite(value) ? value : null;
}

type RawWarehouse = Record<string, unknown>;

export function parseBoxTariffs(payload: unknown, dateKey: string, loadedAt: string): SellerBoxTariffs {
  const root = (payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}) as Record<string, unknown>;
  const response = (root.response && typeof root.response === "object" ? (root.response as Record<string, unknown>) : root) as Record<string, unknown>;
  const data = (response.data && typeof response.data === "object" ? (response.data as Record<string, unknown>) : {}) as Record<string, unknown>;
  const list = Array.isArray(data.warehouseList) ? (data.warehouseList as RawWarehouse[]) : [];
  const warehouses: SellerWarehouseTariff[] = [];
  for (const row of list) {
    const name = typeof row.warehouseName === "string" ? row.warehouseName.trim() : "";
    if (!name) continue;
    warehouses.push({
      name,
      geo: typeof row.geoName === "string" ? row.geoName.trim() : "",
      deliveryBase: parseTariffNumber(row.boxDeliveryBase),
      deliveryLiter: parseTariffNumber(row.boxDeliveryLiter),
      storageBase: parseTariffNumber(row.boxStorageBase),
      storageLiter: parseTariffNumber(row.boxStorageLiter),
      fbsBase: parseTariffNumber(row.boxDeliveryMarketplaceBase),
      fbsLiter: parseTariffNumber(row.boxDeliveryMarketplaceLiter),
    });
  }
  return {
    loadedAt,
    date: dateKey,
    nextFrom: typeof data.dtNextBox === "string" && data.dtNextBox ? data.dtNextBox : null,
    warehouses,
  };
}

/** Тарифы на дату (по умолчанию сегодня по Москве). */
export async function fetchWbBoxTariffs(token: string, now = Date.now()): Promise<SellerBoxTariffs> {
  const dateKey = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" }).format(new Date(now));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${COMMON_BASE}/api/v1/tariffs/box?date=${dateKey}`, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json", Authorization: `Bearer ${normalizeToken(token)}` },
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      throw new WildberriesApiError(
        res.status === 429 ? "WB ограничил запросы (тарифы). Повторите через минуту." : res.status === 401 || res.status === 403 ? "Нет доступа к тарифам WB: проверьте категории токена" : `Wildberries вернул ${res.status} (тарифы)`,
        res.status,
      );
    }
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    const tariffs = parseBoxTariffs(payload, dateKey, new Date(now).toISOString());
    if (tariffs.warehouses.length === 0) throw new WildberriesApiError("WB вернул пустой список тарифов", 502);
    return tariffs;
  } catch (e) {
    if (e instanceof WildberriesApiError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") throw new WildberriesApiError("Wildberries не ответил вовремя", 504);
    throw new WildberriesApiError(e instanceof Error ? e.message : "Не удалось связаться с Wildberries", 502);
  } finally {
    clearTimeout(timeout);
  }
}
