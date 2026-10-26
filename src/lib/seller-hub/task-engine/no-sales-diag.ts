/**
 * Диагноз TASK_NO_SALES: сравнение с конверсиями магазина + Пуассон + BH.
 * Стандарт §3.4.
 */

import { formatCartAdds, formatCarts, formatOpens, formatOrders, ruPlural } from "./ru-plural";
import { benjaminiHochberg, bhAdjustedPValues, poissonCdfLower, poissonZeroP } from "./stats";

export const NO_SALES_MIN_EXPECTED = 3;
export const NO_SALES_SHOP_MIN_ORDERS = 20;
export const NO_SALES_BH_Q = 0.05;

export type ShopConversionRates = {
  cA: number;
  cB: number;
  shopOpens: number;
  shopCarts: number;
  shopOrders: number;
  applicable: boolean;
  note: string | null;
};

export type NoSalesStageTest = {
  stage: "open_to_cart" | "cart_to_order";
  expected: number;
  observed: number;
  pValue: number;
  tested: boolean;
};

export type NoSalesDiagnosisKind =
  | "no_opens"
  | "no_carts"
  | "no_orders"
  | "low_traffic"
  | "inconclusive"
  | "legacy_fact";

export type NoSalesDiagnosis = {
  kind: NoSalesDiagnosisKind;
  text: string;
  levers: string;
  cA: number | null;
  cB: number | null;
  E_c: number | null;
  E_o: number | null;
  p_cart: number | null;
  p_order: number | null;
  q_cart: number | null;
  q_order: number | null;
  bh_rank_cart: number | null;
  bh_rank_order: number | null;
  M: number | null;
  method: "shop_poisson_bh" | "legacy_insufficient_shop" | "zero_opens";
};

export function shopConversionExcluding(
  products: Array<{
    nmId: string;
    openCount: number | null;
    priorOpenCount: number | null;
    cartCount: number | null;
    priorCartCount: number | null;
    orders: number | null;
    priorOrders: number | null;
  }>,
  excludeNmId: string,
): ShopConversionRates {
  let opens = 0;
  let carts = 0;
  let orders = 0;
  for (const p of products) {
    if (p.nmId === excludeNmId) continue;
    opens += (p.openCount ?? 0) + (p.priorOpenCount ?? 0);
    carts += (p.cartCount ?? 0) + (p.priorCartCount ?? 0);
    orders += (p.orders ?? 0) + (p.priorOrders ?? 0);
  }
  if (orders < NO_SALES_SHOP_MIN_ORDERS || !(opens > 0) || !(carts > 0)) {
    return {
      cA: 0,
      cB: 0,
      shopOpens: opens,
      shopCarts: carts,
      shopOrders: orders,
      applicable: false,
      note: "сравнить не с чем: в магазине мало заказов",
    };
  }
  return {
    cA: carts / opens,
    cB: orders / carts,
    shopOpens: opens,
    shopCarts: carts,
    shopOrders: orders,
    applicable: true,
    note: null,
  };
}

