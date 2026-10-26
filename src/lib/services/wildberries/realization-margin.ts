import type {
  SellerRealizationPeriod,
  SellerRealizationNm,
  SellerRealizationNoNm,
  SellerRealizationReconcile,
  SellerRealizationSnapshot,
  SellerRealizationWindow,
} from "@/lib/seller-hub/types";
import type {
  SellerRealizationDelivery90,
  SellerRealizationShopDelivery90,
} from "@/lib/seller-hub/types";
import {
  absorbDeliveryRow,
  emptyDeliveryAgg,
  shopDeliveryStats,
  type DeliveryLogisticsAgg,
} from "@/lib/seller-hub/unit-sale-economics";
import { emptyWindowTotals, reconcileBankPayment } from "@/lib/seller-hub/unit-economics";

const FINANCE_URL = "https://finance-api.wildberries.ru/api/finance/v1/sales-reports/detailed";
const FINANCE_LIST_URL = "https://finance-api.wildberries.ru/api/finance/v1/sales-reports/list";
/** 5 — окно 90д + delivery90 для маржи на 1 продажу; факт 28+28 без изменений. 6 — + periods (окна 7/14/28/60/90 для «Аналитики»). */
const REALIZATION_SNAPSHOT_VERSION = 6;

function moscowDay(offsetDays: number): string {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function money(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function rowsFromBody(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body.map(asRecord).filter((row): row is Record<string, unknown> => row != null);
  const root = asRecord(body);
  const data = root?.data;
  if (Array.isArray(data)) return data.map(asRecord).filter((row): row is Record<string, unknown> => row != null);
  return [];
}

function failureText(status: number, body: unknown): string {
  if (status === 401 || status === 403) {
    return "В токене нет категории «Финансы». Отчёт реализации не прочитался.";
  }
  if (status === 429) {
    return "WB отдаёт отчёт реализации раз в минуту. Нажмите «Повторить» чуть позже.";
  }
  if (status === 402) {
    return "WB не отдал отчёт: для этого метода нужна другая подписка токена.";
  }
  const root = asRecord(body);
  const detail = root?.detail ?? root?.title ?? root?.errorText ?? root?.message;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  return `Отчёт реализации не прочитался (${status}).`;
}

function emptyWindow(): SellerRealizationWindow {
  return emptyWindowTotals();
}

function emptyResult(dateFrom: string, dateTo: string, error?: string): SellerRealizationSnapshot {
  return {
    loadedAt: new Date().toISOString(),
    version: REALIZATION_SNAPSHOT_VERSION,
    dateFrom,
    dateTo,
    accountRetail: 0,
    accountNet: 0,
    byNm: {},
    noNmCurrent: emptyWindow(),
    noNmPrior: emptyWindow(),
    error,
  };
}

function addDays(iso: string, delta: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function dayKey(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 10) return null;
  return value.slice(0, 10);
}

function emptyNm(): SellerRealizationNm {
  return {
    retail: 0,
    net: 0,
    qty: 0,
    recentQty: 0,
    earlyRetail: 0,
    earlyNet: 0,
    lateRetail: 0,
    lateNet: 0,
    priorQty: 0,
    priorRetail: 0,
    priorNet: 0,
    storage: 0,
    current: emptyWindow(),
    prior: emptyWindow(),
  };
}

function toDelivery90(
  agg: DeliveryLogisticsAgg,
  sales: { sales: number; returns: number },
): SellerRealizationDelivery90 {
  return {
    ...agg,
    netSalesQty: sales.sales - sales.returns,
  };
}

function isReturnOper(oper: string): boolean {
  const lower = oper.toLowerCase();
  return lower.includes("возврат") && !lower.includes("возмещен");
}

function isSaleOper(oper: string): boolean {
  const lower = oper.toLowerCase();
  return lower.includes("продаж") || lower.includes("коррекц");
}

type LineKind = "sale" | "return" | "other";

function lineKind(oper: string, qty: number, retailAmount: number): LineKind {
  if (isReturnOper(oper)) return "return";
  if (isSaleOper(oper)) return "sale";
  if (qty > 0 && retailAmount > 0) return "sale";
  return "other";
}

function absorbIntoWindow(
  row: Record<string, unknown>,
  bucket: SellerRealizationWindow,
  kind: LineKind,
): void {
  const qty = Math.abs(money(row.quantity));
  const sellerPrice = money(row.retailPriceWithDisc);
  const retailAmount = money(row.retailAmount);
  const forPay = money(row.forPay);
  const delivery = money(row.deliveryService);
  const acceptance = money(row.paidAcceptance);
  const storage = money(row.paidStorage);
  const pen = money(row.penalty) + money(row.deduction) - money(row.additionalPayment);
  const rebill = money(row.rebillLogisticCost);

  bucket.L += delivery;
  bucket.A += acceptance;
  bucket.StRealization += storage;
  bucket.Pen += pen;
  bucket.rebill += rebill;

  if (kind === "sale") {
    bucket.N += qty;
    bucket.S += sellerPrice * qty;
    bucket.RA += retailAmount;
    bucket.Pay += forPay;
  } else if (kind === "return") {
    bucket.N -= qty;
    bucket.S -= sellerPrice * qty;
    bucket.RA -= retailAmount;
    bucket.Pay -= forPay;
  }
  // Логистика / хранение / приёмка / штрафы / rebill: суммы уже в L/A/St/Pen/rebill.
}

function lineNetFromWindow(w: SellerRealizationWindow): number {
  return w.Pay - w.L - w.StRealization - w.A - w.Pen;
}

/**
 * Последняя неделя по max dateTo.
 * WB часто отдаёт несколько reportId на одни dateFrom/dateTo (основной + корректировки) —
 * берём все, иначе сверка по max(reportId) ловит мелкий хвост (~1.7k вместо ~34k).
 */
function lastWeeklyPeriod(rows: Record<string, unknown>[]): {
  reportId: number | null;
  reportIds: number[];
  dateFrom: string;
  dateTo: string;
} | null {
  let bestTo = "";
  let bestFrom = "";
  for (const row of rows) {
    const dateTo = String(row.dateTo ?? "").slice(0, 10);
    const dateFrom = String(row.dateFrom ?? "").slice(0, 10);
    if (!dateTo || !dateFrom) continue;
    if (!bestTo || dateTo > bestTo || (dateTo === bestTo && dateFrom > bestFrom)) {
      bestTo = dateTo;
      bestFrom = dateFrom;
    }
  }
  if (!bestTo || !bestFrom) return null;

  const idSet = new Set<number>();
  for (const row of rows) {
    const dateTo = String(row.dateTo ?? "").slice(0, 10);
    const dateFrom = String(row.dateFrom ?? "").slice(0, 10);
    if (dateTo !== bestTo || dateFrom !== bestFrom) continue;
    const rid = Number(row.reportId);
    if (Number.isFinite(rid)) idSet.add(rid);
  }
  const reportIds = [...idSet].sort((a, b) => a - b);
  return {
    reportId: reportIds.length ? reportIds[reportIds.length - 1]! : null,
    reportIds,
    dateFrom: bestFrom,
    dateTo: bestTo,
  };
}

/** Строки всех отчётов недели (все reportId с теми же dateFrom/dateTo). */
export function reconcileRowsAgainstBank(
  rows: Record<string, unknown>[],
  reportId: number | null,
  reportFrom: string,
  reportTo: string,
  bank: number,
  reportIds?: number[],
): SellerRealizationReconcile {
  const wantIds =
    reportIds && reportIds.length > 0
      ? new Set(reportIds)
      : reportId != null
        ? new Set([reportId])
        : null;
  const byNm = new Map<string, SellerRealizationWindow>();
  const noNm = emptyWindow();
  for (const row of rows) {
    const df = String(row.dateFrom ?? "").slice(0, 10);
    const dt = String(row.dateTo ?? "").slice(0, 10);
    const rid = Number(row.reportId);
    if (wantIds) {
      if (!Number.isFinite(rid) || !wantIds.has(rid)) {
        // Без reportId — по датам недели.
        if (Number.isFinite(rid)) continue;
        if (df !== reportFrom || dt !== reportTo) continue;
      }
    } else {
      if (df && df !== reportFrom) continue;
      if (dt && dt !== reportTo) continue;
    }
    const oper = String(row.sellerOperName ?? "");
    const kind = lineKind(oper, money(row.quantity), money(row.retailAmount));
    const nmId = Number(row.nmId);
    if (Number.isFinite(nmId) && nmId > 0) {
      const key = String(nmId);
      const bucket = byNm.get(key) ?? emptyWindow();
      absorbIntoWindow(row, bucket, kind);
      byNm.set(key, bucket);
    } else {
      absorbIntoWindow(row, noNm, kind);
    }
  }
  const result = reconcileBankPayment({
    byNm: [...byNm.values()].map((w) => ({
      Pay: w.Pay,
      L: w.L,
      St: w.StRealization,
      A: w.A,
      Pen: w.Pen,
    })),
    noNm: {
      Pay: noNm.Pay,
      L: noNm.L,
      St: noNm.StRealization,
      A: noNm.A,
      Pen: noNm.Pen,
    },
    bankPaymentSum: bank,
  });
  const ids = reportIds ?? (reportId != null ? [reportId] : []);
  return {
    reportId: ids.length ? ids[ids.length - 1]! : reportId,
    reportIds: ids,
    dateFrom: reportFrom,
    dateTo: reportTo,
    bankPaymentSum: result.bank,
    computed: result.sum,
    delta: result.delta,
    ok: result.ok,
  };
}

/**
 * Сверка с bankPaymentSum. Отдельный запрос списка (лимит finance 1/мин) —
 * вызывать после паузы или из diagnostics, не в том же тике, что detailed.
 */
export async function fetchRealizationReconcile(
  token: string,
  rows: Record<string, unknown>[],
): Promise<SellerRealizationReconcile> {
  const normalized = token.startsWith("Bearer ") ? token.slice(7).trim() : token.trim();
  const period = lastWeeklyPeriod(rows);
  if (!period) {
    return {
      reportId: null,
      dateFrom: "",
      dateTo: "",
      bankPaymentSum: null,
      computed: null,
      delta: null,
      ok: null,
      error: "В детализации нет dateFrom/dateTo отчёта",
    };
  }
  try {
    const listRes = await fetch(FINANCE_LIST_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${normalized}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateFrom: period.dateFrom,
        dateTo: period.dateTo,
        period: "weekly",
      }),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (!listRes.ok) {
      return {
        ...period,
        bankPaymentSum: null,
        computed: null,
        delta: null,
        ok: null,
        error: `Список отчётов: ${listRes.status}`,
      };
    }
    const listBody: unknown = await listRes.json().catch(() => null);
    const reports = Array.isArray(listBody) ? listBody : [];
    const matches = reports
      .map(asRecord)
      .filter((r): r is Record<string, unknown> => r != null)
      .filter(
        (r) =>
          String(r.dateFrom ?? "").slice(0, 10) === period.dateFrom &&
          String(r.dateTo ?? "").slice(0, 10) === period.dateTo,
      );
    if (matches.length === 0) {
      return {
        ...period,
        bankPaymentSum: null,
        computed: null,
        delta: null,
        ok: null,
        error: "Отчёты недели не найдены в списке",
      };
    }
    const listIds = new Set<number>();
    let bank = 0;
    for (const match of matches) {
      const rid = Number(match.reportId);
      if (Number.isFinite(rid)) listIds.add(rid);
      bank += money(match.bankPaymentSum);
    }
    const reportIds = [...new Set([...period.reportIds, ...listIds])].sort((a, b) => a - b);
    return reconcileRowsAgainstBank(
      rows,
      reportIds.length ? reportIds[reportIds.length - 1]! : period.reportId,
      period.dateFrom,
      period.dateTo,
      Math.round(bank * 100) / 100,
      reportIds,
    );
  } catch (error) {
    return {
      ...period,
      bankPaymentSum: null,
      computed: null,
      delta: null,
      ok: null,
      error: error instanceof Error ? error.message : "Сверка не прочиталась",
    };
  }
}

/** Поля детализации: агрегаты маржи + денежные для rawRealizationSample. */
const REALIZATION_FIELDS = [
  "rrdId",
  "reportId",
  "dateFrom",
  "dateTo",
  "nmId",
  "quantity",
  "retailPrice",
  "retailAmount",
  "retailPriceWithDisc",
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
  "sellerOperName",
  "bonusTypeName",
  "docTypeName",
  "rrDate",
  "saleDt",
] as const;

export type RealizationFetchBundle = {
  snapshot: SellerRealizationSnapshot;
  /** Все строки ответа (ещё с лишними полями, если WB их отдал). Для диагностики. */
  rawRows: Record<string, unknown>[];
};

export async function fetchRealizationMargin(token: string): Promise<SellerRealizationSnapshot> {
  const bundle = await fetchRealizationMarginBundle(token);
  return bundle.snapshot;
}

/** Снимок + сырые строки за оба окна (для выгрузки диагностики). */
export async function fetchRealizationMarginBundle(token: string): Promise<RealizationFetchBundle> {
  /** 90 дней: маржа на 1 продажу; окна 28+28 считаются внутри. */
  const dateFrom = moscowDay(-89);
  const dateTo = moscowDay(0);
  const normalized = token.startsWith("Bearer ") ? token.slice(7).trim() : token.trim();
  let response: Response;
  try {
    response = await fetch(FINANCE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${normalized}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateFrom,
        dateTo,
        limit: 100000,
        rrdId: 0,
        period: "weekly",
        fields: [...REALIZATION_FIELDS],
      }),
      signal: AbortSignal.timeout(90_000),
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Отчёт реализации не прочитался.";
    return { snapshot: emptyResult(dateFrom, dateTo, message), rawRows: [] };
  }

  if (response.status === 204) {
    return {
      snapshot: { ...emptyResult(dateFrom, dateTo), version: REALIZATION_SNAPSHOT_VERSION },
      rawRows: [],
    };
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return { snapshot: emptyResult(dateFrom, dateTo, failureText(response.status, body)), rawRows: [] };
  }

  const rows = rowsFromBody(body);
  const byNm: Record<string, SellerRealizationNm> = {};
  const delivery90Aggs = new Map<string, DeliveryLogisticsAgg>();
  const delivery90Sales = new Map<string, { sales: number; returns: number }>();
  const deliveryCurrentAggs = new Map<string, DeliveryLogisticsAgg>();
  const deliveryPriorAggs = new Map<string, DeliveryLogisticsAgg>();
  const deliveryCurrentSales = new Map<string, { sales: number; returns: number }>();
  const deliveryPriorSales = new Map<string, { sales: number; returns: number }>();
  const noNmCurrent = emptyWindow();
  const noNmPrior = emptyWindow();
  const currentStart = addDays(dateTo, -27);
  const priorStart = addDays(dateTo, -55);

  for (const row of rows) {
    const oper = String(row.sellerOperName ?? "");
    const kind = lineKind(oper, money(row.quantity), money(row.retailAmount));
    const day = dayKey(row.rrDate) ?? dayKey(row.saleDt);
    const inRange90 = day != null && day >= dateFrom && day <= dateTo;
    const inCurrent = day != null && day >= currentStart && day <= dateTo;
    const inPrior = day != null && day >= priorStart && day < currentStart;

    const nmId = Number(row.nmId);
    const key =
      Number.isFinite(nmId) && nmId > 0 ? String(nmId) : null;

    const bumpSales = (
      map: Map<string, { sales: number; returns: number }>,
      id: string,
    ) => {
      const sales = map.get(id) ?? { sales: 0, returns: 0 };
      const qty = Math.abs(money(row.quantity));
      if (kind === "return") sales.returns += qty;
      else if (kind === "sale") sales.sales += qty;
      map.set(id, sales);
    };

    if (key && inRange90) {
      const agg = delivery90Aggs.get(key) ?? emptyDeliveryAgg();
      absorbDeliveryRow(row, agg);
      delivery90Aggs.set(key, agg);
      bumpSales(delivery90Sales, key);
    }
    if (key && inCurrent) {
      const agg = deliveryCurrentAggs.get(key) ?? emptyDeliveryAgg();
      absorbDeliveryRow(row, agg);
      deliveryCurrentAggs.set(key, agg);
      bumpSales(deliveryCurrentSales, key);
    }
    if (key && inPrior) {
      const agg = deliveryPriorAggs.get(key) ?? emptyDeliveryAgg();
      absorbDeliveryRow(row, agg);
      deliveryPriorAggs.set(key, agg);
      bumpSales(deliveryPriorSales, key);
    }

    if (!inCurrent && !inPrior) continue;

    if (!key) {
      absorbIntoWindow(row, inCurrent ? noNmCurrent : noNmPrior, kind);
      continue;
    }

    const bucket = byNm[key] ?? emptyNm();
    const current = bucket.current ?? emptyWindow();
    const prior = bucket.prior ?? emptyWindow();
    if (inCurrent) absorbIntoWindow(row, current, kind);
    else absorbIntoWindow(row, prior, kind);
    bucket.current = current;
    bucket.prior = prior;

    // Обратная совместимость агрегатов текущего/прошлого окна.
    bucket.retail = current.RA;
    bucket.net = lineNetFromWindow(current);
    bucket.qty = current.N;
    bucket.storage = current.StRealization;
    bucket.priorQty = prior.N;
    bucket.priorRetail = prior.RA;
    bucket.priorNet = lineNetFromWindow(prior);

    if (inCurrent && day) {
      if (day >= addDays(dateTo, -6)) {
        const qtyDelta =
          kind === "return" ? -Math.abs(money(row.quantity)) : kind === "sale" ? Math.abs(money(row.quantity)) : 0;
        bucket.recentQty = (bucket.recentQty ?? 0) + qtyDelta;
      }
      const retail = money(row.retailAmount);
      const netPiece =
        kind === "return"
          ? -(money(row.forPay) - money(row.deliveryService) - money(row.paidStorage) - money(row.paidAcceptance) - money(row.penalty) - money(row.deduction) + money(row.additionalPayment))
          : kind === "sale"
            ? money(row.forPay) - money(row.deliveryService) - money(row.paidStorage) - money(row.paidAcceptance) - money(row.penalty) - money(row.deduction) + money(row.additionalPayment)
            : -money(row.deliveryService) - money(row.paidStorage) - money(row.paidAcceptance) - money(row.penalty) - money(row.deduction) + money(row.additionalPayment);
      if (day >= addDays(dateTo, -13)) {
        bucket.lateRetail = (bucket.lateRetail ?? 0) + (kind === "return" ? -retail : retail);
        bucket.lateNet = (bucket.lateNet ?? 0) + netPiece;
      } else {
        bucket.earlyRetail = (bucket.earlyRetail ?? 0) + (kind === "return" ? -retail : retail);
        bucket.earlyNet = (bucket.earlyNet ?? 0) + netPiece;
      }
    }

    const curDel = deliveryCurrentAggs.get(key);
    if (curDel) {
      bucket.delivery = toDelivery90(
        curDel,
        deliveryCurrentSales.get(key) ?? { sales: 0, returns: 0 },
      );
    }
    const priorDel = deliveryPriorAggs.get(key);
    if (priorDel) {
      bucket.priorDelivery = toDelivery90(
        priorDel,
        deliveryPriorSales.get(key) ?? { sales: 0, returns: 0 },
      );
    }

    byNm[key] = bucket;
  }

  // nm с доставками в 28д, но без sales/window bucket — всё равно заведём для delivery.
  for (const [key, agg] of deliveryCurrentAggs) {
    const bucket = byNm[key] ?? emptyNm();
    bucket.delivery = toDelivery90(
      agg,
      deliveryCurrentSales.get(key) ?? { sales: 0, returns: 0 },
    );
    const priorDel = deliveryPriorAggs.get(key);
    if (priorDel) {
      bucket.priorDelivery = toDelivery90(
        priorDel,
        deliveryPriorSales.get(key) ?? { sales: 0, returns: 0 },
      );
    }
    byNm[key] = bucket;
  }
  for (const [key, agg] of deliveryPriorAggs) {
    if (byNm[key]?.priorDelivery) continue;
    const bucket = byNm[key] ?? emptyNm();
    bucket.priorDelivery = toDelivery90(
      agg,
      deliveryPriorSales.get(key) ?? { sales: 0, returns: 0 },
    );
    byNm[key] = bucket;
  }

  let accountRetail = 0;
  let accountNet = 0;
  for (const bucket of Object.values(byNm)) {
    accountRetail += bucket.retail;
    accountNet += bucket.net;
  }

  const delivery90: Record<string, SellerRealizationDelivery90> = {};
  const aggsForShop: DeliveryLogisticsAgg[] = [];
  for (const [nmId, agg] of delivery90Aggs) {
    aggsForShop.push(agg);
    const sales = delivery90Sales.get(nmId) ?? { sales: 0, returns: 0 };
    delivery90[nmId] = toDelivery90(agg, sales);
  }
  const shopStats = shopDeliveryStats(aggsForShop);
  const shopDelivery90: SellerRealizationShopDelivery90 = {
    D: shopStats.D,
    R: shopStats.R,
    returnCost: shopStats.returnCost,
    bShop: shopStats.bShop,
    rShop: shopStats.rShop,
  };

  // Сверка с банком: list + bankPaymentSum за последнюю закрытую неделю (finance list, 1/мин).
  let reconcile: SellerRealizationReconcile | undefined;
  if (lastWeeklyPeriod(rows)) {
    reconcile = await fetchRealizationReconcile(normalized, rows);
  }

  const snapshot: SellerRealizationSnapshot = {
    loadedAt: new Date().toISOString(),
    version: REALIZATION_SNAPSHOT_VERSION,
    dateFrom,
    dateTo,
    truncated: rows.length >= 100000,
    accountRetail,
    accountNet,
    byNm,
    delivery90,
    shopDelivery90,
    noNmCurrent,
    noNmPrior,
    reconcile,
    periods: buildPeriodWindows(rows, dateTo),
  };
  return { snapshot, rawRows: rows };
}

