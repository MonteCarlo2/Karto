import { salesWindowShift } from "@/lib/seller-hub/event-engine/compare";
import { productUnitEconomics, productWindowEconomics } from "@/lib/seller-hub/product-economics";
import {
  productUnitSaleEconomics,
  productUnitSaleEconomicsForWindow,
} from "@/lib/seller-hub/product-unit-sale";
import {
  contentScore,
  sittingRub,
  stockCoverDays,
  stockPace,
  supplyPace,
} from "@/lib/seller-hub/product-signal";
import type { SellerFeedbackNmStats } from "@/lib/seller-hub/feedbacks/types";
import type { SellerCatalogItem, SellerCatalogSnapshot, SellerFunnelNm } from "@/lib/seller-hub/types";
import { adFactsForNm, adsFullyRead, buildAdsFactsContext } from "./ads";
import { promoOffersForItem } from "./promo";
import type { StoreTaskFacts, TaskFact, TaskFunnelStatus, TaskPaceSource } from "./types";

export type TaskFactsOptions = {
  taxRatePercent?: number | null;
};

function money(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value);
}

function photoCount(item: SellerCatalogItem): number {
  if (item.imageUrls && item.imageUrls.length > 0) return item.imageUrls.length;
  return item.imageUrl ? 1 : 0;
}

function attachContentPeerLines(products: TaskFact[]): void {
  const peersBySubject = new Map<number, TaskFact[]>();
  for (const product of products) {
    if (product.subjectId == null || product.subjectId <= 0) continue;
    if ((product.salesQty ?? 0) <= 0) continue;
    const list = peersBySubject.get(product.subjectId) ?? [];
    list.push(product);
    peersBySubject.set(product.subjectId, list);
  }
  for (const product of products) {
    if (product.subjectId == null || product.subjectId <= 0) {
      product.contentPeerLine = null;
      continue;
    }
    const peers = peersBySubject.get(product.subjectId);
    if (!peers || peers.length === 0) {
      product.contentPeerLine = null;
      continue;
    }
    const avgPhotos = Math.round(
      peers.reduce((sum, row) => sum + (row.photoCount ?? 0), 0) / peers.length,
    );
    const withVideo = peers.filter((row) => row.hasVideo).length;
    product.contentPeerLine = `у ваших товаров этой категории с продажами за 28 дней в среднем ${avgPhotos} фото, видео у ${withVideo} из ${peers.length}`;
  }
}

function snapshotFunnelStatus(snapshot: SellerCatalogSnapshot): TaskFunnelStatus {
  const funnel = snapshot.funnel;
  if (!funnel) return "not_loaded";
  if (funnel.status) return funnel.status;
  if (funnel.error) return "error";
  if (funnel.truncated) return "partial";
  return "ok";
}

/** Строка воронки есть и годна для сравнения заказов 28/28. */
export function funnelRowUsable(row: SellerFunnelNm | null | undefined): boolean {
  return Boolean(row && row.priorOrders != null);
}

function productFunnelStatus(
  snapshotStatus: TaskFunnelStatus,
  row: SellerFunnelNm | undefined,
  truncated: boolean | undefined,
): TaskFunnelStatus {
  if (snapshotStatus === "not_loaded") return "not_loaded";
  /** Сохранённые строки после сбоя загрузки всё ещё годны для сравнения. */
  if (row && funnelRowUsable(row)) return "ok";
  if (snapshotStatus === "jam_required" || snapshotStatus === "rate_limited" || snapshotStatus === "forbidden") {
    return snapshotStatus;
  }
  if (snapshotStatus === "error") return "error";
  if (truncated && !row) return "missing";
  if (row && row.priorOrders == null) return "partial";
  if (!row) return "missing";
  return "ok";
}

function paceSourceOf(
  source: ReturnType<typeof supplyPace>["source"],
): TaskPaceSource | null {
  if (source === "orders" || source === "sales-recent" || source === "sales-span") return source;
  return null;
}

