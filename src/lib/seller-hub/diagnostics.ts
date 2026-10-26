/**
 * Выгрузка диагностики Seller Hub (только NODE_ENV !== production в UI).
 * Без токенов, ключей и ПДн покупателей.
 */

import { contentScore } from "./product-signal";
import { productUnitEconomics, windowOf } from "./product-economics";
import { productUnitSaleEconomics } from "./product-unit-sale";
import { DEFAULT_TASK_THRESHOLDS } from "./task-engine/config";
import { ageDays, taskFactsFromSnapshot } from "./task-engine/facts";
import { buildStoreMoneyContext } from "./task-engine/severity";
import {
  availableStock,
  buildShopBuyoutContext,
  coverDaysFromBurn,
  dailyDemand,
  resolveNetBurnPerDay,
  resolveStorageMoneyAtRisk,
  smoothProductBuyout,
} from "./task-engine/stock-math";
import type { SellerTask, TaskFact } from "./task-engine/types";
import type { SellerCatalogSnapshot, SellerRealizationReconcile } from "./types";
import type { SellerProductEvent } from "./event-engine/types";
import { resolveStorage } from "./unit-economics";
import type { BankPaymentMonthReport } from "../services/wildberries/realization-margin";
import { aggregateRealizationCalendarMonth } from "../services/wildberries/realization-margin";

const PRESENCE_WINDOW_DAYS = 56;

/** Денежные и служебные поля строки реализации без ПДн и без srid. */
export const RAW_REALIZATION_SAMPLE_KEYS = [
  "nmId",
  "quantity",
  "retailPrice",
  "retailPriceWithDisc",
  "retailAmount",
  "salePercent",
  "commissionPercent",
  "forPay",
  "ppvzSalesCommission",
  "acquiringFee",
  "acquiringPercent",
  "deliveryService",
  "deliveryAmount",
  "returnAmount",
  "rebillLogisticCost",
  "paidStorage",
  "paidAcceptance",
  "penalty",
  "deduction",
  "additionalPayment",
  "ppvzReward",
  "cashbackAmount",
  "cashbackDiscount",
  "cashbackCommissionChange",
  "spp",
  "kvw",
  "kvwBase",
  "productDiscountForReport",
  "installmentCofinancingAmount",
  "docTypeName",
  "sellerOperName",
  "rrDate",
  "saleDt",
  "reportId",
  "dateFrom",
  "dateTo",
  "window",
] as const;

export type RawRealizationSampleRole = "top_sold" | "with_returns" | "wb_stock";

export type RawRealizationSample = {
  windows: { currentFrom: string; currentTo: string; priorFrom: string; priorTo: string };
  picked: Array<{ nmId: string; role: RawRealizationSampleRole; reason: string }>;
  rows: Array<Record<string, unknown>>;
};

/** Сверка календарного месяца (шаг 9): строки реализации + bankPaymentSum списка отчётов. */
export type MonthReconcileProductRow = {
  nmId: string;
  title: string | null;
  vendorCode: string | null;
  N: number;
  Pay: number;
  L: number;
  St: number;
  A: number;
  Pen: number;
  /** Себестоимость за 1 шт.; null — не задана. */
  cost: number | null;
  /** N × cost; 0 если cost нет. */
  costTotal: number;
  /** P = Pay − L − St − A − cost×N (штрафы не входят). null без себестоимости. */
  P: number | null;
};

export type MonthPenBreakdownRow = {
  sellerOperName: string;
  bonusTypeName: string | null;
  penalty: number;
  deduction: number;
  additionalPayment: number;
  /** penalty + deduction − additionalPayment */
  pen: number;
  rows: number;
};

export type MonthReconcileDiagnostics = {
  month: string;
  dateFrom: string;
  dateTo: string;
  rowCount: number;
  sumPay: number;
  sumL: number;
  sumSt: number;
  sumA: number;
  sumPen: number;
  sumRebill: number;
  /** Pay − L − St − A − Pen (rebill не входит) = «Итого к оплате» из строк. */
  computed: number;
  bankPaymentSum: number | null;
  bankReports: BankPaymentMonthReport[];
  delta: number | null;
  ok: boolean | null;
  bankError: string | null;
  /** Σ (N × себестоимость) по товарам с себестоимостью и N>0 за месяц. */
  costSum: number;
  /** Σ P по товарам с себестоимостью. */
  sumP: number;
  /** Проверка: Σ P − Σ Pen ?= computed − costSum. */
  identityOk: boolean | null;
  identityLeft: number | null;
  identityRight: number | null;
  products: MonthReconcileProductRow[];
  penBreakdown: MonthPenBreakdownRow[];
  missingCost: Array<{
    nmId: string;
    N: number;
    title: string | null;
    vendorCode: string | null;
  }>;
};

