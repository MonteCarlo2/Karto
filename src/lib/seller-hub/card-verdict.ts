import type { Diagnosis } from "@/lib/seller-hub/product-diagnosis";
import { benjaminiHochberg, twoProportionTest } from "@/lib/seller-hub/task-engine/stats";
import type { TaskFact } from "@/lib/seller-hub/task-engine/types";

/**
 * Вердикт по карточке: покупают её или нет и почему.
 * Пять независимых опор, каждая со своим статусом: трафик, конверсия, выкуп, контент, рейтинг.
 * Одной общей «оценки в баллах» нет намеренно: она прячет причину. Вердикт собирается из опор по понятным правилам.
 *
 * Все сравнения относительные (с остальными карточками вашего магазина) и проверены тестами на случайность.
 */

export type PillarStatus = "good" | "ok" | "warn" | "bad" | "na";

export type Pillar = {
  status: PillarStatus;
  /** Короткая подпись с цифрами. */
  note: string;
};

export type CardVerdictId =
  | "works"
  | "great_hidden"
  | "hidden"
  | "leaky"
  | "returns"
  | "polish"
  | "no_data";

export type CardVerdict = {
  nmId: string;
  title: string;
  verdict: CardVerdictId;
  headline: string;
  /** Что сделать первым. */
  action: string;
  traffic: Pillar;
  conversion: Pillar;
  buyout: Pillar;
  content: Pillar;
  rating: Pillar;
  /** Заказы за период воронки. */
  orders: number;
  /** Для сортировки: чем больше, тем важнее разобраться. */
  weight: number;
};

export const VERDICT_LABEL: Record<CardVerdictId, string> = {
  works: "Работает",
  great_hidden: "Хорошая, но её мало видят",
  hidden: "Почти не видят",
  leaky: "Видят, но не покупают",
  returns: "Покупают, но возвращают",
  polish: "Работает, но есть что улучшить",
  no_data: "Мало данных",
};

/** Карточка получает меньше этой доли переходов от типичной (медианной) карточки магазина — трафик низкий. */
const TRAFFIC_BAD_RATIO = 0.25;
const TRAFFIC_WARN_RATIO = 0.5;
/** Меньше переходов за период — вывод о конверсии и трафике делать рано. */
const MIN_OPENS = 30;
const MIN_BUYOUT_ORDERS = 15;
const FDR_Q = 0.1;
const RATING_MIN_REVIEWS = 5;
const RATING_GAP = 0.3;
const RATING_FLOOR = 4.0;
/** Оценка контента ниже порога задач «Низкая оценка контента» — карточка недозаполнена. */
const CONTENT_OK = 60;

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

const pct = (value: number) => `${(Math.round(value * 10) / 10).toLocaleString("ru-RU")}%`;

