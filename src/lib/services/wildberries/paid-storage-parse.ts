import type {
  SellerPaidStorageLoadStatus,
  SellerPaidStorageNm,
  SellerPaidStorageSnapshot,
} from "@/lib/seller-hub/types";
import { SELLER_PAID_STORAGE_SNAPSHOT_VERSION } from "@/lib/seller-hub/types";
import { storagePerUnitDayFromPaidRows } from "@/lib/seller-hub/task-engine/stock-math";

export function paidStorageStatusFromHttp(status: number): SellerPaidStorageLoadStatus {
  if (status === 402) return "payment_required";
  if (status === 403) return "forbidden";
  if (status === 429) return "rate_limited";
  if (status >= 200 && status < 300) return "ok";
  return "error";
}

export type PaidStorageRow = {
  date: string;
  nmId: number;
  warehousePrice: number;
  barcodesCount: number;
};

export function parsePaidStorageRows(raw: unknown): PaidStorageRow[] {
  if (!Array.isArray(raw)) return [];
  const out: PaidStorageRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const nmId = typeof row.nmId === "number" ? row.nmId : Number(row.nmId);
    if (!Number.isFinite(nmId) || nmId <= 0) continue;
    const warehousePrice =
      typeof row.warehousePrice === "number"
        ? row.warehousePrice
        : Number(row.warehousePrice);
    const barcodesCount =
      typeof row.barcodesCount === "number"
        ? row.barcodesCount
        : Number(row.barcodesCount);
    if (!Number.isFinite(warehousePrice) || !Number.isFinite(barcodesCount)) continue;
    const date = typeof row.date === "string" ? row.date.slice(0, 10) : "";
    out.push({ date, nmId, warehousePrice, barcodesCount });
  }
  return out;
}

export type PaidStorageWindowBounds = {
  currentFrom: string;
  currentTo: string;
  priorFrom: string;
  priorTo: string;
};

/**
 * Ставка = Σ warehousePrice / Σ barcodesCount за период.
 * barcodesCount = единицы, подлежащие тарифицированию за расчётные сутки.
 * currentWindowRub / priorWindowRub — суммы warehousePrice по окнам маржи.
 */
export function aggregatePaidStorageByNm(
  rows: PaidStorageRow[],
  windows?: PaidStorageWindowBounds,
): Record<string, SellerPaidStorageNm> {
  const buckets = new Map<
    string,
    {
      totalPrice: number;
      totalUnits: number;
      days: Set<string>;
      unitDays: Array<{ warehousePrice: number; barcodesCount: number }>;
      currentRub: number;
      priorRub: number;
    }
  >();
  for (const row of rows) {
    const key = String(row.nmId);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        totalPrice: 0,
        totalUnits: 0,
        days: new Set(),
        unitDays: [],
        currentRub: 0,
        priorRub: 0,
      };
      buckets.set(key, bucket);
    }
    bucket.totalPrice += row.warehousePrice;
    bucket.totalUnits += row.barcodesCount;
    bucket.unitDays.push({
      warehousePrice: row.warehousePrice,
      barcodesCount: row.barcodesCount,
    });
    if (row.date) bucket.days.add(row.date);
    if (windows && row.date) {
      if (row.date >= windows.currentFrom && row.date <= windows.currentTo) {
        bucket.currentRub += row.warehousePrice;
      } else if (row.date >= windows.priorFrom && row.date <= windows.priorTo) {
        bucket.priorRub += row.warehousePrice;
      }
    }
  }
  const byNm: Record<string, SellerPaidStorageNm> = {};
  for (const [nmId, bucket] of buckets) {
    const periodDays = bucket.days.size > 0 ? bucket.days.size : null;
    const avgStock =
      periodDays != null && periodDays > 0 && bucket.totalUnits > 0
        ? bucket.totalUnits / periodDays
        : null;
    const rate = storagePerUnitDayFromPaidRows(bucket.unitDays);
    byNm[nmId] = {
      totalStorageRub: bucket.totalPrice,
      avgStock,
      periodDays,
      storagePerUnitDay: rate,
      unitDays: bucket.totalUnits,
      currentWindowRub: windows ? bucket.currentRub : undefined,
      priorWindowRub: windows ? bucket.priorRub : undefined,
    };
  }
  return byNm;
}