export type SellerHubDiagnostics = {
  meta: {
    exportedAt: string;
    funnel: { status: string | null; loadedAt: string | null; dateFrom: string | null; dateTo: string | null; error: string | null };
    stocksReport: { status: string | null; loadedAt: string | null; dateFrom: string | null; dateTo: string | null; error: string | null };
    paidStorage: {
      status: string | null;
      loadedAt: string | null;
      dateFrom: string | null;
      dateTo: string | null;
      error: string | null;
      nmCount: number;
      lastOkDateFrom: string | null;
      lastOkDateTo: string | null;
      lastOkLoadedAt: string | null;
      pendingChunks: number;
    };
    realization: {
      loadedAt: string | null;
      dateFrom: string | null;
      dateTo: string | null;
      error: string | null;
      version: number | null;
      reconcile: SellerRealizationReconcile | null;
    };
    /** Сверка за календарный месяц (по умолчанию сентябрь текущего среза). */
    monthReconcile: MonthReconcileDiagnostics | null;
    taxRatePercent: number | null;
    targetMarginPercent: number | null;
    turnoverRub: number | null;
    turnoverSource: "funnel_orderSum" | "realization_retail" | null;
    /** Валовая прибыль 28д (Σ u×N при себестоимости) — база важности, если useGrossProfit. */
    grossProfitRub: number | null;
    useGrossProfit: boolean;
    bShop: number | null;
    bShopSource: "funnel_past" | "realization" | null;
    thresholds: typeof DEFAULT_TASK_THRESHOLDS;
  };
  products: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  /** Сырые строки реализации по 3 nmId (оба окна). null — строк в прогоне не было. */
  rawRealizationSample: RawRealizationSample | null;
};

function onHandStock(fact: TaskFact): number | null {
  if (fact.stockCountReport != null) return fact.stockCountReport;
  return fact.stock;
}

/** Как §3.4 / rules.stockOutInPresenceWindow: только stock_out с читаемой датой в окне. */
function stockOutInWindow(
  events: SellerProductEvent[],
  nmId: string,
  now: string,
  windowDays = PRESENCE_WINDOW_DAYS,
): boolean {
  const at = Date.parse(now);
  if (!Number.isFinite(at)) return false;
  const from = at - windowDays * 86_400_000;
  return events.some((event) => {
    if (event.nmId !== nmId || event.kind !== "stock_out") return false;
    if (!event.createdAt) return false;
    const created = Date.parse(event.createdAt);
    if (!Number.isFinite(created)) return false;
    return created >= from && created <= at;
  });
}

/**
 * Слагаемые шага 9: N,S,RA,Pay,L,St,A,Pen,rebill,k всегда при продажах;
 * P и u — только при себестоимости.
 */
