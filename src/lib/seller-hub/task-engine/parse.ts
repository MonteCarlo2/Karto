import type { SellerHubMarketplaceId } from "@/lib/seller-hub/types";
import type { StoreTaskFacts, TaskFact, TaskFunnelStatus, TaskPaceSource } from "./types";

const MAX_PRODUCTS = 20_000;
const INT_LIMIT = 2_000_000_000;

export type TaskReconcileBody = {
  marketplaceId: SellerHubMarketplaceId;
  products: TaskFact[];
  store: StoreTaskFacts;
};

function clip(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function num(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  if (rounded > INT_LIMIT) return INT_LIMIT;
  if (rounded < -INT_LIMIT) return -INT_LIMIT;
  return rounded;
}

/** 1 шт. за 28 дней ≈ 0,0357. Один знак после запятой записывает это как 0. */
function pace(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  if (rounded > INT_LIMIT) return INT_LIMIT;
  if (rounded < -INT_LIMIT) return -INT_LIMIT;
  return rounded;
}

function int(value: unknown): number | null {
  const rounded = num(value);
  return rounded == null ? null : Math.round(rounded);
}

function isMarketplace(value: unknown): value is SellerHubMarketplaceId {
  return value === "wildberries" || value === "ozon" || value === "yandex";
}

function source(value: unknown): TaskFact["marginSource"] {
  return value === "sku" || value === "account" ? value : null;
}

function paceSource(value: unknown): TaskPaceSource | null {
  return value === "orders" || value === "sales-recent" || value === "sales-span" ? value : null;
}

function funnelStatus(value: unknown): TaskFunnelStatus {
  switch (value) {
    case "ok":
    case "partial":
    case "jam_required":
    case "rate_limited":
    case "forbidden":
    case "error":
    case "not_loaded":
    case "missing":
      return value;
    default:
      return "not_loaded";
  }
}

const MAX_REVIEW_LIST = 40;

function parseStaleNegatives(
  value: unknown,
): TaskFact["staleNegativeReviews"] {
  if (!Array.isArray(value)) return null;
  const out: NonNullable<TaskFact["staleNegativeReviews"]> = [];
  for (const item of value.slice(0, MAX_REVIEW_LIST)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = clip(row.id, 80);
    const createdAt = clip(row.createdAt, 40);
    const rating = int(row.rating);
    if (!id || !createdAt || rating == null || rating < 1 || rating > 5) continue;
    out.push({
      id,
      createdAt,
      rating,
      preview: clip(row.preview, 220) || "Без текста",
      countsOnCard: row.countsOnCard !== false,
    });
  }
  return out.length > 0 ? out : [];
}

function parseStaleQuestions(value: unknown): TaskFact["staleQuestions"] {
  if (!Array.isArray(value)) return null;
  const out: NonNullable<TaskFact["staleQuestions"]> = [];
  for (const item of value.slice(0, MAX_REVIEW_LIST)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = clip(row.id, 80);
    const createdAt = clip(row.createdAt, 40);
    if (!id || !createdAt) continue;
    out.push({
      id,
      createdAt,
      preview: clip(row.preview, 220) || "Без текста",
    });
  }
  return out.length > 0 ? out : [];
}

const MAX_PROMO_OFFERS = 12;
const COHORTS = new Set(["boost", "hold", "loss", "open"]);

function parsePromoOffers(value: unknown): TaskFact["promoOffers"] {
  if (!Array.isArray(value)) return undefined;
  const out: NonNullable<TaskFact["promoOffers"]> = [];
  for (const item of value.slice(0, MAX_PROMO_OFFERS)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const promoId = clip(row.promoId, 40);
    const promoName = clip(row.promoName, 200);
    const cohort = typeof row.cohort === "string" && COHORTS.has(row.cohort) ? (row.cohort as "boost" | "hold" | "loss" | "open") : null;
    if (!promoId || !promoName || !cohort) continue;
    out.push({
      promoId,
      promoName,
      promoType: clip(row.promoType, 20) || null,
      startAt: clip(row.startAt, 40) || null,
      endAt: clip(row.endAt, 40) || null,
      canManage: row.canManage === true,
      planPrice: num(row.planPrice),
      inPromo: row.inPromo === true ? true : row.inPromo === false ? false : null,
      cohort,
      marginPromoRub: num(row.marginPromoRub),
      marginPromoPercent: num(row.marginPromoPercent),
      marginNowRub: num(row.marginNowRub),
    });
  }
  return out;
}

const MAX_AD_CAMPAIGNS = 30;

function count(value: unknown): number {
  const parsed = num(value);
  return parsed == null || parsed < 0 ? 0 : parsed;
}

function parseAdFacts(value: unknown): TaskFact["adFacts"] {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const campaigns: NonNullable<TaskFact["adFacts"]>["campaigns"] = [];
  for (const item of Array.isArray(raw.campaigns) ? raw.campaigns.slice(0, MAX_AD_CAMPAIGNS) : []) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = clip(row.id, 40);
    if (!id) continue;
    campaigns.push({
      id,
      name: clip(row.name, 200) || id,
      status: int(row.status),
      budget: num(row.budget),
      dailyLimitRub: num(row.dailyLimitRub),
      advertised: row.advertised === true ? true : row.advertised === false ? false : null,
      spend: count(row.spend),
      orders: count(row.orders),
      orderSum: count(row.orderSum),
      recentSpend: count(row.recentSpend),
      limitHitDays: Math.round(count(row.limitHitDays)),
    });
  }
  const totals = (value: unknown) => {
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    return { spend: count(row.spend), views: count(row.views), clicks: count(row.clicks), orders: count(row.orders), orderSum: count(row.orderSum) };
  };
  const bm = raw.benchmark && typeof raw.benchmark === "object" ? (raw.benchmark as Record<string, unknown>) : null;
  return {
    prev: totals(raw.prev),
    benchmark: bm ? { products: Math.round(count(bm.products)), ctrPercent: pace(bm.ctrPercent), crPercent: pace(bm.crPercent) } : null,
    statsReady: raw.statsReady === true,
    windowDays: Math.round(count(raw.windowDays)),
    dateFrom: clip(raw.dateFrom, 10) || null,
    dateTo: clip(raw.dateTo, 10) || null,
    spend: count(raw.spend),
    views: count(raw.views),
    clicks: count(raw.clicks),
    orders: count(raw.orders),
    orderSum: count(raw.orderSum),
    drrPercent: num(raw.drrPercent),
    storeCpo: num(raw.storeCpo),
    campaigns,
  };
}

