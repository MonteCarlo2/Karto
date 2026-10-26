import type {
  SellerFunnelLoadStatus,
  SellerFunnelNm,
  SellerFunnelPeriod,
  SellerFunnelSnapshot,
} from "@/lib/seller-hub/types";
import { SELLER_FUNNEL_SNAPSHOT_VERSION } from "@/lib/seller-hub/types";

/** Число из ответа: нет поля → null, ноль → 0. */
export function funnelNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

type RawConversions = {
  addToCartPercent?: unknown;
  cartToOrderPercent?: unknown;
  buyoutPercent?: unknown;
};

type RawPeriod = {
  openCount?: unknown;
  cartCount?: unknown;
  orderCount?: unknown;
  orderSum?: unknown;
  buyoutCount?: unknown;
  cancelCount?: unknown;
  avgOrdersCountPerDay?: unknown;
  avgPrice?: unknown;
  conversions?: RawConversions;
};

export function parseFunnelPeriod(raw: unknown): SellerFunnelPeriod | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as RawPeriod;
  const conversions = row.conversions && typeof row.conversions === "object" ? row.conversions : null;
  return {
    openCount: funnelNumber(row.openCount),
    cartCount: funnelNumber(row.cartCount),
    orderCount: funnelNumber(row.orderCount),
    orderSum: funnelNumber(row.orderSum),
    buyoutCount: funnelNumber(row.buyoutCount),
    cancelCount: funnelNumber(row.cancelCount),
    avgOrdersCountPerDay: funnelNumber(row.avgOrdersCountPerDay),
    avgPrice: funnelNumber(row.avgPrice),
    addToCartPercent: conversions ? funnelNumber(conversions.addToCartPercent) : null,
    cartToOrderPercent: conversions ? funnelNumber(conversions.cartToOrderPercent) : null,
    buyoutPercent: conversions ? funnelNumber(conversions.buyoutPercent) : null,
  };
}

export function emptyFunnelPeriod(): SellerFunnelPeriod {
  return {
    openCount: null,
    cartCount: null,
    orderCount: null,
    orderSum: null,
    buyoutCount: null,
    cancelCount: null,
    avgOrdersCountPerDay: null,
    avgPrice: null,
    addToCartPercent: null,
    cartToOrderPercent: null,
    buyoutPercent: null,
  };
}

/**
 * Legacy-поля с прежним смыслом: orders / ordersPerDay без значения → 0,
 * priorOrders без past → null, с past без orderCount → 0.
 */
export function funnelNmFromProduct(item: {
  product?: { nmId?: number | string; feedbackRating?: unknown };
  statistic?: { selected?: RawPeriod; past?: RawPeriod };
}): SellerFunnelNm | null {
  const rawId = item.product?.nmId;
  const nmId = typeof rawId === "number" ? rawId : typeof rawId === "string" ? Number(rawId) : Number.NaN;
  if (!Number.isFinite(nmId)) return null;
  const selected = parseFunnelPeriod(item.statistic?.selected) ?? emptyFunnelPeriod();
  const pastRaw = item.statistic?.past;
  const past = pastRaw === undefined ? null : parseFunnelPeriod(pastRaw);
  const orders = selected.orderCount ?? 0;
  const priorOrders = past == null ? null : (past.orderCount ?? 0);
  const ordersPerDay = selected.avgOrdersCountPerDay ?? 0;
  const feedbackRating = funnelNumber(item.product?.feedbackRating);
  return {
    orders,
    priorOrders,
    feedbackRating,
    ordersPerDay,
    selected,
    past,
  };
}

export function funnelStatusFromHttp(status: number): SellerFunnelLoadStatus {
  if (status === 402) return "jam_required";
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403) return "forbidden";
  return "error";
}

/** Снимок пригоден для задач по спросу: актуальная версия и есть хотя бы одна строка с selected. */
export function isFunnelReadyForDemandTasks(
  funnel: Pick<SellerFunnelSnapshot, "loadedAt" | "error" | "version" | "byNm" | "status"> | null | undefined,
): boolean {
  if (!funnel?.loadedAt || funnel.error) return false;
  if ((funnel.version ?? 0) < SELLER_FUNNEL_SNAPSHOT_VERSION) return false;
  if (funnel.status === "jam_required" || funnel.status === "forbidden" || funnel.status === "rate_limited") {
    return false;
  }
  const rows = Object.values(funnel.byNm);
  if (rows.length === 0) return false;
  return rows.some((row) => row.selected != null && typeof row.selected === "object");
}

/** Нужна перезагрузка: нет годного снимка или каталог синкнули позже воронки. */
export function funnelNeedsReload(
  funnel: Pick<SellerFunnelSnapshot, "loadedAt" | "error" | "version" | "byNm" | "status"> | null | undefined,
  catalogSyncedAt: string | null | undefined,
): boolean {
  if (!isFunnelReadyForDemandTasks(funnel)) return true;
  if (!catalogSyncedAt || !funnel?.loadedAt) return true;
  const syncMs = Date.parse(catalogSyncedAt);
  const funnelMs = Date.parse(funnel.loadedAt);
  if (!Number.isFinite(syncMs) || !Number.isFinite(funnelMs)) return true;
  return syncMs > funnelMs;
}

/** Ошибка загрузки не затирает прошлый успешный снимок. */
export function mergeFunnelKeepPrevious(
  previous: SellerFunnelSnapshot | null | undefined,
  incoming: SellerFunnelSnapshot,
): SellerFunnelSnapshot {
  const hadGood = Boolean(
    previous &&
      !previous.error &&
      (previous.version ?? 0) >= SELLER_FUNNEL_SNAPSHOT_VERSION &&
      Object.keys(previous.byNm).length > 0,
  );
  if (incoming.error && hadGood && previous) {
    return {
      ...incoming,
      byNm: previous.byNm,
      version: previous.version,
      truncated: undefined,
      error: incoming.error,
      status: incoming.status ?? "error",
    };
  }
  return incoming;
}
