import type { SupabaseClient } from "@supabase/supabase-js";
import { expectedFor } from "@/lib/seller-hub/event-engine/smart-events";
import type { PlaybookSignals } from "./playbooks";

/**
 * Сигналы товара для сценариев цен. Считаются из того, что фон уже собрал: заказы по дням из нашей базы, отзывы, остаток.
 * Статистику тренда берём ту же, что в событиях («заказы ниже обычного N дней подряд»), чтобы агент и лента событий не расходились.
 */

const DAY_MS = 86_400_000;
const shift = (date: string, delta: number) => new Date(Date.parse(`${date}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);

/** Насколько день должен быть ниже или выше ожидаемого (в разбросах), чтобы войти в серию. Как «обычная» чувствительность событий. */
const TREND_Z = 0.8;
/** Серия должна быть ощутимой: суммарное отклонение не меньше этой доли ожидаемого. */
const MATERIAL_SHARE = 0.15;

export type OrdersTrend = { declineDays: number; riseDays: number; known: boolean };

/**
 * Сколько дней подряд (до вчерашнего включительно) заказы товара статистически ниже или выше обычного.
 * Мало истории (менее 10 дней из последних 28) — known=false, серию не засчитываем: лучше промолчать, чем гадать.
 * Неполный сегодняшний день не учитывается.
 */
export function ordersTrend(ordersByDate: Map<string, number>, todayKey: string): OrdersTrend {
  const last = shift(todayKey, -1);
  const check = expectedFor(ordersByDate, last);
  if (!check) return { declineDays: 0, riseDays: 0, known: false };
  const runLength = (dir: "down" | "up"): number => {
    let length = 0;
    let actual = 0;
    let expected = 0;
    for (let back = 0; back < 28; back += 1) {
      const date = shift(last, -back);
      const x = ordersByDate.get(date);
      const e = expectedFor(ordersByDate, date);
      if (x == null || !e) break;
      const z = (x - e.expected) / e.sigma;
      if (dir === "down" ? z > -TREND_Z : z < TREND_Z) break;
      length += 1;
      actual += x;
      expected += e.expected;
    }
    const material = expected > 0 && Math.abs(actual - expected) / expected >= MATERIAL_SHARE;
    return material ? length : 0;
  };
  return { declineDays: runLength("down"), riseDays: runLength("up"), known: true };
}

/**
 * Оборачиваемость и дни до нулевого остатка берутся из досье товара (`coverDays`), то есть по правилам утверждённого стандарта
 * (docs/seller-hub/rules-standard.md, §3.2): спрос по дням наличия, сглаженный выкуп, доступный остаток. Своей второй формулы у агента нет,
 * чтобы он и раздел «Задачи» не расходились в цифрах.
 * Остаток есть, а заказов нет ни в текущем, ни в прошлом окне воронки (deadStock) — 365 дней: товар лежит без движения (как у JVO).
 */
export const DEAD_STOCK_DAYS = 365;

export function turnoverFromDossier(coverDays: number | null, stock: number | null, deadStock: boolean): number | null {
  if (coverDays != null && Number.isFinite(coverDays) && coverDays >= 0) return Math.min(DEAD_STOCK_DAYS, Math.round(coverDays * 10) / 10);
  if (deadStock && stock != null && stock > 0) return DEAD_STOCK_DAYS;
  return null;
}

export type FeedbackRating = { rating: number; createdAt: string; countsOnCard: boolean };

/** Негатив старше этого срока окном «последние 10 отзывов» уже не считается свежим. */
export const NEGATIVE_MAX_AGE_DAYS = 30;

/**
 * В последних 10 отзывах, видимых на карточке, есть оценки 1–3★ не старше 30 дней. Отзывов нет — false.
 * УТОЧНЕНО относительно JVO: у товаров с редкими отзывами «последние 10» растягиваются на год, и старая низкая оценка держала бы цену
 * сниженной бессрочно. Поэтому к окну из 10 отзывов добавлен предел по возрасту.
 */
export function hasRecentNegative(feedbacks: FeedbackRating[], nowMs: number, window = 10): boolean {
  const visible = feedbacks.filter((f) => f.countsOnCard).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, window);
  return visible.some((f) => {
    if (!(f.rating >= 1 && f.rating <= 3)) return false;
    const created = Date.parse(f.createdAt);
    return Number.isFinite(created) && nowMs - created <= NEGATIVE_MAX_AGE_DAYS * DAY_MS;
  });
}

export type ProductInputs = {
  nmId: string;
  /** Цена со скидкой продавца сейчас, ₽. */
  discountedPrice: number | null;
  stock: number | null;
  /** Дни запаса из досье (по стандарту §3.2). Один и тот же показатель задаёт и «дни до нуля», и оборачиваемость. */
  coverDays: number | null;
  /** Остаток есть, а заказов нет ни в текущем, ни в прошлом окне воронки (и воронка прочитана). */
  deadStock: boolean;
  /** Конверсия просмотра в корзину за окно воронки, %, и число просмотров, из которых она посчитана. */
  cartPercent: number | null;
  openCount: number | null;
  ordersByDate: Map<string, number>;
  /** null — отзывы не читались. */
  feedbacks: FeedbackRating[] | null;
};

export function playbookSignals(input: ProductInputs, todayKey: string, nowMs = Date.now()): PlaybookSignals | null {
  if (input.discountedPrice == null || !(input.discountedPrice > 0)) return null;
  const trend = ordersTrend(input.ordersByDate, todayKey);
  return {
    nmId: input.nmId,
    buyerPrice: input.discountedPrice,
    oosDays: input.coverDays,
    turnoverDays: turnoverFromDossier(input.coverDays, input.stock, input.deadStock),
    cartPercent: input.cartPercent,
    cartSample: input.openCount,
    declineDays: trend.declineDays,
    riseDays: trend.riseDays,
    recentNegative: input.feedbacks == null ? null : hasRecentNegative(input.feedbacks, nowMs),
    trendKnown: trend.known,
  };
}

/** Заказы товаров по дням из истории в нашей базе (воронка WB). */
export async function loadOrdersByNm(db: SupabaseClient, userId: string, sinceDate: string): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("seller_hub_metric_daily")
      .select("metric_date, nm_id, metrics")
      .eq("user_id", userId)
      .eq("marketplace_id", "wildberries")
      .neq("nm_id", "store")
      .gte("metric_date", sinceDate)
      .order("metric_date", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`История заказов не прочиталась: ${error.message}`);
    for (const row of data ?? []) {
      const orders = (row.metrics as { orders?: unknown } | null)?.orders;
      if (typeof orders !== "number" || !Number.isFinite(orders)) continue;
      const nm = row.nm_id as string;
      if (!out.has(nm)) out.set(nm, new Map());
      out.get(nm)!.set(row.metric_date as string, orders);
    }
    if ((data ?? []).length < pageSize) break;
  }
  return out;
}

/** Оценки отзывов по товарам (последние, достаточно для окна в 10 штук на товар). */
export async function loadFeedbackRatings(db: SupabaseClient, userId: string): Promise<Map<string, FeedbackRating[]>> {
  const { data, error } = await db
    .from("seller_hub_feedbacks")
    .select("nm_id, rating, created_at, counts_on_card")
    .eq("user_id", userId)
    .eq("marketplace_id", "wildberries")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(`Отзывы не прочитались: ${error.message}`);
  const out = new Map<string, FeedbackRating[]>();
  for (const row of data ?? []) {
    if (typeof row.rating !== "number") continue;
    const nm = row.nm_id as string;
    if (!out.has(nm)) out.set(nm, []);
    out.get(nm)!.push({ rating: row.rating, createdAt: row.created_at as string, countsOnCard: row.counts_on_card !== false });
  }
  return out;
}