export function taskFactsFromSnapshot(
  snapshot: SellerCatalogSnapshot,
  options: TaskFactsOptions = {},
): {
  products: TaskFact[];
  store: StoreTaskFacts;
} {
  const reportReady = Boolean(snapshot.realization && !snapshot.realization.error);
  const realization = reportReady ? snapshot.realization ?? null : null;
  /** byNm сохраняем даже при новой ошибке загрузки — нули вместо старых цифр не подставляем. */
  const funnel = snapshot.funnel;
  const funnelSnapshotStatus = snapshotFunnelStatus(snapshot);
  const taxRatePercent = options.taxRatePercent ?? null;
  const products: TaskFact[] = [];
  const adsContext = buildAdsFactsContext(snapshot);
  for (const item of snapshot.items) {
    const nmId = item.externalId?.trim();
    if (!nmId) continue;
    const own = realization?.byNm[nmId];
    const salesKnown = reportReady && (own != null || realization?.truncated !== true);
    const stock = item.totalStock == null ? null : Math.round(item.totalStock);
    const cost = item.costPrice == null ? null : item.costPrice;
    const promoPrice = money(item.discountedPrice);
    const funnelRow = funnel?.byNm[nmId];
    const funnelStatus = productFunnelStatus(
      funnelSnapshotStatus,
      funnelRow,
      funnel?.truncated,
    );
    const ordersPerDayForPace =
      funnelRow && funnelRow.ordersPerDay > 0 ? funnelRow.ordersPerDay : null;
    const paceOwn = reportReady ? own : undefined;
    const pace = supplyPace({
      stock,
      ordersPerDay: ordersPerDayForPace,
      realization: own,
      reportReady,
    });
    const paceSource = paceSourceOf(pace.source);
    const coverFromRealization = stockCoverDays(stock, paceOwn);
    const paceInfo = stockPace(stock, paceOwn);
    const coverDays =
      paceSource === "orders" && pace.days != null ? pace.days : coverFromRealization;
    const paceWindow =
      paceSource === "orders"
        ? ("span" as const)
        : coverDays != null && (paceInfo.window === "recent" || paceInfo.window === "span")
          ? paceInfo.window
          : null;
    const windowBase = productWindowEconomics({
      realization,
      paidStorage: snapshot.paidStorage,
      nmId,
      stockFbo: item.stockFbo,
      which: "current",
    });
    /** Факт окна 28д (промпт 13) — только рубли, не главный %. */
    const econ = productUnitEconomics({
      realization,
      paidStorage: snapshot.paidStorage,
      nmId,
      costPerUnit: cost,
      taxRatePercent,
      currentPrice: promoPrice,
      stockFbo: item.stockFbo,
      which: "current",
    });
    /** Главный показатель: маржа на 1 продажу по доставкам 90д. */
    const unitSale = productUnitSaleEconomics({
      realization,
      paidStorage: snapshot.paidStorage,
      nmId,
      costPerUnit: cost,
      taxRatePercent,
      currentPrice: promoPrice,
      stockFbo: item.stockFbo,
    });
    const windowUnitSale = productUnitSaleEconomicsForWindow({
      realization,
      paidStorage: snapshot.paidStorage,
      nmId,
      which: "current",
      costPerUnit: cost,
      taxRatePercent,
      currentPrice: promoPrice,
      stockFbo: item.stockFbo,
    });
    const priorUnitSale = productUnitSaleEconomicsForWindow({
      realization,
      paidStorage: snapshot.paidStorage,
      nmId,
      which: "prior",
      costPerUnit: cost,
      taxRatePercent,
      currentPrice: promoPrice,
      stockFbo: item.stockFbo,
    });
    const w = windowBase?.window;
    const marginPercent =
      unitSale?.m != null ? Math.round(unitSale.m * 1000) / 10 : null;
    const marginRub =
      unitSale?.u != null ? Math.round(unitSale.u * 100) / 100 : null;
    const windowMarginPercent =
      windowUnitSale?.m != null ? Math.round(windowUnitSale.m * 1000) / 10 : null;
    const windowMarginRub =
      windowUnitSale?.u != null ? Math.round(windowUnitSale.u * 100) / 100 : null;
    const priorMarginPercent =
      priorUnitSale?.m != null ? Math.round(priorUnitSale.m * 1000) / 10 : null;
    const card = contentScore({
      photos: photoCount(item),
      hasVideo: Boolean(item.videoUrl),
      description: item.description ?? null,
      characteristicNames: item.characteristicNames ?? null,
      categoryCharcNames: item.categoryCharcNames ?? null,
      categoryCharcRequiredNames: item.categoryCharcRequiredNames ?? null,
      dimensions: item.dimensions ?? null,
    });
    const capital =
      reportReady && cost != null && cost > 0 ? sittingRub(item, realization) : null;
    const selected = funnelRow?.selected;
    const past = funnelRow?.past;
    const stocksRow = snapshot.stocksReport?.byNm[nmId];
    products.push({
      nmId,
      itemId: item.id,
      title: item.title || item.vendorCode || nmId,
      vendorCode: item.vendorCode,
      promoOffers: promoOffersForItem(snapshot, item),
      adFacts: adsContext ? adFactsForNm(adsContext, nmId) : undefined,
      stock,
      price: money(item.price),
      promoPrice,
      cost: cost == null ? null : Math.round(cost),
      salesQty: reportReady ? (own?.qty ?? 0) : null,
      salesKnown,
      priorSalesQty: reportReady ? (own?.priorQty ?? null) : null,
      recentSalesQty: reportReady ? (own?.recentQty ?? null) : null,
      coverDays,
      paceWindow,
      dailyPace: pace.daily,
      sittingRub: capital,
      marginPercent,
      marginRub,
      marginSource: unitSale != null ? ("sku" as const) : null,
      marginWindowP: econ ? Math.round(econ.P) : null,
      marginWindowU: econ ? Math.round(econ.u * 100) / 100 : null,
      marginBeforeCostP:
        unitSale != null
          ? Math.round(unitSale.uBeforeCost)
          : windowBase != null
            ? Math.round(windowBase.beforeCostP)
            : null,
      priorMarginPercent,
      priorMarginWindowU:
        priorUnitSale?.u != null ? Math.round(priorUnitSale.u * 100) / 100 : null,
      priorMarginWindowP: null,
      breakEvenPrice: unitSale?.breakEvenPrice ?? null,
      breakEvenImpossible: unitSale?.breakEvenImpossible ?? false,
      storageExcluded: unitSale?.storageExcluded ?? false,
      feeRateK: unitSale != null ? Math.round(unitSale.k * 1000) / 1000 : null,
      taxRateUsed:
        unitSale?.taxSpecified && taxRatePercent != null
          ? Math.max(0, Math.min(100, taxRatePercent)) / 100
          : null,
      taxSpecified: unitSale?.taxSpecified ?? false,
      rebillRub: w ? Math.round(w.rebill) : null,
      penRub: w ? Math.round(w.Pen) : null,
      logisticsPerUnit: unitSale != null ? Math.round(unitSale.l * 100) / 100 : null,
      storagePerUnit:
        unitSale?.s != null ? Math.round(unitSale.s * 100) / 100 : null,
      sellerRevenueS: realization?.delivery90?.[nmId]
        ? Math.round(realization.delivery90[nmId]!.S)
        : w
          ? Math.round(w.S)
          : null,
      unitSaleNoDeliveries: Boolean(
        reportReady &&
          realization?.shopDelivery90 &&
          promoPrice != null &&
          promoPrice > 0 &&
          unitSale == null,
      ),
      unitSaleD: unitSale?.D ?? realization?.delivery90?.[nmId]?.D ?? null,
      unitSaleR: unitSale?.R ?? realization?.delivery90?.[nmId]?.R ?? null,
      unitSaleDeliveryUnit: unitSale != null ? Math.round(unitSale.d * 100) / 100 : null,
      unitSaleReturnUnit: unitSale != null ? Math.round(unitSale.r * 100) / 100 : null,
      unitSaleB: unitSale != null ? Math.round(unitSale.b * 10000) / 10000 : null,
      unitSaleNetSales90: realization?.delivery90?.[nmId]?.netSalesQty ?? null,
      acceptancePerUnit: unitSale != null ? Math.round(unitSale.a * 100) / 100 : null,
      unitSaleWindowMarginPercent: windowMarginPercent,
      unitSaleWindowMarginRub: windowMarginRub,
      contentScore: Number.isFinite(card.score) ? Math.round(card.score) : null,
      contentGaps: card.gapLines,
      contentGap: card.gapLines.length > 0 ? card.gapLines.join("\n") : null,
      contentPeerLine: null,
      photoCount: photoCount(item),
      hasVideo: Boolean(item.videoUrl),
      subjectId: item.subjectId ?? null,
      contentParts: card.parts,
      contentSlots: card.slots,
      contentGrade: card.grade,
      contentRequiredMissing: card.requiredMissing,
      createdAt: item.createdAt ?? null,
      paceSource,
      funnelStatus,
      orders: funnelRow ? funnelRow.orders : null,
      priorOrders: funnelRow ? funnelRow.priorOrders : null,
      ordersPerDay: funnelRow ? funnelRow.ordersPerDay : null,
      priorOrdersPerDay: past?.avgOrdersCountPerDay ?? null,
      openCount: selected?.openCount ?? null,
      priorOpenCount: past?.openCount ?? null,
      cartCount: selected?.cartCount ?? null,
      priorCartCount: past?.cartCount ?? null,
      addToCartPercent: selected?.addToCartPercent ?? null,
      priorAddToCartPercent: past?.addToCartPercent ?? null,
      cartToOrderPercent: selected?.cartToOrderPercent ?? null,
      priorCartToOrderPercent: past?.cartToOrderPercent ?? null,
      avgOrderPrice: selected?.avgPrice ?? null,
      orderSum: selected?.orderSum ?? null,
      priorOrderSum: past?.orderSum ?? null,
      funnelDateFrom: funnel?.dateFrom ?? null,
      funnelDateTo: funnel?.dateTo ?? null,
      funnelPastDateFrom: funnel?.pastDateFrom ?? null,
      funnelPastDateTo: funnel?.pastDateTo ?? null,
      buyoutPercentFunnelPast: past?.buyoutPercent ?? null,
      pastBuyoutCount: past?.buyoutCount ?? null,
      pastOrderCount: past?.orderCount ?? (funnelRow ? funnelRow.priorOrders : null),
      buyoutPercentStocks: stocksRow?.buyoutPercent ?? null,
      stockFbo: item.stockFbo ?? null,
      stockFbs: item.stockFbs ?? null,
      stockCountReport: stocksRow?.stockCount ?? null,
      fromClientCount: stocksRow?.fromClientCount ?? null,
      toClientCount: stocksRow?.toClientCount ?? null,
      lostOrdersCount: stocksRow?.lostOrdersCount ?? null,
      lostOrdersSum: stocksRow?.lostOrdersSum ?? null,
      lostBuyoutsCount: stocksRow?.lostBuyoutsCount ?? null,
      lostBuyoutsSum: stocksRow?.lostBuyoutsSum ?? null,
      officeMissingTime: stocksRow?.officeMissingTimeDays ?? null,
      officeMissingTimeSpecial: stocksRow?.officeMissingTimeSpecial ?? null,
      availability: stocksRow?.availability ?? null,
      stocksAvgOrders: stocksRow?.avgOrders ?? null,
      stocksOrdersCount: stocksRow?.ordersCount ?? null,
      saleRateDays: stocksRow?.saleRateDays ?? null,
      avgStockTurnoverDays: stocksRow?.avgStockTurnoverDays ?? null,
      retailSum: reportReady ? (own?.retail ?? null) : null,
      /** officeMissingTime неоднозначен по складам → дни наличия не считаем. */
      daysInStock: null,
      ordersInStockDays: null,
      storagePerUnitDay: snapshot.paidStorage?.byNm[nmId]?.storagePerUnitDay ?? null,
      storageSource: snapshot.paidStorage?.byNm[nmId]?.storagePerUnitDay != null ? "paid_storage" : null,
      realizationStorageRub: reportReady ? (own?.storage ?? null) : null,
      realizationLoadedAt: snapshot.realization?.loadedAt ?? null,
      ...feedbackFactFields(snapshot.feedbacks?.byNm[nmId]),
    });
  }
  attachContentPeerLines(products);
  const fb = snapshot.feedbacks;
  return {
    products,
    store: {
      unansweredFeedbacks: snapshot.comms?.unansweredFeedbacks ?? null,
      unansweredQuestions: snapshot.comms?.unansweredQuestions ?? null,
      feedbacksStatus: fb?.status ?? "not_loaded",
      unansweredPositiveCount: fb?.unansweredPositiveCount ?? null,
      unansweredPositiveProductCount: fb?.unansweredPositiveProductCount ?? null,
      adsReady: adsFullyRead(snapshot),
    },
  };
}

