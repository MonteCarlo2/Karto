import type { AcceptanceRow } from "@/lib/seller-hub/acceptance-slots";
import type {
  SellerRegionOrders,
  SellerRegionOrdersRow,
  SellerWarehouseStockRow,
  SellerWarehouseStocks,
} from "@/lib/seller-hub/types";
import { WildberriesApiError } from "./client";

/** Только чтение: остатки по складам WB и заказы по регионам покупателей. */

const ANALYTICS_BASE = "https://seller-analytics-api.wildberries.ru";
const STATISTICS_BASE = "https://statistics-api.wildberries.ru";
const REQUEST_TIMEOUT_MS = 60_000;
/** Лимит выгрузки отчёта «Заказы» за один запрос; страницы дальше листаем по lastChangeDate. */
const ORDERS_PAGE_ROWS = 80_000;
const ORDERS_MAX_PAGES = 5;

function normalizeToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new WildberriesApiError("API-токен не указан", 400);
  return trimmed.startsWith("Bearer ") ? trimmed.slice(7).trim() : trimmed;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function wbFetch(
  token: string,
  url: string,
  init: { method: "GET" | "POST"; body?: unknown }
): Promise<{ status: number; ok: boolean; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: init.method,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        Authorization: `Bearer ${normalizeToken(token)}`,
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      cache: "no-store",
    });
    return { status: res.status, ok: res.ok, text: await res.text() };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new WildberriesApiError("Wildberries не ответил вовремя", 504);
    }
    throw new WildberriesApiError(e instanceof Error ? e.message : "Не удалось связаться с Wildberries", 502);
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

function accessError(status: number, what: string): WildberriesApiError {
  return new WildberriesApiError(
    status === 429
      ? `WB ограничил запросы (${what}). Повторите через минуту.`
      : status === 401 || status === 403
        ? `Нет доступа к данным WB (${what}): проверьте категории токена`
        : `Wildberries вернул ${status} (${what})`,
    status
  );
}

/** Остатки по складам WB для списка артикулов (до 1000 за запрос). */
export async function fetchWbWarehouseStocks(token: string, nmIds: number[]): Promise<SellerWarehouseStocks> {
  const rows: SellerWarehouseStockRow[] = [];
  for (let offset = 0; offset < nmIds.length; offset += 1000) {
    if (offset > 0) await sleep(1_000);
    const res = await wbFetch(token, `${ANALYTICS_BASE}/api/analytics/v1/stocks-report/wb-warehouses`, {
      method: "POST",
      body: { nmIds: nmIds.slice(offset, offset + 1000), limit: 250_000, offset: 0 },
    });
    if (res.status === 204) continue;
    if (!res.ok) throw accessError(res.status, "остатки по складам");
    const payload = parseJson<{
      data?: {
        items?: Array<{
          nmId?: number;
          warehouseId?: number;
          warehouseName?: string;
          regionName?: string;
          quantity?: number;
          inWayToClient?: number;
          inWayFromClient?: number;
        }>;
      };
    }>(res.text);
    for (const item of payload?.data?.items ?? []) {
      if (!item.nmId || typeof item.warehouseId !== "number" || !item.warehouseName) continue;
      rows.push({
        nmId: String(item.nmId),
        warehouseId: item.warehouseId,
        warehouseName: item.warehouseName,
        regionName: item.regionName ?? "",
        quantity: item.quantity ?? 0,
        inWayToClient: item.inWayToClient ?? 0,
        inWayFromClient: item.inWayFromClient ?? 0,
      });
    }
  }
  return { loadedAt: new Date().toISOString(), rows };
}

type OrdersItem = {
  date?: string;
  lastChangeDate?: string;
  nmId?: number;
  oblastOkrugName?: string;
  regionName?: string;
  isCancel?: boolean;
  priceWithDisc?: number;
  srid?: string;
};

/**
 * Заказы за последние `days` дней, сведённые по артикулу и региону покупателя (Statistics API, лимит 1 запрос в минуту).
 * Дубли по srid отбрасываем. Если дошли до лимита страниц, помечаем выгрузку как обрезанную.
 */
