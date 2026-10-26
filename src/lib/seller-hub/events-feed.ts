import { moscowDateKey } from "@/lib/seller-hub/complete-days";
import type { SellerEventGroup, SellerProductEvent } from "@/lib/seller-hub/event-engine/types";

/**
 * Лента «Событий»: уведомления по дням, новые сверху. Все уведомления выглядят одинаково, отличается одно:
 * пометка «Обратить внимание» (критичное и важное). Направления — фильтры.
 */

/** Нужно ли обратить внимание: всё, что не «к сведению». */
export const needsAttention = (event: SellerProductEvent): boolean => event.severity !== "info";

export type FeedFilter = "all" | "attention" | SellerEventGroup;

export type DayDigest = { orders: number | null; orderSum: number | null };

export type FeedDay = {
  /** Дата по Москве, ГГГГ-ММ-ДД. */
  date: string;
  label: string;
  events: SellerProductEvent[];
  /** Итоги дня из истории в базе (заказы и сумма по воронке WB); null — день не сохранён или ещё не закончился. */
  digest: DayDigest | null;
};

const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** «Сегодня», «Вчера» или «19 октября, воскресенье». Чистая функция: «сейчас» передаётся снаружи. */
export function dayLabel(dateKey: string, nowMs: number): string {
  const today = moscowDateKey(nowMs);
  if (dateKey === today) return "Сегодня";
  if (dateKey === moscowDateKey(nowMs - 86_400_000)) return "Вчера";
  const d = new Date(`${dateKey}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${WEEKDAYS[d.getUTCDay()]}`;
}

export function matchesFilter(event: SellerProductEvent, filter: FeedFilter): boolean {
  if (filter === "all") return true;
  if (filter === "attention") return needsAttention(event);
  return event.group === filter;
}

export function matchesQuery(event: SellerProductEvent, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [event.productTitle, event.vendorCode, event.nmId, event.title, event.detail].filter(Boolean).join(" ").toLowerCase().includes(needle);
}

/**
 * События по дням, новые дни сверху, внутри дня новые сверху.
 * @param digests итоги дней по дате (из истории); сегодняшний день итога не получает: он не закончен.
 */
export function groupEventsByDay(events: SellerProductEvent[], nowMs: number, digests: Map<string, DayDigest> = new Map()): FeedDay[] {
  const today = moscowDateKey(nowMs);
  const byDay = new Map<string, SellerProductEvent[]>();
  for (const event of events) {
    const ms = Date.parse(event.createdAt);
    if (!Number.isFinite(ms)) continue;
    const key = moscowDateKey(ms);
    byDay.set(key, [...(byDay.get(key) ?? []), event]);
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => ({
      date,
      label: dayLabel(date, nowMs),
      events: [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      digest: date < today ? (digests.get(date) ?? null) : null,
    }));
}

/** Сколько событий в каждом направлении (для чисел на фильтрах) и сколько требуют внимания. */
export function feedCounts(events: SellerProductEvent[]): { byGroup: Map<SellerEventGroup, number>; attention: number } {
  const byGroup = new Map<SellerEventGroup, number>();
  let attention = 0;
  for (const event of events) {
    byGroup.set(event.group, (byGroup.get(event.group) ?? 0) + 1);
    if (needsAttention(event)) attention += 1;
  }
  return { byGroup, attention };
}

export type FeedItem =
  | { type: "single"; event: SellerProductEvent }
  /** Серия однотипных событий в одну минуту-другую (например, обновление цен у десятков товаров): одно уведомление со списком. */
  | { type: "burst"; id: string; title: string; events: SellerProductEvent[] };

/** Сколько однотипных событий подряд считаем серией. */
export const BURST_MIN = 3;
/** События одного вида, замеченные в пределах этого окна, относятся к одной серии. */
export const BURST_WINDOW_MS = 5 * 60 * 1000;

const productsWord = (n: number) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "товара";
  return "товаров";
};

/**
 * Схлопывает серии: события одного вида по товарам, замеченные почти одновременно, в одно уведомление, даже если между ними
 * чередуются другие виды (скидка, цена, скидка, цена…). Серия стоит на месте своего первого события, порядок остальных сохраняется.
 * События без товара (штрафы, акции) в серии не склеиваются.
 */
export function collapseBursts(events: SellerProductEvent[]): FeedItem[] {
  type Bucket = { kind: string; events: SellerProductEvent[]; lastMs: number };
  const slots: Array<{ event: SellerProductEvent } | { bucket: Bucket }> = [];
  const open: Bucket[] = [];
  for (const event of events) {
    if (!event.nmId) {
      slots.push({ event });
      continue;
    }
    const ms = Date.parse(event.createdAt);
    const bucket = open.find((b) => b.kind === event.kind && Math.abs(b.lastMs - ms) <= BURST_WINDOW_MS);
    if (bucket) {
      bucket.events.push(event);
      bucket.lastMs = ms;
    } else {
      const fresh: Bucket = { kind: event.kind, events: [event], lastMs: ms };
      open.push(fresh);
      slots.push({ bucket: fresh });
    }
  }
  const items: FeedItem[] = [];
  for (const slot of slots) {
    if ("event" in slot) {
      items.push({ type: "single", event: slot.event });
    } else if (slot.bucket.events.length >= BURST_MIN) {
      const first = slot.bucket.events[0]!;
      items.push({ type: "burst", id: `burst:${first.kind}:${first.id}`, title: `${first.title}: у ${slot.bucket.events.length} ${productsWord(slot.bucket.events.length)}`, events: slot.bucket.events });
    } else {
      for (const event of slot.bucket.events) items.push({ type: "single", event });
    }
  }
  return items;
}
