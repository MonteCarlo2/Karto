import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import type { InboxReviewItem } from "@/lib/auto-replies/inbox-demo-data";
import { inboxSemiPendingCount } from "@/lib/auto-replies/inbox-demo-data";
import {
  insertAutoReplyHistoryRow,
  upsertAutoReplyInboxSnapshot,
} from "@/lib/auto-replies/auto-replies-supabase-db";
import type {
  AutoRepliesMarketplaceSettings,
  AutoRepliesSettingsRoot,
  AutoRepliesShopSettings,
} from "@/lib/auto-replies/settings-types";
import type { AutoRepliesMarketplaceId } from "@/lib/auto-replies/types";
import { listMarketplaceSecretsForUser } from "@/lib/auto-replies/server-secrets";
import {
  prepareReplyForMarketplaceSend,
  prepareReplyTextForMarketplace,
} from "@/lib/auto-replies/reply-postprocess";
import { reviewScopeRemainingQuota } from "@/lib/auto-replies/inbox-review-scope";
import { usageModeLabel } from "@/lib/auto-replies/reply-history-store";
import { consumeReviewScopeLimit } from "@/lib/auto-replies/inbox-review-scope";
import { answerWildberriesFeedback } from "@/lib/services/wildberries/client";
import { answerOzonReview, parseOzonCredentials } from "@/lib/services/ozon/client";
import {
  answerYandexGoodsFeedback,
  fetchYandexCampaigns,
} from "@/lib/services/yandex/client";
import { editTelegramReviewCard } from "./send-review-card";
import {
  fetchTelegramLinkByUserId,
  isTelegramMarketplaceEnabled,
  markTelegramReviewMessageSent,
  updateTelegramReviewDraft,
} from "./telegram-db";

function mpKey(shopId: string, marketplaceId: AutoRepliesMarketplaceId): string {
  return `${shopId}:${marketplaceId}`;
}

async function loadUserContext(
  supabase: SupabaseClient,
  userId: string,
  shopId: string,
  marketplaceId: AutoRepliesMarketplaceId
): Promise<{
  shop: AutoRepliesShopSettings;
  mp: AutoRepliesMarketplaceSettings;
} | null> {
  const { data: row } = await supabase
    .from("auto_reply_user_state")
    .select("settings_json")
    .eq("user_id", userId)
    .maybeSingle();

  const settings = (row?.settings_json as AutoRepliesSettingsRoot | null) ?? null;
  const shop = settings?.shops?.[shopId];
  const mpCfg = settings?.marketplaces?.[mpKey(shopId, marketplaceId)];
  if (!shop?.style || !mpCfg?.connection) return null;

  const secrets = await listMarketplaceSecretsForUser(supabase, userId);
  const secret = secrets.find((s) => s.shopId === shopId && s.marketplaceId === marketplaceId);
  if (!secret?.apiKey?.trim()) return null;

  const mp: AutoRepliesMarketplaceSettings = {
    ...mpCfg,
    connection: {
      ...mpCfg.connection,
      apiKey: secret.apiKey,
      clientId: secret.clientId ?? mpCfg.connection.clientId,
      campaignId: secret.campaignId ?? mpCfg.connection.campaignId,
      businessId: secret.businessId ?? mpCfg.connection.businessId,
    },
  };

  return { shop, mp };
}

