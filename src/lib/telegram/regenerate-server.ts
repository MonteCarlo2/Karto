import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboxReviewItem } from "@/lib/auto-replies/inbox-demo-data";
import type { AutoRepliesMarketplaceId } from "@/lib/auto-replies/types";
import { generateAutoReply } from "@/lib/auto-replies/generate-auto-reply";
import { consumeAutoReplyCredits } from "@/lib/auto-replies-balance";
import { listMarketplaceSecretsForUser } from "@/lib/auto-replies/server-secrets";
import type { AutoRepliesSettingsRoot } from "@/lib/auto-replies/settings-types";
import { patchInboxReplyDraft } from "./semi-confirm-server";
import { replaceTelegramReviewCard } from "./send-review-card";
import { updateTelegramReviewDraft, updateTelegramReviewMessageIds } from "./telegram-db";

function mpKey(shopId: string, marketplaceId: AutoRepliesMarketplaceId): string {
  return `${shopId}:${marketplaceId}`;
}

export async function regenerateTelegramReviewDraft(
  supabase: SupabaseClient,
  input: {
    userId: string;
    shopId: string;
    marketplaceId: AutoRepliesMarketplaceId;
    reviewId: string;
    messageRowId: string;
    chatId: number;
    telegramMessageId: number;
    extraMessageIds?: number[];
    hasPhoto?: boolean;
    revisionHint?: string | null;
    item: InboxReviewItem;
    brandName?: string | null;
  }
): Promise<{ ok: boolean; error?: string; reply?: string }> {
  const { data: stateRow } = await supabase
    .from("auto_reply_user_state")
    .select("settings_json")
    .eq("user_id", input.userId)
    .maybeSingle();

  const settings = (stateRow?.settings_json as AutoRepliesSettingsRoot | null) ?? null;
  const shop = settings?.shops?.[input.shopId];
  const mpCfg = settings?.marketplaces?.[mpKey(input.shopId, input.marketplaceId)];
  if (!shop || !mpCfg) return { ok: false, error: "Настройки не найдены" };

  const secrets = await listMarketplaceSecretsForUser(supabase, input.userId);
  const secret = secrets.find(
    (s) => s.shopId === input.shopId && s.marketplaceId === input.marketplaceId
  );
  if (!secret?.apiKey) return { ok: false, error: "API-ключ не найден" };

  const mp = {
    ...mpCfg,
    connection: {
      ...mpCfg.connection,
      apiKey: secret.apiKey,
      clientId: secret.clientId ?? mpCfg.connection.clientId,
      campaignId: secret.campaignId ?? mpCfg.connection.campaignId,
      businessId: secret.businessId ?? mpCfg.connection.businessId,
    },
  };

  const previous = input.item.replyDraft?.trim() || "";
  const isRegeneration = previous.length >= 2;

  if (!isRegeneration) {
    const charge = await consumeAutoReplyCredits(supabase, input.userId, 1);
    if (!charge.ok) return { ok: false, error: charge.error ?? "Недостаточно ответов" };
  }

  try {
    const result = await generateAutoReply({
      reviewText: input.item.reviewText,
      starRating: input.item.starRating,
      shop,
      mp,
      brandName: input.brandName ?? null,
      buyerName: input.item.buyerName ?? null,
      productName: input.item.productName,
      hasReviewPhotos: (input.item.reviewPhotoUrls?.length ?? 0) > 0,
      revisionHint: input.revisionHint?.trim() || null,
      previousReply: isRegeneration ? previous : null,
    });

    const reply = result.reply.trim();
    if (reply.length < 2) return { ok: false, error: "Пустой ответ от ИИ" };

    await updateTelegramReviewDraft(supabase, input.messageRowId, reply);
    const updatedItem = await patchInboxReplyDraft(supabase, {
      userId: input.userId,
      shopId: input.shopId,
      marketplaceId: input.marketplaceId,
      reviewId: input.reviewId,
      replyDraft: reply,
    });

    const cardItem = { ...(updatedItem ?? input.item), replyDraft: reply };
    const msg = await replaceTelegramReviewCard({
      chatId: input.chatId,
      oldMessageId: input.telegramMessageId,
      oldExtraMessageIds: input.extraMessageIds,
      item: cardItem,
      messageRowId: input.messageRowId,
      status: "pending",
      footer: "🔄 Черновик перегенерирован ИИ",
    });

    await updateTelegramReviewMessageIds(supabase, {
      messageRowId: input.messageRowId,
      telegramMessageId: msg.message_id,
      hasPhoto: msg.has_photo,
      extraMessageIds: msg.extra_message_ids,
    });

    return { ok: true, reply };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка генерации" };
  }
}