/**
 * Агрегат календарного месяца по rrDate (иначе saleDt): все строки с nmId и без.
 * St — paidStorage из строк реализации (не paid_storage analytics).
 */
export function aggregateRealizationCalendarMonth(
  rows: Record<string, unknown>[],
  monthFrom: string,
  monthTo: string,
): {
  totals: SellerRealizationWindow;
  byNm: Record<string, SellerRealizationWindow>;
  noNm: SellerRealizationWindow;
  rowCount: number;
} {
  const totals = emptyWindow();
  const noNm = emptyWindow();
  const byNm: Record<string, SellerRealizationWindow> = {};
  let rowCount = 0;
  for (const row of rows) {
    const day = dayKey(row.rrDate) ?? dayKey(row.saleDt);
    if (!day || day < monthFrom || day > monthTo) continue;
    rowCount += 1;
    const oper = String(row.sellerOperName ?? "");
    const kind = lineKind(oper, money(row.quantity), money(row.retailAmount));
    absorbIntoWindow(row, totals, kind);
    const nmId = Number(row.nmId);
    if (Number.isFinite(nmId) && nmId > 0) {
      const key = String(nmId);
      const bucket = byNm[key] ?? emptyWindow();
      absorbIntoWindow(row, bucket, kind);
      byNm[key] = bucket;
    } else {
      absorbIntoWindow(row, noNm, kind);
    }
  }
  return { totals, byNm, noNm, rowCount };
}