function feedbackFactFields(row: SellerFeedbackNmStats | undefined) {
  if (!row) {
    return {
      reviewCount180: null as number | null,
      reviewRatingAvg: null as number | null,
      unansweredReviews: null as number | null,
      unansweredNegativeReviews: null as number | null,
      unansweredQuestionsNm: null as number | null,
      staleNegativeReviews: null as TaskFact["staleNegativeReviews"],
      staleQuestions: null as TaskFact["staleQuestions"],
      windowNegativeReviews: null as TaskFact["windowNegativeReviews"],
      negativeWindowNeg: null as number | null,
      negativeWindowN: null as number | null,
      negativeBaseNeg: null as number | null,
      negativeBaseN: null as number | null,
    };
  }
  const mapNeg = (r: {
    id: string;
    createdAt: string;
    rating: number;
    text: string;
    pros: string;
    cons: string;
    countsOnCard?: boolean;
  }) => ({
    id: r.id,
    createdAt: r.createdAt,
    rating: r.rating,
    preview: previewFromParts(r),
    countsOnCard: r.countsOnCard !== false,
  });
  const mapQ = (r: { id: string; createdAt: string; text: string }) => ({
    id: r.id,
    createdAt: r.createdAt,
    preview: (r.text.trim() || "Без текста").slice(0, 200),
  });
  return {
    reviewCount180: row.reviewCount180,
    reviewRatingAvg: row.ratingAvg,
    unansweredReviews: row.unansweredTotal,
    unansweredNegativeReviews: row.unansweredNegative,
    unansweredQuestionsNm: row.unansweredQuestions,
    staleNegativeReviews: row.staleNegatives.map(mapNeg),
    staleQuestions: row.staleQuestions.map(mapQ),
    windowNegativeReviews: row.windowNegatives.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      rating: r.rating,
      preview: previewFromParts(r),
    })),
    negativeWindowNeg: row.windowNeg,
    negativeWindowN: row.windowN,
    negativeBaseNeg: row.baseNeg,
    negativeBaseN: row.baseN,
  };
}

