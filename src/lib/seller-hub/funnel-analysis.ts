import type { SellerFunnelNm, SellerFunnelPeriod, SellerFunnelSnapshot } from "@/lib/seller-hub/types";

/**
 * Откуда покупки: воронка магазина и по товарам (переходы → корзина → заказ → выкуп).
 * Только данные воронки WB; пороги «плохо» не придумываем: сравниваем с вашим же средним по магазину и с прошлым периодом.
 */

export type FunnelStepId = "open" | "cart" | "order" | "buyout";

export const FUNNEL_STEP_LABEL: Record<FunnelStepId, string> = {
  open: "Перешли в карточку",
  cart: "Добавили в корзину",
  order: "Заказали",
  buyout: "Выкупили",
};

export type FunnelStep = {
  id: FunnelStepId;
  label: string;
  count: number;
  /** Конверсия из предыдущего шага, %. null — у первого шага или нет базы. */
  conversion: number | null;
  /** Прошлый период: число и конверсия. null — прошлого периода нет. */
  pastCount: number | null;
  pastConversion: number | null;
};

type Counts = { open: number; cart: number; order: number; buyout: number };

function counts(period: SellerFunnelPeriod | null): Counts | null {
  if (!period) return null;
  const { openCount, cartCount, orderCount, buyoutCount } = period;
  if (openCount == null || cartCount == null || orderCount == null || buyoutCount == null) return null;
  return { open: openCount, cart: cartCount, order: orderCount, buyout: buyoutCount };
}

const rate = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

function sumCounts(rows: Array<{ selected: Counts | null; past: Counts | null }>, key: "selected" | "past"): Counts | null {
  let any = false;
  const total: Counts = { open: 0, cart: 0, order: 0, buyout: 0 };
  for (const row of rows) {
    const c = row[key];
    if (!c) continue;
    any = true;
    total.open += c.open;
    total.cart += c.cart;
    total.order += c.order;
    total.buyout += c.buyout;
  }
  return any ? total : null;
}

function stepsFrom(selected: Counts | null, past: Counts | null): FunnelStep[] {
  if (!selected) return [];
  const order: FunnelStepId[] = ["open", "cart", "order", "buyout"];
  return order.map((id, index) => {
    const prev = index > 0 ? order[index - 1]! : null;
    return {
      id,
      label: FUNNEL_STEP_LABEL[id],
      count: selected[id],
      conversion: prev ? rate(selected[id], selected[prev]) : null,
      pastCount: past ? past[id] : null,
      pastConversion: prev && past ? rate(past[id], past[prev]) : null,
    };
  });
}

/** Воронка всего магазина: сумма по артикулам. Если у какого-то артикула нет полей воронки, воронка не строится. */
export function storeFunnel(funnel: SellerFunnelSnapshot | null | undefined): { steps: FunnelStep[]; dateFrom: string; dateTo: string } | null {
  if (!funnel || funnel.status === "error" || funnel.status === "forbidden" || funnel.status === "jam_required" || funnel.truncated) return null;
  const rows = Object.values(funnel.byNm ?? {}).map((row) => ({ selected: counts(row.selected), past: counts(row.past) }));
  if (rows.length === 0) return null;
  const selected = sumCounts(rows, "selected");
  if (!selected || selected.open === 0) return null;
  return { steps: stepsFrom(selected, sumCounts(rows, "past")), dateFrom: funnel.dateFrom, dateTo: funnel.dateTo };
}

export type ProductFunnelRow = {
  nmId: string;
  open: number;
  cart: number;
  order: number;
  buyout: number;
  /** Конверсии шагов, %. */
  openToCart: number | null;
  cartToOrder: number | null;
  orderToBuyout: number | null;
  /** Самый слабый шаг относительно среднего по магазину и на сколько п. п. ниже. null — ниже среднего нигде нет или данных мало. */
  weakest: { step: "openToCart" | "cartToOrder"; gapPoints: number } | null;
};

const MIN_BASE: Record<"openToCart" | "cartToOrder" | "orderToBuyout", number> = {
  openToCart: 30,
  cartToOrder: 10,
  orderToBuyout: 10,
};

/**
 * Воронка по товарам с самым слабым шагом. Шаг оцениваем только при достаточной базе (число входов в шаг), чтобы не
 * принимать случайность за проблему; разрыв считаем к среднему по магазину в п. п.
 */
export function productFunnels(funnel: SellerFunnelSnapshot | null | undefined): ProductFunnelRow[] {
  const store = storeFunnel(funnel);
  if (!funnel || !store) return [];
  const avg = {
    openToCart: store.steps[1]?.conversion ?? null,
    cartToOrder: store.steps[2]?.conversion ?? null,
    orderToBuyout: store.steps[3]?.conversion ?? null,
  };
  const rows: ProductFunnelRow[] = [];
  for (const [nmId, row] of Object.entries(funnel.byNm ?? {}) as Array<[string, SellerFunnelNm]>) {
    const c = counts(row.selected);
    if (!c || c.open === 0) continue;
    const conv = {
      openToCart: rate(c.cart, c.open),
      cartToOrder: rate(c.order, c.cart),
      orderToBuyout: rate(c.buyout, c.order),
    };
    const base = { openToCart: c.open, cartToOrder: c.cart, orderToBuyout: c.order };
    let weakest: ProductFunnelRow["weakest"] = null;
    // Выкуп приходит с задержкой в недели: по свежим заказам он занижен, поэтому слабым местом его не считаем.
    for (const step of ["openToCart", "cartToOrder"] as const) {
      const mine = conv[step];
      const average = avg[step];
      if (mine == null || average == null || base[step] < MIN_BASE[step]) continue;
      const gap = Math.round((average - mine) * 10) / 10;
      if (gap > 0 && (weakest == null || gap > weakest.gapPoints)) weakest = { step, gapPoints: gap };
    }
    rows.push({ nmId, ...c, ...conv, weakest });
  }
  return rows.sort((a, b) => b.open - a.open);
}

export type OrderSources = {
  days: number;
  /** Всего заказов магазина за общие дни, шт. */
  total: number;
  /** Заказы по рекламе товаров, на которые тратились деньги, шт. */
  adDirect: number;
  /** Заказы по рекламе товаров без расхода (ассоциированные), шт. */
  adAssociated: number;
  /** Остальное: органика и акции. WB их не разделяет. */
  organic: number;
};

/**
 * Источники заказов за общие дни рекламы и Analytics WB. Органика и акции в одной строке: WB в отчётах их не разделяет.
 * null — общих дней нет или в Analytics нет заказов.
 */
export function orderSources(input: {
  adDaily: Array<{ date: string; orders: number }>;
  adDirectOrders: number;
  adAssociatedOrders: number;
  storeDaily: Array<{ date: string; orders: number }>;
}): OrderSources | null {
  const store = new Map(input.storeDaily.map((d) => [d.date.slice(0, 10), d.orders]));
  let total = 0;
  let adOnCommon = 0;
  let days = 0;
  for (const day of input.adDaily) {
    const orders = store.get(day.date);
    if (orders == null) continue;
    total += orders;
    adOnCommon += day.orders;
    days += 1;
  }
  if (days === 0 || total <= 0) return null;
  const adTotal = Math.min(total, adOnCommon);
  const associatedShare = input.adDirectOrders + input.adAssociatedOrders > 0 ? input.adAssociatedOrders / (input.adDirectOrders + input.adAssociatedOrders) : 0;
  const adAssociated = Math.round(adTotal * associatedShare);
  const adDirect = adTotal - adAssociated;
  return { days, total, adDirect, adAssociated, organic: Math.max(0, total - adTotal) };
}
