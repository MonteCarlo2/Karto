import type { InboxReviewItem } from "./inbox-demo-data";

const RU_MONTHS: Record<string, number> = {
  янв: 0,
  января: 0,
  фев: 1,
  февраля: 1,
  мар: 2,
  марта: 2,
  апр: 3,
  апреля: 3,
  май: 4,
  мая: 4,
  июн: 5,
  июня: 5,
  июл: 6,
  июля: 6,
  авг: 7,
  августа: 7,
  сен: 8,
  сентября: 8,
  окт: 9,
  октября: 9,
  ноя: 10,
  ноября: 10,
  дек: 11,
  декабря: 11,
};

/** Парсит дату отзыва из ISO или полей ленты (ru-RU форматы). */
export function parseInboxItemDate(item: InboxReviewItem): number | null {
  const iso = item.reviewPublishedAt?.trim();
  if (iso) {
    const ts = Date.parse(iso);
    if (!Number.isNaN(ts)) return ts;
  }

  const listRaw = item.listDateLabel?.trim();
  if (listRaw && listRaw !== "—") {
    const dotted = listRaw.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (dotted) {
      const [, d, mo, y] = dotted;
      return new Date(Number(y), Number(mo) - 1, Number(d), 12, 0).getTime();
    }
    const longRu = listRaw.match(/(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
    if (longRu) {
      const month = RU_MONTHS[longRu[2].toLowerCase()];
      if (month !== undefined) {
        return new Date(Number(longRu[3]), month, Number(longRu[1]), 12, 0).getTime();
      }
    }
  }

  const raw = item.dateLabel?.trim();
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})\s+([а-яё]+)(?:,\s*(\d{1,2}):(\d{2}))?/i);
  if (!m) return null;
  const monthKey = m[2].toLowerCase().slice(0, 3);
  const monthFull = m[2].toLowerCase();
  const month = RU_MONTHS[monthFull] ?? RU_MONTHS[monthKey];
  if (month === undefined) return null;
  const day = Number(m[1]);
  const hour = m[3] ? Number(m[3]) : 12;
  const minute = m[4] ? Number(m[4]) : 0;
  const yearMatch = listRaw?.match(/(\d{4})/);
  const year = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();
  return new Date(year, month, day, hour, minute).getTime();
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function formatShortDay(ts: number): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(ts);
}

export function formatHourLabel(ts: number): string {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(ts);
}
