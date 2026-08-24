import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboxReviewItem } from "@/lib/auto-replies/inbox-demo-data";
import type { AutoRepliesMarketplaceId } from "@/lib/auto-replies/types";
import { patchInboxReplyDraft } from "./semi-confirm-server";
import { sendTelegramReviewCard } from "./send-review-card";
import { updateTelegramReviewDraft, updateTelegramReviewMessageIds } from "./telegram-db";

/** Сохраняет отредактированный вручную черновик и показывает новую карточку на подтверждение. */
export async function applyTelegramEditedDraft(
  supabase: SupabaseClient,
  input: {
    userId: string;
    shopId: string;
    marketplaceId: AutoRepliesMarketplaceId;
    reviewId: string;
    messageRowId: string;
    chatId: number;
    replyDraft: string;
    item: InboxReviewItem;
  }
): Promise<{ ok: boolean; error?: string }> {
  const reply = input.replyDraft.trim();
  if (reply.length < 2) return { ok: false, error: "Текст ответа слишком короткий" };

  await updateTelegramReviewDraft(supabase, input.messageRowId, reply);
  const updatedItem = await patchInboxReplyDraft(supabase, {
    userId: input.userId,
    shopId: input.shopId,
    marketplaceId: input.marketplaceId,
    reviewId: input.reviewId,
    replyDraft: reply,
  });

  const cardItem = { ...(updatedItem ?? input.item), replyDraft: reply };
  const msg = await sendTelegramReviewCard({
    chatId: input.chatId,
    item: cardItem,
    messageRowId: input.messageRowId,
    status: "pending",
    footer: "✏️ Черновик изменён — подтвердите отправку",
  });

  await updateTelegramReviewMessageIds(supabase, {
    messageRowId: input.messageRowId,
    telegramMessageId: msg.message_id,
    hasPhoto: msg.has_photo,
    extraMessageIds: msg.extra_message_ids,
  });

  return { ok: true };
}