export function emptyPaidStorageSnapshot(
  status: SellerPaidStorageLoadStatus,
  error?: string,
  dateFrom = "",
  dateTo = "",
): SellerPaidStorageSnapshot {
  return {
    loadedAt: new Date().toISOString(),
    version: SELLER_PAID_STORAGE_SNAPSHOT_VERSION,
    dateFrom,
    dateTo,
    status,
    byNm: {},
    error,
  };
}

export function mergePaidStorageKeepPrevious(
  previous: SellerPaidStorageSnapshot | null | undefined,
  incoming: SellerPaidStorageSnapshot,
): SellerPaidStorageSnapshot {
  const prevNm = previous && Object.keys(previous.byNm).length > 0 ? previous.byNm : null;
  // Уже загруженные дни не выкидываем, даже если новый прогон целиком упал (таймаут / 429).
  if (!prevNm) return incoming;
  if (Object.keys(incoming.byNm).length === 0) {
    return {
      ...previous!,
      error: incoming.error ?? previous!.error,
      status: incoming.status === "ok" ? previous!.status : (incoming.status ?? previous!.status),
      loadedAt: incoming.loadedAt,
      pendingChunks: incoming.pendingChunks ?? previous!.pendingChunks,
      lastOkDateFrom: previous!.lastOkDateFrom ?? previous!.dateFrom,
      lastOkDateTo: previous!.lastOkDateTo ?? previous!.dateTo,
      lastOkLoadedAt: previous!.lastOkLoadedAt ?? previous!.loadedAt,
    };
  }
  const mergedByNm = { ...prevNm, ...incoming.byNm };
  const pending = incoming.status === "pending" || Boolean(incoming.pendingChunks?.length);
  const partial =
    !pending &&
    (incoming.status === "partial" ||
      previous!.status === "partial" ||
      Boolean(incoming.error) ||
      Boolean(previous!.error));
  return {
    ...incoming,
    byNm: mergedByNm,
    dateFrom: previous!.dateFrom || incoming.dateFrom,
    dateTo: incoming.dateTo || previous!.dateTo,
    status: pending ? "pending" : partial && incoming.status !== "ok" ? "partial" : incoming.status,
    error: incoming.error ?? previous!.error,
    pendingChunks: incoming.pendingChunks,
    lastOkDateFrom:
      incoming.lastOkDateFrom ?? previous!.lastOkDateFrom ?? previous!.dateFrom,
    lastOkDateTo: incoming.lastOkDateTo ?? previous!.lastOkDateTo ?? previous!.dateTo,
    lastOkLoadedAt:
      incoming.lastOkLoadedAt ?? previous!.lastOkLoadedAt ?? previous!.loadedAt,
  };
}

export function paidStorageNeedsReload(
  report:
    | Pick<
        SellerPaidStorageSnapshot,
        "loadedAt" | "error" | "version" | "byNm" | "status" | "pendingChunks"
      >
    | null
    | undefined,
  syncedAt: string | null | undefined,
): boolean {
  if (!report) return true;
  if (
    report.status === "payment_required" ||
    report.status === "jam_required" ||
    report.status === "forbidden" ||
    report.status === "rate_limited"
  ) {
    return false;
  }
  // Async: добираем, пока есть pending (пауза между проходами — в эффекте UI).
  if (report.status === "pending" || (report.pendingChunks?.length ?? 0) > 0) return true;
  if (report.error && Object.keys(report.byNm).length === 0) return true;
  if (!syncedAt || !report.loadedAt) return true;
  return Date.parse(report.loadedAt) < Date.parse(syncedAt);
}