export type BankPaymentMonthReport = {
  reportId: number | null;
  dateFrom: string;
  dateTo: string;
  bankPaymentSum: number;
};

/**
 * Σ bankPaymentSum недельных отчётов, пересекающих [dateFrom, dateTo].
 * Отдельный finance-запрос (лимит ~1/мин) — после detailed нужна пауза.
 */
export async function fetchBankPaymentSumForMonth(
  token: string,
  dateFrom: string,
  dateTo: string,
): Promise<{
  sum: number | null;
  reports: BankPaymentMonthReport[];
  error?: string;
}> {
  const normalized = token.startsWith("Bearer ") ? token.slice(7).trim() : token.trim();
  try {
    const listRes = await fetch(FINANCE_LIST_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${normalized}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateFrom,
        dateTo,
        period: "weekly",
      }),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (!listRes.ok) {
      return { sum: null, reports: [], error: `Список отчётов: ${listRes.status}` };
    }
    const listBody: unknown = await listRes.json().catch(() => null);
    const reportsRaw = Array.isArray(listBody) ? listBody : [];
    const reports: BankPaymentMonthReport[] = [];
    let sum = 0;
    for (const item of reportsRaw) {
      const r = asRecord(item);
      if (!r) continue;
      const rf = String(r.dateFrom ?? "").slice(0, 10);
      const rt = String(r.dateTo ?? "").slice(0, 10);
      if (!rf || !rt) continue;
      // Пересечение с месяцем.
      if (rt < dateFrom || rf > dateTo) continue;
      const bank = money(r.bankPaymentSum);
      const rid = Number(r.reportId);
      reports.push({
        reportId: Number.isFinite(rid) ? rid : null,
        dateFrom: rf,
        dateTo: rt,
        bankPaymentSum: bank,
      });
      sum += bank;
    }
    reports.sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
    return { sum: Math.round(sum * 100) / 100, reports };
  } catch (error) {
    return {
      sum: null,
      reports: [],
      error: error instanceof Error ? error.message : "Список отчётов не прочитался",
    };
  }
}

