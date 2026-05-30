import type { InboxReviewItem } from "./inbox-demo-data";
import type { StarKey } from "./settings-types";
import { hasMeaningfulReviewText } from "./empty-review-settings";
import { filterInboxItemsForMarketplace } from "./inbox-item-merge";
import type { AutoRepliesMarketplaceId } from "./types";
import { formatInboxReviewDates } from "./inbox-review-dates";
import type { ReplyHistoryEntry } from "./reply-history-store";
import {
  formatHourLabel,
  formatShortDay,
  parseInboxItemDate,
  startOfDay,
} from "./inbox-item-date";

export type AnalyticsDataSource = "cabinet" | "text";

export type AnalyticsPeriod = "day" | "month" | "quarter" | "all";

export type ReviewSentiment = "positive" | "neutral" | "negative";

export type AnalyticsTimelinePoint = {
  key: string;
  label: string;
  count: number;
  avgRating: number;
  positive: number;
  negative: number;
};

export type AnalyticsProductRow = {
  name: string;
  count: number;
  avgRating: number;
};

export type InboxAnalyticsSnapshot = {
  period: AnalyticsPeriod;
  marketplaceId: AutoRepliesMarketplaceId;
  totalReviews: number;
  averageRating: number;
  ratingDelta: number | null;
  sentiment: Record<ReviewSentiment, number>;
  sentimentPct: Record<ReviewSentiment, number>;
  stars: Record<StarKey, number>;
  starsPct: Record<StarKey, number>;
  /** Самая частая оценка за период */
  dominantStar: StarKey | null;
  withText: number;
  withoutText: number;
  withTextPct: number;
  repliesSent: number;
  repliesPending: number;
  autoReplies: number;
  manualReplies: number;
  responseRate: number;
  timeline: AnalyticsTimelinePoint[];
  topProducts: AnalyticsProductRow[];
  hasData: boolean;
  isDemo: boolean;
  syncedAt: string | null;
};

const STAR_KEYS: StarKey[] = ["1", "2", "3", "4", "5"];

export function sentimentFromStar(star: StarKey): ReviewSentiment {
  if (star === "3") return "neutral";
  if (star === "1" || star === "2") return "negative";
  return "positive";
}

function periodRange(period: AnalyticsPeriod, now = Date.now()): { from: number; to: number } {
  const to = now;
  if (period === "all") return { from: 0, to };
  if (period === "day") {
    const from = startOfDay(now);
    return { from, to };
  }
  if (period === "month") return { from: now - 30 * 86_400_000, to };
  return { from: now - 90 * 86_400_000, to };
}

function previousPeriodRange(period: AnalyticsPeriod, now = Date.now()): { from: number; to: number } | null {
  if (period === "all") return null;
  const current = periodRange(period, now);
  const span = current.to - current.from;
  return { from: current.from - span, to: current.from - 1 };
}

function filterByPeriod(items: InboxReviewItem[], from: number, to: number): InboxReviewItem[] {
  return items.filter((item) => {
    const ts = parseInboxItemDate(item);
    if (ts === null) return from === 0;
    if (from === 0) return ts <= to;
    return ts >= from && ts <= to;
  });
}

function averageRating(items: InboxReviewItem[]): number {
  if (items.length === 0) return 0;
  const sum = items.reduce((acc, item) => acc + Number(item.starRating), 0);
  return sum / items.length;
}

function buildTimeline(items: InboxReviewItem[], period: AnalyticsPeriod): AnalyticsTimelinePoint[] {
  const buckets = new Map<
    string,
    { label: string; count: number; ratingSum: number; positive: number; negative: number }
  >();

  for (const item of items) {
    const ts = parseInboxItemDate(item);
    if (ts === null) continue;

    const key =
      period === "day"
        ? `${startOfDay(ts)}:${new Date(ts).getHours()}`
        : String(startOfDay(ts));
    const label = period === "day" ? formatHourLabel(ts) : formatShortDay(ts);

    const bucket = buckets.get(key) ?? { label, count: 0, ratingSum: 0, positive: 0, negative: 0 };
    bucket.count += 1;
    bucket.ratingSum += Number(item.starRating);
    const sentiment = sentimentFromStar(item.starRating);
    if (sentiment === "positive") bucket.positive += 1;
    if (sentiment === "negative") bucket.negative += 1;
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => {
      const aTs = Number(a.split(":")[0]);
      const bTs = Number(b.split(":")[0]);
      return aTs - bTs;
    })
    .map(([key, bucket]) => ({
      key,
      label: bucket.label,
      count: bucket.count,
      avgRating: bucket.count ? bucket.ratingSum / bucket.count : 0,
      positive: bucket.positive,
      negative: bucket.negative,
    }));
}

