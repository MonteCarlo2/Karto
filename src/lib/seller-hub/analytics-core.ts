import type { SellerCatalogItem, SellerFunnelNm, SellerFunnelPeriod, SellerFunnelSnapshot, SellerStocksReportSnapshot } from "@/lib/seller-hub/types";

/**
 * Расчётное ядро раздела «Аналитика». Только данные WB по вашему кабинету: воронка за выбранный период (7–90 дней) против предыдущего такого же (analytics-api),
 * отчёт об остатках и упущенных заказах, каталог. Ничего не оценивается и не прогнозируется.
 * Выкуп считаем так же, как WB: выкуплено / (выкуплено + отменено), то есть по заказам, у которых уже есть исход.
 */

export type PeriodTotals = {
  opens: number;
  carts: number;
  orders: number;
  /** Сумма заказов, ₽ (orderSum WB). */
  orderSum: number;
  buyouts: number;
  cancels: number;
  /** Средний чек заказа, ₽; null — заказов нет. */
  avgCheck: number | null;
  /** Из просмотров в корзину, 0–1; null — просмотров нет. */
  cartRate: number | null;
  /** Из корзины в заказ, 0–1. */
  orderRate: number | null;
  /** Из просмотра в заказ, 0–1. */
  openToOrder: number | null;
  /** Выкуп по завершённым заказам, 0–1; null — исходов ещё нет. */
  buyoutRate: number | null;
  /** Сколько артикулов получили хотя бы один заказ. */
  activeProducts: number;
};

export type LostSummary = {
  orders: number;
  sum: number;
  buyouts: number;
  buyoutsSum: number;
  /** Артикулов, по которым WB насчитал упущенное. */
  products: number;
};

export type StoreKpis = {
  current: PeriodTotals;
  past: PeriodTotals | null;
  period: { from: string; to: string; pastFrom: string | null; pastTo: string | null };
  lost: LostSummary | null;
  skuCount: number;
  /** WB отдал не все карточки (воронка или отчёт об остатках обрезаны): итоги занижены, это нужно показать на экране. */
  truncated: boolean;
};

const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

function sumPeriod(rows: Array<SellerFunnelPeriod | null | undefined>): PeriodTotals {
  let opens = 0;
  let carts = 0;
  let orders = 0;
  let orderSum = 0;
  let buyouts = 0;
  let cancels = 0;
  let activeProducts = 0;
  for (const p of rows) {
    if (!p) continue;
    opens += num(p.openCount);
    carts += num(p.cartCount);
    orders += num(p.orderCount);
    orderSum += num(p.orderSum);
    buyouts += num(p.buyoutCount);
    cancels += num(p.cancelCount);
    if (num(p.orderCount) > 0) activeProducts += 1;
  }
  return {
    opens,
    carts,
    orders,
    orderSum,
    buyouts,
    cancels,
    avgCheck: orders > 0 ? orderSum / orders : null,
    cartRate: ratio(carts, opens),
    orderRate: ratio(orders, carts),
    openToOrder: ratio(orders, opens),
    buyoutRate: ratio(buyouts, buyouts + cancels),
    activeProducts,
  };
}

/** Изменение в процентах относительно прошлого значения; null — прошлое значение нулевое или неизвестное. */
export function pctChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || !(previous > 0)) return null;
  return ((current - previous) / previous) * 100;
}