function marginBlockForProduct(
  fact: TaskFact,
  snapshot: SellerCatalogSnapshot,
): Record<string, unknown> {
  const own = snapshot.realization?.byNm[fact.nmId];
  const w = windowOf(own, "current");
  const hasSales = w.N > 0 || (fact.salesQty != null && fact.salesQty > 0);
  if (!hasSales) {
    return {
      N: fact.salesQty,
      S: fact.sellerRevenueS,
      m: fact.marginPercent,
      u: fact.marginWindowU,
      P: fact.marginWindowP,
      k: fact.feeRateK,
      cost: fact.cost,
    };
  }

  const paid = snapshot.paidStorage;
  const paidLoaded =
    Boolean(paid) &&
    (paid?.version ?? 0) >= 1 &&
    ((paid?.status === "ok" || paid?.status === "pending" || paid?.status === "partial") &&
      Object.keys(paid.byNm).length > 0);
  const paidRub =
    paid?.byNm[fact.nmId]?.currentWindowRub ??
    (paidLoaded && paid?.byNm[fact.nmId] == null ? 0 : paid?.byNm[fact.nmId]?.totalStorageRub ?? null);
  const storage = resolveStorage({
    stRealization: w.StRealization,
    paidStorageRub: paidRub,
    paidStorageLoaded: paidLoaded,
    onWbWarehouse: (fact.stockFbo ?? 0) > 0,
  });

  const N = w.N > 0 ? w.N : (fact.salesQty ?? 0);
  const S = w.S;
  const RA = w.RA;
  const Pay = w.Pay;
  const L = w.L;
  const St = storage.St;
  const A = w.A;
  const Pen = w.Pen;
  const rebill = w.rebill;
  const k = S > 0 ? Math.round(((S - Pay) / S) * 1000) / 1000 : null;

  const econ = productUnitEconomics({
    realization: snapshot.realization,
    paidStorage: snapshot.paidStorage,
    nmId: fact.nmId,
    costPerUnit: fact.cost,
    taxRatePercent: null,
    currentPrice: fact.promoPrice,
    stockFbo: fact.stockFbo,
    which: "current",
  });

  const unitSale = productUnitSaleEconomics({
    realization: snapshot.realization,
    paidStorage: snapshot.paidStorage,
    nmId: fact.nmId,
    costPerUnit: fact.cost,
    taxRatePercent: null,
    currentPrice: fact.promoPrice,
    stockFbo: fact.stockFbo,
  });
  const d90 = snapshot.realization?.delivery90?.[fact.nmId];
  const unit = unitSale
    ? {
        D: unitSale.D,
        R: unitSale.R,
        d: round2(unitSale.d),
        r: round2(unitSale.r),
        otherL: d90 ? round2(d90.otherL) : null,
        otherPerSale: round2(unitSale.otherPerSale),
        b: round4(unitSale.b),
        l: round2(unitSale.l),
        p: unitSale.p,
        k: round4(unitSale.k),
        a: round2(unitSale.a),
        s: unitSale.s == null ? null : round2(unitSale.s),
        c: unitSale.c,
        u: unitSale.u == null ? null : round2(unitSale.u),
        m: unitSale.m == null ? null : round4(unitSale.m),
        breakEvenPrice: unitSale.breakEvenPrice,
        storageExcluded: unitSale.storageExcluded,
        sources: {
          D: d90 ? "delivery90.D" : null,
          R: d90 ? "delivery90.R" : null,
          d: d90 ? "deliveryCost/D" : null,
          r: d90 && d90.R > 0 ? "returnCost/R" : "shop.rShop",
          otherL: d90 ? "delivery90.otherL" : null,
          b: "fisher(D−R, shop.bShop)",
          l: "d/b + r·(1−b)/b + otherPerSale",
          p: "promoPrice",
          k: "(S−Pay)/S за 90д доставок",
          a: "A/(D−R)",
          s: unitSale.storageExcluded
            ? null
            : (fact.stockFbo ?? 0) > 0
              ? "paid_storage / (D−R)"
              : "fbs_zero",
          c: fact.cost != null && fact.cost > 0 ? "seller_cost" : null,
          u: "p·(1−k)−l−s−a−c",
          m: "u/p",
          breakEvenPrice: "ceil((l+s+a+c)/(1−k))",
        },
        nullReasons: {
          s: unitSale.storageExcluded
            ? "paid_storage не готов или нет строк по nm на складе WB"
            : null,
          c: !(fact.cost != null && fact.cost > 0) ? "себестоимость не задана" : null,
          u: unitSale.u == null ? "нет себестоимости — u до c в uBeforeCost" : null,
          m: unitSale.m == null ? "нет себестоимости" : null,
          breakEvenPrice: unitSale.breakEvenImpossible
            ? "1−k ≤ 0"
            : unitSale.breakEvenPrice == null
              ? "нет себестоимости"
              : null,
        },
        uBeforeCost: round2(unitSale.uBeforeCost),
        mBeforeCost: round4(unitSale.mBeforeCost),
      }
    : {
        D: null,
        R: null,
        d: null,
        r: null,
        otherL: null,
        otherPerSale: null,
        b: null,
        l: null,
        p: fact.promoPrice,
        k: null,
        a: null,
        s: null,
        c: fact.cost,
        u: null,
        m: null,
        breakEvenPrice: null,
        storageExcluded: null,
        sources: null,
        nullReasons: {
          unit: d90 == null || !(d90.D > 0)
            ? "нет доставок за 90д (delivery90)"
            : fact.promoPrice == null || !(fact.promoPrice > 0)
              ? "нет текущей цены"
              : "не удалось посчитать unit-sale",
        },
      };

  return {
    N,
    S: Math.round(S * 100) / 100,
    RA: Math.round(RA * 100) / 100,
    Pay: Math.round(Pay * 100) / 100,
    L: Math.round(L * 100) / 100,
    St: St == null ? null : Math.round(St * 100) / 100,
    StSource: storage.source,
    A: Math.round(A * 100) / 100,
    Pen: Math.round(Pen * 100) / 100,
    rebill: Math.round(rebill * 100) / 100,
    k,
    P: econ ? Math.round(econ.P * 100) / 100 : null,
    u: econ ? Math.round(econ.u * 100) / 100 : null,
    m: econ ? Math.round(econ.m * 1000) / 10 : fact.marginPercent,
    m1: fact.priorMarginPercent,
    u1: fact.priorMarginWindowU,
    P1: fact.priorMarginWindowP,
    F_breakEven: fact.breakEvenPrice,
    uNow: fact.marginRub,
    currentPrice: fact.promoPrice,
    logisticsPerUnit: N > 0 ? Math.round((L / N) * 100) / 100 : null,
    storagePerUnit: N > 0 && St != null ? Math.round((St / N) * 100) / 100 : null,
    storageExcluded: storage.St == null,
    taxSpecified: false,
    cost: fact.cost,
    hasCost: fact.cost != null && fact.cost > 0,
    unit,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function productRow(
  fact: TaskFact,
  events: SellerProductEvent[],
  now: string,
  hadStockOutAt: boolean,
  bShop: number | null,
  snapshot: SellerCatalogSnapshot,
): Record<string, unknown> {
  const pastOrders = fact.pastOrderCount ?? fact.priorOrders;
  const pastBuyouts =
    fact.pastBuyoutCount ?? (pastOrders === 0 ? 0 : null);
  const buyout = smoothProductBuyout({
    pastOrders,
    pastBuyouts,
    bShop,
  });
  const demand = dailyDemand({
    orders28: fact.orders,
    priorOrders28: fact.priorOrders,
    daysInStock: fact.daysInStock,
    ordersInStockDays: fact.ordersInStockDays,
    hadStockOutInWindow: hadStockOutAt,
    pastOrdersPerDay: fact.priorOrdersPerDay,
  });
  const realizationBuyoutsPerDay =
    buyout.percent == null && fact.salesKnown && fact.salesQty != null && fact.salesQty >= 0
      ? fact.salesQty / 28
      : null;
  const burn = resolveNetBurnPerDay({
    demandPerDay: demand.demandPerDay,
    buyoutPercent: buyout.percent,
    realizationBuyoutsPerDay,
  });
  const stock = availableStock({
    stock: onHandStock(fact),
    fromClientCount: fact.fromClientCount,
    toClientCount: fact.toClientCount,
    buyoutPercent: buyout.percent,
  });
  const coverDays = coverDaysFromBurn(stock.available, burn.burn);
  const storage = resolveStorageMoneyAtRisk({
    excessOrStockUnits: onHandStock(fact) ?? 0,
    storagePerUnitDay: fact.storagePerUnitDay,
    stockFbo: fact.stockFbo,
    stockFbs: fact.stockFbs,
  });
  return {
    nmId: fact.nmId,
    title: fact.title,
    vendorCode: fact.vendorCode,
    price: fact.price,
    promoPrice: fact.promoPrice,
    cost: fact.cost,
    stock: fact.stock,
    stockFbo: fact.stockFbo,
    stockFbs: fact.stockFbs,
    stockCountReport: fact.stockCountReport,
    fromClientCount: fact.fromClientCount,
    toClientCount: fact.toClientCount,
    orders28: fact.orders,
    priorOrders28: fact.priorOrders,
    pastBuyoutCount: fact.pastBuyoutCount,
    pastOrderCount: fact.pastOrderCount,
    openCount: fact.openCount,
    priorOpenCount: fact.priorOpenCount,
    cartCount: fact.cartCount,
    priorCartCount: fact.priorCartCount,
    buyoutPercent: buyout.percent,
    buyoutSource: buyout.source,
    demandPerDay: demand.demandPerDay,
    demandBasis: demand.basis,
    netBurnPerDay: burn.burn,
    netBurnBasis: burn.basis,
    availableStock: stock.available,
    coverDaysBurn: coverDays,
    storagePerUnitDay: storage.effectiveRate ?? fact.storagePerUnitDay,
    storageSource: storage.storageSource ?? fact.storageSource,
    storageBasis: storage.basis,
    realizationStorageRub: fact.realizationStorageRub,
    realizationLoadedAt: fact.realizationLoadedAt,
    ageDays: ageDays(fact.createdAt, now),
    createdAt: fact.createdAt,
    availability: fact.availability,
    funnelStatus: fact.funnelStatus,
    stockOutIn56d: stockOutInWindow(events, fact.nmId, now),
    salesQty: fact.salesQty,
    salesKnown: fact.salesKnown,
    orderSum: fact.orderSum,
    retailSum: fact.retailSum,
    margin: marginBlockForProduct(fact, snapshot),
    content: contentBlockForProduct(fact, snapshot),
  };
}

function contentBlockForProduct(
  fact: TaskFact,
  snapshot: SellerCatalogSnapshot,
): Record<string, unknown> | null {
  const item = snapshot.items.find((row) => row.externalId === fact.nmId);
  if (item) {
    const photos = item.imageUrls?.length ?? (item.imageUrl ? 1 : 0);
    const card = contentScore({
      photos,
      hasVideo: Boolean(item.videoUrl),
      description: item.description ?? null,
      characteristicNames: item.characteristicNames ?? null,
      categoryCharcNames: item.categoryCharcNames ?? null,
      categoryCharcRequiredNames: item.categoryCharcRequiredNames ?? null,
      dimensions: item.dimensions ?? null,
    });
    return {
      score: card.score,
      grade: card.grade,
      earned: card.earned,
      applicableMax: card.applicableMax,
      parts: card.parts,
      slots: card.slots,
      gaps: card.gapLines,
      requiredMissing: card.requiredMissing,
      peerLine: fact.contentPeerLine ?? null,
    };
  }
  if (fact.contentScore == null) return null;
  return {
    score: fact.contentScore,
    grade: fact.contentGrade ?? null,
    parts: fact.contentParts ?? null,
    slots: fact.contentSlots ?? null,
    gaps: fact.contentGaps ?? (fact.contentGap ? fact.contentGap.split("\n") : []),
    requiredMissing: fact.contentRequiredMissing ?? null,
    peerLine: fact.contentPeerLine ?? null,
  };
}

function moneyCell(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Разложение Pen = penalty + deduction − additionalPayment по видам операций. */
export function buildMonthPenBreakdown(
  rawRows: Record<string, unknown>[],
  monthFrom: string,
  monthTo: string,
): MonthPenBreakdownRow[] {
  const buckets = new Map<string, MonthPenBreakdownRow>();
  for (const row of rawRows) {
    const day = dayKey(row.rrDate) ?? dayKey(row.saleDt);
    if (!day || day < monthFrom || day > monthTo) continue;
    const penalty = moneyCell(row.penalty);
    const deduction = moneyCell(row.deduction);
    const additionalPayment = moneyCell(row.additionalPayment);
    const pen = penalty + deduction - additionalPayment;
    if (pen === 0 && penalty === 0 && deduction === 0 && additionalPayment === 0) continue;
    const sellerOperName = String(row.sellerOperName ?? "").trim() || "(без sellerOperName)";
    const bonusRaw = row.bonusTypeName;
    const bonusTypeName =
      typeof bonusRaw === "string" && bonusRaw.trim() ? bonusRaw.trim() : null;
    const key = `${sellerOperName}\0${bonusTypeName ?? ""}`;
    const prev = buckets.get(key);
    if (prev) {
      prev.penalty += penalty;
      prev.deduction += deduction;
      prev.additionalPayment += additionalPayment;
      prev.pen += pen;
      prev.rows += 1;
    } else {
      buckets.set(key, {
        sellerOperName,
        bonusTypeName,
        penalty,
        deduction,
        additionalPayment,
        pen,
        rows: 1,
      });
    }
  }
  return [...buckets.values()]
    .map((row) => ({
      ...row,
      penalty: Math.round(row.penalty * 100) / 100,
      deduction: Math.round(row.deduction * 100) / 100,
      additionalPayment: Math.round(row.additionalPayment * 100) / 100,
      pen: Math.round(row.pen * 100) / 100,
    }))
    .sort((a, b) => Math.abs(b.pen) - Math.abs(a.pen) || a.sellerOperName.localeCompare(b.sellerOperName));
}

export function buildMonthReconcile(input: {
  rawRows: Record<string, unknown>[];
  facts: TaskFact[];
  monthFrom: string;
  monthTo: string;
  bankPaymentSum: number | null;
  bankReports: BankPaymentMonthReport[];
  bankError: string | null;
}): MonthReconcileDiagnostics {
  const { totals, byNm, noNm, rowCount } = aggregateRealizationCalendarMonth(
    input.rawRows,
    input.monthFrom,
    input.monthTo,
  );
  const computed =
    Math.round((totals.Pay - totals.L - totals.StRealization - totals.A - totals.Pen) * 100) / 100;
  const bank = input.bankPaymentSum;
  const delta =
    bank == null ? null : Math.round((computed - bank) * 100) / 100;
  const ok = delta == null ? null : Math.abs(delta) < 0.02;

  const factByNm = new Map(input.facts.map((f) => [f.nmId, f]));
  let costSum = 0;
  let sumP = 0;
  const missingCost: MonthReconcileDiagnostics["missingCost"] = [];
  const products: MonthReconcileProductRow[] = [];

  for (const [nmId, w] of Object.entries(byNm)) {
    const fact = factByNm.get(nmId);
    const cost = fact?.cost != null && fact.cost > 0 ? fact.cost : null;
    const costTotal = cost != null && w.N > 0 ? w.N * cost : 0;
    // P всегда: без себестоимости C=0 (для тождества ΣP − ΣPen = к оплате − ΣC).
    const P = Math.round((w.Pay - w.L - w.StRealization - w.A - costTotal) * 100) / 100;
    if (w.N > 0 || Math.abs(w.Pay) + Math.abs(w.L) + Math.abs(w.StRealization) + Math.abs(w.A) + Math.abs(w.Pen) > 0) {
      products.push({
        nmId,
        title: fact?.title ?? null,
        vendorCode: fact?.vendorCode ?? null,
        N: w.N,
        Pay: Math.round(w.Pay * 100) / 100,
        L: Math.round(w.L * 100) / 100,
        St: Math.round(w.StRealization * 100) / 100,
        A: Math.round(w.A * 100) / 100,
        Pen: Math.round(w.Pen * 100) / 100,
        cost,
        costTotal: Math.round(costTotal * 100) / 100,
        P,
      });
    }
    sumP += P;
    if (w.N <= 0) continue;
    if (cost != null) {
      costSum += costTotal;
    } else {
      missingCost.push({
        nmId,
        N: w.N,
        title: fact?.title ?? null,
        vendorCode: fact?.vendorCode ?? null,
      });
    }
  }
  // Без nmId: входит в «к оплате» и Pen, C=0.
  const noNmP = Math.round((noNm.Pay - noNm.L - noNm.StRealization - noNm.A) * 100) / 100;
  sumP += noNmP;
  missingCost.sort((a, b) => b.N - a.N || a.nmId.localeCompare(b.nmId));
  products.sort((a, b) => {
    const ap = a.P ?? Number.POSITIVE_INFINITY;
    const bp = b.P ?? Number.POSITIVE_INFINITY;
    return ap - bp || b.N - a.N || a.nmId.localeCompare(b.nmId);
  });

  const sumPen = Math.round(totals.Pen * 100) / 100;
  costSum = Math.round(costSum * 100) / 100;
  sumP = Math.round(sumP * 100) / 100;
  // Σ P − Σ Pen = «Итого к оплате» − Σ себестоимости.
  const identityLeft = Math.round((sumP - sumPen) * 100) / 100;
  const payout = bank ?? computed;
  const identityRight = Math.round((payout - costSum) * 100) / 100;
  const identityOk = Math.abs(identityLeft - identityRight) < 0.02;

  return {
    month: input.monthFrom.slice(0, 7),
    dateFrom: input.monthFrom,
    dateTo: input.monthTo,
    rowCount,
    sumPay: Math.round(totals.Pay * 100) / 100,
    sumL: Math.round(totals.L * 100) / 100,
    sumSt: Math.round(totals.StRealization * 100) / 100,
    sumA: Math.round(totals.A * 100) / 100,
    sumPen,
    sumRebill: Math.round(totals.rebill * 100) / 100,
    computed,
    bankPaymentSum: bank,
    bankReports: input.bankReports,
    delta,
    ok,
    bankError: input.bankError,
    costSum,
    sumP,
    identityOk,
    identityLeft,
    identityRight,
    products,
    penBreakdown: buildMonthPenBreakdown(input.rawRows, input.monthFrom, input.monthTo),
    missingCost,
  };
}

function dayKey(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 10) return null;
  return value.slice(0, 10);
}

function addDaysIso(iso: string, delta: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function isReturnOper(oper: string): boolean {
  const lower = oper.toLowerCase();
  return lower.includes("возврат") && !lower.includes("возмещен");
}

function sanitizeRealizationRow(
  row: Record<string, unknown>,
  window: "current" | "prior",
): Record<string, unknown> {
  const out: Record<string, unknown> = { window };
  for (const key of RAW_REALIZATION_SAMPLE_KEYS) {
    if (key === "window") continue;
    if (key in row) out[key] = row[key];
  }
  // Явно не тащим идентификаторы заказа / ПДн, даже если WB их отдал вне fields.
  delete out.srid;
  delete out.orderUid;
  delete out.stickerId;
  delete out.shkId;
  return out;
}

/**
 * Три nmId: самый продаваемый, с возвратами, с остатком на WB.
 * Строки — оба окна (56д по rrDate), только денежные поля + sellerOperName.
 */
export function buildRawRealizationSample(input: {
  rawRows: Record<string, unknown>[];
  facts: TaskFact[];
  dateTo: string;
}): RawRealizationSample | null {
  const { rawRows, facts, dateTo } = input;
  if (!rawRows.length || !dateTo) return null;

  const currentFrom = addDaysIso(dateTo, -27);
  const priorTo = addDaysIso(dateTo, -28);
  const priorFrom = addDaysIso(dateTo, -55);

  const inWindows = rawRows.filter((row) => {
    const day = dayKey(row.rrDate) ?? dayKey(row.saleDt);
    if (!day) return false;
    return day >= priorFrom && day <= dateTo;
  });

  const returnNmIds = new Set<string>();
  for (const row of inWindows) {
    const nmId = Number(row.nmId);
    if (!Number.isFinite(nmId) || nmId <= 0) continue;
    if (isReturnOper(String(row.sellerOperName ?? ""))) returnNmIds.add(String(nmId));
  }

  const bySold = [...facts]
    .filter((f) => (f.salesQty ?? 0) > 0 || (f.sellerRevenueS ?? 0) > 0)
    .sort((a, b) => {
      const sa = a.sellerRevenueS ?? a.retailSum ?? 0;
      const sb = b.sellerRevenueS ?? b.retailSum ?? 0;
      if (sb !== sa) return sb - sa;
      return (b.salesQty ?? 0) - (a.salesQty ?? 0);
    });

  const withWbStock = facts.filter((f) => (f.stockFbo ?? 0) > 0);
  const picked: Array<{ nmId: string; role: RawRealizationSampleRole; reason: string }> = [];
  const used = new Set<string>();

  const top = bySold[0];
  if (top) {
    used.add(top.nmId);
    picked.push({
      nmId: top.nmId,
      role: "top_sold",
      reason: `макс. выручка/продажи в текущем окне (N=${top.salesQty ?? 0}, S=${top.sellerRevenueS ?? top.retailSum ?? 0})`,
    });
  }

  const returnPick = [...returnNmIds].find((id) => !used.has(id)) ?? null;
  if (returnPick) {
    used.add(returnPick);
    picked.push({
      nmId: returnPick,
      role: "with_returns",
      reason: "есть строки sellerOperName «Возврат» в окнах 56д",
    });
  }

  const wbPick = withWbStock.find((f) => !used.has(f.nmId)) ?? null;
  if (wbPick) {
    used.add(wbPick.nmId);
    picked.push({
      nmId: wbPick.nmId,
      role: "wb_stock",
      reason: `остаток FBO ${wbPick.stockFbo ?? 0} шт.`,
    });
  }

  if (picked.length === 0) return null;

  const want = new Set(picked.map((p) => p.nmId));
  const rows: Array<Record<string, unknown>> = [];
  for (const row of inWindows) {
    const nmId = Number(row.nmId);
    if (!Number.isFinite(nmId) || !want.has(String(nmId))) continue;
    const day = dayKey(row.rrDate) ?? dayKey(row.saleDt);
    if (!day) continue;
    const window: "current" | "prior" = day >= currentFrom ? "current" : "prior";
    rows.push(sanitizeRealizationRow(row, window));
  }

  rows.sort((a, b) => {
    const nm = String(a.nmId).localeCompare(String(b.nmId));
    if (nm !== 0) return nm;
    return String(a.rrDate ?? "").localeCompare(String(b.rrDate ?? ""));
  });

  return {
    windows: { currentFrom, currentTo: dateTo, priorFrom, priorTo },
    picked,
    rows,
  };
}

export function buildSellerHubDiagnostics(input: {
  snapshot: SellerCatalogSnapshot;
  tasks: SellerTask[];
  events: SellerProductEvent[];
  now?: string;
  /** Сырые строки detailed-отчёта (оба окна). Без них rawRealizationSample = null. */
  realizationRawRows?: Record<string, unknown>[];
  /** Σ bankPaymentSum отчётов за месяц (после отдельного list-запроса). */
  monthBank?: {
    monthFrom: string;
    monthTo: string;
    sum: number | null;
    reports: BankPaymentMonthReport[];
    error: string | null;
  };
}): SellerHubDiagnostics {
  const now = input.now ?? new Date().toISOString();
  const { products: facts } = taskFactsFromSnapshot(input.snapshot);
  const store = buildStoreMoneyContext(facts, DEFAULT_TASK_THRESHOLDS);
  let turnoverSource: SellerHubDiagnostics["meta"]["turnoverSource"] = null;
  if (facts.some((f) => f.orderSum != null && Number.isFinite(f.orderSum))) {
    turnoverSource = "funnel_orderSum";
  } else if (facts.some((f) => f.retailSum != null && Number.isFinite(f.retailSum))) {
    turnoverSource = "realization_retail";
  }

  const shopBuyout = buildShopBuyoutContext({
    products: facts.map((fact) => ({
      pastOrders: fact.pastOrderCount ?? fact.priorOrders,
      pastBuyouts:
        fact.pastBuyoutCount ??
        (fact.pastOrderCount === 0 || fact.priorOrders === 0 ? 0 : null),
    })),
  });

  const funnel = input.snapshot.funnel;
  const stocks = input.snapshot.stocksReport;
  const paid = input.snapshot.paidStorage;
  const realization = input.snapshot.realization;

  const products = facts.map((fact) =>
    productRow(
      fact,
      input.events,
      now,
      stockOutInWindow(input.events, fact.nmId, now),
      shopBuyout.bShop,
      input.snapshot,
    ),
  );

  /** Все статусы: active / snoozed / completed / dismissed — иначе скрытые задачи не видны в разборе. */
  const tasks = input.tasks.map((task) => ({
    id: task.id,
    type: task.type,
    nmId: task.nmId,
    severity: task.severity,
    severityBasis: task.evidence.severity_basis ?? null,
    moneyAtRiskRub: task.evidence.money_at_risk_rub ?? null,
    shareOfTurnover: task.evidence.share_of_turnover ?? null,
    frozenRub: task.evidence.frozen_rub ?? null,
    frozenBasis: task.evidence.frozen_basis ?? null,
    title: task.title,
    description: task.description,
    reason: task.reason,
    recommendation: task.recommendation,
    evidence: task.evidence,
    status: task.status,
    snoozeUntil: task.snoozeUntil,
    resolvedAt: task.resolvedAt,
    resolution: task.resolution,
    category: task.category,
    businessImpactType: task.businessImpactType,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }));

  const rawRealizationSample =
    input.realizationRawRows && realization?.dateTo
      ? buildRawRealizationSample({
          rawRows: input.realizationRawRows,
          facts,
          dateTo: realization.dateTo,
        })
      : null;

  const monthFrom = input.monthBank?.monthFrom ?? "2026-09-01";
  const monthTo = input.monthBank?.monthTo ?? "2026-09-30";
  const monthReconcile =
    input.realizationRawRows && input.realizationRawRows.length > 0
      ? buildMonthReconcile({
          rawRows: input.realizationRawRows,
          facts,
          monthFrom,
          monthTo,
          bankPaymentSum: input.monthBank?.sum ?? null,
          bankReports: input.monthBank?.reports ?? [],
          bankError:
            input.monthBank?.error ??
            (input.monthBank ? null : "bankPaymentSum: список отчётов не запрашивался"),
        })
      : null;

  return {
    meta: {
      exportedAt: now,
      funnel: {
        status: funnel?.status ?? null,
        loadedAt: funnel?.loadedAt ?? null,
        dateFrom: funnel?.dateFrom ?? null,
        dateTo: funnel?.dateTo ?? null,
        error: funnel?.error ?? null,
      },
      stocksReport: {
        status: stocks?.status ?? null,
        loadedAt: stocks?.loadedAt ?? null,
        dateFrom: stocks?.dateFrom ?? null,
        dateTo: stocks?.dateTo ?? null,
        error: stocks?.error ?? null,
      },
      paidStorage: {
        status: paid?.status ?? null,
        loadedAt: paid?.loadedAt ?? null,
        dateFrom: paid?.dateFrom ?? null,
        dateTo: paid?.dateTo ?? null,
        error:
          paid?.error ??
          (paid == null
            ? "отчёт не загружен в снимок каталога (синхронизация сбросила или не дождалась paid_storage)"
            : paid.status == null
              ? "статус отчёта неизвестен: загрузка не завершилась"
              : null),
        nmCount: paid ? Object.keys(paid.byNm).length : 0,
        lastOkDateFrom: paid?.lastOkDateFrom ?? paid?.dateFrom ?? null,
        lastOkDateTo: paid?.lastOkDateTo ?? paid?.dateTo ?? null,
        lastOkLoadedAt: paid?.lastOkLoadedAt ?? paid?.loadedAt ?? null,
        pendingChunks: paid?.pendingChunks?.length ?? 0,
      },
      realization: {
        loadedAt: realization?.loadedAt ?? null,
        dateFrom: realization?.dateFrom ?? null,
        dateTo: realization?.dateTo ?? null,
        error: realization?.error ?? null,
        version: realization?.version ?? null,
        reconcile: realization?.reconcile ?? null,
      },
      monthReconcile,
      taxRatePercent: null,
      targetMarginPercent: DEFAULT_TASK_THRESHOLDS.lowMarginPercent,
      turnoverRub: store.turnoverRub,
      turnoverSource,
      grossProfitRub: store.grossProfitRub,
      useGrossProfit: store.useGrossProfit,
      bShop: shopBuyout.bShop,
      bShopSource: shopBuyout.bShopSource,
      thresholds: { ...DEFAULT_TASK_THRESHOLDS },
    },
    products,
    tasks,
    rawRealizationSample,
  };
}

export function downloadSellerHubDiagnosticsJson(data: SellerHubDiagnostics, filename = "karto-diagnostics.json") {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Dev: скачать файл и параллельно записать в корень проекта через API. */
export async function exportSellerHubDiagnostics(data: SellerHubDiagnostics): Promise<{ saved: boolean; path?: string }> {
  downloadSellerHubDiagnosticsJson(data);
  try {
    const res = await fetch("/api/seller-hub/diagnostics/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; path?: string };
    return { saved: Boolean(res.ok && json.ok), path: json.path };
  } catch {
    return { saved: false };
  }
}