export function parseTaskReconcileBody(body: unknown): TaskReconcileBody | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  if (!isMarketplace(raw.marketplaceId)) return null;
  if (!Array.isArray(raw.products) || raw.products.length > MAX_PRODUCTS) return null;
  if (!raw.store || typeof raw.store !== "object") return null;
  const storeRaw = raw.store as Record<string, unknown>;
  const byNm = new Map<string, TaskFact>();
  for (const item of raw.products) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const nmId = clip(row.nmId, 32);
    if (!nmId) return null;
    byNm.set(nmId, {
      nmId,
      itemId: clip(row.itemId, 80),
      title: clip(row.title, 300) || nmId,
      vendorCode: clip(row.vendorCode, 80),
      promoOffers: parsePromoOffers(row.promoOffers),
      adFacts: parseAdFacts(row.adFacts),
      stock: int(row.stock),
      price: int(row.price),
      promoPrice: int(row.promoPrice),
      cost: int(row.cost),
      salesQty: int(row.salesQty),
      salesKnown: row.salesKnown === true,
      priorSalesQty: int(row.priorSalesQty),
      recentSalesQty: int(row.recentSalesQty),
      coverDays: int(row.coverDays),
      paceWindow:
        row.paceWindow === "recent" || row.paceWindow === "span" ? row.paceWindow : null,
      dailyPace: pace(row.dailyPace),
      sittingRub: int(row.sittingRub),
      marginPercent: num(row.marginPercent),
      marginRub: int(row.marginRub),
      marginSource: source(row.marginSource),
      ...{
        marginWindowP: int(row.marginWindowP),
        marginWindowU: num(row.marginWindowU),
        marginBeforeCostP: int(row.marginBeforeCostP),
        unitSaleNoDeliveries: row.unitSaleNoDeliveries === true,
        unitSaleD: num(row.unitSaleD),
        unitSaleR: num(row.unitSaleR),
        unitSaleDeliveryUnit: num(row.unitSaleDeliveryUnit),
        unitSaleReturnUnit: num(row.unitSaleReturnUnit),
        unitSaleB: num(row.unitSaleB),
        unitSaleNetSales90: num(row.unitSaleNetSales90),
        acceptancePerUnit: num(row.acceptancePerUnit),
        unitSaleWindowMarginPercent: num(row.unitSaleWindowMarginPercent),
        unitSaleWindowMarginRub: num(row.unitSaleWindowMarginRub),
        priorMarginPercent: num(row.priorMarginPercent),
        priorMarginWindowU: num(row.priorMarginWindowU),
        priorMarginWindowP: int(row.priorMarginWindowP),
        breakEvenPrice: int(row.breakEvenPrice),
        breakEvenImpossible: row.breakEvenImpossible === true,
        storageExcluded: row.storageExcluded === true,
        feeRateK: num(row.feeRateK),
        taxRateUsed: num(row.taxRateUsed),
        taxSpecified: row.taxSpecified === true,
        rebillRub: int(row.rebillRub),
        penRub: int(row.penRub),
        logisticsPerUnit: num(row.logisticsPerUnit),
        storagePerUnit: num(row.storagePerUnit),
        sellerRevenueS: int(row.sellerRevenueS),
      },
      contentScore: int(row.contentScore),
      contentGaps: Array.isArray(row.contentGaps)
        ? row.contentGaps
            .filter((line): line is string => typeof line === "string")
            .map((line) => clip(line, 200))
            .filter(Boolean)
            .slice(0, 40)
        : null,
      contentGap: clip(row.contentGap, 4000) || null,
      contentPeerLine: clip(row.contentPeerLine, 300) || null,
      photoCount: int(row.photoCount),
      hasVideo: row.hasVideo === true ? true : row.hasVideo === false ? false : null,
      subjectId: int(row.subjectId),
      contentGrade:
        row.contentGrade === "A" ||
        row.contentGrade === "B" ||
        row.contentGrade === "C" ||
        row.contentGrade === "D"
          ? row.contentGrade
          : null,
      contentRequiredMissing: Array.isArray(row.contentRequiredMissing)
        ? row.contentRequiredMissing
            .filter((name): name is string => typeof name === "string")
            .map((name) => clip(name, 80))
            .filter(Boolean)
            .slice(0, 40)
        : null,
      createdAt: clip(row.createdAt, 40) || null,
      paceSource: paceSource(row.paceSource),
      funnelStatus: funnelStatus(row.funnelStatus),
      orders: int(row.orders),
      priorOrders: int(row.priorOrders),
      ordersPerDay: pace(row.ordersPerDay),
      priorOrdersPerDay: pace(row.priorOrdersPerDay),
      openCount: int(row.openCount),
      priorOpenCount: int(row.priorOpenCount),
      cartCount: int(row.cartCount),
      priorCartCount: int(row.priorCartCount),
      addToCartPercent: num(row.addToCartPercent),
      priorAddToCartPercent: num(row.priorAddToCartPercent),
      cartToOrderPercent: num(row.cartToOrderPercent),
      priorCartToOrderPercent: num(row.priorCartToOrderPercent),
      avgOrderPrice: int(row.avgOrderPrice),
      orderSum: int(row.orderSum),
      priorOrderSum: int(row.priorOrderSum),
      funnelDateFrom: clip(row.funnelDateFrom, 40) || null,
      funnelDateTo: clip(row.funnelDateTo, 40) || null,
      funnelPastDateFrom: clip(row.funnelPastDateFrom, 40) || null,
      funnelPastDateTo: clip(row.funnelPastDateTo, 40) || null,
      buyoutPercentFunnelPast: num(row.buyoutPercentFunnelPast),
      pastBuyoutCount: int(row.pastBuyoutCount),
      pastOrderCount: int(row.pastOrderCount),
      buyoutPercentStocks: num(row.buyoutPercentStocks),
      stockFbo: int(row.stockFbo),
      stockFbs: int(row.stockFbs),
      stockCountReport: int(row.stockCountReport),
      fromClientCount: int(row.fromClientCount),
      toClientCount: int(row.toClientCount),
      lostOrdersCount: num(row.lostOrdersCount),
      lostOrdersSum: num(row.lostOrdersSum),
      lostBuyoutsCount: num(row.lostBuyoutsCount),
      lostBuyoutsSum: num(row.lostBuyoutsSum),
      officeMissingTime: num(row.officeMissingTime),
      officeMissingTimeSpecial: clip(row.officeMissingTimeSpecial, 40) || null,
      availability: clip(row.availability, 40) || null,
      stocksAvgOrders: num(row.stocksAvgOrders),
      stocksOrdersCount: int(row.stocksOrdersCount),
      saleRateDays: num(row.saleRateDays),
      avgStockTurnoverDays: num(row.avgStockTurnoverDays),
      retailSum: int(row.retailSum),
      daysInStock: int(row.daysInStock),
      ordersInStockDays: int(row.ordersInStockDays),
      storagePerUnitDay: pace(row.storagePerUnitDay),
      storageSource:
        row.storageSource === "paid_storage" ||
        row.storageSource === "seller_warehouse" ||
        row.storageSource === "wb_zero"
          ? row.storageSource
          : null,
      realizationStorageRub: num(row.realizationStorageRub),
      realizationLoadedAt: clip(row.realizationLoadedAt, 40) || null,
      reviewCount180: int(row.reviewCount180),
      reviewRatingAvg: pace(row.reviewRatingAvg),
      unansweredReviews: int(row.unansweredReviews),
      unansweredNegativeReviews: int(row.unansweredNegativeReviews),
      unansweredQuestionsNm: int(row.unansweredQuestionsNm),
      staleNegativeReviews: parseStaleNegatives(row.staleNegativeReviews),
      staleQuestions: parseStaleQuestions(row.staleQuestions),
      windowNegativeReviews: parseStaleNegatives(row.windowNegativeReviews),
      negativeWindowNeg: int(row.negativeWindowNeg),
      negativeWindowN: int(row.negativeWindowN),
      negativeBaseNeg: int(row.negativeBaseNeg),
      negativeBaseN: int(row.negativeBaseN),
    });
  }
  return {
    marketplaceId: raw.marketplaceId,
    products: [...byNm.values()],
    store: {
      unansweredFeedbacks: int(storeRaw.unansweredFeedbacks),
      unansweredQuestions: int(storeRaw.unansweredQuestions),
      feedbacksStatus:
        storeRaw.feedbacksStatus === "ok" ||
        storeRaw.feedbacksStatus === "partial" ||
        storeRaw.feedbacksStatus === "rate_limited" ||
        storeRaw.feedbacksStatus === "forbidden" ||
        storeRaw.feedbacksStatus === "error" ||
        storeRaw.feedbacksStatus === "not_loaded"
          ? storeRaw.feedbacksStatus
          : null,
      unansweredPositiveCount: int(storeRaw.unansweredPositiveCount),
      unansweredPositiveProductCount: int(storeRaw.unansweredPositiveProductCount),
      adsReady: storeRaw.adsReady === true,
    },
  };
}
