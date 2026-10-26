import type { SellerRealizationSnapshot } from "@/lib/seller-hub/types";

/**
 * Во сколько товарам обходится логистика WB и где она выросла.
 * Источник — отчёт реализации (finance-api): за 28 дней и за 28 дней до них. Ничего не оценивается, только суммы из отчёта.
 * «Переплата от роста» — на сколько вы заплатили бы меньше, если бы доставка стоила как в прошлом окне: (цена доставки сейчас − раньше) × число доставок сейчас.
 */

/** Меньше стольких доставок в окне — цена одной доставки случайна, сравнивать нельзя. */
export const MIN_DELIVERIES = 8;
/** Рост цены доставки на столько процентов и больше считаем заметным. */
export const GROWTH_PERCENT = 10;
/** Для суждения о возвратах: минимум доставок, минимум возвратов и во сколько раз выше среднего по магазину. */
export const RETURN_MIN_DELIVERIES = 5;
export const RETURN_MIN_COUNT = 2;
export const RETURN_ABOVE_SHOP = 1.5;
export const RETURN_MIN_RATE = 0.2;

export type ProductLogisticsCost = {
  nmId: string;
  title: string;
  /** Доставок к покупателю за 28 дней. */
  deliveries: number;
  /** Средняя цена одной доставки сейчас, ₽; null — мало доставок. */
  perDelivery: number | null;
  /** То же за предыдущие 28 дней. */
  priorPerDelivery: number | null;
  /** Изменение цены доставки, %; null — нечем сравнить. */
  changePercent: number | null;
  returns: number;
  /** Доля возвратов от доставок, 0–1; null — доставок нет. */
  returnRate: number | null;
  returnCost: number;
  /** Вся логистика за 28 дней: доставки + возвраты + прочее. */
  logisticsTotal: number;
  /** Выручка продавца за 28 дней, ₽ (по цене продавца). */
  revenue: number;
  /** Доля логистики в выручке, 0–1; null — выручки нет. */
  shareOfRevenue: number | null;
  storage: number;
  acceptance: number;
  /** Переплата из-за роста цены доставки, ₽ (0, если роста нет или данных мало). */
  overpay: number;
  /** Возвратов заметно больше, чем в среднем по магазину. */
  highReturn: boolean;
};

export type LogisticsCostSummary = {
  logisticsTotal: number;
  revenue: number;
  shareOfRevenue: number | null;
  returnCost: number;
  storage: number;
  acceptance: number;
  overpay: number;
  grewCount: number;
  /** Доля возвратов от доставок по всему магазину, 0–1; null — доставок нет. */
  shopReturnRate: number | null;
  highReturnCount: number;
  products: ProductLogisticsCost[];
};

const round = (n: number, digits = 0) => {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
};

export function buildLogisticsCost(
  realization: SellerRealizationSnapshot | null | undefined,
  titleOf: (nmId: string) => string,
): LogisticsCostSummary | null {
  if (!realization || realization.error) return null;
  const products: ProductLogisticsCost[] = [];
  for (const [nmId, nm] of Object.entries(realization.byNm)) {
    const cur = nm.delivery;
    const prev = nm.priorDelivery;
    const window = nm.current;
    if (!cur && !window) continue;
    const deliveries = cur?.D ?? 0;
    const perDelivery = cur && cur.D >= MIN_DELIVERIES ? cur.deliveryCost / cur.D : null;
    const priorPerDelivery = prev && prev.D >= MIN_DELIVERIES ? prev.deliveryCost / prev.D : null;
    const changePercent = perDelivery != null && priorPerDelivery != null && priorPerDelivery > 0 ? ((perDelivery - priorPerDelivery) / priorPerDelivery) * 100 : null;
    const logisticsTotal = (cur?.deliveryCost ?? 0) + (cur?.returnCost ?? 0) + (cur?.otherL ?? 0);
    const revenue = window?.S ?? 0;
    const overpay = changePercent != null && changePercent >= GROWTH_PERCENT && perDelivery != null && priorPerDelivery != null ? Math.max(0, (perDelivery - priorPerDelivery) * deliveries) : 0;
    // Товар без доставок, но с хранением или приёмкой всё равно показываем: это тоже затраты.
    if (logisticsTotal === 0 && deliveries === 0 && (window?.StRealization ?? 0) === 0 && (window?.A ?? 0) === 0) continue;
    products.push({
      nmId,
      title: titleOf(nmId),
      deliveries,
      perDelivery: perDelivery == null ? null : round(perDelivery, 1),
      priorPerDelivery: priorPerDelivery == null ? null : round(priorPerDelivery, 1),
      changePercent: changePercent == null ? null : round(changePercent, 1),
      returns: cur?.R ?? 0,
      returnRate: deliveries > 0 ? (cur?.R ?? 0) / deliveries : null,
      returnCost: round(cur?.returnCost ?? 0),
      logisticsTotal: round(logisticsTotal),
      revenue: round(revenue),
      // Без продаж за окно доля от копеек выручки бессмысленна (тысячи процентов): показываем только суммы.
      shareOfRevenue: revenue > 0 && (window?.N ?? 0) > 0 ? logisticsTotal / revenue : null,
      storage: round(window?.StRealization ?? 0),
      acceptance: round(window?.A ?? 0),
      overpay: round(overpay),
      highReturn: false,
    });
  }
  if (products.length === 0) return null;
  products.sort((a, b) => b.logisticsTotal - a.logisticsTotal);
  const sum = (pick: (p: ProductLogisticsCost) => number) => products.reduce((s, p) => s + pick(p), 0);
  const revenue = sum((p) => p.revenue);
  const logisticsTotal = sum((p) => p.logisticsTotal);
  const totalDeliveries = sum((p) => p.deliveries);
  const shopReturnRate = totalDeliveries > 0 ? sum((p) => p.returns) / totalDeliveries : null;
  for (const p of products) {
    p.highReturn =
      shopReturnRate != null &&
      p.deliveries >= RETURN_MIN_DELIVERIES &&
      p.returns >= RETURN_MIN_COUNT &&
      p.returnRate != null &&
      p.returnRate >= RETURN_MIN_RATE &&
      p.returnRate >= shopReturnRate * RETURN_ABOVE_SHOP;
  }
  return {
    logisticsTotal: round(logisticsTotal),
    revenue: round(revenue),
    shareOfRevenue: revenue > 0 ? logisticsTotal / revenue : null,
    returnCost: round(sum((p) => p.returnCost)),
    storage: round(sum((p) => p.storage)),
    acceptance: round(sum((p) => p.acceptance)),
    overpay: round(sum((p) => p.overpay)),
    grewCount: products.filter((p) => p.overpay > 0).length,
    shopReturnRate,
    highReturnCount: products.filter((p) => p.highReturn).length,
    products,
  };
}