export function noSalesStageTests(input: {
  opens: number;
  carts: number;
  cA: number;
  cB: number;
}): NoSalesStageTest[] {
  const E_c = input.opens * input.cA;
  const E_o = input.carts * input.cB;
  const tests: NoSalesStageTest[] = [];
  if (E_c >= NO_SALES_MIN_EXPECTED) {
    tests.push({
      stage: "open_to_cart",
      expected: E_c,
      observed: input.carts,
      pValue: poissonCdfLower(input.carts, E_c),
      tested: true,
    });
  } else {
    tests.push({
      stage: "open_to_cart",
      expected: E_c,
      observed: input.carts,
      pValue: Number.NaN,
      tested: false,
    });
  }
  if (E_o >= NO_SALES_MIN_EXPECTED) {
    tests.push({
      stage: "cart_to_order",
      expected: E_o,
      observed: 0,
      pValue: poissonZeroP(E_o),
      tested: true,
    });
  } else {
    tests.push({
      stage: "cart_to_order",
      expected: E_o,
      observed: 0,
      pValue: Number.NaN,
      tested: false,
    });
  }
  return tests;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Финальный диагноз после BH по всем тестам прогона.
 * Порядок: значимые этапы → мало трафика → нельзя выделить.
 */
export function finalizeNoSalesDiagnosis(input: {
  opens: number;
  carts: number;
  rates: ShopConversionRates;
  /** Результаты BH для этапов этого товара (после общего прогона). */
  cartSignificant: boolean;
  orderSignificant: boolean;
  p_cart: number | null;
  p_order: number | null;
  q_cart: number | null;
  q_order: number | null;
  bh_rank_cart: number | null;
  bh_rank_order: number | null;
  E_c: number;
  E_o: number;
}): NoSalesDiagnosis {
  if (input.opens <= 0) {
    return {
      kind: "no_opens",
      text: `Карточку не видят: ${formatOpens(0)} за 56 дней`,
      levers: "продвижение, акция, название и характеристики для поиска",
      cA: null,
      cB: null,
      E_c: null,
      E_o: null,
      p_cart: null,
      p_order: null,
      q_cart: null,
      q_order: null,
      bh_rank_cart: null,
      bh_rank_order: null,
      M: null,
      method: "zero_opens",
    };
  }

  if (!input.rates.applicable) {
    let kind: NoSalesDiagnosisKind;
    let text: string;
    let levers: string;
    if (input.carts <= 0) {
      kind = "no_carts";
      text = `Карточку смотрят, но не кладут в корзину: ${formatOpens(input.opens)}, ${formatCartAdds(0)}. Сравнить не с чем: в магазине мало заказов`;
      levers = "цена, фото, рейтинг и отзывы";
    } else {
      kind = "no_orders";
      text = `Кладут в корзину, но не заказывают: ${formatCartAdds(input.carts)}, ${formatOrders(0)}. Сравнить не с чем: в магазине мало заказов`;
      levers = "цена, срок доставки";
    }
    return {
      kind,
      text,
      levers,
      cA: null,
      cB: null,
      E_c: round3(input.E_c),
      E_o: round3(input.E_o),
      p_cart: null,
      p_order: null,
      q_cart: null,
      q_order: null,
      bh_rank_cart: null,
      bh_rank_order: null,
      M: null,
      method: "legacy_insufficient_shop",
    };
  }

  const { cA, cB } = input.rates;
  const conv = cA * cB;
  const M = conv > 0 ? Math.ceil(NO_SALES_MIN_EXPECTED / conv) : null;

  if (input.cartSignificant) {
    return {
      kind: "no_carts",
      text: `Карточку смотрят, но не кладут в корзину: ${formatOpens(input.opens)}, ${formatCarts(input.carts)} при ожидаемых ~${round1(input.E_c)} по вашему магазину`,
      levers: "цена, фото, рейтинг и отзывы",
      cA,
      cB,
      E_c: round3(input.E_c),
      E_o: round3(input.E_o),
      p_cart: input.p_cart,
      p_order: input.p_order,
      q_cart: input.q_cart,
      q_order: input.q_order,
      bh_rank_cart: input.bh_rank_cart,
      bh_rank_order: input.bh_rank_order,
      M,
      method: "shop_poisson_bh",
    };
  }

  if (input.orderSignificant) {
    return {
      kind: "no_orders",
      text: `Кладут в корзину, но не заказывают: ${formatCartAdds(input.carts)}, ${formatOrders(0)} при ожидаемых ~${round1(input.E_o)}`,
      levers: "цена, срок доставки",
      cA,
      cB,
      E_c: round3(input.E_c),
      E_o: round3(input.E_o),
      p_cart: input.p_cart,
      p_order: input.p_order,
      q_cart: input.q_cart,
      q_order: input.q_order,
      bh_rank_cart: input.bh_rank_cart,
      bh_rank_order: input.bh_rank_order,
      M,
      method: "shop_poisson_bh",
    };
  }

  const expectedOrders = input.opens * conv;
  if (expectedOrders < NO_SALES_MIN_EXPECTED) {
    return {
      kind: "low_traffic",
      text: `Мало трафика: ${formatOpens(input.opens)} за 56 дней. При конверсиях вашего магазина для ~${NO_SALES_MIN_EXPECTED} заказов нужно ~${M} ${ruPlural(M ?? 0, "переход", "перехода", "переходов")}`,
      levers: "продвижение, акция, название и характеристики для поиска",
      cA,
      cB,
      E_c: round3(input.E_c),
      E_o: round3(input.E_o),
      p_cart: input.p_cart,
      p_order: input.p_order,
      q_cart: input.q_cart,
      q_order: input.q_order,
      bh_rank_cart: input.bh_rank_cart,
      bh_rank_order: input.bh_rank_order,
      M,
      method: "shop_poisson_bh",
    };
  }

  return {
    kind: "inconclusive",
    text: `Заказов нет, но на таком объёме причину нельзя выделить статистически (${formatOpens(input.opens)}, ${formatCarts(input.carts)} при ожидаемых ~${round1(input.E_c)}; заказов ожидалось ~${round1(input.E_o)})`,
    levers: "цена, фото, рейтинг и отзывы, срок доставки, продвижение",
    cA,
    cB,
    E_c: round3(input.E_c),
    E_o: round3(input.E_o),
    p_cart: input.p_cart,
    p_order: input.p_order,
    q_cart: input.q_cart,
    q_order: input.q_order,
    bh_rank_cart: input.bh_rank_cart,
    bh_rank_order: input.bh_rank_order,
    M,
    method: "shop_poisson_bh",
  };
}

export type NoSalesBhEntry = {
  draftIndex: number;
  stage: "open_to_cart" | "cart_to_order";
  pValue: number;
};

/**
 * Один прогон BH по всем тестам всех кандидатов «Не продаётся».
 * Возвращает rejected флаги в порядке entries.
 */
export function runNoSalesBh(
  entries: NoSalesBhEntry[],
  q = NO_SALES_BH_Q,
): { rejected: boolean[]; adjusted: number[]; ranks: number[] } {
  const pValues = entries.map((e) => e.pValue);
  const rejected = benjaminiHochberg(pValues, q);
  const adjusted = bhAdjustedPValues(pValues);
  const order = pValues
    .map((p, index) => ({ p, index }))
    .sort((a, b) => a.p - b.p);
  const ranks = Array.from({ length: pValues.length }, () => 0);
  for (let i = 0; i < order.length; i++) {
    ranks[order[i]!.index] = i + 1;
  }
  return { rejected, adjusted, ranks };
}
