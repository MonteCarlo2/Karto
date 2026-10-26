import { moscowDateKey } from "@/lib/seller-hub/complete-days";
import type { SellerEventKind, SellerProductEvent } from "@/lib/seller-hub/event-engine/types";
import type { SellerDailySalesPoint } from "@/lib/seller-hub/types";

/**
 * Динамика заказов и события рядом: что случилось перед просадкой.
 * Время события — когда мы его заметили при обновлении данных, а не момент самого изменения: изменение могло произойти
 * в любой момент между двумя обновлениями. Поэтому причины называем «возможными», а не доказанными.
 */

export type TimelineDay = {
  date: string;
  orders: number;
  revenue: number;
  /** Неполный день (сегодня): не сравниваем с полными. */
  partial: boolean;
  /** События, замеченные в этот день. */
  events: SellerProductEvent[];
};

export type PossibleCause = { event: SellerProductEvent; why: string };

export type Drop = {
  date: string;
  orders: number;
  /** Среднее число заказов за предыдущие полные дни окна. */
  baseline: number;
  /** Падение относительно среднего, %. */
  dropPercent: number;
  causes: PossibleCause[];
};

/** Меньше стольких заказов в среднем: падение нельзя отличить от случайных колебаний. */
export const MIN_BASELINE_ORDERS = 4;
/** Падение на столько процентов и больше считаем просадкой. */
export const DROP_PERCENT = 40;
/** Сколько суток до просадки ищем события-кандидаты. */
export const CAUSE_WINDOW_DAYS = 3;

/** Насколько событие похоже на причину просадки заказов: чем меньше число, тем вероятнее. null — не причина. */
const CAUSE_RANK: Partial<Record<SellerEventKind, { rank: number; why: string }>> = {
  stock_out: { rank: 1, why: "товар закончился: нечего заказывать" },
  price_changed: { rank: 2, why: "цена менялась: покупатели реагируют на цену" },
  promo_price_changed: { rank: 2, why: "цена со скидкой менялась" },
  discount_changed: { rank: 2, why: "скидка менялась" },
  content_score_changed: { rank: 4, why: "карточку правили: конверсия могла измениться" },
  photos_changed: { rank: 4, why: "менялись фото: конверсия могла измениться" },
  product_removed: { rank: 1, why: "товар пропал из каталога" },
};

const dayKey = (iso: string): string | null => {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? moscowDateKey(ms) : null;
};

/** События, которые могли повлиять на просадку заказов за день `date`: замеченные за CAUSE_WINDOW_DAYS суток до неё, самые вероятные первыми. */
export function possibleCauses(date: string, events: SellerProductEvent[]): PossibleCause[] {
  const to = Date.parse(`${date}T00:00:00Z`);
  const from = to - CAUSE_WINDOW_DAYS * 86_400_000;
  return events
    .flatMap((event) => {
      const rule = CAUSE_RANK[event.kind];
      const key = dayKey(event.createdAt);
      if (!rule || !key) return [];
      const eventDay = Date.parse(`${key}T00:00:00Z`);
      if (eventDay < from || eventDay > to) return [];
      return [{ event, why: rule.why, rank: rule.rank }];
    })
    .sort((a, b) => a.rank - b.rank || b.event.createdAt.localeCompare(a.event.createdAt))
    .slice(0, 5)
    .map(({ event, why }) => ({ event, why }));
}

export function buildEventTimeline(input: {
  daily: SellerDailySalesPoint[];
  events: SellerProductEvent[];
  nowMs: number;
}): { days: TimelineDay[]; drops: Drop[] } {
  const today = moscowDateKey(input.nowMs);
  const byDate = new Map<string, SellerProductEvent[]>();
  for (const event of input.events) {
    const key = dayKey(event.createdAt);
    if (!key) continue;
    byDate.set(key, [...(byDate.get(key) ?? []), event]);
  }
  const days: TimelineDay[] = [...input.daily]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const date = d.date.slice(0, 10);
      return { date, orders: d.orders, revenue: d.revenue, partial: date >= today, events: byDate.get(date) ?? [] };
    });

  const drops: Drop[] = [];
  const complete = days.filter((d) => !d.partial);
  for (let i = 3; i < complete.length; i += 1) {
    const day = complete[i]!;
    const before = complete.slice(0, i);
    const baseline = before.reduce((s, d) => s + d.orders, 0) / before.length;
    if (baseline < MIN_BASELINE_ORDERS) continue;
    const dropPercent = Math.round((1 - day.orders / baseline) * 100);
    if (dropPercent < DROP_PERCENT) continue;
    const causes = possibleCauses(day.date, input.events);
    drops.push({ date: day.date, orders: day.orders, baseline: Math.round(baseline * 10) / 10, dropPercent, causes });
  }
  return { days, drops };
}
