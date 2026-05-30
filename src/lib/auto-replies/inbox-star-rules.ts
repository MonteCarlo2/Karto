import type { InboxReviewItem } from "./inbox-demo-data";
import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings, StarKey } from "./settings-types";
import { findStopWordHitsInReview } from "./restrictions-settings";

export function resolveStarDeliveryMode(
  mpSettings: AutoRepliesMarketplaceSettings,
  starRating: StarKey
): "confirm" | "auto" {
  return mpSettings.starRules.byStar[starRating] ?? "confirm";
}

export function shouldAutoSendInboxItem(
  item: InboxReviewItem,
  mpSettings: AutoRepliesMarketplaceSettings,
  shopSettings: AutoRepliesShopSettings
): boolean {
  if (item.status !== "pending" || item.canSend === false) return false;
  if (resolveStarDeliveryMode(mpSettings, item.starRating) !== "auto") return false;

    if (shopSettings.advanced.stopWordsEnabled && shopSettings.advanced.stopWords.length > 0) {
    const hits = findStopWordHitsInReview(item.reviewText, shopSettings.advanced.stopWords);
    if (hits.length > 0) return false;
  }

  return true;
}