async function sendToMarketplace(input: {
  marketplaceId: AutoRepliesMarketplaceId;
  mp: AutoRepliesMarketplaceSettings;
  externalId: string;
  text: string;
}): Promise<void> {
  const text = prepareReplyTextForMarketplace(input.text);

  if (input.marketplaceId === "wildberries") {
    const apiKey = input.mp.connection.apiKey.trim();
    if (text.length < 2 || text.length > 5000) throw new Error("Некорректная длина ответа для WB");
    await answerWildberriesFeedback({ token: apiKey, feedbackId: input.externalId, text });
    return;
  }

  if (input.marketplaceId === "ozon") {
    const credentials = parseOzonCredentials({
      clientId: input.mp.connection.clientId,
      apiKey: input.mp.connection.apiKey,
    });
    if (!credentials) throw new Error("Нет Client ID / API Key Ozon");
    if (text.length < 2 || text.length > 2000) throw new Error("Некорректная длина ответа для Ozon");
    await answerOzonReview(credentials, input.externalId, text);
    return;
  }

  if (input.marketplaceId === "yandex") {
    const apiKey = input.mp.connection.apiKey.trim();
    const campaignId = input.mp.connection.campaignId?.trim();
    let businessId = input.mp.connection.businessId?.trim();
    if (!campaignId) throw new Error("Нет Campaign ID Яндекс Маркета");
    if (!businessId) {
      const campaigns = await fetchYandexCampaigns(apiKey);
      const match = campaigns.find((c) => String(c.id) === campaignId);
      businessId = match?.business?.id ? String(match.business.id) : "";
    }
    if (!businessId) throw new Error("Нет businessId Яндекс Маркета");
    if (text.length < 2 || text.length > 4096) throw new Error("Некорректная длина ответа для Яндекс");
    await answerYandexGoodsFeedback(
      { apiKey, campaignId, businessId },
      Number(input.externalId),
      text
    );
  }
}

function markItemSent(item: InboxReviewItem, replyText: string): InboxReviewItem {
  return {
    ...item,
    status: "sent",
    feed: "semi",
    replyDraft: replyText,
    canSend: false,
    autoSent: false,
    sentAtLabel: "Только что · подтверждено",
  };
}

function markItemSkipped(item: InboxReviewItem): InboxReviewItem {
  return {
    ...item,
    status: "sent",
    feed: "semi",
    canSend: false,
    autoSent: false,
    sentAtLabel: "Пропущено · не отправлено",
  };
}

export async function updateInboxSnapshotAfterSemiSend(
  supabase: SupabaseClient,
  input: {
    userId: string;
    shopId: string;
    marketplaceId: AutoRepliesMarketplaceId;
    reviewId: string;
    replyText: string;
    mp: AutoRepliesMarketplaceSettings;
  }
): Promise<InboxReviewItem | null> {
  const { data: snap } = await supabase
    .from("auto_reply_inbox_snapshots")
    .select("items_json, seller_name")
    .eq("user_id", input.userId)
    .eq("shop_id", input.shopId)
    .eq("marketplace_id", input.marketplaceId)
    .maybeSingle();

  const items = ((snap?.items_json as InboxReviewItem[] | null) ?? []).map((item) =>
    item.id === input.reviewId ? markItemSent(item, input.replyText) : item
  );

  const found = items.find((i) => i.id === input.reviewId) ?? null;

  await upsertAutoReplyInboxSnapshot(supabase, {
    userId: input.userId,
    shopId: input.shopId,
    marketplaceId: input.marketplaceId,
    items,
    sellerName: (snap?.seller_name as string | null) ?? undefined,
    unansweredCount: inboxSemiPendingCount(items),
  });

  if (input.mp.reviewScope.mode === "limited") {
    const next = consumeReviewScopeLimit(input.mp.reviewScope, 1);
    const { data: stateRow } = await supabase
      .from("auto_reply_user_state")
      .select("settings_json")
      .eq("user_id", input.userId)
      .maybeSingle();
    const settings = (stateRow?.settings_json as AutoRepliesSettingsRoot | null) ?? null;
    if (settings?.marketplaces?.[mpKey(input.shopId, input.marketplaceId)]) {
      settings.marketplaces[mpKey(input.shopId, input.marketplaceId)]!.reviewScope = next;
      await supabase
        .from("auto_reply_user_state")
        .update({ settings_json: settings, updated_at: new Date().toISOString() })
        .eq("user_id", input.userId);
    }
  }

  return found;
}

export async function syncTelegramMessageAfterSent(
  supabase: SupabaseClient,
  input: {
    userId: string;
    shopId: string;
    marketplaceId: AutoRepliesMarketplaceId;
    reviewId: string;
    item?: InboxReviewItem | null;
    footer?: string;
  }
): Promise<void> {
  const tgRow = await markTelegramReviewMessageSent(supabase, input);
  if (!tgRow || !input.item) return;

  try {
    await editTelegramReviewCard({
      chatId: tgRow.chat_id,
      messageId: tgRow.telegram_message_id,
      item: input.item,
      messageRowId: tgRow.id,
      hasPhoto: Boolean(tgRow.has_photo),
      status: "sent",
      footer: input.footer ?? "Подтверждено в KARTO",
    });
  } catch (e) {
    console.warn("[telegram] edit sent message failed", e);
  }
}

