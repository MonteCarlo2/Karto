import type { InboxReviewItem } from "./inbox-demo-data";
import type { AutoRepliesMarketplaceId } from "./types";
import { resolveSentAtLabel } from "./inbox-feed-utils";

export function isPlaceholderProductName(
  name: string,
  marketplaceId?: AutoRepliesMarketplaceId
): boolean {
  const t = name.trim();
  if (!t) return true;
  if (
    t === "Товар Wildberries" ||
    t === "Товар Яндекс Маркет" ||
    t === "Товар Ozon" ||
    /^Товар \d+$/.test(t)
  ) {
    return true;
  }
  if (marketplaceId === "yandex" && t.startsWith("Товар ") && t.length < 40) {
    return /^Товар [\w-]+$/.test(t);
  }
  return false;
}

export function isPlaceholderProductArticle(article: string): boolean {
  const t = article.trim();
  return t === "Арт. —" || t === "Арт. -" || t === "Арт.—";
}

/** Не затираем название, артикул и фото при повторном sync без offer-mappings. */
export function mergeInboxReviewItem(prev: InboxReviewItem, next: InboxReviewItem): InboxReviewItem {
  if (prev.id !== next.id) return next;

  const productName =
    isPlaceholderProductName(next.productName, next.marketplaceId) &&
    !isPlaceholderProductName(prev.productName, prev.marketplaceId)
      ? prev.productName
      : next.productName;

  const productArticle =
    isPlaceholderProductArticle(next.productArticle) &&
    !isPlaceholderProductArticle(prev.productArticle)
      ? prev.productArticle
      : next.productArticle;

  const prevSent = prev.status === "sent";
  const nextSent = next.status === "sent";
  /** WB: во вкладке «есть ответ» без текста — next.pending; не держим старый sent из snapshot. */
  const ghostReopen = prevSent && !nextSent;
  const mergedSent = ghostReopen ? false : prevSent || nextSent;
  const inferredAutoSent =
    !ghostReopen &&
    (Boolean(prev.autoSent || next.autoSent) ||
      (prev.status === "pending" && prev.feed === "auto" && nextSent));
  const autoJournalSent = mergedSent && inferredAutoSent;

  const nextDraft = next.replyDraft?.trim() ?? "";
  const prevDraft = prev.replyDraft?.trim() ?? "";
  const replyDraft = ghostReopen
    ? next.replyDraft
    : mergedSent
      ? prev.replyDraft || next.replyDraft
      : nextDraft.length >= 2
        ? next.replyDraft
        : prevDraft.length >= 2
          ? prev.replyDraft
          : next.replyDraft;

  const sentAtLabel = ghostReopen
    ? next.sentAtLabel
    : autoJournalSent
      ? prev.sentAtLabel?.includes("автоматически")
        ? prev.sentAtLabel
        : next.sentAtLabel?.includes("автоматически")
          ? next.sentAtLabel
          : resolveSentAtLabel({
              dateLabel: next.dateLabel || prev.dateLabel,
              autoSent: true,
            })
      : mergedSent
        ? prev.sentAtLabel || next.sentAtLabel
        : next.sentAtLabel;

  return {
    ...next,
    productName,
    productArticle,
    productImageUrl: next.productImageUrl || prev.productImageUrl,
    reviewPhotoUrls:
      (next.reviewPhotoUrls?.length ?? 0) > 0
        ? next.reviewPhotoUrls
        : prev.reviewPhotoUrls,
    nmId: next.nmId ?? prev.nmId,
    supplierOfferId: next.supplierOfferId || prev.supplierOfferId,
    autoSent: ghostReopen ? next.autoSent : autoJournalSent ? true : next.autoSent ?? prev.autoSent,
    status: mergedSent ? "sent" : next.status,
    feed: ghostReopen ? next.feed : autoJournalSent ? "auto" : mergedSent ? prev.feed : next.feed,
    replyDraft,
    draftGeneratedByAi: next.draftGeneratedByAi ?? prev.draftGeneratedByAi,
    autoSendError: ghostReopen ? next.autoSendError : next.autoSendError ?? prev.autoSendError,
    canSend: ghostReopen ? next.canSend : mergedSent ? false : next.canSend,
    sentAtLabel,
  };
}

export function mergeInboxReviewLists(
  existing: InboxReviewItem[],
  incoming: InboxReviewItem[],
  marketplaceId?: AutoRepliesMarketplaceId
): InboxReviewItem[] {
  const byId = new Map<string, InboxReviewItem>();

  for (const item of existing) {
    if (marketplaceId && item.marketplaceId !== marketplaceId) continue;
    byId.set(item.id, item);
  }

  for (const item of incoming) {
    const prev = byId.get(item.id);
    byId.set(item.id, prev ? mergeInboxReviewItem(prev, item) : item);
  }

  return Array.from(byId.values());
}

export function inboxItemsMissingYandexProductInfo(items: InboxReviewItem[]): boolean {
  return items.some(
    (item) =>
      item.marketplaceId === "yandex" &&
      (isPlaceholderProductName(item.productName, "yandex") || !item.productImageUrl)
  );
}

export function filterInboxItemsForMarketplace(
  items: InboxReviewItem[],
  marketplaceId: AutoRepliesMarketplaceId
): InboxReviewItem[] {
  return items.filter((item) => item.marketplaceId === marketplaceId);
}
