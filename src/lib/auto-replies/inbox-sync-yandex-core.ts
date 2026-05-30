import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboxFeedTab, InboxReviewItem } from "@/lib/auto-replies/inbox-demo-data";
import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings } from "@/lib/auto-replies/settings-types";
import type { AutoRepliesUsageId } from "@/lib/auto-replies/types";
import { extractYandexProducts, mapYandexFeedbacksToInbox } from "@/lib/auto-replies/yandex-inbox";
import { mergeInboxReviewLists } from "@/lib/auto-replies/inbox-item-merge";
import { sortInboxItemsByReviewDate } from "@/lib/auto-replies/inbox-review-scope";
import { finishInboxSyncPipeline, type InboxSyncMode } from "@/lib/auto-replies/inbox-sync-finish";
import {
  getStaleYandexSync,
  setCachedYandexSync,
  yandexCredentialsKey,
} from "@/lib/services/yandex/server-cache";
import {
  answerYandexGoodsFeedback,
  enrichYandexFeedbacksWithSellerReplies,
  fetchYandexAllRecentFeedbacks,
  fetchYandexCampaigns,
  fetchYandexProductPreviews,
  parseYandexCredentials,
  resolveYandexCampaign,
} from "@/lib/services/yandex/client";

const SYNC_CACHE_MS = 90_000;

function mergeInboxItems(existing: InboxReviewItem[], incoming: InboxReviewItem[]): InboxReviewItem[] {
  return mergeInboxReviewLists(existing, incoming, "yandex");
}

function countPendingInboxItems(items: InboxReviewItem[]): number {
  return items.filter((item) => item.feed === "semi" && item.status === "pending").length;
}

export type YandexInboxSyncResult = {
  items: InboxReviewItem[];
  sellerName: string;
  unansweredCount: number;
  autoSentCount: number;
  autoSendWarning?: string;
};

export async function runYandexInboxSync(input: {
  supabase: SupabaseClient;
  userId: string;
  apiKey: string;
  campaignId: string;
  businessId?: string | null;
  tab?: InboxFeedTab;
  usage: AutoRepliesUsageId;
  shop: AutoRepliesShopSettings;
  mp: AutoRepliesMarketplaceSettings;
  brandName?: string | null;
  sellerName?: string | null;
  mode?: InboxSyncMode;
}): Promise<YandexInboxSyncResult> {
  const parsed = parseYandexCredentials({
    apiKey: input.apiKey,
    campaignId: input.campaignId,
    businessId: input.businessId ?? input.mp.connection.businessId,
  });
  if (!parsed) throw new Error("Укажите токен и Campaign ID Яндекс Маркета");

  let businessId = parsed.businessId || input.mp.connection.businessId?.trim();
  if (!businessId) {
    const campaigns = await fetchYandexCampaigns(parsed.apiKey);
    const campaign = resolveYandexCampaign(campaigns, parsed.campaignId);
    businessId = campaign?.business?.id ? String(campaign.business.id) : undefined;
  }
  if (!businessId) {
    throw new Error("Не найден businessId. Проверьте Campaign ID.");
  }

  const credentials = {
    apiKey: parsed.apiKey,
    campaignId: parsed.campaignId,
    businessId,
  };

  const tab = input.tab ?? "semi";
  const mode = input.mode ?? "ui";
  const cacheKey = `${yandexCredentialsKey(credentials.apiKey, credentials.campaignId)}:all`;
  const sellerName =
    input.sellerName?.trim() ||
    input.mp.connection.sellerName?.trim() ||
    "Продавец Яндекс Маркета";

  const rawFeedbacks = await fetchYandexAllRecentFeedbacks(credentials, 100);
  const feedbacks = await enrichYandexFeedbacksWithSellerReplies(credentials, rawFeedbacks);

  const offerIds = [
    ...new Set(
      feedbacks
        .map((f) => f.identifiers?.offerId?.trim())
        .filter((id): id is string => Boolean(id))
    ),
  ];
  let offerById: Awaited<ReturnType<typeof fetchYandexProductPreviews>> | undefined;
  try {
    offerById = await fetchYandexProductPreviews(credentials, offerIds);
  } catch {
    offerById = undefined;
  }

  const staleItems = (getStaleYandexSync<{ items?: InboxReviewItem[] }>(cacheKey)?.items ?? []) as InboxReviewItem[];

  const freshItems = mapYandexFeedbacksToInbox({
    feedbacks,
    tab: "semi",
    sellerName,
    shopSettings: input.shop,
    mpSettings: input.mp,
    brandName: input.brandName ?? null,
    usage: input.mp.usage ?? input.usage,
    offerById,
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
            const feedbackId = Number(item.externalId);
            if (!Number.isFinite(feedbackId) || feedbackId <= 0) {
              throw new Error("Не найден ID отзыва");
            }
            await answerYandexGoodsFeedback(credentials, feedbackId, replyText);
          }
        : undefined,
  });

  const items = pipeline.items;
  const unansweredCount = countPendingInboxItems(items);
  const products = extractYandexProducts(items);

  setCachedYandexSync(
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
