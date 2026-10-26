import type { SellerCatalogItem, SellerRealizationSnapshot, SellerRealizationWindow } from "@/lib/seller-hub/types";

/**
 * Деньги магазина по отчёту реализации WB за два окна по 28 дней: куда уходит выручка и что остаётся.
 * Определения те же, что в утверждённом расчёте маржи: к перечислению (Pay) минус логистика (L), хранение (St), приёмка (A) и себестоимость.
 * Штрафы и удержания (Pen) показываем отдельно: в маржу они не входят. Налог и реклама тоже не входят.
 */

export type MoneyBreakdown = {
  /** Выручка по цене продавца, ₽. */
  revenue: number;
  /** Удержано WB (комиссия, эквайринг и т. п.) = выручка − к перечислению. */
  wbHold: number;
  /** К перечислению от WB за продажи за вычетом возвратов. */
  pay: number;
  logistics: number;
  storage: number;
  acceptance: number;
  /** Остаётся до себестоимости = к перечислению − логистика − хранение − приёмка. */
  beforeCost: number;
  /** Штрафы и удержания (не входят в маржу). */
  penalties: number;
  /** Продажи минус возвраты, шт. */
  units: number;
  /** Себестоимость проданного для товаров, где она указана, ₽. */
  cost: number | null;
  /** Доля выручки, по которой себестоимость известна, 0–1. */
  costCoverage: number;
  /** Прибыль до налога и рекламы по товарам с себестоимостью = остаётся до себестоимости (этих товаров) − себестоимость. */
  profit: number | null;
  /** Прибыль / выручка этих товаров, 0–1. */
  margin: number | null;
};

export type ProductMoney = {
  nmId: string;
  title: string;
  units: number;
  revenue: number;
  beforeCost: number;
  logistics: number;
  storage: number;
  cost: number | null;
  profit: number | null;
  margin: number | null;
  /** Логистика и хранение как доля выручки, 0–1. */
  serviceShare: number | null;
};

export type MoneyAnalytics = {
  current: MoneyBreakdown;
  past: MoneyBreakdown | null;
  period: { from: string; to: string; days: number };
  products: ProductMoney[];
  /** Отчёт реализации WB обрезан лимитом выгрузки: суммы занижены. */
  truncated: boolean;
};

const before = (w: SellerRealizationWindow) => w.Pay - w.L - w.StRealization - w.A;

function breakdown(windows: Array<{ w: SellerRealizationWindow; cost: number | null }>): MoneyBreakdown {
  let revenue = 0;
  let pay = 0;
  let logistics = 0;
  let storage = 0;
  let acceptance = 0;
  let penalties = 0;
  let units = 0;
  let cost = 0;
  let knownRevenue = 0;
  let knownBefore = 0;
  let anyCost = false;
  for (const { w, cost: unitCost } of windows) {
    revenue += w.S;
    pay += w.Pay;
    logistics += w.L;
    storage += w.StRealization;
    acceptance += w.A;
    penalties += w.Pen;
    units += w.N;
    if (unitCost != null && unitCost > 0) {
      anyCost = true;
      cost += unitCost * Math.max(0, w.N);
      knownRevenue += w.S;
      knownBefore += before(w);
    }
  }
  const profit = anyCost ? knownBefore - cost : null;
  return {
    revenue,
    wbHold: revenue - pay,
    pay,
    logistics,
    storage,
    acceptance,
    beforeCost: pay - logistics - storage - acceptance,
    penalties,
    units,
    cost: anyCost ? cost : null,
    costCoverage: revenue > 0 ? knownRevenue / revenue : 0,
    profit,
    margin: profit != null && knownRevenue > 0 ? profit / knownRevenue : null,
  };
}

type NmWindows = Array<{ nmId: string; current: SellerRealizationWindow; prior: SellerRealizationWindow | null }>;

/**
 * @param days период в днях (7/14/28/60/90). Окна берутся из realization.periods; для 28 дней, если периодов в снимке ещё нет (старая выгрузка), —
 * из прежних окон 28+28. Для других периодов без данных результат null.
 */
export function buildMoneyAnalytics(realization: SellerRealizationSnapshot | null | undefined, items: SellerCatalogItem[], days = 28): MoneyAnalytics | null {
  if (!realization || realization.error) return null;
  const per = realization.periods?.[String(days)];
  let entries: NmWindows;
  let noNmCurrent: SellerRealizationWindow | undefined;
  let noNmPrior: SellerRealizationWindow | null | undefined;
  let from: string;
  if (per) {
    entries = Object.entries(per.byNm).map(([nmId, w]) => ({ nmId, current: w.current, prior: w.prior }));
    noNmCurrent = per.noNm.current;
    noNmPrior = per.noNm.prior;
    from = per.from;
  } else if (days === 28) {
    entries = Object.entries(realization.byNm)
      .filter(([, nm]) => nm.current)
      .map(([nmId, nm]) => ({ nmId, current: nm.current!, prior: nm.prior ?? null }));
    noNmCurrent = realization.noNmCurrent;
    noNmPrior = realization.noNmPrior;
    from = new Date(Date.parse(`${realization.dateTo.slice(0, 10)}T00:00:00Z`) - 27 * 86_400_000).toISOString().slice(0, 10);
  } else {
    return null;
  }
  if (entries.length === 0) return null;
  const itemOf = new Map(items.map((i) => [i.externalId, i]));
  const costOf = (nmId: string) => itemOf.get(nmId)?.costPrice ?? null;

  const cur = entries.map((e) => ({ w: e.current, cost: costOf(e.nmId) }));
  const prev = entries.filter((e) => e.prior).map((e) => ({ w: e.prior!, cost: costOf(e.nmId) }));
  // Строки без артикула (штрафы, общая логистика и т. п.) входят в итоги магазина, но не в таблицу товаров.
  if (noNmCurrent) cur.push({ w: noNmCurrent, cost: null });
  if (noNmPrior && prev.length > 0) prev.push({ w: noNmPrior, cost: null });

  const products: ProductMoney[] = entries
    .map(({ nmId, current: w }) => {
      const unitCost = costOf(nmId);
      const beforeCost = before(w);
      const cost = unitCost != null && unitCost > 0 ? unitCost * Math.max(0, w.N) : null;
      const profit = cost != null ? beforeCost - cost : null;
      return {
        nmId,
        title: itemOf.get(nmId)?.title || itemOf.get(nmId)?.vendorCode || nmId,
        units: w.N,
        revenue: w.S,
        beforeCost,
        logistics: w.L,
        storage: w.StRealization,
        cost,
        profit,
        // Без продаж за период (продано 0 или меньше) процент от случайных копеек выручки бессмыслен: 4 120% и −4 740% вводят в заблуждение.
        margin: profit != null && w.S > 0 && w.N > 0 ? profit / w.S : null,
        serviceShare: w.S > 0 && w.N > 0 ? (w.L + w.StRealization) / w.S : null,
      };
    })
    .filter((p) => p.revenue !== 0 || p.logistics !== 0 || p.units !== 0)
    .sort((a, b) => b.revenue - a.revenue);

  return {
    current: breakdown(cur),
    past: prev.length > 0 ? breakdown(prev) : null,
    period: { from, to: realization.dateTo.slice(0, 10), days },
    products,
    truncated: realization.truncated === true,
  };
}