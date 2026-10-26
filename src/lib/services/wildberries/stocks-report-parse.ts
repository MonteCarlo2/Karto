import type {
  SellerStocksReportDuration,
  SellerStocksReportLoadStatus,
  SellerStocksReportNm,
  SellerStocksReportSnapshot,
} from "@/lib/seller-hub/types";
import { SELLER_STOCKS_REPORT_SNAPSHOT_VERSION } from "@/lib/seller-hub/types";

/** Число: нет поля → null, ноль → 0. */
export function stocksNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * lostOrders* / lostBuyouts*: `-2` → 0; другое отрицательное → не рассчитано (null).
 * Спека: «Значение меньше 0 и не равно -2 — значение не рассчитано; -2 — нулевое значение».
 */
export function stocksLostMetric(value: unknown): number | null {
  const n = stocksNumber(value);
  if (n == null) return null;
  if (n === -2) return 0;
  if (n < 0) return null;
  return n;
}

/**
 * Длительности saleRate / avgStockTurnover / officeMissingTime.
 * hours: -1 infinite, -2 zero, -3 not calculated, (-4 only officeMissingTime: entire period).
 * Возвращаем дни как число только при нормальных значениях; особые случаи → null + код в evidence при необходимости.
 */
export function stocksDurationDays(raw: unknown): {
  days: number | null;
  special: "infinite" | "zero" | "uncalculated" | "entire_period" | null;
  raw: SellerStocksReportDuration | null;
} {
  if (!raw || typeof raw !== "object") {
    return { days: null, special: null, raw: null };
  }
  const row = raw as { days?: unknown; hours?: unknown };
  const days = stocksNumber(row.days);
  const hours = stocksNumber(row.hours);
  const duration: SellerStocksReportDuration = {
    days: days ?? 0,
    hours: hours ?? 0,
  };
  if (hours === -1) return { days: null, special: "infinite", raw: duration };
  if (hours === -2) return { days: 0, special: "zero", raw: duration };
  if (hours === -3) return { days: null, special: "uncalculated", raw: duration };
  if (hours === -4) return { days: null, special: "entire_period", raw: duration };
  if (days == null && hours == null) return { days: null, special: null, raw: null };
  const totalDays =
    (days ?? 0) + (hours != null && hours > 0 ? hours / 24 : 0);
  return { days: Math.round(totalDays * 1000) / 1000, special: null, raw: duration };
}

const AVAILABILITY = new Set([
  "deficient",
  "actual",
  "balanced",
  "nonActual",
  "nonLiquid",
  "invalidData",
]);

export function stocksAvailability(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return AVAILABILITY.has(value) ? value : null;
}

export function stocksReportStatusFromHttp(status: number): SellerStocksReportLoadStatus {
  if (status === 402) return "jam_required";
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403) return "forbidden";
  return "error";
}

type RawMetrics = Record<string, unknown>;

export function stocksNmFromItem(item: {
  nmID?: unknown;
  nmId?: unknown;
  metrics?: RawMetrics;
}): SellerStocksReportNm | null {
  const rawId = item.nmID ?? item.nmId;
  const nmId = typeof rawId === "number" ? rawId : typeof rawId === "string" ? Number(rawId) : Number.NaN;
  if (!Number.isFinite(nmId)) return null;
  const m = item.metrics && typeof item.metrics === "object" ? item.metrics : {};
  const sale = stocksDurationDays(m.saleRate);
  const turnover = stocksDurationDays(m.avgStockTurnover);
  const missing = stocksDurationDays(m.officeMissingTime);
  return {
    stockCount: stocksNumber(m.stockCount),
    toClientCount: stocksNumber(m.toClientCount),
    fromClientCount: stocksNumber(m.fromClientCount),
    lostOrdersCount: stocksLostMetric(m.lostOrdersCount),
    lostOrdersSum: stocksLostMetric(m.lostOrdersSum),
    lostBuyoutsCount: stocksLostMetric(m.lostBuyoutsCount),
    lostBuyoutsSum: stocksLostMetric(m.lostBuyoutsSum),
    officeMissingTimeDays: missing.days,
    officeMissingTimeSpecial: missing.special,
    availability: stocksAvailability(m.availability),
    buyoutPercent: stocksNumber(m.buyoutPercent),
    avgOrders: stocksNumber(m.avgOrders),
    ordersCount: stocksNumber(m.ordersCount),
    saleRateDays: sale.days,
    saleRateSpecial: sale.special,
    avgStockTurnoverDays: turnover.days,
    avgStockTurnoverSpecial: turnover.special,
  };
}

export function readStocksReportItems(text: string): {
  items: Array<{ nmID?: unknown; nmId?: unknown; metrics?: RawMetrics }>;
  recognized: boolean;
} {
  const trimmed = text.trim();
  if (!trimmed) return { items: [], recognized: true };
  let payload: unknown;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    return { items: [], recognized: false };
  }
  if (payload == null) return { items: [], recognized: true };
  if (typeof payload !== "object") return { items: [], recognized: false };
  const root = payload as { data?: unknown };
  const data = root.data;
  if (!data || typeof data !== "object") return { items: [], recognized: false };
  const items = (data as { items?: unknown }).items;
  if (!Array.isArray(items)) return { items: [], recognized: false };
  return { items: items as Array<{ nmID?: unknown; nmId?: unknown; metrics?: RawMetrics }>, recognized: true };
}

/** Ошибка загрузки не затирает прошлый успешный снимок. */
export function mergeStocksReportKeepPrevious(
  previous: SellerStocksReportSnapshot | null | undefined,
  incoming: SellerStocksReportSnapshot,
): SellerStocksReportSnapshot {
  const hadGood = Boolean(
    previous &&
      !previous.error &&
      (previous.version ?? 0) >= SELLER_STOCKS_REPORT_SNAPSHOT_VERSION &&
      Object.keys(previous.byNm).length > 0,
  );
  if (incoming.error && hadGood && previous) {
    return {
      ...incoming,
      byNm: previous.byNm,
      version: previous.version,
      dateFrom: previous.dateFrom,
      dateTo: previous.dateTo,
      truncated: previous.truncated,
      error: incoming.error,
      status: incoming.status ?? "error",
    };
  }
  return incoming;
}

/** Нужна перезагрузка после sync каталога или при пустом/битом снимке. */
export function stocksReportNeedsReload(
  report: Pick<SellerStocksReportSnapshot, "loadedAt" | "error" | "version" | "byNm" | "status"> | null | undefined,
  catalogSyncedAt: string | null | undefined,
): boolean {
  if (!report?.loadedAt) return true;
  if ((report.version ?? 0) < SELLER_STOCKS_REPORT_SNAPSHOT_VERSION) return true;
  if (report.status === "jam_required" || report.status === "forbidden" || report.status === "rate_limited") {
    return false;
  }
  if (report.error && Object.keys(report.byNm).length === 0) return true;
  if (!catalogSyncedAt || !report.loadedAt) return true;
  const syncMs = Date.parse(catalogSyncedAt);
  const loadedMs = Date.parse(report.loadedAt);
  if (!Number.isFinite(syncMs) || !Number.isFinite(loadedMs)) return true;
  return syncMs > loadedMs;
}