function buildTopProducts(items: InboxReviewItem[]): AnalyticsProductRow[] {
  const map = new Map<string, { count: number; ratingSum: number }>();
  for (const item of items) {
    const name = item.productName?.trim() || "Без названия";
    const row = map.get(name) ?? { count: 0, ratingSum: 0 };
    row.count += 1;
    row.ratingSum += Number(item.starRating);
    map.set(name, row);
  }

  return [...map.entries()]
    .map(([name, row]) => ({
      name,
      count: row.count,
      avgRating: row.count ? row.ratingSum / row.count : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

/** История ручных генераций → метрики для вкладки «По тексту». */
export function replyHistoryToAnalyticsItems(
  entries: ReplyHistoryEntry[],
  marketplaceId: AutoRepliesMarketplaceId
): InboxReviewItem[] {
  return entries
    .filter((entry) => entry.marketplaceId === marketplaceId)
    .map((entry) => {
      const { timeLabel, dateLabel, listDateLabel } = formatInboxReviewDates(entry.createdAt);
      return {
        id: `manual-${entry.id}`,
        feed: "semi",
        status: "sent",
        starRating: entry.starRating,
        productName: "Ручной ввод",
        productArticle: "—",
        marketplaceId,
        buyerLabel: "Ручной режим",
        shopName: "KARTO",
        reviewText: entry.reviewText,
        replyDraft: entry.replyText,
        timeLabel,
        dateLabel,
        listDateLabel,
        sentAtLabel: dateLabel,
        reviewPublishedAt: entry.createdAt,
        autoSent: false,
        canSend: false,
      };
    });
}

export function computeInboxAnalytics(params: {
  items: InboxReviewItem[];
  marketplaceId: AutoRepliesMarketplaceId;
  period: AnalyticsPeriod;
  isDemo?: boolean;
  syncedAt?: string | null;
}): InboxAnalyticsSnapshot {
  const scoped = filterInboxItemsForMarketplace(params.items, params.marketplaceId);
  const range = periodRange(params.period);
  const inPeriod = filterByPeriod(scoped, range.from, range.to);

  const sentiment: Record<ReviewSentiment, number> = { positive: 0, neutral: 0, negative: 0 };
  const stars = Object.fromEntries(STAR_KEYS.map((s) => [s, 0])) as Record<StarKey, number>;
  let withText = 0;
  let withoutText = 0;
  let repliesSent = 0;
  let repliesPending = 0;
  let autoReplies = 0;
  let manualReplies = 0;

  for (const item of inPeriod) {
    sentiment[sentimentFromStar(item.starRating)] += 1;
    stars[item.starRating] += 1;

    if (hasMeaningfulReviewText(item.reviewText)) withText += 1;
    else withoutText += 1;

    if (item.status === "sent") {
      repliesSent += 1;
      if (item.autoSent || item.feed === "auto") autoReplies += 1;
      else manualReplies += 1;
    } else {
      repliesPending += 1;
    }
  }

  const totalReviews = inPeriod.length;
  const avg = averageRating(inPeriod);

  let ratingDelta: number | null = null;
  const prevRange = previousPeriodRange(params.period);
  if (prevRange) {
    const prevItems = filterByPeriod(scoped, prevRange.from, prevRange.to);
    if (prevItems.length > 0) {
      ratingDelta = avg - averageRating(prevItems);
    }
  }

  const responseRate =
    totalReviews > 0 ? Math.round((repliesSent / totalReviews) * 100) : 0;

  const starsPct = Object.fromEntries(
    STAR_KEYS.map((s) => [s, pct(stars[s], totalReviews)])
  ) as Record<StarKey, number>;

  let dominantStar: StarKey | null = null;
  let dominantCount = 0;
  for (const s of STAR_KEYS) {
    if (stars[s] > dominantCount) {
      dominantCount = stars[s];
      dominantStar = s;
    }
  }

  return {
    period: params.period,
    marketplaceId: params.marketplaceId,
    totalReviews,
    averageRating: totalReviews ? Math.round(avg * 10) / 10 : 0,
    ratingDelta: ratingDelta !== null ? Math.round(ratingDelta * 10) / 10 : null,
    sentiment,
    sentimentPct: {
      positive: pct(sentiment.positive, totalReviews),
      neutral: pct(sentiment.neutral, totalReviews),
      negative: pct(sentiment.negative, totalReviews),
    },
    stars,
    starsPct,
    dominantStar,
    withText,
    withoutText,
    withTextPct: pct(withText, totalReviews),
    repliesSent,
    repliesPending,
    autoReplies,
    manualReplies,
    responseRate,
    timeline: buildTimeline(inPeriod, params.period),
    topProducts: buildTopProducts(inPeriod),
    hasData: totalReviews > 0,
    isDemo: Boolean(params.isDemo),
    syncedAt: params.syncedAt ?? null,
  };
}

export const ANALYTICS_PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  day: "Сегодня",
  month: "30 дней",
  quarter: "Квартал",
  all: "Всё время",
};