/** Нужна перезагрузка: нет годного снимка или каталог синкнули позже реализации. */
export function realizationNeedsReload(
  realization: Pick<SellerRealizationSnapshot, "loadedAt" | "error" | "version" | "byNm"> | null | undefined,
  catalogSyncedAt: string | null | undefined,
): boolean {
  if (!realization) return true;
  if (realization.error && Object.keys(realization.byNm).length === 0) return true;
  if ((realization.version ?? 0) < REALIZATION_SNAPSHOT_VERSION) return true;
  if (!catalogSyncedAt || !realization.loadedAt) return true;
  const syncMs = Date.parse(catalogSyncedAt);
  const loadedMs = Date.parse(realization.loadedAt);
  if (!Number.isFinite(syncMs) || !Number.isFinite(loadedMs)) return true;
  return syncMs > loadedMs;
}

/** Ошибка загрузки не затирает прошлый успешный снимок. */
export function mergeRealizationKeepPrevious(
  previous: SellerRealizationSnapshot | null | undefined,
  incoming: SellerRealizationSnapshot,
): SellerRealizationSnapshot {
  const hadGood = Boolean(
    previous &&
      !previous.error &&
      (previous.version ?? 0) >= REALIZATION_SNAPSHOT_VERSION &&
      Object.keys(previous.byNm).length > 0,
  );
  if (incoming.error && hadGood && previous) {
    return {
      ...incoming,
      byNm: previous.byNm,
      version: previous.version,
      accountRetail: previous.accountRetail,
      accountNet: previous.accountNet,
      dateFrom: previous.dateFrom,
      dateTo: previous.dateTo,
      truncated: previous.truncated,
      noNmCurrent: previous.noNmCurrent,
      noNmPrior: previous.noNmPrior,
      reconcile: previous.reconcile,
      periods: previous.periods,
      error: incoming.error,
    };
  }
  return incoming;
}

