import type { ShopBuyoutContext } from "./stock-math";
import type { TaskDraft, TaskFact } from "./types";

/**
 * Задачи про качество товара в глазах покупателя и про то, что съедает маржу.
 * Везде сравнение идёт с вашими же товарами или с вашей же маржой: чужих «норм» не берём, кроме явно названных ориентиров.
 */

const rub = (value: number) => `${Math.round(value).toLocaleString("ru-RU")} ₽`;
const pct = (value: number) => `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;

function base(fact: TaskFact) {
  return {
    nmId: fact.nmId,
    itemId: fact.itemId,
    productTitle: fact.title,
    vendorCode: fact.vendorCode,
    eventKind: null,
  };
}

/** z-критерий доли x из n против известной доли p0. Отрицательное значение — доля ниже. */
function zOne(x: number, n: number, p0: number): number | null {
  if (n <= 0 || p0 <= 0 || p0 >= 1) return null;
  return (x / n - p0) / Math.sqrt((p0 * (1 - p0)) / n);
}

// ── Низкий выкуп ──

/** Меньше стольких заказов прошлого окна процент выкупа шумит: выводов не делаем. */
const BUYOUT_MIN_ORDERS = 20;
/** Выкуп ниже среднего по магазину минимум на столько долей и значимо (z ≤ −2). */
const BUYOUT_MIN_GAP = 0.08;
const BUYOUT_IMPORTANT_GAP = 0.15;
const BUYOUT_Z = -2;

/**
 * Товар выкупают заметно реже, чем остальные ваши: каждый невыкуп стоит доставки туда и обратно и снимает товар с продаж.
 * Берём «дозревшее» окно (заказы 28–56 дней назад): свежие заказы ещё не успели выкупить.
 */
export function ruleLowBuyout(fact: TaskFact, shop: ShopBuyoutContext | null): TaskDraft | null {
  const orders = fact.pastOrderCount ?? fact.priorOrders;
  const buyouts = fact.pastBuyoutCount;
  if (!shop || shop.bShop == null || orders == null || buyouts == null || orders < BUYOUT_MIN_ORDERS || buyouts < 0 || buyouts > orders) return null;
  const own = buyouts / orders;
  const gap = shop.bShop - own;
  const z = zOne(buyouts, orders, shop.bShop);
  if (gap < BUYOUT_MIN_GAP || z == null || z > BUYOUT_Z) return null;
  const extra = Math.round(orders * gap);
  const negatives = fact.windowNegativeReviews?.length ?? null;
  const severity = gap >= BUYOUT_IMPORTANT_GAP ? "important" : "opportunity";
  return {
    ...base(fact),
    type: "TASK_LOW_BUYOUT",
    category: "sales",
    baseSeverity: severity,
    severityFloor: severity,
    severityCeiling: severity,
    title: "Товар выкупают реже ваших остальных",
    description: `Из ${orders.toLocaleString("ru-RU")} заказов прошлого периода выкуплено ${buyouts.toLocaleString("ru-RU")} (${pct(own * 100)}). В среднем по магазину выкуп ${pct(shop.bShop * 100)}: сверх нормы магазина не выкуплено около ${extra.toLocaleString("ru-RU")} шт.`,
    reason: "Процент выкупа товара значимо ниже среднего по вашим товарам, и разница не объясняется малым числом заказов.",
    evidence: {
      buyout_percent: Math.round(own * 1000) / 10,
      shop_buyout_percent: Math.round(shop.bShop * 1000) / 10,
      past_orders: orders,
      past_buyouts: buyouts,
      extra_returns: extra,
      negative_reviews_28d: negatives,
    },
    recommendation: `Откройте негативные отзывы и вопросы по товару: чаще всего возвраты объясняются размером и посадкой, цветом «не как на фото», комплектацией или качеством. Сверьте главное фото, размеры и описание с реальным товаром, добавьте габариты или размерную сетку, проверьте упаковку. Если отзывов с претензиями нет, смотрите остатки по регионам: долгая доставка тоже снижает выкуп.`,
    actionType: "OPEN_PRODUCT",
    businessImpactType: "PROFIT_PROTECTION",
  };
}

// ── Низкий рейтинг ──

const RATING_MIN_REVIEWS = 10;
/** Ориентир продавцов WB: ниже этой оценки покупатели заметно чаще проходят мимо карточки. Это ориентир, а не данные WB. */
const RATING_FLOOR = 4.5;
const RATING_BELOW_STORE = 0.3;
const RATING_IMPORTANT = 4.3;

/** Средняя оценка по магазину, взвешенная по числу отзывов; нужно минимум 5 товаров с достаточным числом отзывов. */
export function storeRatingOf(facts: TaskFact[]): number | null {
  let sum = 0;
  let weight = 0;
  let products = 0;
  for (const fact of facts) {
    if (fact.reviewRatingAvg == null || fact.reviewCount180 == null || fact.reviewCount180 < RATING_MIN_REVIEWS) continue;
    sum += fact.reviewRatingAvg * fact.reviewCount180;
    weight += fact.reviewCount180;
    products += 1;
  }
  return products >= 5 && weight > 0 ? sum / weight : null;
}

/**
 * Оценка отзывов товара ниже ориентира 4,5 или заметно ниже ваших остальных товаров, отзывов достаточно.
 * Рейтинг влияет на выдачу и на то, купят ли вас, поэтому причину нужно найти в самих отзывах.
 */
export function ruleLowRating(fact: TaskFact, storeRating: number | null): TaskDraft | null {
  const rating = fact.reviewRatingAvg;
  const count = fact.reviewCount180;
  if (rating == null || count == null || count < RATING_MIN_REVIEWS) return null;
  const belowFloor = rating < RATING_FLOOR;
  const belowStore = storeRating != null && rating <= storeRating - RATING_BELOW_STORE;
  if (!belowFloor && !belowStore) return null;
  const negatives = fact.windowNegativeReviews?.length ?? null;
  const severity = rating < RATING_IMPORTANT ? "important" : "opportunity";
  const compare = belowStore && storeRating != null ? ` В среднем по вашим товарам ${storeRating.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}.` : "";
  return {
    ...base(fact),
    type: "TASK_LOW_RATING",
    category: "reviews",
    baseSeverity: severity,
    severityFloor: severity,
    severityCeiling: severity,
    title: "У карточки низкая оценка отзывов",
    description: `Средняя оценка ${rating.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} по ${count.toLocaleString("ru-RU")} отзывам за 180 дней.${compare}`,
    reason: belowFloor ? `Оценка ниже ориентира ${RATING_FLOOR.toLocaleString("ru-RU")}.` : "Оценка заметно ниже, чем у ваших остальных товаров.",
    evidence: {
      rating_avg: Math.round(rating * 100) / 100,
      rating_count: count,
      store_rating_avg: storeRating == null ? null : Math.round(storeRating * 100) / 100,
      negative_reviews_28d: negatives,
    },
    recommendation: `Прочитайте отзывы на 1–3★ и выпишите повторяющуюся претензию: если она одна (размер, запах, комплектация), её можно закрыть описанием, фото и вложением в упаковку, а при необходимости самим товаром. Ответьте на негатив по существу: ответ видят будущие покупатели. Оценка растёт медленно: новые отзывы вытесняют старые не сразу.`,
    actionType: "OPEN_REVIEWS",
    businessImpactType: "SALES_PROTECTION",
  };
}

// ── Логистика и хранение съедают маржу ──

/** Меньше стольких продаж за 28 дней расчёт логистики на штуку ненадёжен. */
const COSTS_MIN_SALES = 5;
/** Логистика и хранение забирают минимум такую долю прибыли до них. */
const COSTS_SHARE = 0.5;
const COSTS_IMPORTANT_SHARE = 0.7;

/**
 * Логистика и платное хранение забирают половину и более прибыли, которая была бы без них. Это не убыток (его ловит «Убыточная цена»),
 * а повод проверить габариты, возвраты и запас: здесь маржу можно вернуть без изменения цены.
 */
export function ruleCostsEatMargin(fact: TaskFact): TaskDraft | null {
  const logistics = fact.logisticsPerUnit;
  const margin = fact.marginRub;
  if (logistics == null || logistics <= 0 || margin == null || margin <= 0) return null;
  if (fact.unitSaleNoDeliveries || (fact.salesQty ?? 0) < COSTS_MIN_SALES) return null;
  // Хранение входит в маржу только если расчёт его не исключал.
  const storage = fact.storageExcluded ? 0 : Math.max(0, fact.storagePerUnit ?? 0);
  const costs = logistics + storage;
  const before = margin + costs;
  const share = costs / before;
  if (share < COSTS_SHARE) return null;
  const storageLeads = storage > logistics;
  const severity = share >= COSTS_IMPORTANT_SHARE ? "important" : "opportunity";
  const lead = storageLeads
    ? `Платное хранение ${rub(storage)} на штуку: товар лежит дольше, чем продаётся. Сократите запас до того, что реально уйдёт за ближайшие недели, а излишек вывезите или распродайте. Следующие поставки делайте меньше и чаще.`
    : `Логистика ${rub(logistics)} на штуку. Проверьте габариты и вес в карточке: WB считает тариф по объёму, и завышенные размеры дают лишние рубли с каждой продажи. Посмотрите, нет ли товара в слишком далёких от покупателей регионах, и долю возвратов: каждый возврат оплачивается дважды.`;
  return {
    ...base(fact),
    type: "TASK_COSTS_EAT_MARGIN",
    category: "economics",
    baseSeverity: severity,
    severityFloor: severity,
    severityCeiling: severity,
    title: "Логистика и хранение съедают маржу",
    description: `На одной продаже логистика ${rub(logistics)}${storage > 0 ? ` и хранение ${rub(storage)}` : ""} забирают ${pct(Math.round(share * 1000) / 10)} прибыли до этих расходов (${rub(before)}), остаётся ${rub(margin)}.`,
    reason: "Логистика и хранение за штуку составляют половину и более прибыли с продажи до этих расходов.",
    evidence: {
      logistics_per_unit: Math.round(logistics),
      storage_per_unit: storage > 0 ? Math.round(storage) : null,
      margin_rub: Math.round(margin),
      margin_before_costs_rub: Math.round(before),
      costs_share_percent: Math.round(share * 1000) / 10,
      sales_28d: fact.salesQty,
    },
    recommendation: lead,
    actionType: "OPEN_PRODUCT",
    businessImpactType: "PROFIT_GROWTH",
  };
}
