import type {
  SellerFunnelLoadStatus,
  SellerFunnelNm,
  SellerFunnelSnapshot,
  SellerPaidStorageLoadStatus,
  SellerPaidStoragePendingChunk,
  SellerPaidStorageSnapshot,
  SellerStocksReportLoadStatus,
  SellerStocksReportNm,
  SellerStocksReportSnapshot,
} from "@/lib/seller-hub/types";
import {
  SELLER_FUNNEL_SNAPSHOT_VERSION,
  SELLER_PAID_STORAGE_SNAPSHOT_VERSION,
  SELLER_STOCKS_REPORT_SNAPSHOT_VERSION,
} from "@/lib/seller-hub/types";
import { WildberriesApiError } from "./client";
import {
  funnelNmFromProduct,
  funnelStatusFromHttp,
} from "./funnel-parse";
import {
  aggregatePaidStorageByNm,
  emptyPaidStorageSnapshot,
  paidStorageStatusFromHttp,
  parsePaidStorageRows,
  type PaidStorageRow,
} from "./paid-storage-parse";
import {
  readStocksReportItems,
  stocksNmFromItem,
  stocksReportStatusFromHttp,
} from "./stocks-report-parse";

const ANALYTICS_BASE = "https://seller-analytics-api.wildberries.ru";
const REQUEST_TIMEOUT_MS = 45_000;
/** Тяжёлые POST/create/download: лимит WB ~3/мин. */
const ANALYTICS_MIN_INTERVAL_MS = 21_000;

let lastAnalyticsCallAt = 0;
/** Очередь throttle: параллельные funnel/stocks/storage не ломают интервал. */
let analyticsThrottleTail: Promise<void> = Promise.resolve();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new WildberriesApiError("API-токен не указан", 400);
  return trimmed.startsWith("Bearer ") ? trimmed.slice(7).trim() : trimmed;
}

type AnalyticsRequestOpts = {
  method: "GET" | "POST";
  body?: unknown;
  /**
   * Опрос статуса задания (paid_storage): без 21 с паузы.
   * Иначе 8 окон × до 20 опросов × 21 с = часы и обрыв по timeout.
   */
  bypassThrottle?: boolean;
};

async function analyticsFetch(
  token: string,
  path: string,
  body?: unknown
): Promise<{ status: number; ok: boolean; text: string }> {
  return analyticsRequest(token, path, { method: "POST", body });
}

async function analyticsGet(
  token: string,
  path: string,
  opts?: { bypassThrottle?: boolean },
): Promise<{ status: number; ok: boolean; text: string }> {
  return analyticsRequest(token, path, { method: "GET", bypassThrottle: opts?.bypassThrottle });
}

async function waitAnalyticsThrottle(): Promise<void> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const prev = analyticsThrottleTail;
  analyticsThrottleTail = prev.then(() => gate);
  await prev.catch(() => undefined);
  try {
    const now = Date.now();
    const wait = Math.max(0, ANALYTICS_MIN_INTERVAL_MS - (now - lastAnalyticsCallAt));
    if (wait > 0) await sleep(wait);
    lastAnalyticsCallAt = Date.now();
  } finally {
    release();
  }
}

