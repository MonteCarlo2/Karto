import type { InboxFeedTab, InboxReviewItem } from "./inbox-demo-data";
import type { StarKey } from "./settings-types";
import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings } from "./settings-types";
import type { AutoRepliesUsageId } from "./types";
import { buildLocalAutoReply } from "./reply-generation";
import {
  getWildberriesProductImageProxyUrl,
  parseWildberriesNmId,
} from "./marketplace-product-image";
import type { WbFeedback } from "@/lib/services/wildberries/types";
import { formatInboxReviewDates } from "./inbox-review-dates";
import { resolveInboxItemFeed, resolveSentAtLabel } from "./inbox-auto-send";

const ORDER_STATUS_LABELS: Record<string, string> = {
  buyout: "Выкуп",
  returned: "Возврат",
  rejected: "Отказ",
  canceled: "Отмена",
  cancelled: "Отмена",
};

function clampStar(value: number | undefined): StarKey {
  const n = Math.round(Number(value ?? 5));
  if (n <= 1) return "1";
  if (n >= 5) return "5";
  return String(n) as StarKey;
}

/** Имя магазина в UI: сначала бренд из KARTO, затем WB seller / supplier. */
export function resolveInboxShopDisplayName({
  brandName,
  sellerName,
  supplierName,
}: {
  brandName?: string | null;
  sellerName?: string | null;
  supplierName?: string | null;
}): string {
  return (
    brandName?.trim() ||
    sellerName?.trim() ||
    supplierName?.trim() ||
    "Продавец Wildberries"
  );
}

export function isWildberriesFeedbackAnswered(feedback: WbFeedback): boolean {
  if (feedback.answer?.text?.trim()) return true;
  const state = feedback.state?.trim().toLowerCase();
  return state === "wbRu" || state === "answered" || state === "published";
}

export function buildWildberriesReviewText(feedback: WbFeedback): string {
  const chunks: string[] = [];
  const text = feedback.text?.trim();
  const pros = feedback.pros?.trim();
  const cons = feedback.cons?.trim();

  if (text) chunks.push(text);
  if (pros) chunks.push(`Плюсы: ${pros}`);
  if (cons) chunks.push(`Минусы: ${cons}`);

  if (chunks.length === 0) {
    return "Покупатель не оставил комментария к отзыву";
  }

  return chunks.join("\n\n");
}

export function extractWildberriesReviewPhotos(feedback: WbFeedback): string[] {
  return (feedback.photoLinks ?? [])
    .map((p) => p.fullSize?.trim() || p.miniSize?.trim())
    .filter((url): url is string => Boolean(url));
}

export function mapWildberriesFeedbackToInboxItem({
  feedback,
  tab,
  sellerName,
  shopSettings,
  mpSettings,
  brandName,
  usage,
  existingItem,
}: {
  feedback: WbFeedback;
  tab: InboxFeedTab;
  sellerName: string;
  shopSettings: AutoRepliesShopSettings;
  mpSettings: AutoRepliesMarketplaceSettings;
  brandName?: string | null;
  usage: AutoRepliesUsageId;
  existingItem?: InboxReviewItem;
}): InboxReviewItem {
  const reviewText = buildWildberriesReviewText(feedback);
  const starRating = clampStar(feedback.productValuation);
  const { timeLabel, dateLabel, listDateLabel } = formatInboxReviewDates(feedback.createdDate);
  const product = feedback.productDetails;
  const productName = product?.productName?.trim() || "Товар Wildberries";
  const article = product?.supplierArticle?.trim();
  const productArticle = article ? `Арт. ${article}` : product?.nmId ? `nmId ${product.nmId}` : "Арт. —";
  const buyer = feedback.userName?.trim();
  const buyerLabel = buyer ? `Покупатель ${buyer}` : "Покупатель WB";
  const nmId = parseWildberriesNmId(product?.nmId);
  const isAnswered = isWildberriesFeedbackAnswered(feedback);
  const status = isAnswered ? "sent" : "pending";
  const shopDisplayName = resolveInboxShopDisplayName({
    brandName,
    sellerName,
    supplierName: product?.supplierName,
  });

  const reviewPhotoUrls = extractWildberriesReviewPhotos(feedback);
  const hasReviewPhotos = reviewPhotoUrls.length > 0;

  const replyDraft =
    feedback.answer?.text?.trim() ||
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
          hasReviewPhotos,
          revisionHint: null,
          previousReply: null,
        }));

  const answerDate = feedback.answer?.createDate;
  const autoSent = existingItem?.autoSent;
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
    ? existingItem?.sentAtLabel ??
      resolveSentAtLabel({
        dateLabel: formatInboxReviewDates(answerDate ?? feedback.createdDate).dateLabel,
        autoSent,
      })
    : undefined;

  return {
    id: `wb-${feedback.id}`,
    externalId: feedback.id,
    source: "wildberries",
    feed,
    status,
    starRating,
    productName,
    productArticle,
    marketplaceId: "wildberries",
    buyerLabel,
    buyerName: buyer,
    shopName: shopDisplayName,
    reviewText: reviewText.trim() || "Покупатель не оставил комментария к отзыву",
    replyDraft,
    timeLabel,
    dateLabel,
    listDateLabel,
    sentAtLabel,
    nmId,
    productImageUrl: getWildberriesProductImageProxyUrl(nmId),
    reviewPhotoUrls: reviewPhotoUrls.length > 0 ? reviewPhotoUrls : undefined,
    brandName: product?.brandName,
    reviewPublishedAt: feedback.createdDate,
    autoSent,
    canSend: status === "pending" && !isAnswered,
  };
}

export function mapWildberriesFeedbacksToInbox({
  feedbacks,
  tab,
  sellerName,
  shopSettings,
  mpSettings,
  brandName,
  usage,
  existingItems,
}: {
  feedbacks: WbFeedback[];
  tab: InboxFeedTab;
  sellerName: string;
  shopSettings: AutoRepliesShopSettings;
  mpSettings: AutoRepliesMarketplaceSettings;
  brandName?: string | null;
  usage: AutoRepliesUsageId;
  existingItems?: InboxReviewItem[];
}): InboxReviewItem[] {
  const existingById = new Map((existingItems ?? []).map((item) => [item.id, item]));

  return feedbacks.map((feedback) =>
    mapWildberriesFeedbackToInboxItem({
      feedback,
      tab,
      sellerName,
      shopSettings,
      mpSettings,
      brandName,
      usage,
      existingItem: existingById.get(`wb-${feedback.id}`),
    })
  );
}

export type WildberriesProductPreview = {
  nmId: number;
  productName: string;
  supplierArticle: string;
  brandName?: string;
  reviewCount: number;
  productImageUrl?: string;
};

export function extractWildberriesProducts(items: InboxReviewItem[]): WildberriesProductPreview[] {
  const map = new Map<number, WildberriesProductPreview>();

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
      brandName: item.brandName,
      reviewCount: 1,
      productImageUrl: item.productImageUrl,
    });
  }

  return Array.from(map.values()).sort((a, b) => b.reviewCount - a.reviewCount);
}
