import type { InboxReviewItem } from "./inbox-demo-data";
import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings, StarKey } from "./settings-types";
import { findStopWordHitsInReview } from "./restrictions-settings";

export function resolveStarDeliveryMode(
  mpSettings: AutoRepliesMarketplaceSettings,
  starRating: StarKey
): "confirm" | "auto" {
  return mpSettings.starRules.byStar[starRating] ?? "confirm";
}

/** Сколько неудач автоотправки подряд терпим: после этого отзыв остаётся на ручное подтверждение с понятной причиной. */
export const AUTO_SEND_MAX_ATTEMPTS = 5;

/** Пауза после неудачи: 5, 10, 20, 40 минут, дальше час. Бесконечные повторы каждую минуту не нужны. */
export function autoSendBackoffMs(attempts: number): number {
  return Math.min(60, 5 * 2 ** Math.max(0, attempts - 1)) * 60_000;
}

export function autoSendIsPaused(item: Pick<InboxReviewItem, "autoSendAttempts" | "autoSendFailedAt">, nowMs = Date.now()): boolean {
  const attempts = item.autoSendAttempts ?? 0;
  if (attempts <= 0) return false;
  if (attempts >= AUTO_SEND_MAX_ATTEMPTS) return true;
  const failedAt = item.autoSendFailedAt ? Date.parse(item.autoSendFailedAt) : NaN;
  if (!Number.isFinite(failedAt)) return false;
  return nowMs - failedAt < autoSendBackoffMs(attempts);
}

export function shouldAutoSendInboxItem(
  item: InboxReviewItem,
  mpSettings: AutoRepliesMarketplaceSettings,
  shopSettings: AutoRepliesShopSettings,
  nowMs = Date.now()
): boolean {
  if (item.status !== "pending" || item.canSend === false) return false;
  if (autoSendIsPaused(item, nowMs)) return false;
  if (resolveStarDeliveryMode(mpSettings, item.starRating) !== "auto") return false;

  if (shopSettings.advanced.stopWordsEnabled && shopSettings.advanced.stopWords.length > 0) {
    const hits = findStopWordHitsInReview(item.reviewText, shopSettings.advanced.stopWords);
    if (hits.length > 0) return false;
  }

  return true;
}