export function buildStoreKpis(
  funnel: SellerFunnelSnapshot | null | undefined,
  stocksReport: SellerStocksReportSnapshot | null | undefined,
  skuCount: number,
): StoreKpis | null {
  if (!funnel || funnel.error || (funnel.status && funnel.status !== "ok" && funnel.status !== "partial")) return null;
  const rows = Object.values(funnel.byNm);
  if (rows.length === 0) return null;
  const hasPast = rows.some((r) => r.past != null);
  let lost: LostSummary | null = null;
  if (stocksReport && !stocksReport.error && (stocksReport.status === "ok" || stocksReport.status === "partial")) {
    let orders = 0;
    let sum = 0;
    let buyouts = 0;
    let buyoutsSum = 0;
    let products = 0;
    for (const r of Object.values(stocksReport.byNm)) {
      const o = num(r.lostOrdersCount);
      orders += o;
      sum += num(r.lostOrdersSum);
      buyouts += num(r.lostBuyoutsCount);
      buyoutsSum += num(r.lostBuyoutsSum);
      if (o > 0) products += 1;
    }
    lost = { orders, sum, buyouts, buyoutsSum, products };
  }
  return {
    current: sumPeriod(rows.map((r) => r.selected)),
    past: hasPast ? sumPeriod(rows.map((r) => r.past)) : null,
    period: { from: funnel.dateFrom, to: funnel.dateTo, pastFrom: funnel.pastDateFrom ?? null, pastTo: funnel.pastDateTo ?? null },
    lost,
    skuCount,
    truncated: funnel.truncated === true || stocksReport?.truncated === true,
  };
}

export type AbcClass = "A" | "B" | "C" | "none";

export type ProductRow = {
  nmId: string;
  title: string;
  vendorCode: string;
  brand: string;
  category: string;
  opens: number;
  carts: number;
  orders: number;
  orderSum: number;
  /** Заказы и сумма за предыдущий такой же период; null — прошлого периода нет. */
  prevOrders: number | null;
  prevOrderSum: number | null;
  /** Просмотры, корзины, выкупы и отмены: нужны экрану артикула для воронки с прошлым периодом. */
  prevOpens: number | null;
  prevCarts: number | null;
  buyouts: number;
  cancels: number;
  prevBuyouts: number | null;
  prevCancels: number | null;
  /** Изменение суммы заказов, %; null — нечем сравнить. */
  sumChange: number | null;
  /** Вклад артикула в изменение суммы заказов по магазину, ₽ (текущая минус прошлая). */
  sumDelta: number | null;
  /** Доля в сумме заказов магазина, 0–1. */
  share: number;
  abc: AbcClass;
  buyoutRate: number | null;
  cartRate: number | null;
  orderRate: number | null;
  rating: number | null;
  stock: number | null;
  /** WB: на сколько дней хватит остатка при текущей скорости продаж; null — не рассчитано WB. */
  saleRateDays: number | null;
  /** WB: упущенные заказы и сумма из-за отсутствия товара. */
  lostOrders: number;
  lostSum: number;
  /** Дней без товара на складах за период (WB), если число известно. */
  missingDays: number | null;
  /** Место воронки, где артикул теряет покупателей заметно сильнее магазина; null — перекоса нет или мало просмотров. */
  leak: "cart" | "order" | null;
  /** Маржа на 1 продажу, ₽ и %: утверждённый расчёт «Товаров» (нужна себестоимость). */
  marginRub: number | null;
  marginPercent: number | null;
};

export type ProductExtras = Map<string, { marginRub: number | null; marginPercent: number | null }>;

/** Меньше стольких просмотров — доли воронки случайны, перекос не отмечаем. */
export const MIN_OPENS_FOR_LEAK = 100;
/** Конверсия артикула ниже такой доли от магазинной считается «утечкой». */
export const LEAK_BELOW_SHOP = 0.6;
/** Границы ABC по накопленной доле суммы заказов: A — до 80%, B — до 95%, остальное C. */
export const ABC_A = 0.8;
export const ABC_B = 0.95;

