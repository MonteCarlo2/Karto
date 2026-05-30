import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboxFeedTab, InboxReviewItem } from "@/lib/auto-replies/inbox-demo-data";
import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings } from "@/lib/auto-replies/settings-types";
import type { AutoRepliesUsageId } from "@/lib/auto-replies/types";
import { extractOzonProducts, mapOzonReviewsToInbox } from "@/lib/auto-replies/ozon-inbox";
import { mergeInboxReviewLists } from "@/lib/auto-replies/inbox-item-merge";
import { sortInboxItemsByReviewDate } from "@/lib/auto-replies/inbox-review-scope";
import { finishInboxSyncPipeline, type InboxSyncMode } from "@/lib/auto-replies/inbox-sync-finish";
import { ozonReviewApiBlocked } from "@/lib/auto-replies/ozon-subscription";
import {
  getStaleOzonSync,
  setCachedOzonSync,
  ozonCredentialsKey,
} from "@/lib/services/ozon/server-cache";
import {
  answerOzonReview,
  enrichOzonReviewsWithSellerReplies,
  fetchOzonAllRecentReviews,
  fetchOzonProductsBySku,
  parseOzonCredentials,
} from "@/lib/services/ozon/client";

const SYNC_CACHE_MS = 90_000;

function mergeInboxItems(existing: InboxReviewItem[], incoming: InboxReviewItem[]): InboxReviewItem[] {
  return mergeInboxReviewLists(existing, incoming, "ozon");
}

function countPendingInboxItems(items: InboxReviewItem[]): number {
  return items.filter((item) => item.feed === "semi" && item.status === "pending").length;
}

export type OzonInboxSyncResult = {
  items: InboxReviewItem[];
  sellerName: string;
  unansweredCount: number;
  autoSentCount: number;
  autoSendWarning?: string;
};

export async function runOzonInboxSync(input: {
  supabase: SupabaseClient;
  userId: string;
  clientId: string;
  apiKey: string;
  tab?: InboxFeedTab;
  usage: AutoRepliesUsageId;
  shop: AutoRepliesShopSettings;
  mp: AutoRepliesMarketplaceSettings;
  brandName?: string | null;
  sellerName?: string | null;
  take?: number;
  mode?: InboxSyncMode;
}): Promise<OzonInboxSyncResult> {
  const credentials = parseOzonCredentials({
    clientId: input.clientId,
    apiKey: input.apiKey,
  });
  if (!credentials) throw new Error("Укажите Client ID и API Key Ozon");

  if (
    input.mp.connection.verifiedAt &&
    ozonReviewApiBlocked(input.mp.connection.reviewApiAvailable, input.mp.connection.premiumPlus)
  ) {
    throw new Error("Для отзывов Ozon нужна подписка Premium Plus или «Управление отзывами»");
  }

  const tab = input.tab ?? "semi";
  const mode = input.mode ?? "ui";
  const cacheKey = `${ozonCredentialsKey(credentials.clientId, credentials.apiKey)}:all`;
  const take = Math.min(100, Math.max(20, Number(input.take ?? 100)));

  const sellerName =
    input.sellerName?.trim() ||
    input.mp.connection.sellerName?.trim() ||
    "Продавец Ozon";

  const rawReviews = await fetchOzonAllRecentReviews(credentials, take);
  const reviews = await enrichOzonReviewsWithSellerReplies(credentials, rawReviews.reviews ?? []);

  const skus = reviews
    .map((review) => review.sku)
    .filter((sku): sku is number => typeof sku === "number");

  let productsBySku = new Map<number, import("@/lib/services/ozon/types").OzonProductInfo>();
  try {
    productsBySku = await fetchOzonProductsBySku(credentials, skus);
  } catch {
    /* optional */
  }

  const staleItems = (getStaleOzonSync<{ items?: InboxReviewItem[] }>(cacheKey)?.items ?? []) as InboxReviewItem[];

  const freshItems = mapOzonReviewsToInbox({
    reviews,
    tab: "semi",
    sellerName,
    shopSettings: input.shop,
    mpSettings: input.mp,
    brandName: input.brandName ?? null,
    usage: input.mp.usage ?? input.usage,
    productsBySku,
    existingItems: staleItems,
  });

  const merged = sortInboxItemsByReviewDate(mergeInboxItems(staleItems, freshItems));

  const pipeline = await finishInboxSyncPipeline({
    items: merged,
    mode,
    usage: input.usage,
    shop: input.shop,
    mp: input.mp,
    brandName: input.brandName ?? null,
    userId: input.userId,
    supabase: input.supabase,
    sendReply:
      input.usage !== "manual"
        ? async (item, replyText) => {
            const reviewId = item.externalId?.trim();
            if (!reviewId) throw new Error("Не найден ID отзыва");
            await answerOzonReview(credentials, reviewId, replyText);
          }
        : undefined,
  });

  const items = pipeline.items;
  const unansweredCount = countPendingInboxItems(items);
  const products = extractOzonProducts(items);

  setCachedOzonSync(
    cacheKey,
    {
      items,
      products,
      sellerName,
      meta: {
        tab,
        unansweredCount,
        fetched: items.length,
        autoSentCount: pipeline.autoSentCount,
      },
    },
    SYNC_CACHE_MS
  );

  return {
    items,
    sellerName,
    unansweredCount,
    autoSentCount: pipeline.autoSentCount,
    autoSendWarning: pipeline.autoSendWarning,
  };
}
