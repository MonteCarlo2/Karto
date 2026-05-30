import type { StarKey } from "./settings-types";
import type { InboxReviewItem } from "./inbox-demo-data";

export type InboxFeedSort = "newest" | "oldest" | "rating_desc" | "rating_asc";

export type InboxFeedDateRange = {
  from: string | null;
  to: string | null;
};

export type InboxFeedTextMode = "all" | "with_text" | "without_text";

export type InboxFeedFilters = {
  sort: InboxFeedSort;
  ratings: StarKey[];
  dateRange: InboxFeedDateRange;
  textMode: InboxFeedTextMode;
  search: string;
};

export const INBOX_FEED_DEFAULT_FILTERS: InboxFeedFilters = {
  sort: "newest",
  ratings: ["1", "2", "3", "4", "5"],
  dateRange: { from: null, to: null },
  textMode: "all",
  search: "",
};

const STAR_KEYS: StarKey[] = ["1", "2", "3", "4", "5"];

import { hasMeaningfulReviewText } from "./empty-review-settings";
import { parseInboxItemDate } from "./inbox-item-date";

function parseItemDate(item: InboxReviewItem): number | null {
  return parseInboxItemDate(item);
}

function dayStartFromIso(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function dayEndFromIso(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

function withinDateRange(ts: number | null, range: InboxFeedDateRange): boolean {
  if (!range.from && !range.to) return true;
  if (ts === null) return false;
  const from = range.from ? dayStartFromIso(range.from) : null;
  const to = range.to ? dayEndFromIso(range.to) : null;
  if (from !== null && to !== null) return ts >= from && ts <= to;
  if (from !== null) return ts >= from;
  if (to !== null) return ts <= to;
  return true;
}

export function isInboxFeedFilterActive(filters: InboxFeedFilters): boolean {
  if (filters.search.trim().length > 0) return true;
  if (filters.sort !== INBOX_FEED_DEFAULT_FILTERS.sort) return true;
  if (filters.dateRange.from || filters.dateRange.to) return true;
  if (filters.textMode !== "all") return true;
  if (filters.ratings.length !== STAR_KEYS.length) return true;
  const set = new Set(filters.ratings);
  return STAR_KEYS.some((s) => !set.has(s));
}

export function applyInboxFeedFilters(items: InboxReviewItem[], filters: InboxFeedFilters): InboxReviewItem[] {
  const q = filters.search.trim().toLowerCase();
  const ratingSet = new Set(filters.ratings);

  let list = items.filter((item) => {
    if (!ratingSet.has(item.starRating)) return false;
    if (!withinDateRange(parseItemDate(item), filters.dateRange)) return false;

    const withText = hasMeaningfulReviewText(item.reviewText);
    if (filters.textMode === "with_text" && !withText) return false;
    if (filters.textMode === "without_text" && withText) return false;

    if (!q) return true;
    const haystack = [
      item.productName,
      item.buyerName,
      item.buyerLabel,
      item.reviewText,
      item.productArticle,
      item.shopName,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  list = [...list].sort((a, b) => {
    switch (filters.sort) {
      case "oldest":
        return (parseItemDate(a) ?? 0) - (parseItemDate(b) ?? 0);
      case "rating_desc":
        return Number(b.starRating) - Number(a.starRating);
      case "rating_asc":
        return Number(a.starRating) - Number(b.starRating);
      case "newest":
      default:
        return (parseItemDate(b) ?? 0) - (parseItemDate(a) ?? 0);
    }
  });

  return list;
}

export { STAR_KEYS as INBOX_FEED_STAR_KEYS };
