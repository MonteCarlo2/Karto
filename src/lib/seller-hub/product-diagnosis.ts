import { benjaminiHochberg, twoProportionTest } from "@/lib/seller-hub/task-engine/stats";
import type { SellerFunnelPeriod, SellerFunnelSnapshot } from "@/lib/seller-hub/types";

/**
 * Диагноз товара: на каком шаге пути покупателя он теряет заказы и сколько заказов даст исправление.
 *
 * Как устроено:
 * 1. Каждый товар сравниваем не с придуманной нормой, а с остальным магазином (все прочие товары вместе).
 * 2. Отличие признаём реальным статистическим тестом двух долей (z или точный Фишер) с поправкой на множественные
 *    сравнения (Benjamini–Hochberg): по десяткам товаров «просадка» легко возникает случайно.
 * 3. Потенциал — сколько заказов добавилось бы, если шаг дотянуть до уровня остального магазина. Это оценка, а не обещание.
 * 4. Прежде чем советовать вести трафик, проверяем ограничения: убыточность, запас, рейтинг. Если они есть, сначала их снимаем.
 */

export type DiagnosisStage = "openToCart" | "cartToOrder";

export type DiagnosisBlocker =
  | { kind: "loss"; marginPercent: number }
  | { kind: "stock"; days: number }
  | { kind: "rating"; rating: number; storeRating: number };

export type Diagnosis = {
  nmId: string;
  stage: DiagnosisStage;
  /** Конверсия товара и остального магазина на этом шаге, %. */
  mine: number;
  benchmark: number;
  /** Поправленная на множественные сравнения вероятность случайности (для отчёта). */
  pValue: number;
  /** Сколько заказов за период добавил бы выход на уровень магазина. */
  extraOrders: number;
  extraRevenue: number | null;
  blockers: DiagnosisBlocker[];
  /** Что делать в первую очередь. */
  verdict: "fix_card" | "restock_first" | "fix_economics_first";
};

export type DiagnosisProduct = {
  nmId: string;
  marginPercent: number | null;
  stock: number | null;
};

/** Мало входов в шаг: тест ненадёжен, товар не оцениваем. */
const MIN_BASE: Record<DiagnosisStage, number> = { openToCart: 100, cartToOrder: 20 };
/** Доля ложных находок, которую готовы терпеть среди найденного (BH). */
const FDR_Q = 0.1;
/** Запас меньше стольких дней текущего темпа — сначала поставка. */
const MIN_STOCK_DAYS = 7;
/** Рейтинг ниже среднего по магазину на столько звёзд и при таком числе отзывов считаем помехой конверсии. */
const RATING_GAP = 0.3;
const RATING_MIN_REVIEWS = 5;

type Counts = { open: number; cart: number; order: number; orderSum: number | null };

function counts(period: SellerFunnelPeriod | null | undefined): Counts | null {
  if (!period) return null;
  const { openCount, cartCount, orderCount, orderSum } = period;
  if (openCount == null || cartCount == null || orderCount == null) return null;
  return { open: openCount, cart: cartCount, order: orderCount, orderSum };
}