export function buildCardVerdicts(input: { facts: TaskFact[]; diagnoses: Diagnosis[] }): CardVerdict[] {
  const withFunnel = input.facts.filter((f) => f.openCount != null && (f.stockFbo != null || f.stockFbs != null || (f.orders ?? 0) > 0));
  if (withFunnel.length === 0) return [];

  const opens = withFunnel.map((f) => f.openCount ?? 0).filter((v) => v > 0);
  const typicalOpen = median(opens);

  // Выкуп: товар против остального магазина по дозревшему прошлому окну воронки.
  const buyoutTotals = withFunnel.reduce(
    (acc, f) => ({ buyouts: acc.buyouts + (f.pastBuyoutCount ?? 0), orders: acc.orders + (f.pastOrderCount ?? 0) }),
    { buyouts: 0, orders: 0 },
  );
  const buyoutTests: Array<{ nmId: string; p: number; mine: number; rest: number }> = [];
  const allBuyoutP: number[] = [];
  for (const f of withFunnel) {
    const n = f.pastOrderCount ?? 0;
    const s = f.pastBuyoutCount ?? 0;
    const restN = buyoutTotals.orders - n;
    const restS = buyoutTotals.buyouts - s;
    if (n < MIN_BUYOUT_ORDERS || restN < MIN_BUYOUT_ORDERS || s > n || restS > restN) continue;
    const test = twoProportionTest(s, n, restS, restN);
    if (test.status !== "ok") continue;
    allBuyoutP.push(test.pValue);
    if (s / n < restS / restN) buyoutTests.push({ nmId: f.nmId, p: test.pValue, mine: (s / n) * 100, rest: (restS / restN) * 100 });
  }
  const rejected = benjaminiHochberg(allBuyoutP, FDR_Q);
  const sigP = new Set(allBuyoutP.filter((_, i) => rejected[i]));
  const buyoutBad = new Map(buyoutTests.filter((t) => sigP.has(t.p)).map((t) => [t.nmId, t]));

  let ratingWeighted = 0;
  let ratingCount = 0;
  for (const f of withFunnel) {
    if (f.reviewRatingAvg != null && (f.reviewCount180 ?? 0) > 0) {
      ratingWeighted += f.reviewRatingAvg * (f.reviewCount180 ?? 0);
      ratingCount += f.reviewCount180 ?? 0;
    }
  }
  const storeRating = ratingCount > 0 ? ratingWeighted / ratingCount : null;
  const diagnosisByNm = new Map(input.diagnoses.map((d) => [d.nmId, d]));

  // Конверсия выше остального магазина: считаем по тем же итогам воронки.
  const totals = withFunnel.reduce(
    (acc, f) => ({ open: acc.open + (f.openCount ?? 0), cart: acc.cart + (f.cartCount ?? 0), order: acc.order + (f.orders ?? 0) }),
    { open: 0, cart: 0, order: 0 },
  );

  const out: CardVerdict[] = [];
  for (const f of withFunnel) {
    const open = f.openCount ?? 0;
    const orders = f.orders ?? 0;
    const diagnosis = diagnosisByNm.get(f.nmId);

    // Трафик.
    let traffic: Pillar;
    if (typicalOpen <= 0) {
      traffic = { status: "na", note: "нет данных воронки" };
    } else {
      const ratio = open / typicalOpen;
      const note = `${open.toLocaleString("ru-RU")} переходов, ${Math.round(ratio * 100)}% от типичной карточки магазина`;
      traffic = { status: ratio < TRAFFIC_BAD_RATIO ? "bad" : ratio < TRAFFIC_WARN_RATIO ? "warn" : "ok", note };
    }

    // Конверсия.
    let conversion: Pillar;
    if (open < MIN_OPENS) {
      conversion = { status: "na", note: "мало переходов для вывода" };
    } else if (diagnosis) {
      conversion = {
        status: "bad",
        note: `${diagnosis.stage === "openToCart" ? "в корзину" : "из корзины в заказ"} ${pct(diagnosis.mine)} против ${pct(diagnosis.benchmark)} по магазину`,
      };
    } else {
      const rest = { open: totals.open - open, cart: totals.cart - (f.cartCount ?? 0), order: totals.order - orders };
      const cartRate = f.cartCount != null && open > 0 ? f.cartCount / open : null;
      const restCartRate = rest.open > 0 ? rest.cart / rest.open : null;
      const better =
        cartRate != null && restCartRate != null && f.cartCount != null && f.cartCount >= 10 && open >= 100
          ? twoProportionTest(f.cartCount, open, rest.cart, rest.open)
          : null;
      const isBetter = better != null && better.status === "ok" && better.pValue <= 0.05 && cartRate! > restCartRate!;
      conversion = {
        status: isBetter ? "good" : "ok",
        note: cartRate != null ? `в корзину ${pct(cartRate * 100)}${isBetter ? ", лучше остального магазина" : ""}` : "в норме",
      };
    }

    // Выкуп.
    const bb = buyoutBad.get(f.nmId);
    const buyout: Pillar = bb
      ? { status: "bad", note: `выкуп ${pct(bb.mine)} против ${pct(bb.rest)} по магазину` }
      : (f.pastOrderCount ?? 0) >= MIN_BUYOUT_ORDERS && f.pastBuyoutCount != null
        ? { status: "ok", note: `выкуп ${pct(((f.pastBuyoutCount ?? 0) / (f.pastOrderCount ?? 1)) * 100)}` }
        : { status: "na", note: "заказов мало или выкуп ещё не созрел" };

    // Контент.
    const content: Pillar =
      f.contentScore == null
        ? { status: "na", note: "не оценён" }
        : { status: f.contentScore >= CONTENT_OK ? "ok" : f.contentScore >= 40 ? "warn" : "bad", note: `${f.contentScore} из 100${f.contentGaps && f.contentGaps.length > 0 && f.contentScore < CONTENT_OK ? `: ${f.contentGaps[0]}` : ""}` };

    // Рейтинг.
    let rating: Pillar;
    if (f.reviewRatingAvg == null || (f.reviewCount180 ?? 0) < RATING_MIN_REVIEWS) {
      rating = { status: "na", note: (f.reviewCount180 ?? 0) > 0 ? `${f.reviewCount180} отзывов — мало для вывода` : "отзывов нет" };
    } else {
      const low = f.reviewRatingAvg < RATING_FLOOR || (storeRating != null && f.reviewRatingAvg <= storeRating - RATING_GAP);
      rating = { status: low ? "bad" : "ok", note: `${f.reviewRatingAvg.toLocaleString("ru-RU")} по ${f.reviewCount180} отзывам` };
    }

    // Вердикт.
    let verdict: CardVerdictId;
    let headline: string;
    let action: string;
    let weight: number;
    const worstContent = content.status === "bad" || content.status === "warn";
    if (open < MIN_OPENS && orders === 0 && traffic.status !== "bad") {
      verdict = "no_data";
      headline = "Мало данных для вывода";
      action = "Подождите накопления переходов или обновите данные.";
      weight = 0;
    } else if (conversion.status === "bad") {
      verdict = "leaky";
      headline = VERDICT_LABEL.leaky;
      action =
        diagnosis?.stage === "openToCart"
          ? "Улучшите то, что видно в выдаче: главное фото, название, цену, рейтинг."
          : "Проверьте цену после скидок, срок доставки и наличие нужных размеров и количеств.";
      weight = 3 + (diagnosis?.extraOrders ?? 0);
    } else if (traffic.status === "bad" || traffic.status === "warn") {
      const goodCard = conversion.status === "good" || (conversion.status === "ok" && !worstContent && rating.status !== "bad");
      if (goodCard && orders > 0) {
        verdict = "great_hidden";
        headline = VERDICT_LABEL.great_hidden;
        action =
          (f.marginPercent ?? 0) > 0
            ? "Карточка конвертирует, но трафика мало. Ей нужны позиции в поиске (вкладка «Поиск и SEO») или тестовая реклама."
            : "Трафика мало, но товар убыточен: сначала цена или себестоимость, потом трафик.";
        weight = 2.5;
      } else {
        verdict = "hidden";
        headline = VERDICT_LABEL.hidden;
        action = worstContent
          ? "Карточку почти не открывают, и она недозаполнена: поднимите оценку контента, затем подключайте продвижение."
          : "Карточку почти не открывают: проверьте позиции по запросам (вкладка «Поиск и SEO») и попробуйте тестовую рекламу.";
        weight = 2;
      }
    } else if (buyout.status === "bad") {
      verdict = "returns";
      headline = VERDICT_LABEL.returns;
      action = "Покупатели отказываются чаще, чем у остального магазина: сверьте фото и описание с реальным товаром, размеры, комплектацию.";
      weight = 2;
    } else if (worstContent || rating.status === "bad") {
      verdict = "polish";
      headline = VERDICT_LABEL.polish;
      action = rating.status === "bad" ? "Разберите негативные отзывы и ответьте на них: рейтинг ниже, чем у остального магазина." : "Дозаполните контент: фото, видео и характеристики.";
      weight = 1;
    } else {
      verdict = "works";
      headline = VERDICT_LABEL.works;
      action = "Ничего срочного. Следите за запасом и ценой.";
      weight = 0.5;
    }

    out.push({ nmId: f.nmId, title: f.title, verdict, headline, action, traffic, conversion, buyout, content, rating, orders, weight });
  }
  return out.sort((a, b) => b.weight - a.weight);
}
