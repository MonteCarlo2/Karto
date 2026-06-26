import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboxReviewItem } from "@/lib/auto-replies/inbox-demo-data";
import type { AutoRepliesMarketplaceId } from "@/lib/auto-replies/types";
import { isTelegramConfigured } from "./config";
import { sendTelegramReviewCard } from "./send-review-card";
import { fetchTelegramLinkByUserId, isTelegramMarketplaceEnabled, resolveTelegramReviewMessageRowId, upsertTelegramReviewMessage } from "./telegram-db";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function notifyTelegramSemiPendingReviews(
  supabase: SupabaseClient,
  input: {
    userId: string;
    shopId: string;
    marketplaceId: AutoRepliesMarketplaceId;
    items: InboxReviewItem[];
  }
): Promise<number> {
  if (!isTelegramConfigured()) return 0;

  const link = await fetchTelegramLinkByUserId(supabase, input.userId);
  if (!link) return 0;

  const mpEnabled = await isTelegramMarketplaceEnabled(
    supabase,
    input.userId,
    input.shopId,
    input.marketplaceId
  );
  if (!mpEnabled) return 0;

  const pending = input.items.filter(
    (item) =>
      item.feed === "semi" &&
      item.status === "pending" &&
      (item.replyDraft?.trim().length ?? 0) >= 2 &&
      item.canSend !== false
  );

  if (pending.length === 0) return 0;

  const { data: existing } = await supabase
    .from("auto_reply_telegram_review_messages")
    .select("review_id")
    .eq("user_id", input.userId)
    .eq("shop_id", input.shopId)
    .eq("marketplace_id", input.marketplaceId)
    .eq("status", "pending")
    .in(
      "review_id",
      pending.map((p) => p.id)
    );

  const already = new Set((existing ?? []).map((r) => r.review_id as string));
  let sent = 0;

  for (const item of pending) {
    if (already.has(item.id)) continue;

    const rowId = await resolveTelegramReviewMessageRowId(supabase, {
      userId: input.userId,
      shopId: input.shopId,
      marketplaceId: input.marketplaceId,
      reviewId: item.id,
    });

    try {
      const msg = await sendTelegramReviewCard({
        chatId: link.chat_id,
        item,
        messageRowId: rowId,
        status: "pending",
      });

      const saved = await upsertTelegramReviewMessage(supabase, {
        id: rowId,
        user_id: input.userId,
        shop_id: input.shopId,
        marketplace_id: input.marketplaceId,
        review_id: item.id,
        telegram_message_id: msg.message_id,
        chat_id: link.chat_id,
        reply_draft: item.replyDraft,
        has_photo: msg.has_photo,
        extra_message_ids: msg.extra_message_ids,
      });

      if (!saved) {
        console.warn("[telegram] notify: DB row not saved", input.userId, item.id);
        continue;
      }

      sent += 1;
      if (sent < pending.length) await sleep(450);
    } catch (e) {
      console.warn("[telegram] notify failed", input.userId, item.id, e);
    }
  }

  return sent;
}

/** Сразу после подключения Telegram — отправить все ожидающие semi-отзывы. */
export async function notifyAllPendingSemiForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data: snaps } = await supabase
    .from("auto_reply_inbox_snapshots")
    .select("shop_id, marketplace_id, items_json")
    .eq("user_id", userId);

  let total = 0;
  for (const snap of snaps ?? []) {
    const shopId = snap.shop_id as string;
    const marketplaceId = snap.marketplace_id as AutoRepliesMarketplaceId;
    const enabled = await isTelegramMarketplaceEnabled(supabase, userId, shopId, marketplaceId);
    if (!enabled) continue;

    const items = (snap.items_json as InboxReviewItem[]) ?? [];
    total += await notifyTelegramSemiPendingReviews(supabase, {
      userId,
      shopId,
      marketplaceId,
      items,
    });
  }
  return total;
}
