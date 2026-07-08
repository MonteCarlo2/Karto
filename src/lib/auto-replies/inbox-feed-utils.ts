import type { InboxFeedTab, InboxReviewItem } from "./inbox-demo-data";
import type { AutoRepliesMarketplaceSettings } from "./settings-types";
import { resolveStarDeliveryMode } from "./inbox-star-rules";

export function resolveInboxItemFeed(params: {
  status: InboxReviewItem["status"];
  starRating: InboxReviewItem["starRating"];
  mpSettings: AutoRepliesMarketplaceSettings;
  autoSent?: boolean;
}): InboxFeedTab {
  if (params.status === "sent") {
    return params.autoSent ? "auto" : "semi";
  }
  const starMode = resolveStarDeliveryMode(params.mpSettings, params.starRating);
  return starMode === "auto" ? "auto" : "semi";
}

/** Пересчитать feed только для pending — отправленные остаются в своей вкладке. */
export function reassignInboxItemFeeds(
  items: InboxReviewItem[],
  mpSettings: AutoRepliesMarketplaceSettings
): InboxReviewItem[] {
  return items.map((item) => {
    if (item.status === "sent") return item;
    const feed = resolveInboxItemFeed({
      status: item.status,
      starRating: item.starRating,
      mpSettings,
      autoSent: item.autoSent,
    });
    if (feed === item.feed) return item;
    return { ...item, feed };
  });
}

export function resolveSentAtLabel(params: {
  dateLabel: string;
  autoSent?: boolean;
}): string {
  if (params.autoSent) {
    return `${params.dateLabel} · автоматически`;
  }
  return `${params.dateLabel} · подтверждено`;
}