export async function fetchWbOrdersByRegion(token: string, days: number): Promise<SellerRegionOrders> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const dateFrom = from.toISOString().slice(0, 10);
  const seen = new Set<string>();
  const acc = new Map<string, SellerRegionOrdersRow>();
  // Курсор — начало первых суток периода, а не «сейчас минус N дней»: иначе заказы первого дня до этого часа не попадают в выгрузку.
  let cursor = `${dateFrom}T00:00:00`;
  let truncated = false;
  const todayMsk = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(to);
  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  const weekdayDateSets: Array<Set<string>> = [0, 1, 2, 3, 4, 5, 6].map(() => new Set<string>());
  const dailyMap = new Map<string, { orders: number; cancelled: number; sum: number }>();

  for (let page = 0; page < ORDERS_MAX_PAGES; page += 1) {
    if (page > 0) await sleep(61_000);
    const res = await wbFetch(token, `${STATISTICS_BASE}/api/v1/supplier/orders?dateFrom=${encodeURIComponent(cursor)}&flag=0`, {
      method: "GET",
    });
    if (!res.ok) throw accessError(res.status, "заказы по регионам");
    const items = parseJson<OrdersItem[]>(res.text) ?? [];
    if (!Array.isArray(items) || items.length === 0) break;
    for (const item of items) {
      if (!item.nmId || !item.date || item.date.slice(0, 10) < dateFrom) continue;
      if (item.srid) {
        if (seen.has(item.srid)) continue;
        seen.add(item.srid);
      }
      const day = item.date.slice(0, 10);
      if (!item.isCancel && day < todayMsk) {
        const wd = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 — понедельник
        byWeekday[wd] = (byWeekday[wd] ?? 0) + 1;
        weekdayDateSets[wd]!.add(day);
      }
      const dayRow = dailyMap.get(day) ?? { orders: 0, cancelled: 0, sum: 0 };
      dayRow.orders += 1;
      if (item.isCancel) dayRow.cancelled += 1;
      else dayRow.sum += typeof item.priceWithDisc === "number" && Number.isFinite(item.priceWithDisc) ? item.priceWithDisc : 0;
      dailyMap.set(day, dayRow);
      const district = item.oblastOkrugName?.trim() || "";
      const region = item.regionName?.trim() || "";
      const key = `${item.nmId}|${district}|${region}`;
      const row = acc.get(key) ?? { nmId: String(item.nmId), district, region, orders: 0, cancelled: 0 };
      row.orders += 1;
      if (item.isCancel) row.cancelled += 1;
      acc.set(key, row);
    }
    const last = items[items.length - 1]?.lastChangeDate;
    if (items.length < ORDERS_PAGE_ROWS || !last) break;
    cursor = last;
    if (page === ORDERS_MAX_PAGES - 1) truncated = true;
  }

  return {
    loadedAt: new Date().toISOString(),
    dateFrom,
    dateTo: to.toISOString().slice(0, 10),
    truncated,
    rows: [...acc.values()],
    byWeekday,
    weekdayDates: weekdayDateSets.map((set) => set.size),
    daily: [...dailyMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, orders: v.orders, cancelled: v.cancelled, sum: Math.round(v.sum) })),
  };
}

/** Метод перенесён в раздел «Тарифы» (общий хост); старый адрес Supplies API и два вероятных варианта оставлены запасными. Перебираем, пока WB не ответит не 404. */
const ACCEPTANCE_URLS = [
  "https://common-api.wildberries.ru/api/tariffs/v1/acceptance/coefficients",
  "https://supplies-api.wildberries.ru/api/v1/acceptance/coefficients",
  "https://common-api.wildberries.ru/api/v1/tariffs/acceptance/coefficients",
  "https://supplies-api.wildberries.ru/api/tariffs/v1/acceptance/coefficients",
];

/** Коэффициенты приёмки на склады WB на ближайшие 14 дней (Supplies API, лимит 6 запросов в минуту). Только чтение. */
export async function fetchWbAcceptanceCoefficients(token: string): Promise<{ loadedAt: string; rows: AcceptanceRow[] }> {
  let res = await wbFetch(token, ACCEPTANCE_URLS[0]!, { method: "GET" });
  const statuses = [res.status];
  for (let i = 1; i < ACCEPTANCE_URLS.length && (res.status === 404 || res.status === 405); i += 1) {
    res = await wbFetch(token, ACCEPTANCE_URLS[i]!, { method: "GET" });
    statuses.push(res.status);
  }  if (!res.ok) {
    if (res.status === 404 || res.status === 405) {
      const detail = (parseJson<{ title?: string; detail?: string; message?: string; errorText?: string }>(res.text) ?? {});
      const wbSays = [detail.title, detail.detail, detail.message, detail.errorText].filter(Boolean).join(": ").slice(0, 160);
      throw new WildberriesApiError(`WB не нашёл метод слотов приёмки (ответы ${statuses.join(", ")}${wbSays ? `, WB пишет: ${wbSays}` : ""}). Возможно, WB сменил адрес метода или в токене нет нужной категории.`, 404);
    }
    throw new WildberriesApiError(
      res.status === 401 || res.status === 403
        ? "Нет доступа к слотам приёмки: в токене нужна категория «Тарифы» или «Поставки»"
        : res.status === 429
          ? "WB ограничил запросы (слоты приёмки). Повторите через минуту."
          : `Wildberries вернул ${res.status} (слоты приёмки)`,
      res.status
    );
  }
  const items =
    parseJson<
      Array<{
        date?: string;
        coefficient?: number;
        warehouseID?: number;
        warehouseName?: string;
        allowUnload?: boolean;
        boxTypeID?: number;
        isSortingCenter?: boolean;
      }>
    >(res.text) ?? [];
  const rows: AcceptanceRow[] = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item.date || typeof item.warehouseID !== "number" || !item.warehouseName || typeof item.coefficient !== "number") continue;
    rows.push({
      date: item.date.slice(0, 10),
      coefficient: item.coefficient,
      warehouseId: item.warehouseID,
      warehouseName: item.warehouseName,
      allowUnload: item.allowUnload === true,
      boxTypeId: typeof item.boxTypeID === "number" ? item.boxTypeID : null,
      isSortingCenter: item.isSortingCenter === true,
    });
  }
  return { loadedAt: new Date().toISOString(), rows };
}