export function diagnoseProducts(input: {
  funnel: SellerFunnelSnapshot | null | undefined;
  products: DiagnosisProduct[];
  /** Рейтинг и число отзывов по артикулам. */
  ratings?: Map<string, { rating: number; reviews: number }>;
}): Diagnosis[] {
  const { funnel } = input;
  if (!funnel || funnel.status === "error" || funnel.status === "forbidden" || funnel.status === "jam_required" || funnel.truncated) return [];

  const rows = Object.entries(funnel.byNm ?? {}).flatMap(([nmId, row]) => {
    const c = counts(row.selected);
    return c ? [{ nmId, c, ordersPerDay: row.ordersPerDay }] : [];
  });
  if (rows.length < 3) return [];

  const total = rows.reduce(
    (acc, r) => ({ open: acc.open + r.c.open, cart: acc.cart + r.c.cart, order: acc.order + r.c.order }),
    { open: 0, cart: 0, order: 0 },
  );
  const productById = new Map(input.products.map((p) => [p.nmId, p]));

  // Средний рейтинг магазина, взвешенный по числу отзывов.
  let weighted = 0;
  let reviews = 0;
  for (const value of input.ratings?.values() ?? []) {
    weighted += value.rating * value.reviews;
    reviews += value.reviews;
  }
  const storeRating = reviews > 0 ? weighted / reviews : null;

  type Candidate = { nmId: string; stage: DiagnosisStage; mine: number; benchmark: number; p: number; extraOrders: number; avgPrice: number | null };
  const candidates: Candidate[] = [];
  const allP: number[] = [];

  for (const { nmId, c } of rows) {
    const rest = { open: total.open - c.open, cart: total.cart - c.cart, order: total.order - c.order };
    const avgPrice = c.orderSum != null && c.order > 0 ? c.orderSum / c.order : null;
    const stages: Array<{ stage: DiagnosisStage; s: number; n: number; rs: number; rn: number }> = [
      { stage: "openToCart", s: c.cart, n: c.open, rs: rest.cart, rn: rest.open },
      { stage: "cartToOrder", s: c.order, n: c.cart, rs: rest.order, rn: rest.cart },
    ];
    for (const { stage, s, n, rs, rn } of stages) {
      if (n < MIN_BASE[stage] || rn < MIN_BASE[stage] || s > n || rs > rn) continue;
      const test = twoProportionTest(s, n, rs, rn);
      if (test.status !== "ok") continue;
      allP.push(test.pValue);
      const mine = s / n;
      const benchmark = rs / rn;
      if (!(mine < benchmark)) continue;
      const extraOrders =
        stage === "openToCart"
          ? n * (benchmark - mine) * (c.cart >= MIN_BASE.cartToOrder ? c.order / c.cart : rest.cart > 0 ? rest.order / rest.cart : 0)
          : n * (benchmark - mine);
      candidates.push({ nmId, stage, mine, benchmark, p: test.pValue, extraOrders, avgPrice });
    }
  }
  if (candidates.length === 0) return [];

  // BH считаем по всем проведённым тестам (в обе стороны), а не только по «просевшим»: иначе поправка занижена.
  const rejected = benjaminiHochberg(allP, FDR_Q);
  const significant = new Set<number>();
  allP.forEach((p, index) => {
    if (rejected[index]) significant.add(p);
  });

  const out: Diagnosis[] = [];
  for (const cand of candidates) {
    if (!significant.has(cand.p)) continue;
    const info = productById.get(cand.nmId);
    const ordersPerDay = rows.find((r) => r.nmId === cand.nmId)?.ordersPerDay ?? 0;
    const blockers: DiagnosisBlocker[] = [];
    if (info?.marginPercent != null && info.marginPercent <= 0) blockers.push({ kind: "loss", marginPercent: info.marginPercent });
    if (info?.stock != null && ordersPerDay > 0) {
      const days = info.stock / ordersPerDay;
      if (days < MIN_STOCK_DAYS) blockers.push({ kind: "stock", days: Math.round(days * 10) / 10 });
    }
    const mineRating = input.ratings?.get(cand.nmId);
    if (storeRating != null && mineRating && mineRating.reviews >= RATING_MIN_REVIEWS && mineRating.rating <= storeRating - RATING_GAP) {
      blockers.push({ kind: "rating", rating: mineRating.rating, storeRating: Math.round(storeRating * 100) / 100 });
    }
    const extraOrders = Math.round(cand.extraOrders * 10) / 10;
    out.push({
      nmId: cand.nmId,
      stage: cand.stage,
      mine: Math.round(cand.mine * 1000) / 10,
      benchmark: Math.round(cand.benchmark * 1000) / 10,
      pValue: cand.p,
      extraOrders,
      extraRevenue: cand.avgPrice != null ? Math.round(extraOrders * cand.avgPrice) : null,
      blockers,
      verdict: blockers.some((b) => b.kind === "loss") ? "fix_economics_first" : blockers.some((b) => b.kind === "stock") ? "restock_first" : "fix_card",
    });
  }
  return out.sort((a, b) => b.extraOrders - a.extraOrders);
}

export const STAGE_HYPOTHESES: Record<DiagnosisStage, string[]> = {
  openToCart: [
    "Покупатель открывает карточку, но не кладёт в корзину: проверьте главное фото и инфографику, название и цену в сравнении с соседями по выдаче.",
    "Смотрите рейтинг и последние негативные отзывы: они решают сразу.",
  ],
  cartToOrder: [
    "Положили в корзину, но не заказали: обычно мешают срок доставки, цена после скидки или отсутствие нужного размера или количества.",
    "Проверьте, нет ли у товара склада с долгой доставкой и не закончился ли нужный вариант.",
  ],
};
