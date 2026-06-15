import type { SupabaseClient } from "@supabase/supabase-js";
import { telegramSendMessage } from "./bot-api";
import {
  TELEGRAM_WELCOME_ALREADY,
  TELEGRAM_WELCOME_LINKED,
  TELEGRAM_WELCOME_RELINKED,
} from "./bot-profile";
import {
  clearTelegramSession,
  enableTelegramMarketplace,
  fetchTelegramLinkByUserId,
  upsertTelegramLink,
} from "./telegram-db";
import type { AutoRepliesMarketplaceId } from "@/lib/auto-replies/types";
import { notifyTelegramSemiPendingReviews, notifyAllPendingSemiForUser } from "./notify-semi-pending";
import type { InboxReviewItem } from "@/lib/auto-replies/inbox-demo-data";

type TgUser = { id: number; username?: string; first_name?: string };
type TgChat = { id: number };

export async function completeTelegramLink(
  supabase: SupabaseClient,
  input: {
    userId: string;
    from: TgUser;
    chat: TgChat;
    wasRelink?: boolean;
    /** Свежая ссылка из кабинета — считаем переподключением. */
    fromCabinetLink?: boolean;
    shopId?: string;
    marketplaceId?: AutoRepliesMarketplaceId | null;
  }
): Promise<void> {
  const shopId = (input.shopId ?? "main").trim() || "main";
  const existing = await fetchTelegramLinkByUserId(supabase, input.userId);
  const sameAccount = existing?.telegram_user_id === input.from.id;
  const chatChanged = existing && existing.chat_id !== input.chat.id;
  const isRelink = Boolean(input.wasRelink || input.fromCabinetLink);

  await upsertTelegramLink(supabase, {
    userId: input.userId,
    telegramUserId: input.from.id,
    chatId: input.chat.id,
    username: input.from.username ?? null,
    firstName: input.from.first_name ?? null,
  });
  await clearTelegramSession(supabase, input.from.id);

  if (input.marketplaceId) {
    await enableTelegramMarketplace(supabase, {
      userId: input.userId,
      shopId,
      marketplaceId: input.marketplaceId,
    });
  }

  if (!existing || !sameAccount) {
    await telegramSendMessage({ chatId: input.chat.id, text: TELEGRAM_WELCOME_LINKED });
  } else if (chatChanged || isRelink) {
    await telegramSendMessage({ chatId: input.chat.id, text: TELEGRAM_WELCOME_RELINKED });
  } else {
    await telegramSendMessage({ chatId: input.chat.id, text: TELEGRAM_WELCOME_ALREADY });
  }

  if (!existing || !sameAccount || chatChanged || isRelink) {
    const notifyMarketplace = async (marketplaceId: AutoRepliesMarketplaceId) => {
      const { data: snap } = await supabase
        .from("auto_reply_inbox_snapshots")
        .select("items_json")
        .eq("user_id", input.userId)
        .eq("shop_id", shopId)
        .eq("marketplace_id", marketplaceId)
        .maybeSingle();
      const items = (snap?.items_json as InboxReviewItem[] | null) ?? [];
      await notifyTelegramSemiPendingReviews(supabase, {
        userId: input.userId,
        shopId,
        marketplaceId,
        items,
      });
    };

    if (input.marketplaceId) {
      void notifyMarketplace(input.marketplaceId).catch((e) =>
        console.warn("[telegram] notify after link failed", e)
      );
    } else {
      void notifyAllPendingSemiForUser(supabase, input.userId).catch((e) =>
        console.warn("[telegram] notify after link failed", e)
      );
    }
  }
}
