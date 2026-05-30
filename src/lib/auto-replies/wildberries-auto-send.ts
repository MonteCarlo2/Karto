import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboxReviewItem } from "./inbox-demo-data";
import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings } from "./settings-types";
import type { AutoRepliesUsageId } from "./types";
import { reassignInboxItemFeeds } from "./inbox-auto-send";
import { postProcessInboxAutoSend } from "./inbox-sync-finish";
import { answerWildberriesFeedback } from "@/lib/services/wildberries/client";

export function createWildberriesAutoSendReply(usage: AutoRepliesUsageId, apiKey: string) {
  if (usage === "manual") return undefined;
  return async (item: InboxReviewItem, replyText: string) => {
    const feedbackId = item.externalId?.trim();
    if (!feedbackId) throw new Error("Не найден ID отзыва");
    await answerWildberriesFeedback({ token: apiKey, feedbackId, text: replyText });
  };
}

export async function runWildberriesPendingAutoSend(input: {
  items: InboxReviewItem[];
  shop: AutoRepliesShopSettings;
  mp: AutoRepliesMarketplaceSettings;
  usage: AutoRepliesUsageId;
  apiKey: string;
  brandName?: string | null;
  userId: string;
  supabase: SupabaseClient;
}): Promise<{
  items: InboxReviewItem[];
  autoSentCount: number;
  autoSendWarning?: string;
}> {
  const sendReply = createWildberriesAutoSendReply(input.usage, input.apiKey);
  const post = await postProcessInboxAutoSend({
    items: input.items,
    shop: input.shop,
    mp: input.mp,
    brandName: input.brandName ?? null,
    userId: input.userId,
    supabase: input.supabase,
    sendReply,
  });
  return {
    items: reassignInboxItemFeeds(post.items, input.mp),
    autoSentCount: post.autoSentCount,
    autoSendWarning: post.autoSendWarning,
  };
}