export function buildProductRows(input: {
  funnel: SellerFunnelSnapshot | null | undefined;
  stocksReport: SellerStocksReportSnapshot | null | undefined;
  items: SellerCatalogItem[];
  extras?: ProductExtras;
}): ProductRow[] {
  const { funnel } = input;
  if (!funnel || funnel.error) return [];
  const stocksOk = input.stocksReport && !input.stocksReport.error && (input.stocksReport.status === "ok" || input.stocksReport.status === "partial");
  const shop = sumPeriod(Object.values(funnel.byNm).map((r) => r.selected));
  const totalSum = shop.orderSum;
  const itemOf = new Map(input.items.map((i) => [i.externalId, i]));

  const rows: ProductRow[] = [];
  for (const [nmId, f] of Object.entries(funnel.byNm) as Array<[string, SellerFunnelNm]>) {
    const item = itemOf.get(nmId);
    const cur = f.selected;
    const past = f.past;
    const sr = stocksOk ? input.stocksReport!.byNm[nmId] : undefined;
    const opens = num(cur.openCount);
    const carts = num(cur.cartCount);
    const orders = num(cur.orderCount);
    const orderSum = num(cur.orderSum);
    const cartRate = ratio(carts, opens);
    const orderRate = ratio(orders, carts);
    let leak: ProductRow["leak"] = null;
    if (opens >= MIN_OPENS_FOR_LEAK) {
      if (cartRate != null && shop.cartRate != null && cartRate < shop.cartRate * LEAK_BELOW_SHOP) leak = "cart";
      else if (carts >= 10 && orderRate != null && shop.orderRate != null && orderRate < shop.orderRate * LEAK_BELOW_SHOP) leak = "order";
    }
    const prevSum = past ? num(past.orderSum) : null;
    const extra = input.extras?.get(nmId);
    rows.push({
      nmId,
      title: item?.title || item?.vendorCode || nmId,
      vendorCode: item?.vendorCode ?? "",
      brand: item?.brand ?? "",
      category: item?.category ?? "",
      opens,
      carts,
      orders,
      orderSum,
      prevOrders: past ? num(past.orderCount) : null,
      prevOrderSum: prevSum,
      prevOpens: past ? num(past.openCount) : null,
      prevCarts: past ? num(past.cartCount) : null,
      buyouts: num(cur.buyoutCount),
      cancels: num(cur.cancelCount),
      prevBuyouts: past ? num(past.buyoutCount) : null,
      prevCancels: past ? num(past.cancelCount) : null,
      sumChange: pctChange(orderSum, prevSum),
      sumDelta: prevSum == null ? null : orderSum - prevSum,
      share: totalSum > 0 ? orderSum / totalSum : 0,
      abc: "none",
      buyoutRate: ratio(num(cur.buyoutCount), num(cur.buyoutCount) + num(cur.cancelCount)),
      cartRate,
      orderRate,
      rating: f.feedbackRating != null && f.feedbackRating > 0 ? f.feedbackRating : null,
      stock: item?.totalStock ?? sr?.stockCount ?? null,
      saleRateDays: sr?.saleRateDays ?? null,
      lostOrders: num(sr?.lostOrdersCount),
      lostSum: num(sr?.lostOrdersSum),
      missingDays: sr?.officeMissingTimeDays ?? null,
      leak,
      marginRub: extra?.marginRub ?? null,
      marginPercent: extra?.marginPercent ?? null,
    });
  }

  // ABC по накопленной доле суммы заказов: артикулы без заказов в класс не попадают.
  const ranked = rows.filter((r) => r.orderSum > 0).sort((a, b) => b.orderSum - a.orderSum);
  let acc = 0;
  for (const r of ranked) {
    const before = acc / totalSum;
    acc += r.orderSum;
    // Класс определяем по доле, накопленной ДО артикула: первый артикул всегда A, граница включает артикул, пересёкший порог.
    r.abc = before < ABC_A ? "A" : before < ABC_B ? "B" : "C";
  }
  return rows.sort((a, b) => b.orderSum - a.orderSum || b.opens - a.opens);
}

export type AbcSummary = Array<{ abc: Exclude<AbcClass, "none">; products: number; orderSum: number; share: number }>;

export function abcSummary(rows: ProductRow[]): AbcSummary {
  const total = rows.reduce((s, r) => s + r.orderSum, 0);
  return (["A", "B", "C"] as const).map((abc) => {
    const part = rows.filter((r) => r.abc === abc);
    const sum = part.reduce((s, r) => s + r.orderSum, 0);
    return { abc, products: part.length, orderSum: sum, share: total > 0 ? sum / total : 0 };
  });
}

