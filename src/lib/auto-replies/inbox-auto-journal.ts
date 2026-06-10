import type { InboxReviewItem } from "./inbox-demo-data";
import type { AutoRepliesMarketplaceId } from "./types";
import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings } from "./settings-types";
import { resolveSentAtLabel } from "./inbox-auto-send";
import { resolveStarDeliveryMode } from "./inbox-star-rules";

/** Ручная отправка из UI — не переносим в авто-журнал. */
function isManualConfirmationSend(item: InboxReviewItem): boolean {
  const label = item.sentAtLabel?.trim() ?? "";
  return label.includes("Только что · подтверждено");
}

/**
 * Восстанавливает вкладку «Авто-журнал» после sync с WB, если ответ ушёл автоматически
 * (режим/звёзды = auto), но API маркетплейса не вернул autoSent.
 */
export function normalizeInboxItemAutoJournal(
  item: InboxReviewItem,
  mp: AutoRepliesMarketplaceSettings,
  _shop?: AutoRepliesShopSettings
): InboxReviewItem {
  if (item.status !== "sent") return item;
  if (item.autoSent === true && item.feed === "auto") return item;
  if (isManualConfirmationSend(item)) return item;
  if (mp.usage === "manual") return item;

  const starMode = resolveStarDeliveryMode(mp, item.starRating);
  if (starMode !== "auto") return item;

  return {
    ...item,
    feed: "auto",
    autoSent: true,
    sentAtLabel: item.sentAtLabel?.includes("автоматически")
      ? item.sentAtLabel
      : resolveSentAtLabel({ dateLabel: item.dateLabel, autoSent: true }),
  };
}

export function normalizeInboxItemsAutoJournal(
  items: InboxReviewItem[],
  marketplaceId: AutoRepliesMarketplaceId,
  mp: AutoRepliesMarketplaceSettings,
  shop?: AutoRepliesShopSettings
): InboxReviewItem[] {
  return items.map((item) =>
    item.marketplaceId === marketplaceId
      ? normalizeInboxItemAutoJournal(item, mp, shop)
      : item
  );
}