/** Периоды, за которые отдаём окна экономики для раздела «Аналитика». Окно «до» нужно и помещается в 90 дней только при 2N ≤ 90. */
const PERIOD_DAYS = [7, 14, 28, 60, 90] as const;
const RANGE_DAYS = 90;

/**
 * Окна экономики (выручка, к перечислению, логистика, хранение, приёмка, штрафы) по товарам за последние N дней и за N дней до них.
 * Строки без артикула собираются отдельно. Для 60 и 90 дней предыдущего окна в выгрузке нет: prior = null.
 */
export function buildPeriodWindows(rows: Record<string, unknown>[], dateTo: string): Record<string, SellerRealizationPeriod> {
  const out: Record<string, SellerRealizationPeriod> = {};
  for (const days of PERIOD_DAYS) {
    out[String(days)] = {
      days,
      from: addDays(dateTo, -(days - 1)),
      priorFrom: 2 * days <= RANGE_DAYS ? addDays(dateTo, -(2 * days - 1)) : null,
      byNm: {},
      noNm: { current: emptyWindow(), prior: 2 * days <= RANGE_DAYS ? emptyWindow() : null },
    };
  }
  for (const row of rows) {
    const day = dayKey(row.rrDate) ?? dayKey(row.saleDt);
    if (!day || day > dateTo) continue;
    const kind = lineKind(String(row.sellerOperName ?? ""), money(row.quantity), money(row.retailAmount));
    const nmId = Number(row.nmId);
    const key = Number.isFinite(nmId) && nmId > 0 ? String(nmId) : null;
    for (const days of PERIOD_DAYS) {
      const period = out[String(days)]!;
      const inCurrent = day >= period.from;
      const inPrior = !inCurrent && period.priorFrom != null && day >= period.priorFrom;
      if (!inCurrent && !inPrior) continue;
      if (key == null) {
        const target = inCurrent ? period.noNm.current : period.noNm.prior;
        if (target) absorbIntoWindow(row, target, kind);
        continue;
      }
      const entry = (period.byNm[key] ??= { current: emptyWindow(), prior: period.priorFrom != null ? emptyWindow() : null });
      const target = inCurrent ? entry.current : entry.prior;
      if (target) absorbIntoWindow(row, target, kind);
    }
  }
  return out;
}

export type { SellerRealizationNoNm };
