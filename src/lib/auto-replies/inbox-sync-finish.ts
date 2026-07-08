import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboxReviewItem } from "./inbox-demo-data";
import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings } from "./settings-types";
import type { AutoRepliesUsageId } from "./types";
import { enrichPendingInboxDrafts } from "./generate-auto-reply";
import { hydrateInboxReplyDrafts } from "./empty-review-settings";
import { processAutoRepliesInbox } from "./inbox-auto-send";
import { reassignInboxItemFeeds } from "./inbox-feed-utils";
import { shouldAutoSendInboxItem } from "./inbox-star-rules";
import {
  applyReviewScopeEligibility,
  consumeReviewScopeLimit,
  filterInboxItemsByReviewScope,
  maxAutoSendsForReviewScope,
} from "./inbox-review-scope";

export type InboxSyncMode = "ui" | "full";

export async function finishInboxSyncPipeline(input: {
  items: InboxReviewItem[];
  mode: InboxSyncMode;
  usage: AutoRepliesUsageId;
  shop: AutoRepliesShopSettings;
  mp: AutoRepliesMarketplaceSettings;
  brandName?: string | null;
  userId: string;
  supabase: SupabaseClient;
  sendReply?: (item: InboxReviewItem, replyText: string) => Promise<void>;
}): Promise<{ items: InboxReviewItem[]; autoSentCount: number; autoSendWarning?: string }> {
  const scopedItems = reassignInboxItemFeeds(
    hydrateInboxReplyDrafts(
      applyReviewScopeEligibility(
        filterInboxItemsByReviewScope(input.items, input.mp.reviewScope),
        input.mp.reviewScope
      ),
      input.shop
    ),
    input.mp
  );

  const withDrafts = await enrichPendingInboxDrafts({
    items: scopedItems,
    shopSettings: input.shop,
    mpSettings: input.mp,
    brandName: input.brandName ?? null,
    userId: input.userId,
    supabase: input.supabase,
    skipAutoStarItems: true,
    semiFeedOnly: true,
  });

  const autoSendAllowed = Boolean(input.sendReply);

  if (!autoSendAllowed || !input.sendReply) {
    return { items: withDrafts, autoSentCount: 0 };
  }

  const autoPendingCount = scopedItems.filter((item) =>
    shouldAutoSendInboxItem(item, input.mp, input.shop)
  ).length;

  const autoResult = await processAutoRepliesInbox({
    items: withDrafts,
    shopSettings: input.shop,
    mpSettings: input.mp,
    brandName: input.brandName ?? null,
    maxAutoSends: Math.max(maxAutoSendsForReviewScope(input.mp.reviewScope), autoPendingCount),
    userId: input.userId,
    supabase: input.supabase,
    sendReply: input.sendReply,
  });

  consumeReviewScopeLimit(input.mp.reviewScope, autoResult.autoSentCount);

  const withFallbackDrafts = await enrichPendingInboxDrafts({
    items: autoResult.items,
    shopSettings: input.shop,
    mpSettings: input.mp,
    brandName: input.brandName ?? null,
    userId: input.userId,
    supabase: input.supabase,
    skipAutoStarItems: true,
    semiFeedOnly: true,
  });

  return {
    items: withFallbackDrafts,
    autoSentCount: autoResult.autoSentCount,
    autoSendWarning: autoResult.errors[0],
  };
}

/** Пересчитать feed и отправить авто-ответы без повторной загрузки с маркетплейса (кэш sync). */
export async function postProcessInboxAutoSend(input: {
  items: InboxReviewItem[];
  shop: AutoRepliesShopSettings;
  mp: AutoRepliesMarketplaceSettings;
  brandName?: string | null;
  userId: string;
  supabase: SupabaseClient;
  sendReply?: (item: InboxReviewItem, replyText: string) => Promise<void>;
}): Promise<{ items: InboxReviewItem[]; autoSentCount: number; autoSendWarning?: string }> {
  const scopedItems = reassignInboxItemFeeds(
    hydrateInboxReplyDrafts(
      applyReviewScopeEligibility(
        filterInboxItemsByReviewScope(input.items, input.mp.reviewScope),
        input.mp.reviewScope
      ),
      input.shop
    ),
    input.mp
  );

  const withDrafts = await enrichPendingInboxDrafts({
    items: scopedItems,
    shopSettings: input.shop,
    mpSettings: input.mp,
    brandName: input.brandName ?? null,
    userId: input.userId,
    supabase: input.supabase,
    skipAutoStarItems: true,
    semiFeedOnly: true,
  });

  const pendingAutoCount = withDrafts.filter((item) =>
    shouldAutoSendInboxItem(item, input.mp, input.shop)
  ).length;

  if (pendingAutoCount === 0 || !input.sendReply) {
    return { items: withDrafts, autoSentCount: 0 };
  }

  const autoResult = await processAutoRepliesInbox({
    items: withDrafts,
    shopSettings: input.shop,
    mpSettings: input.mp,
    brandName: input.brandName ?? null,
    maxAutoSends: Math.max(maxAutoSendsForReviewScope(input.mp.reviewScope), pendingAutoCount),
    userId: input.userId,
    supabase: input.supabase,
    sendReply: input.sendReply,
  });

  consumeReviewScopeLimit(input.mp.reviewScope, autoResult.autoSentCount);

  const withFallbackDrafts = await enrichPendingInboxDrafts({
    items: autoResult.items,
    shopSettings: input.shop,
    mpSettings: input.mp,
    brandName: input.brandName ?? null,
    userId: input.userId,
    supabase: input.supabase,
    skipAutoStarItems: true,
    semiFeedOnly: true,
  });

  return {
    items: withFallbackDrafts,
    autoSentCount: autoResult.autoSentCount,
    autoSendWarning: autoResult.errors[0],
  };
}
