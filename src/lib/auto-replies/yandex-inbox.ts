import type { InboxFeedTab, InboxReviewItem } from "./inbox-demo-data";
import type { StarKey } from "./settings-types";
import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings } from "./settings-types";
import type { AutoRepliesUsageId } from "./types";
import { buildLocalAutoReply } from "./reply-generation";
import type { YandexGoodsFeedback } from "@/lib/services/yandex/types";
import type { YandexOfferPreview } from "@/lib/services/yandex/client";
import { extractYandexOfferId } from "@/lib/services/yandex/client";
import type { InboxProductPreview } from "./ozon-inbox";
import { formatInboxReviewDates } from "./inbox-review-dates";
import { resolveInboxItemFeed, resolveSentAtLabel } from "./inbox-auto-send";

function clampStar(value: number | undefined): StarKey {
  const n = Math.round(Number(value ?? 5));
  if (n <= 1) return "1";
  if (n >= 5) return "5";
  return String(n) as StarKey;
}

/** Ответ считается отправленным только если есть текст от продавца в кабинете. */
export function isYandexFeedbackAnswered(feedback: YandexGoodsFeedback): boolean {
  return Boolean(feedback.sellerReplyText?.trim());
}

export function buildYandexReviewText(feedback: YandexGoodsFeedback): string {
  const chunks: string[] = [];
  const comment = feedback.description?.comment?.trim();
  const pros = feedback.description?.advantages?.trim();
  const cons = feedback.description?.disadvantages?.trim();

  if (comment) chunks.push(comment);
  if (pros) chunks.push(`Плюсы: ${pros}`);
  if (cons) chunks.push(`Минусы: ${cons}`);

  if (chunks.length === 0) {
    return "Покупатель не оставил комментария к отзыву";
  }

  return chunks.join("\n\n");
}

export function mapYandexFeedbacksToInbox({
  feedbacks,
  tab,
  sellerName,
  shopSettings,
  mpSettings,
  brandName,
  usage,
  offerById,
  existingItems,
}: {
  feedbacks: YandexGoodsFeedback[];
  tab: InboxFeedTab;
  sellerName: string;
  shopSettings: AutoRepliesShopSettings;
  mpSettings: AutoRepliesMarketplaceSettings;
  brandName?: string | null;
  usage: AutoRepliesUsageId;
  offerById?: Map<string, YandexOfferPreview>;
  existingItems?: InboxReviewItem[];
}): InboxReviewItem[] {
  const existingById = new Map((existingItems ?? []).map((item) => [item.id, item]));

  return feedbacks.map((feedback) => {
    const itemId = `yandex-${feedback.feedbackId}`;
    const existingItem = existingById.get(itemId);
    const starRating = clampStar(feedback.statistics?.rating);
    const reviewText = buildYandexReviewText(feedback);
    const { timeLabel, dateLabel, listDateLabel } = formatInboxReviewDates(feedback.createdAt);
    const offerId = extractYandexOfferId(feedback, existingItem?.supplierOfferId);
    const offerPreview = offerId ? offerById?.get(offerId) : undefined;
    const productName =
      offerPreview?.name?.trim() || (offerId ? `Товар ${offerId}` : "Товар Яндекс Маркет");
    const productArticle = offerId ? `Арт. ${offerId}` : "Арт. —";
    const isAnswered = isYandexFeedbackAnswered(feedback);
    const status = isAnswered ? "sent" : "pending";
    const buyer = feedback.author?.trim();
    const autoSent = existingItem?.autoSent;

    const replyDraft =
      feedback.sellerReplyText?.trim() ||
      (status === "pending"
        ? ""
        : buildLocalAutoReply({
            reviewText,
            starRating,
            shop: shopSettings,
            mp: mpSettings,
            brandName: brandName ?? null,
            buyerName: buyer,
            productName,
            revisionHint: null,
            previousReply: null,
          }));

    const nmId = offerId ? hashOfferId(offerId) : undefined;
    const feed =
      existingItem?.status === "sent"
        ? existingItem.feed
        : resolveInboxItemFeed({
            status,
            starRating,
            mpSettings,
            autoSent,
          });
    const sentAtLabel = isAnswered
      ? existingItem?.sentAtLabel ?? resolveSentAtLabel({ dateLabel, autoSent })
      : undefined;

    return {
      id: itemId,
      externalId: String(feedback.feedbackId),
      source: "yandex",
      feed,
      status,
      starRating,
      productName,
      productArticle,
      marketplaceId: "yandex",
      buyerLabel: buyer || "Покупатель Яндекс Маркета",
      buyerName: buyer,
      shopName: sellerName,
      reviewText,
      replyDraft: isAnswered && feedback.sellerReplyText?.trim() ? feedback.sellerReplyText.trim() : replyDraft,
      timeLabel,
      dateLabel,
      listDateLabel,
      sentAtLabel,
      nmId,
      supplierOfferId: offerId,
      productImageUrl: offerPreview?.pictureUrl,
      reviewPublishedAt: feedback.createdAt,
      orderStatusLabel: "Доставлен",
      autoSent,
      canSend: status === "pending" && !isAnswered,
    };
  });
}

function hashOfferId(offerId: string): number {
  let hash = 0;
  for (let i = 0; i < offerId.length; i++) {
    hash = (hash * 31 + offerId.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
}

export function extractYandexProducts(items: InboxReviewItem[]): InboxProductPreview[] {
  const map = new Map<number, InboxProductPreview>();

  for (const item of items) {
    if (!item.nmId) continue;
    const existing = map.get(item.nmId);
    if (existing) {
      existing.reviewCount += 1;
      if (!existing.productImageUrl && item.productImageUrl) {
        existing.productImageUrl = item.productImageUrl;
      }
      continue;
    }
    map.set(item.nmId, {
      nmId: item.nmId,
      productName: item.productName,
      supplierArticle: item.productArticle.replace(/^Арт\.\s*/, ""),
      reviewCount: 1,
      productImageUrl: item.productImageUrl,
    });
  }

  return Array.from(map.values()).sort((a, b) => b.reviewCount - a.reviewCount);
}
