import type { SellerCatalogItem, SellerFunnelSnapshot } from "@/lib/seller-hub/types";

export type PromoCohort = "boost" | "hold" | "loss" | "open";

export type PromoPace = {
  orders: number;
  perDay: number;
};

export type PromoMargin = {
  rub: number;
  percent: number;
};

export type PromoSkuAdvice = {
  cohort: PromoCohort;
  pace: PromoPace | null;
  marginNow: PromoMargin | null;
  marginPromo: PromoMargin | null;
  dropRub: number | null;
  verdict: string;
};

function ruCount(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count);
  const n10 = abs % 10;
  const n100 = abs % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

function rub(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const left = sorted[mid - 1];
  const right = sorted[mid];
  if (left == null || right == null) return null;
  return (left + right) / 2;
}

/** Темп заказов из воронки. null — заказы этого артикула неизвестны, это не ноль. */
export function readOrderPace(
  externalId: string,
  funnel: SellerFunnelSnapshot | null | undefined,
): PromoPace | null {
  if (!funnel || funnel.error) return null;
  const row = funnel.byNm[externalId];
  if (!row) {
    if (funnel.truncated) return null;
    return { orders: 0, perDay: 0 };
  }
  const perDay = row.ordersPerDay > 0 ? row.ordersPerDay : row.orders > 0 ? row.orders / 28 : 0;
  return { orders: row.orders, perDay };
}

export function catalogPaceMedian(
  items: SellerCatalogItem[],
  funnel: SellerFunnelSnapshot | null | undefined,
): number | null {
  const paces: number[] = [];
  for (const item of items) {
    const pace = readOrderPace(item.externalId, funnel);
    if (pace && pace.perDay > 0) paces.push(pace.perDay);
  }
  return median(paces);
}

export function pacePhrase(pace: PromoPace): string {
  if (pace.orders <= 0 || pace.perDay <= 0) return "за 28 дней заказов не было";
  if (pace.perDay >= 0.85) {
    const rounded = Math.max(1, Math.round(pace.perDay));
    return `${rounded.toLocaleString("ru-RU")} ${ruCount(rounded, "заказ", "заказа", "заказов")} в день`;
  }
  const days = Math.max(2, Math.round(1 / pace.perDay));
  return `1 заказ примерно раз в ${days} ${ruCount(days, "день", "дня", "дней")}`;
}

export function classifyPromoSku(input: {
  currentPrice: number | null;
  planPrice: number | null;
  costPrice: number | null | undefined;
  realizationReady: boolean;
  marginNow: PromoMargin | null;
  marginPromo: PromoMargin | null;
  pace: PromoPace | null;
  peerMedian: number | null;
}): PromoSkuAdvice {
  const dropRub =
    input.currentPrice != null && input.planPrice != null && input.currentPrice > input.planPrice
      ? input.currentPrice - input.planPrice
      : input.planPrice != null && input.currentPrice != null
        ? 0
        : null;

  const base = {
    pace: input.pace,
    marginNow: input.marginNow,
    marginPromo: input.marginPromo,
    dropRub,
  };

  if (input.planPrice == null) {
    return {
      ...base,
      cohort: "open",
      verdict: "WB не прислал цену входа в эту акцию. Сравнивать не с чем.",
    };
  }

  if (input.costPrice == null) {
    return {
      ...base,
      cohort: "open",
      verdict: "Укажите себестоимость. Без неё не видно, уйдёт ли цена акции в минус.",
    };
  }

  if (!input.realizationReady || input.marginPromo == null) {
    return {
      ...base,
      cohort: "open",
      verdict: "Отчёт реализации ещё не прочитан, порог убытка неизвестен.",
    };
  }

  if (input.marginPromo.rub < 0) {
    return {
      ...base,
      cohort: "loss",
      verdict: `Цена акции ${rub(input.planPrice)} ниже порога убытка. Каждая продажа уйдёт в минус на ${rub(Math.abs(input.marginPromo.rub))} после списаний WB. Вступать нельзя.`,
    };
  }

  const priceLine =
    dropRub != null && dropRub > 0
      ? `Цена в акции ${rub(input.planPrice)}, на ${rub(dropRub)} ниже текущей.`
      : `Цена в акции ${rub(input.planPrice)} — не ниже той, что стоит сейчас.`;
  const marginLine = `После списаний WB останется ${rub(input.marginPromo.rub)} на штуке (${input.marginPromo.percent.toLocaleString("ru-RU")}%).`;

  if (input.pace == null) {
    return {
      ...base,
      cohort: "open",
      verdict: `${priceLine} ${marginLine} Темп заказов ещё не прочитан, поэтому разгон или удержание не назначаю.`,
    };
  }

  const pace = pacePhrase(input.pace);
  const noPeersSelling = input.peerMedian == null;
  const slower = input.pace.perDay <= 0 || (input.peerMedian != null && input.pace.perDay < input.peerMedian);

  if (slower) {
    const why = noPeersSelling
      ? "Заказов по кабинету нет, а цена акции всё ещё выше порога. Входить можно."
      : "Темп ниже ваших остальных товаров, входить можно.";
    return {
      ...base,
      cohort: "boost",
      verdict: `Сейчас ${pace}. ${priceLine} ${marginLine} ${why} На сколько заказов прибавит бустинг, WB не сообщает.`,
    };
  }

  const why = noPeersSelling
    ? "Других товаров с заказами для сравнения нет."
    : "Это не медленнее ваших остальных товаров.";
  return {
    ...base,
    cohort: "hold",
    verdict: `Сейчас ${pace}. ${why} ${priceLine} ${marginLine} Заказов больше акция сама не обещает, цену лучше не снижать.`,
  };
}