async function analyticsRequest(
  token: string,
  path: string,
  opts: AnalyticsRequestOpts,
): Promise<{ status: number; ok: boolean; text: string }> {
  if (!opts.bypassThrottle) {
    await waitAnalyticsThrottle();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${ANALYTICS_BASE}${path}`, {
      method: opts.method,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(opts.method === "POST"
          ? { "Content-Type": "application/json" }
          : {}),
        Authorization: `Bearer ${normalizeToken(token)}`,
      },
      body: opts.method === "POST" && opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
    return { status: res.status, ok: res.ok, text: await res.text() };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new WildberriesApiError("Wildberries Analytics не ответил вовремя", 504);
    }
    throw new WildberriesApiError(
      e instanceof Error ? e.message : "Не удалось связаться с Wildberries Analytics",
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

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type WbDailySalesPoint = {
  date: string;
  orders: number;
  revenue: number;
  buyouts: number;
};

export type WbSalesSummary = {
  periodStart: string;
  periodEnd: string;
  ordersTotal: number;
  revenueTotal: number;
  buyoutsTotal: number;
  avgOrderValue: number | null;
  daily: WbDailySalesPoint[];
  currency: string;
};

type GroupedHistoryRow = {
  date?: string;
  /** API возвращает orderCount (не ordersCount) */
  orderCount?: number;
  orderSum?: number;
  buyoutCount?: number;
};

/** Один элемент в data[] — содержит product + history */
type GroupedHistoryItem = {
  history?: GroupedHistoryRow[];
};

/** Остатки FBO через Analytics API (замена deprecated Statistics /supplier/stocks). */
export async function fetchWbFboStocksMap(
  token: string,
  nmIds: number[]
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (nmIds.length === 0) return map;

  for (let offset = 0; offset < nmIds.length; offset += 1000) {
    const chunk = nmIds.slice(offset, offset + 1000);
    const res = await analyticsFetch(token, "/api/analytics/v1/stocks-report/wb-warehouses", {
      nmIds: chunk,
      limit: 250_000,
      offset: 0,
    });

    if (!res.ok) {
      throw new WildberriesApiError(
        res.status === 401 || res.status === 403
          ? "Нет доступа к категории «Аналитика» для остатков FBO"
          : `Wildberries Analytics (остатки) вернул ${res.status}`,
        res.status
      );
    }

    const payload = parseJson<{
      data?: {
        items?: Array<{ nmId?: number; quantity?: number }>;
      };
    }>(res.text);

    for (const row of payload?.data?.items ?? []) {
      if (!row.nmId) continue;
      const qty = row.quantity ?? 0;
      map.set(row.nmId, (map.get(row.nmId) ?? 0) + qty);
    }
  }

  return map;
}

/** Сводка заказов и выручки за последние 7 дней. */
export async function fetchWbSalesSummary(token: string): Promise<WbSalesSummary> {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);

  const res = await analyticsFetch(token, "/api/analytics/v3/sales-funnel/grouped/history", {
    selectedPeriod: { start: isoDate(start), end: isoDate(end) },
    brandNames: [],
    subjectIDs: [],
    tagIDs: [],
    skipDeletedNm: true,
    aggregationLevel: "day",
  });

  if (!res.ok) {
    throw new WildberriesApiError(
      res.status === 401 || res.status === 403
        ? "Нет доступа к категории «Аналитика» для заказов и оборота"
        : `Wildberries Analytics (воронка) вернул ${res.status}`,
      res.status
    );
  }

  // WB API: data — массив объектов {product, history[], currency}
  // а НЕ {groups: []}
  const payload = parseJson<{
    data?: GroupedHistoryItem[] | { groups?: GroupedHistoryItem[] };
    currency?: string;
  }>(res.text);

  const byDate = new Map<string, WbDailySalesPoint>();

  // Поддерживаем оба варианта структуры ответа
  const groups: GroupedHistoryItem[] = Array.isArray(payload?.data)
    ? (payload!.data as GroupedHistoryItem[])
    : ((payload?.data as { groups?: GroupedHistoryItem[] } | undefined)?.groups ?? []);

  for (const group of groups) {
    for (const row of group.history ?? []) {
      if (!row.date) continue;
      const existing = byDate.get(row.date) ?? {
        date: row.date,
        orders: 0,
        revenue: 0,
        buyouts: 0,
      };
      existing.orders += row.orderCount ?? 0;
      existing.revenue += row.orderSum ?? 0;
      existing.buyouts += row.buyoutCount ?? 0;
      byDate.set(row.date, existing);
    }
  }

  const daily = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const ordersTotal = daily.reduce((s, d) => s + d.orders, 0);
  const revenueTotal = daily.reduce((s, d) => s + d.revenue, 0);
  const buyoutsTotal = daily.reduce((s, d) => s + d.buyouts, 0);

  return {
    periodStart: isoDate(start),
    periodEnd: isoDate(end),
    ordersTotal,
    revenueTotal,
    buyoutsTotal,
    avgOrderValue: ordersTotal > 0 ? revenueTotal / ordersTotal : null,
    daily,
    currency: (!Array.isArray(payload?.data) ? (payload?.data as { currency?: string } | undefined)?.currency : undefined) ?? payload?.currency ?? "RUB",
  };
}

const FUNNEL_PAGE = 1000;
const FUNNEL_MAX_PAGES = 3;

function moscowDay(offsetDays: number): string {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function funnelFailure(status: number, text: string): string {
  if (status === 401 || status === 403) {
    return "В токене нет категории «Аналитика». Заказы и рейтинг в оценку не вошли.";
  }
  if (status === 402) {
    return "Для сбора этих данных нужна подписка Джем: воронка заказов. Без неё заказы и рейтинг в оценку не входят.";
  }
  if (status === 429) {
    return "WB отдаёт воронку редко. Нажмите «Повторить» чуть позже.";
  }
  const payload = parseJson<{ detail?: string; title?: string; errorText?: string; message?: string }>(text);
  const detail = payload?.detail ?? payload?.title ?? payload?.errorText ?? payload?.message;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  return `Воронка заказов не прочиталась (${status}).`;
}

function emptyFunnel(
  dateFrom: string,
  dateTo: string,
  pastFrom: string,
  pastTo: string,
  status: SellerFunnelLoadStatus,
  error?: string,
): SellerFunnelSnapshot {
  return {
    loadedAt: new Date().toISOString(),
    version: SELLER_FUNNEL_SNAPSHOT_VERSION,
    dateFrom,
    dateTo,
    pastDateFrom: pastFrom,
    pastDateTo: pastTo,
    status,
    byNm: {},
    error,
  };
}

type FunnelProduct = {
  product?: { nmId?: number | string; feedbackRating?: unknown };
  statistic?: {
    selected?: Record<string, unknown>;
    past?: Record<string, unknown>;
  };
};

function readFunnelProducts(text: string): { products: FunnelProduct[]; recognized: boolean } {
  const payload = parseJson<unknown>(text);
  if (payload == null) return { products: [], recognized: text.trim() === "" };
  if (Array.isArray(payload)) return { products: payload as FunnelProduct[], recognized: true };
  if (typeof payload !== "object") return { products: [], recognized: false };
  const root = payload as { data?: unknown; products?: unknown };
  if (Array.isArray(root.products)) return { products: root.products as FunnelProduct[], recognized: true };
  if (Array.isArray(root.data)) return { products: root.data as FunnelProduct[], recognized: true };
  if (root.data && typeof root.data === "object") {
    const products = (root.data as { products?: unknown }).products;
    if (Array.isArray(products)) return { products: products as FunnelProduct[], recognized: true };
  }
  return { products: [], recognized: false };
}

/**
 * Заказы и воронка карточек за `days` дней (по умолчанию 28) и за предыдущие столько же. Не больше трёх страниц.
 * Для «Задач» и каталога всегда 28; другие периоды запрашивает раздел «Аналитика».
 */
export async function fetchSalesFunnel(token: string, days = 28): Promise<SellerFunnelSnapshot> {
  return fetchFunnelWindow(token, moscowDay(-(days - 1)), moscowDay(0), moscowDay(-(2 * days - 1)), moscowDay(-days));
}

/** Воронка за один законченный день (для истории показателей). Предыдущий день нужен WB как «прошлый период». */
export async function fetchSalesFunnelDay(token: string, day: string): Promise<SellerFunnelSnapshot> {
  const prev = new Date(`${day}T00:00:00Z`);
  prev.setUTCDate(prev.getUTCDate() - 1);
  return fetchFunnelWindow(token, day, day, prev.toISOString().slice(0, 10), prev.toISOString().slice(0, 10));
}

async function fetchFunnelWindow(token: string, dateFrom: string, dateTo: string, pastFrom: string, pastTo: string): Promise<SellerFunnelSnapshot> {
  const byNm: Record<string, SellerFunnelNm> = {};
  let truncated = false;

  for (let page = 0; page < FUNNEL_MAX_PAGES; page += 1) {
    const offset = page * FUNNEL_PAGE;
    let res: { status: number; ok: boolean; text: string };
    try {
      res = await analyticsFetch(token, "/api/analytics/v3/sales-funnel/products", {
        selectedPeriod: { start: dateFrom, end: dateTo },
        pastPeriod: { start: pastFrom, end: pastTo },
        nmIds: [],
        skipDeletedNm: false,
        limit: FUNNEL_PAGE,
        offset,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Воронка заказов не прочиталась.";
      return emptyFunnel(dateFrom, dateTo, pastFrom, pastTo, "error", message);
    }
    if (!res.ok) {
      return emptyFunnel(
        dateFrom,
        dateTo,
        pastFrom,
        pastTo,
        funnelStatusFromHttp(res.status),
        funnelFailure(res.status, res.text),
      );
    }

    const parsed = readFunnelProducts(res.text);
    if (!parsed.recognized) {
      return emptyFunnel(
        dateFrom,
        dateTo,
        pastFrom,
        pastTo,
        "error",
        "Воронка пришла в неожиданном виде. Заказы и рейтинг в оценку не входят.",
      );
    }
    const products = parsed.products;
    for (const item of products) {
      const row = funnelNmFromProduct(item);
      if (!row) continue;
      const rawId = item.product?.nmId;
      const nmId = typeof rawId === "number" ? rawId : typeof rawId === "string" ? Number(rawId) : Number.NaN;
      byNm[String(nmId)] = row;
    }
    if (products.length < FUNNEL_PAGE) {
      truncated = false;
      break;
    }
    truncated = page === FUNNEL_MAX_PAGES - 1;
  }

  const status: SellerFunnelLoadStatus = truncated ? "partial" : "ok";
  return {
    loadedAt: new Date().toISOString(),
    version: SELLER_FUNNEL_SNAPSHOT_VERSION,
    dateFrom,
    dateTo,
    pastDateFrom: pastFrom,
    pastDateTo: pastTo,
    status,
    truncated,
    byNm,
  };
}

const STOCKS_REPORT_PAGE = 1000;
const STOCKS_REPORT_MAX_PAGES = 5;

const ALL_AVAILABILITY = [
  "deficient",
  "actual",
  "balanced",
  "nonActual",
  "nonLiquid",
  "invalidData",
] as const;

function stocksReportFailure(status: number, text: string): string {
  if (status === 401 || status === 403) {
    return "В токене нет категории «Аналитика». Отчёт по остаткам не прочитан.";
  }
  if (status === 402) {
    return "Для сбора этих данных нужна подписка Джем: отчёт по остаткам. Без него поля «в пути» и упущенные заказы недоступны.";
  }
  if (status === 429) {
    return "WB отдаёт отчёт по остаткам редко. Нажмите «Повторить» чуть позже.";
  }
  const payload = parseJson<{ detail?: string; title?: string; errorText?: string; message?: string }>(text);
  const detail = payload?.detail ?? payload?.title ?? payload?.errorText ?? payload?.message;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  return `Отчёт по остаткам не прочитался (${status}).`;
}

function emptyStocksReport(
  dateFrom: string,
  dateTo: string,
  status: SellerStocksReportLoadStatus,
  error?: string,
): SellerStocksReportSnapshot {
  return {
    loadedAt: new Date().toISOString(),
    version: SELLER_STOCKS_REPORT_SNAPSHOT_VERSION,
    dateFrom,
    dateTo,
    status,
    byNm: {},
    error,
  };
}

/**
 * Отчёт по остаткам товаров за `days` дней (по умолчанию 28).
 * POST /api/v2/stocks-report/products/products — тот же analyticsFetch (throttle 21 с).
 */
export async function fetchStocksReport(token: string, days = 28): Promise<SellerStocksReportSnapshot> {
  const dateFrom = moscowDay(-(days - 1));
  const dateTo = moscowDay(0);
  const byNm: Record<string, SellerStocksReportNm> = {};
  let truncated = false;

  for (let page = 0; page < STOCKS_REPORT_MAX_PAGES; page += 1) {
    const offset = page * STOCKS_REPORT_PAGE;
    let res: { status: number; ok: boolean; text: string };
    try {
      res = await analyticsFetch(token, "/api/v2/stocks-report/products/products", {
        nmIDs: [],
        currentPeriod: { start: dateFrom, end: dateTo },
        stockType: "",
        skipDeletedNm: true,
        orderBy: { field: "ordersCount", mode: "desc" },
        availabilityFilters: [...ALL_AVAILABILITY],
        limit: STOCKS_REPORT_PAGE,
        offset,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Отчёт по остаткам не прочитался.";
      return emptyStocksReport(dateFrom, dateTo, "error", message);
    }
    if (!res.ok) {
      return emptyStocksReport(
        dateFrom,
        dateTo,
        stocksReportStatusFromHttp(res.status),
        stocksReportFailure(res.status, res.text),
      );
    }

    const parsed = readStocksReportItems(res.text);
    if (!parsed.recognized) {
      return emptyStocksReport(
        dateFrom,
        dateTo,
        "error",
        "Отчёт по остаткам пришёл в неожиданном виде.",
      );
    }
    for (const item of parsed.items) {
      const row = stocksNmFromItem(item);
      if (!row) continue;
      const rawId = item.nmID ?? item.nmId;
      const nmId = typeof rawId === "number" ? rawId : typeof rawId === "string" ? Number(rawId) : Number.NaN;
      byNm[String(nmId)] = row;
    }
    if (parsed.items.length < STOCKS_REPORT_PAGE) {
      truncated = false;
      break;
    }
    truncated = page === STOCKS_REPORT_MAX_PAGES - 1;
  }

  const status: SellerStocksReportLoadStatus = truncated ? "partial" : "ok";
  return {
    loadedAt: new Date().toISOString(),
    version: SELLER_STOCKS_REPORT_SNAPSHOT_VERSION,
    dateFrom,
    dateTo,
    status,
    truncated,
    byNm,
  };
}

function paidStorageFailure(status: number, text: string): string {
  if (status === 402) {
    return "Отчёт о хранении недоступен для вашего кабинета";
  }
  if (status === 429) {
    return "WB отдаёт отчёт о платном хранении редко. Нажмите «Повторить» чуть позже.";
  }
  const payload = parseJson<{ detail?: string; title?: string; errorText?: string; message?: string }>(text);
  const detail = payload?.detail ?? payload?.title ?? payload?.errorText ?? payload?.message;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  return `Отчёт о платном хранении не прочитался (${status}).`;
}

function addMoscowDays(iso: string, delta: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

type PaidStorageChunkResult =
  | { ok: true; rows: PaidStorageRow[]; dateFrom: string; dateTo: string }
  | {
      ok: false;
      status: SellerPaidStorageLoadStatus;
      error: string;
      pending?: SellerPaidStoragePendingChunk;
      dateFrom: string;
      dateTo: string;
    };

/** Сколько create за один HTTP-запрос (throttle 21 с × N). */
const PAID_STORAGE_CREATES_PER_REQUEST = 2;
/** Короткий опрос в одном запросе; если не готово — pending на следующий. */
const PAID_STORAGE_STATUS_POLLS = 3;
const PAID_STORAGE_STATUS_SLEEP_MS = 2_000;

function isPaidStorageHardFail(status: SellerPaidStorageLoadStatus): boolean {
  return status === "payment_required" || status === "forbidden" || status === "jam_required";
}

function paidStorageTaskReady(taskStatus: string): boolean {
  return taskStatus === "done" || taskStatus === "completed" || taskStatus === "success";
}

function paidStorageTaskFailed(taskStatus: string): boolean {
  return (
    taskStatus === "purged" ||
    taskStatus === "canceled" ||
    taskStatus === "cancelled" ||
    taskStatus === "error"
  );
}

async function downloadPaidStorageTask(
  token: string,
  taskId: string,
  dateFrom: string,
  dateTo: string,
): Promise<PaidStorageChunkResult> {
  let downloadRes: { status: number; ok: boolean; text: string };
  try {
    downloadRes = await analyticsGet(token, `/api/v1/paid_storage/tasks/${taskId}/download`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Скачивание отчёта о хранении не удалось.";
    return {
      ok: false,
      status: "error",
      error: message,
      pending: { taskId, dateFrom, dateTo },
      dateFrom,
      dateTo,
    };
  }
  if (!downloadRes.ok) {
    return {
      ok: false,
      status: paidStorageStatusFromHttp(downloadRes.status),
      error: paidStorageFailure(downloadRes.status, downloadRes.text),
      pending: { taskId, dateFrom, dateTo },
      dateFrom,
      dateTo,
    };
  }
  return {
    ok: true,
    rows: parsePaidStorageRows(parseJson<unknown>(downloadRes.text)),
    dateFrom,
    dateTo,
  };
}

/** Один опрос статуса; при готовности — download. */
async function pollPaidStorageTaskOnce(
  token: string,
  chunk: SellerPaidStoragePendingChunk,
): Promise<PaidStorageChunkResult> {
  const { taskId, dateFrom, dateTo } = chunk;
  let statusRes: { status: number; ok: boolean; text: string };
  try {
    statusRes = await analyticsGet(token, `/api/v1/paid_storage/tasks/${taskId}/status`, {
      bypassThrottle: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Статус отчёта о хранении не прочитался.";
    return { ok: false, status: "pending", error: message, pending: chunk, dateFrom, dateTo };
  }
  if (!statusRes.ok) {
    const status = paidStorageStatusFromHttp(statusRes.status);
    return {
      ok: false,
      status: status === "rate_limited" ? "pending" : status,
      error: paidStorageFailure(statusRes.status, statusRes.text),
      pending: chunk,
      dateFrom,
      dateTo,
    };
  }
  const statusBody = parseJson<{ data?: { status?: string } }>(statusRes.text);
  const taskStatus = statusBody?.data?.status?.toLowerCase() ?? "";
  if (paidStorageTaskReady(taskStatus)) {
    return downloadPaidStorageTask(token, taskId, dateFrom, dateTo);
  }
  if (paidStorageTaskFailed(taskStatus)) {
    return {
      ok: false,
      status: "error",
      error: `Задание отчёта о хранении: ${taskStatus || "ошибка"}.`,
      dateFrom,
      dateTo,
    };
  }
  return {
    ok: false,
    status: "pending",
    error: "Отчёт о хранении ещё формируется.",
    pending: chunk,
    dateFrom,
    dateTo,
  };
}

async function createPaidStorageTask(
  token: string,
  dateFrom: string,
  dateTo: string,
): Promise<PaidStorageChunkResult> {
  let createRes: { status: number; ok: boolean; text: string };
  try {
    createRes = await analyticsGet(
      token,
      `/api/v1/paid_storage?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Отчёт о платном хранении не прочитался.";
    return { ok: false, status: "error", error: message, dateFrom, dateTo };
  }
  if (!createRes.ok) {
    return {
      ok: false,
      status: paidStorageStatusFromHttp(createRes.status),
      error: paidStorageFailure(createRes.status, createRes.text),
      dateFrom,
      dateTo,
    };
  }
  const created = parseJson<{ data?: { taskId?: string }; taskId?: string }>(createRes.text);
  const taskId = created?.data?.taskId ?? created?.taskId;
  if (!taskId) {
    return { ok: false, status: "error", error: "WB не вернул taskId отчёта о хранении.", dateFrom, dateTo };
  }

  const pending: SellerPaidStoragePendingChunk = { taskId, dateFrom, dateTo };
  for (let attempt = 0; attempt < PAID_STORAGE_STATUS_POLLS; attempt += 1) {
    const polled = await pollPaidStorageTaskOnce(token, pending);
    if (polled.ok) return polled;
    if (polled.status !== "pending") return polled;
    if (attempt < PAID_STORAGE_STATUS_POLLS - 1) await sleep(PAID_STORAGE_STATUS_SLEEP_MS);
  }
  return {
    ok: false,
    status: "pending",
    error: "Отчёт о хранении ещё формируется.",
    pending,
    dateFrom,
    dateTo,
  };
}