export async function confirmSemiReviewReply(
  supabase: SupabaseClient,
  input: {
    userId: string;
    shopId: string;
    marketplaceId: AutoRepliesMarketplaceId;
    reviewId: string;
    replyText: string;
    source: "web" | "telegram";
  }
): Promise<{ ok: boolean; error?: string; item?: InboxReviewItem }> {
  const ctx = await loadUserContext(supabase, input.userId, input.shopId, input.marketplaceId);
  if (!ctx) return { ok: false, error: "Настройки магазина не найдены" };

  const { data: snap } = await supabase
    .from("auto_reply_inbox_snapshots")
    .select("items_json")
    .eq("user_id", input.userId)
    .eq("shop_id", input.shopId)
    .eq("marketplace_id", input.marketplaceId)
    .maybeSingle();

  const items = (snap?.items_json as InboxReviewItem[] | null) ?? [];
  const item = items.find((i) => i.id === input.reviewId);
  if (!item) return { ok: false, error: "Отзыв не найден в ленте" };
  if (item.status === "sent") return { ok: false, error: "Ответ уже отправлен" };
  if (item.feed !== "semi" || item.status !== "pending") {
    return { ok: false, error: "Отзыв не ожидает подтверждения" };
  }
  if (item.canSend === false) {
    return { ok: false, error: "Этот отзыв вне объёма ответов в настройках" };
  }

  const externalId = item.externalId?.trim();
  if (!externalId) return { ok: false, error: "Нет ID отзыва на маркетплейсе" };

  if (
    ctx.mp.reviewScope.mode === "limited" &&
    reviewScopeRemainingQuota(ctx.mp.reviewScope) <= 0
  ) {
    return { ok: false, error: "Лимит ответов исчерпан — увеличьте объём в настройках" };
  }

  let text: string;
  try {
    text = prepareReplyForMarketplaceSend(input.replyText, ctx.shop);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Текст ответа не прошёл проверку",
    };
  }
  if (text.length < 2) return { ok: false, error: "Текст ответа слишком короткий" };

  try {
    await sendToMarketplace({
      marketplaceId: input.marketplaceId,
      mp: ctx.mp,
      externalId,
      text,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось отправить ответ" };
  }

  const updated = await updateInboxSnapshotAfterSemiSend(supabase, {
    userId: input.userId,
    shopId: input.shopId,
    marketplaceId: input.marketplaceId,
    reviewId: input.reviewId,
    replyText: text,
    mp: ctx.mp,
  });

  await insertAutoReplyHistoryRow(
    supabase,
    input.userId,
    {
      id: randomUUID(),
      shopId: input.shopId,
      marketplaceId: input.marketplaceId,
      usageMode: "semi",
      usageModeLabel: usageModeLabel("semi"),
      starRating: item.starRating,
      reviewText: item.reviewText,
      replyText: text,
      generationSource: "openrouter-dual",
      createdAt: new Date().toISOString(),
    },
    { productName: item.productName, buyerLabel: item.buyerLabel }
  );

  const footer =
    input.source === "telegram"
      ? "✅ Подтверждено и отправлено · синхронизировано с karto.pro"
      : "✅ Подтверждено на сайте · синхронизировано с Telegram";

  await syncTelegramMessageAfterSent(supabase, {
    userId: input.userId,
    shopId: input.shopId,
    marketplaceId: input.marketplaceId,
    reviewId: input.reviewId,
    item: updated,
    footer,
  });

  return { ok: true, item: updated ?? undefined };
}

/** Синхронизация черновика с сайта → карточка в Telegram (pending). */
export async function syncTelegramPendingReviewCard(
  supabase: SupabaseClient,
  input: {
    userId: string;
    shopId: string;
    marketplaceId: AutoRepliesMarketplaceId;
    reviewId: string;
    replyDraft: string;
    source?: "web_edit" | "web_regen";
  }
): Promise<{ synced: boolean }> {
  const draft = input.replyDraft.trim();
  if (draft.length < 2) return { synced: false };

  const link = await fetchTelegramLinkByUserId(supabase, input.userId);
  if (!link) return { synced: false };

  const mpEnabled = await isTelegramMarketplaceEnabled(
    supabase,
    input.userId,
    input.shopId,
    input.marketplaceId
  );
  if (!mpEnabled) return { synced: false };

  const { data: tgRow } = await supabase
    .from("auto_reply_telegram_review_messages")
    .select("*")
    .eq("user_id", input.userId)
    .eq("shop_id", input.shopId)
    .eq("marketplace_id", input.marketplaceId)
    .eq("review_id", input.reviewId)
    .eq("status", "pending")
    .maybeSingle();

  if (!tgRow) return { synced: false };

  const updatedItem = await patchInboxReplyDraft(supabase, {
    userId: input.userId,
    shopId: input.shopId,
    marketplaceId: input.marketplaceId,
    reviewId: input.reviewId,
    replyDraft: draft,
  });
  if (!updatedItem) return { synced: false };

  await updateTelegramReviewDraft(supabase, tgRow.id as string, draft);

  const footer =
    input.source === "web_regen"
      ? "🔄 Черновик перегенерирован на сайте"
      : input.source === "web_edit"
        ? "✏️ Черновик изменён на сайте"
        : undefined;

  try {
    await editTelegramReviewCard({
      chatId: tgRow.chat_id as number,
      messageId: tgRow.telegram_message_id as number,
      item: updatedItem,
      messageRowId: tgRow.id as string,
      hasPhoto: Boolean(tgRow.has_photo),
      status: "pending",
      footer,
    });
    return { synced: true };
  } catch (e) {
    console.warn("[telegram] sync pending card failed", e);
    return { synced: false };
  }
}

export async function patchInboxReplyDraft(
  supabase: SupabaseClient,
  input: {
    userId: string;
    shopId: string;
    marketplaceId: AutoRepliesMarketplaceId;
    reviewId: string;
    replyDraft: string;
  }
): Promise<InboxReviewItem | null> {
  const { data: snap } = await supabase
    .from("auto_reply_inbox_snapshots")
    .select("items_json, seller_name")
    .eq("user_id", input.userId)
    .eq("shop_id", input.shopId)
    .eq("marketplace_id", input.marketplaceId)
    .maybeSingle();

  const items = ((snap?.items_json as InboxReviewItem[] | null) ?? []).map((item) =>
    item.id === input.reviewId ? { ...item, replyDraft: input.replyDraft } : item
  );
  const found = items.find((i) => i.id === input.reviewId) ?? null;
  if (!found) return null;

  await upsertAutoReplyInboxSnapshot(supabase, {
    userId: input.userId,
    shopId: input.shopId,
    marketplaceId: input.marketplaceId,
    items,
    sellerName: (snap?.seller_name as string | null) ?? undefined,
    unansweredCount: inboxSemiPendingCount(items),
  });

  return found;
}

/** Пропуск без отправки на маркетплейс — синхронизирует ленту на сайте. */
export async function skipSemiReviewReply(
  supabase: SupabaseClient,
  input: {
    userId: string;
    shopId: string;
    marketplaceId: AutoRepliesMarketplaceId;
    reviewId: string;
  }
): Promise<{ ok: boolean; item?: InboxReviewItem }> {
  const { data: snap } = await supabase
    .from("auto_reply_inbox_snapshots")
    .select("items_json, seller_name")
    .eq("user_id", input.userId)
    .eq("shop_id", input.shopId)
    .eq("marketplace_id", input.marketplaceId)
    .maybeSingle();

  const items = ((snap?.items_json as InboxReviewItem[] | null) ?? []).map((item) =>
    item.id === input.reviewId ? markItemSkipped(item) : item
  );
  const found = items.find((i) => i.id === input.reviewId) ?? null;
  if (!found) return { ok: false };

  await upsertAutoReplyInboxSnapshot(supabase, {
    userId: input.userId,
    shopId: input.shopId,
    marketplaceId: input.marketplaceId,
    items,
    sellerName: (snap?.seller_name as string | null) ?? undefined,
    unansweredCount: inboxSemiPendingCount(items),
  });

  return { ok: true, item: found };
}
