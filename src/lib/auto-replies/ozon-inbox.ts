import type { InboxFeedTab, InboxReviewItem } from "./inbox-demo-data";
import type { StarKey } from "./settings-types";
import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings } from "./settings-types";
import type { AutoRepliesUsageId } from "./types";
import { buildLocalAutoReply } from "./reply-generation";
import type { OzonProductInfo, OzonReview } from "@/lib/services/ozon/types";
import { pickOzonProductImageUrl } from "@/lib/services/ozon/client";
import { formatInboxReviewDates } from "./inbox-review-dates";
import { resolveInboxItemFeed, resolveSentAtLabel } from "./inbox-auto-send";

const ORDER_STATUS_LABELS: Record<string, string> = {
  DELIVERED: "Доставлен",
  CANCELLED: "Отменён",
};

function clampStar(value: number | undefined): StarKey {
  const n = Math.round(Number(value ?? 5));
  if (n <= 1) return "1";
  if (n >= 5) return "5";
  return String(n) as StarKey;
}

export function ozonReviewHasContent(review: OzonReview): boolean {
  return (
    Boolean(review.text?.trim()) ||
    (review.photos_amount ?? 0) > 0 ||
    (review.videos_amount ?? 0) > 0
  );
}

export function isOzonReviewAnswered(review: OzonReview): boolean {
  return review.status === "PROCESSED" || Boolean(review.sellerReplyText?.trim());
}

export type InboxProductPreview = {
  nmId: number;
  productName: string;
  supplierArticle: string;
  brandName?: string;
  reviewCount: number;
  productImageUrl?: string;
};

export function mapOzonReviewsToInbox({
  reviews,
  tab,
  sellerName,
  shopSettings,
  mpSettings,
  brandName,
  usage,
  productsBySku,
  existingItems,
}: {
  reviews: OzonReview[];
  tab: InboxFeedTab;
  sellerName: string;
  shopSettings: AutoRepliesShopSettings;
  mpSettings: AutoRepliesMarketplaceSettings;
  brandName?: string | null;
  usage: AutoRepliesUsageId;
  productsBySku: Map<number, OzonProductInfo>;
  existingItems?: InboxReviewItem[];
}): InboxReviewItem[] {
  const existingById = new Map((existingItems ?? []).map((item) => [item.id, item]));

  return reviews.map((review) => {
    const itemId = `ozon-${review.id}`;
    const existingItem = existingById.get(itemId);
    const starRating = clampStar(review.rating);
    const reviewText = review.text?.trim() || "Только звёзды";
    const { timeLabel, dateLabel, listDateLabel } = formatInboxReviewDates(review.published_at);
    const sku = review.sku ? Number(review.sku) : undefined;
    const product = sku ? productsBySku.get(sku) : undefined;
    const productName = product?.name?.trim() || (sku ? `Товар SKU ${sku}` : "Товар Ozon");
    const offerId = product?.offer_id?.trim();
    const productArticle = offerId ? `Арт. ${offerId}` : sku ? `SKU ${sku}` : "Арт. —";
    const productImageUrl = pickOzonProductImageUrl(product);
    const isAnswered = isOzonReviewAnswered(review);
    const status = isAnswered ? "sent" : "pending";
    const autoSent = existingItem?.autoSent;
    const hasContent = ozonReviewHasContent(review);

    const replyDraft =
      review.sellerReplyText?.trim() ||
      (status === "pending"
        ? ""
        : buildLocalAutoReply({
            reviewText,
            starRating,
            shop: shopSettings,
            mp: mpSettings,
            brandName: brandName ?? null,
            productName,
            hasReviewPhotos: (review.photos_amount ?? 0) > 0,
            revisionHint: null,
            previousReply: null,
          }));

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
      externalId: review.id,
      source: "ozon",
      feed,
      status,
      starRating,
      productName,
      productArticle,
      marketplaceId: "ozon",
      buyerLabel: "Покупатель Ozon",
      shopName: sellerName,
      reviewText,
      replyDraft: isAnswered && review.sellerReplyText?.trim() ? review.sellerReplyText.trim() : replyDraft,
      timeLabel,
      dateLabel,
      listDateLabel,
      sentAtLabel,
      nmId: sku,
      productImageUrl,
      reviewPublishedAt: review.published_at,
      orderStatusLabel: ORDER_STATUS_LABELS[review.order_status ?? ""] ?? "Доставлен",
      autoSent,
      canSend: status === "pending" && hasContent,
    };
  });
}

export function extractOzonProducts(items: InboxReviewItem[]): InboxProductPreview[] {
  const map = new Map<number, InboxProductPreview>();

  for (const item of items) {
    if (!item.nmId) continue;
    const existing = map.get(item.nmId);
    if (existing) {
      existing.reviewCount += 1;
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