function chunkKey(dateFrom: string, dateTo: string): string {
  return `${dateFrom}|${dateTo}`;
}

/**
 * Платное хранение за 56 дней: async create→status→download.
 * Один HTTP-запрос не ждёт все 8 окон: добирает pending, создаёт ограниченно,
 * иначе возвращает pending + последний успешный byNm (через previous).
 */
export async function fetchPaidStorage(
  token: string,
  previous?: SellerPaidStorageSnapshot | null,
): Promise<SellerPaidStorageSnapshot> {
  const marginTo = moscowDay(0);
  const marginCurrentFrom = addMoscowDays(marginTo, -27);
  const marginPriorTo = addMoscowDays(marginTo, -28);
  const marginPriorFrom = addMoscowDays(marginTo, -55);
  const dateTo = moscowDay(-1);
  const dateFrom = addMoscowDays(dateTo, -55);

  const windows: Array<{ dateFrom: string; dateTo: string }> = [];
  for (let i = 0; i < 8; i += 1) {
    const chunkFrom = addMoscowDays(dateFrom, i * 7);
    let chunkTo = addMoscowDays(chunkFrom, 6);
    if (chunkTo > dateTo) chunkTo = dateTo;
    if (chunkFrom > dateTo) break;
    windows.push({ dateFrom: chunkFrom, dateTo: chunkTo });
  }

  const allRows: PaidStorageRow[] = [];
  const pendingChunks: SellerPaidStoragePendingChunk[] = [];
  const doneKeys = new Set<string>();
  let lastError: string | undefined;
  let lastStatus: SellerPaidStorageLoadStatus = "ok";
  let createsLeft = PAID_STORAGE_CREATES_PER_REQUEST;

  const prevPending = previous?.pendingChunks ?? [];
  for (const chunk of prevPending) {
    const key = chunkKey(chunk.dateFrom, chunk.dateTo);
    let result = await pollPaidStorageTaskOnce(token, chunk);
    if (!result.ok && result.status === "pending") {
      for (let i = 0; i < PAID_STORAGE_STATUS_POLLS - 1; i += 1) {
        await sleep(PAID_STORAGE_STATUS_SLEEP_MS);
        result = await pollPaidStorageTaskOnce(token, chunk);
        if (result.ok || result.status !== "pending") break;
      }
    }
    if (result.ok) {
      allRows.push(...result.rows);
      doneKeys.add(key);
      continue;
    }
    if (result.pending) pendingChunks.push(result.pending);
    lastError = result.error;
    lastStatus = result.status;
    if (isPaidStorageHardFail(result.status)) {
      return withLastOk(
        emptyPaidStorageSnapshot(result.status, result.error, dateFrom, dateTo),
        previous,
      );
    }
  }

  for (const win of windows) {
    const key = chunkKey(win.dateFrom, win.dateTo);
    if (doneKeys.has(key)) continue;
    if (pendingChunks.some((p) => chunkKey(p.dateFrom, p.dateTo) === key)) continue;
    if (createsLeft <= 0) {
      // Остальные окна — на следующих запросах.
      continue;
    }
    createsLeft -= 1;
    const result = await createPaidStorageTask(token, win.dateFrom, win.dateTo);
    if (result.ok) {
      allRows.push(...result.rows);
      doneKeys.add(key);
      continue;
    }
    if (result.pending) pendingChunks.push(result.pending);
    lastError = result.error;
    lastStatus = result.status;
    if (isPaidStorageHardFail(result.status)) {
      if (allRows.length === 0 && Object.keys(previous?.byNm ?? {}).length === 0) {
        return withLastOk(
          emptyPaidStorageSnapshot(result.status, result.error, dateFrom, dateTo),
          previous,
        );
      }
      break;
    }
  }

  const windowsLeft = windows.filter((w) => !doneKeys.has(chunkKey(w.dateFrom, w.dateTo)));
  const stillWork = pendingChunks.length > 0 || windowsLeft.length > 0;

  const freshByNm =
    allRows.length > 0
      ? aggregatePaidStorageByNm(allRows, {
          currentFrom: marginCurrentFrom,
          currentTo: marginTo,
          priorFrom: marginPriorFrom,
          priorTo: marginPriorTo,
        })
      : {};

  const prevByNm = previous?.byNm ?? {};
  const hasPrev = Object.keys(prevByNm).length > 0;
  const hasFresh = Object.keys(freshByNm).length > 0;
  const byNm = hasFresh ? { ...prevByNm, ...freshByNm } : prevByNm;

  if (!hasFresh && !hasPrev) {
    const snap = emptyPaidStorageSnapshot(
      stillWork ? "pending" : lastStatus,
      lastError ?? (stillWork ? "Отчёт о хранении ещё формируется." : "Отчёт о хранении не прочитался."),
      dateFrom,
      dateTo,
    );
    return {
      ...snap,
      pendingChunks: pendingChunks.length ? pendingChunks : undefined,
      marginCurrentFrom,
      marginCurrentTo: marginTo,
      marginPriorFrom,
      marginPriorTo,
    };
  }

  const status: SellerPaidStorageLoadStatus = stillWork
    ? "pending"
    : doneKeys.size < windows.length
      ? "partial"
      : "ok";

  const loadedAt = new Date().toISOString();
  const lastOk =
    status === "ok" || status === "partial"
      ? {
          lastOkDateFrom: dateFrom,
          lastOkDateTo: dateTo,
          lastOkLoadedAt: loadedAt,
        }
      : {
          lastOkDateFrom: previous?.lastOkDateFrom ?? previous?.dateFrom,
          lastOkDateTo: previous?.lastOkDateTo ?? previous?.dateTo,
          lastOkLoadedAt: previous?.lastOkLoadedAt ?? previous?.loadedAt,
        };

  return {
    loadedAt,
    version: SELLER_PAID_STORAGE_SNAPSHOT_VERSION,
    dateFrom: hasFresh ? dateFrom : previous?.dateFrom || dateFrom,
    dateTo: hasFresh ? dateTo : previous?.dateTo || dateTo,
    status,
    byNm,
    marginCurrentFrom,
    marginCurrentTo: marginTo,
    marginPriorFrom,
    marginPriorTo,
    pendingChunks: pendingChunks.length ? pendingChunks : undefined,
    ...lastOk,
    error: stillWork
      ? lastError ?? "Отчёт о хранении ещё формируется — используем последний успешный."
      : status === "partial"
        ? lastError
        : undefined,
  };
}

function withLastOk(
  snap: SellerPaidStorageSnapshot,
  previous?: SellerPaidStorageSnapshot | null,
): SellerPaidStorageSnapshot {
  if (!previous || Object.keys(previous.byNm).length === 0) return snap;
  return {
    ...previous,
    status: snap.status === "ok" ? previous.status : snap.status,
    error: snap.error ?? previous.error,
    loadedAt: snap.loadedAt,
    pendingChunks: snap.pendingChunks ?? previous.pendingChunks,
    lastOkDateFrom: previous.lastOkDateFrom ?? previous.dateFrom,
    lastOkDateTo: previous.lastOkDateTo ?? previous.dateTo,
    lastOkLoadedAt: previous.lastOkLoadedAt ?? previous.loadedAt,
  };
}