function previewFromParts(row: { text: string; pros: string; cons: string }): string {
  const chunks = [row.text, row.pros ? `Плюсы: ${row.pros}` : "", row.cons ? `Минусы: ${row.cons}` : ""]
    .map((s) => s.trim())
    .filter(Boolean);
  const joined = chunks.join(" ").trim() || "Без текста";
  return joined.length > 200 ? `${joined.slice(0, 200)}…` : joined;
}

export function ageDays(createdAt: string | null, now: string): number | null {
  if (!createdAt) return null;
  const created = Date.parse(createdAt);
  const at = Date.parse(now);
  if (!Number.isFinite(created) || !Number.isFinite(at)) return null;
  return Math.floor((at - created) / 86_400_000);
}

export function salesShiftForThreshold(
  qty: number,
  prior: number,
  percent: number,
  minUnits: number,
): "up" | "down" | null {
  return salesWindowShift(qty, prior, {
    salesChangeMinUnits: minUnits,
    salesChangeRatio: percent / 100,
  });
}

/** Относительное изменение в процентах: (current - prior) / prior * 100. prior ≤ 0 → null. */
export function relativeChangePercent(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null || !(prior > 0)) return null;
  return Math.round(((current - prior) / prior) * 1000) / 10;
}

export function paceSourceLabel(source: TaskPaceSource | null): string | null {
  if (source === "orders") return "заказы, воронка WB";
  if (source === "sales-recent" || source === "sales-span") return "выкупы, отчёт реализации";
  return null;
}