const rub = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`;
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

export type Insight = { id: string; tone: "good" | "bad" | "info"; text: string };

/** Выводы за период словами. Каждая строка строится только из чисел выше, ничего не додумывается. */
export function buildInsights(kpis: StoreKpis | null, rows: ProductRow[], days = 28): Insight[] {
  if (!kpis) return [];
  const out: Insight[] = [];
  const { current, past } = kpis;
  const change = pctChange(current.orderSum, past?.orderSum ?? null);
  if (change != null && past) {
    out.push({
      id: "sum",
      tone: change >= 0 ? "good" : "bad",
      text: `Сумма заказов за период ${rub(current.orderSum)}: ${change >= 0 ? "больше" : "меньше"} на ${rub(Math.abs(current.orderSum - past.orderSum))} (${Math.abs(Math.round(change * 10) / 10).toLocaleString("ru-RU")}%), чем за предыдущие ${days} ${plural(days, "день", "дня", "дней")}.`,
    });
  }
  const movers = topMovers(rows, 3);
  const grow = movers.growing[0];
  if (grow && grow.sumDelta != null) out.push({ id: "grow", tone: "good", text: `Больше всего добавил «${grow.title}»: +${rub(grow.sumDelta)} к сумме заказов.` });
  const fall = movers.falling[0];
  if (fall && fall.sumDelta != null) out.push({ id: "fall", tone: "bad", text: `Сильнее всего просел «${fall.title}»: ${rub(fall.sumDelta)} к сумме заказов.` });
  const leaks = rows.filter((r) => r.leak != null).sort((a, b) => b.opens - a.opens);
  if (leaks.length > 0) {
    const first = leaks[0]!;
    out.push({
      id: "leak",
      tone: "info",
      text: `${leaks.length} ${plural(leaks.length, "товар теряет", "товара теряют", "товаров теряют")} покупателей в воронке заметно сильнее магазина. Больше всего просмотров у «${first.title}» (${first.opens.toLocaleString("ru-RU")}): ${first.leak === "cart" ? "её редко кладут в корзину" : "из корзины редко доходят до заказа"}.`,
    });
  }
  if (kpis.lost && kpis.lost.sum > 0) {
    out.push({ id: "lost", tone: "bad", text: `Из-за отсутствия товара WB насчитал упущенных заказов на ${rub(kpis.lost.sum)} (${kpis.lost.orders} шт., ${kpis.lost.products} ${plural(kpis.lost.products, "товар", "товара", "товаров")}).` });
  }
  const classA = rows.filter((r) => r.abc === "A");
  const totalSum = rows.reduce((s, r) => s + r.orderSum, 0);
  if (classA.length > 0 && totalSum > 0) {
    // Долю берём фактическую: товар, перешагнувший порог 80%, тоже в классе A, поэтому она может быть заметно выше 80.
    const shareA = Math.round((classA.reduce((s, r) => s + r.orderSum, 0) / totalSum) * 100);
    out.push({ id: "abc", tone: "info", text: `${classA.length} ${plural(classA.length, "товар даёт", "товара дают", "товаров дают")} ${shareA}% суммы заказов (класс A), остальные товары вместе — ${100 - shareA}%.` });
  }
  if (current.buyoutRate != null && past?.buyoutRate != null) {
    const d = (current.buyoutRate - past.buyoutRate) * 100;
    if (Math.abs(d) >= 3) out.push({ id: "buyout", tone: d > 0 ? "good" : "bad", text: `Выкуп ${d > 0 ? "вырос" : "снизился"} на ${Math.abs(Math.round(d * 10) / 10).toLocaleString("ru-RU")} п. п.: сейчас ${(current.buyoutRate * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%.` });
  }
  return out;
}

/** Растущие и падающие по сумме заказов к прошлому периоду, по вкладу в ₽. Артикулы без прошлого периода не участвуют. */
export function topMovers(rows: ProductRow[], limit = 5): { growing: ProductRow[]; falling: ProductRow[] } {
  const withDelta = rows.filter((r) => r.sumDelta != null);
  return {
    growing: withDelta.filter((r) => r.sumDelta! > 0).sort((a, b) => b.sumDelta! - a.sumDelta!).slice(0, limit),
    falling: withDelta.filter((r) => r.sumDelta! < 0).sort((a, b) => a.sumDelta! - b.sumDelta!).slice(0, limit),
  };
}
