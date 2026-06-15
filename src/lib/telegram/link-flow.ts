import type { SupabaseClient } from "@supabase/supabase-js";
import { telegramSendMessage } from "./bot-api";
import {
  TELEGRAM_WELCOME_ALREADY,
  TELEGRAM_WELCOME_LINKED,
  TELEGRAM_WELCOME_RELINKED,
} from "./bot-profile";
import { notifyAllPendingSemiForUser } from "./notify-semi-pending";
import {
  clearTelegramSession,
  fetchTelegramLinkByUserId,
  upsertTelegramLink,
} from "./telegram-db";

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
  }
): Promise<void> {
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

  if (!existing || !sameAccount) {
    await telegramSendMessage({ chatId: input.chat.id, text: TELEGRAM_WELCOME_LINKED });
  } else if (chatChanged || isRelink) {
    await telegramSendMessage({ chatId: input.chat.id, text: TELEGRAM_WELCOME_RELINKED });
  } else {
    await telegramSendMessage({ chatId: input.chat.id, text: TELEGRAM_WELCOME_ALREADY });
  }

  if (!existing || !sameAccount || chatChanged || isRelink) {
    void notifyAllPendingSemiForUser(supabase, input.userId).catch((e) =>
      console.warn("[telegram] notify after link failed", e)
    );
  }
}
