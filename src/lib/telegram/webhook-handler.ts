import type { SupabaseClient } from "@supabase/supabase-js";
import { telegramAnswerCallbackQuery, telegramSendMessage } from "./bot-api";
import {
  clearTelegramSession,
  consumeLinkToken,
  fetchReviewMessageByShortId,
  fetchTelegramLinkByTelegramUserId,
  findAuthUserIdByEmail,
  generateSixDigitCode,
  getTelegramSession,
  saveTelegramVerifyCode,
  setTelegramSession,
  verifyTelegramEmailCode,
} from "./telegram-db";
import { sendTelegramLinkVerificationEmail } from "@/lib/send-telegram-link-email";
import { completeTelegramLink } from "./link-flow";
import { TELEGRAM_WELCOME_GUEST } from "./bot-profile";
import { confirmSemiReviewReply } from "./semi-confirm-server";
import { regenerateTelegramReviewDraft } from "./regenerate-server";
import type { InboxReviewItem } from "@/lib/auto-replies/inbox-demo-data";
import type { AutoRepliesMarketplaceId } from "@/lib/auto-replies/types";

type TgUser = { id: number; username?: string; first_name?: string };
type TgChat = { id: number };
type TgMessage = { message_id: number; text?: string; chat: TgChat; from?: TgUser };
type TgCallback = {
  id: string;
  data?: string;
  message?: TgMessage;
  from: TgUser;
};

type TgUpdate = {
  message?: TgMessage;
  callback_query?: TgCallback;
};

async function loadInboxItem(
  supabase: SupabaseClient,
  userId: string,
  shopId: string,
  marketplaceId: string,
  reviewId: string
): Promise<InboxReviewItem | null> {
  const { data } = await supabase
    .from("auto_reply_inbox_snapshots")
    .select("items_json")
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .eq("marketplace_id", marketplaceId)
    .maybeSingle();

  const items = (data?.items_json as InboxReviewItem[] | null) ?? [];
  return items.find((i) => i.id === reviewId) ?? null;
}

async function handleStartLink(
  supabase: SupabaseClient,
  token: string,
  from: TgUser,
  chat: TgChat
): Promise<void> {
  try {
    const userId = await consumeLinkToken(supabase, token);
    if (!userId) {
      await telegramSendMessage({
        chatId: chat.id,
        text: "Ссылка устарела или уже использована. Нажмите «Подключить Telegram» в кабинете KARTO ещё раз.",
      });
      return;
    }

    await completeTelegramLink(supabase, { userId, from, chat, fromCabinetLink: true });
  } catch (e) {
    console.error("[telegram] handleStartLink failed", e);
    await telegramSendMessage({
      chatId: chat.id,
      text: "Не удалось привязать аккаунт. Проверьте, что миграция Telegram в Supabase применена, и попробуйте снова из кабинета KARTO.",
    });
  }
}

async function handleEmailStep(
  supabase: SupabaseClient,
  text: string,
  from: TgUser,
  chat: TgChat
): Promise<void> {
  const email = text.trim().toLowerCase();
  if (!email.includes("@") || email.length < 5) {
    await telegramSendMessage({
      chatId: chat.id,
      text: "Введите корректный email, с которым вы регистрировались в KARTO.",
    });
    return;
  }

  const user = await findAuthUserIdByEmail(supabase, email);
  if (!user) {
    await telegramSendMessage({
      chatId: chat.id,
      text: "Аккаунт с таким email не найден. Проверьте адрес или зарегистрируйтесь на karto.pro",
    });
    return;
  }

  const code = generateSixDigitCode();
  await saveTelegramVerifyCode(supabase, {
    email,
    code,
    telegramUserId: from.id,
    chatId: chat.id,
  });

  const sent = await sendTelegramLinkVerificationEmail({ to: email, code });
  await setTelegramSession(supabase, {
    telegramUserId: from.id,
    chatId: chat.id,
    state: "awaiting_code",
    payload: { email },
  });

  if (!sent.ok) {
    await telegramSendMessage({
      chatId: chat.id,
      text: `Не удалось отправить код на почту${sent.error ? `: ${sent.error}` : ""}. Попробуйте привязку по ссылке из личного кабинета.`,
    });
    return;
  }

  await telegramSendMessage({
    chatId: chat.id,
    text: `Код отправлен на <b>${email}</b>. Введите 6 цифр из письма.`,
  });
}

async function handleCodeStep(
  supabase: SupabaseClient,
  text: string,
  from: TgUser,
  chat: TgChat,
  email: string
): Promise<void> {
  const code = text.replace(/\D/g, "");
  if (code.length !== 6) {
    await telegramSendMessage({ chatId: chat.id, text: "Введите 6-значный код из письма." });
    return;
  }

  const ok = await verifyTelegramEmailCode(supabase, {
    email,
    code,
    telegramUserId: from.id,
  });

  if (!ok) {
    await telegramSendMessage({
      chatId: chat.id,
      text: "Неверный или устаревший код. Запросите новый: напишите /link",
    });
    return;
  }

  const user = await findAuthUserIdByEmail(supabase, email);
  if (!user) {
    await telegramSendMessage({ chatId: chat.id, text: "Аккаунт не найден." });
    return;
  }

  await completeTelegramLink(supabase, { userId: user.id, from, chat });
}

async function handleEditTextStep(
  supabase: SupabaseClient,
  text: string,
  from: TgUser,
  chat: TgChat,
  payload: Record<string, unknown>
): Promise<void> {
  const messageRowId = String(payload.messageRowId ?? "");
  const { data: fullRow } = await supabase
    .from("auto_reply_telegram_review_messages")
    .select("*")
    .eq("id", messageRowId)
    .maybeSingle();

  if (!fullRow || fullRow.status !== "pending") {
    await clearTelegramSession(supabase, from.id);
    await telegramSendMessage({ chatId: chat.id, text: "Этот отзыв уже обработан." });
    return;
  }

  const reply = text.trim();
  if (reply.length < 2) {
    await telegramSendMessage({ chatId: chat.id, text: "Текст ответа слишком короткий (минимум 2 символа)." });
    return;
  }

  await clearTelegramSession(supabase, from.id);

  const result = await confirmSemiReviewReply(supabase, {
    userId: fullRow.user_id,
    shopId: fullRow.shop_id,
    marketplaceId: fullRow.marketplace_id as AutoRepliesMarketplaceId,
    reviewId: fullRow.review_id,
    replyText: reply,
    source: "telegram",
  });

  if (!result.ok) {
    await telegramSendMessage({
      chatId: chat.id,
      text: `❌ ${result.error ?? "Не удалось отправить ответ"}`,
    });
  }
}

async function handleRegenHintStep(
  supabase: SupabaseClient,
  text: string,
  from: TgUser,
  chat: TgChat,
  payload: Record<string, unknown>
): Promise<void> {
  const messageRowId = String(payload.messageRowId ?? "");
  const { data: row } = await supabase
    .from("auto_reply_telegram_review_messages")
    .select("*")
    .eq("id", messageRowId)
    .maybeSingle();

  if (!row || row.status !== "pending") {
    await clearTelegramSession(supabase, from.id);
    await telegramSendMessage({ chatId: chat.id, text: "Этот отзыв уже обработан." });
    return;
  }

  const item = await loadInboxItem(
    supabase,
    row.user_id,
    row.shop_id,
    row.marketplace_id,
    row.review_id
  );
  if (!item) {
    await telegramSendMessage({ chatId: chat.id, text: "Отзыв не найден в ленте. Обновите inbox на сайте." });
    await clearTelegramSession(supabase, from.id);
    return;
  }

  const hint = text.trim() === "-" ? null : text.trim();
  const result = await regenerateTelegramReviewDraft(supabase, {
    userId: row.user_id,
    shopId: row.shop_id,
    marketplaceId: row.marketplace_id as AutoRepliesMarketplaceId,
    reviewId: row.review_id,
    messageRowId: row.id,
    chatId: row.chat_id,
    telegramMessageId: row.telegram_message_id,
    hasPhoto: Boolean(row.has_photo),
    revisionHint: hint,
    item,
  });

  await clearTelegramSession(supabase, from.id);

  if (!result.ok) {
    await telegramSendMessage({
      chatId: chat.id,
      text: result.error ?? "Не удалось перегенерировать ответ",
    });
    return;
  }

}

async function handleCallback(
  supabase: SupabaseClient,
  cb: TgCallback
): Promise<void> {
  const data = cb.data?.trim() ?? "";
  const [action, shortId] = data.split(":");
  if (!action || !shortId) {
    await telegramAnswerCallbackQuery({ callbackQueryId: cb.id, text: "Неизвестная команда" });
    return;
  }

  const row = await fetchReviewMessageByShortId(supabase, shortId, cb.from.id);
  if (!row) {
    await telegramAnswerCallbackQuery({ callbackQueryId: cb.id, text: "Отзыв не найден или уже обработан" });
    return;
  }

  const link = await fetchTelegramLinkByTelegramUserId(supabase, cb.from.id);
  if (!link || link.user_id !== row.user_id) {
    await telegramAnswerCallbackQuery({ callbackQueryId: cb.id, text: "Нет доступа" });
    return;
  }

  if (action === "edt") {
    await setTelegramSession(supabase, {
      telegramUserId: cb.from.id,
      chatId: cb.message?.chat.id ?? row.chat_id,
      state: "awaiting_edit_text",
      payload: { messageRowId: row.id },
    });
    await telegramAnswerCallbackQuery({ callbackQueryId: cb.id });
    await telegramSendMessage({
      chatId: cb.message?.chat.id ?? row.chat_id,
      text: "✏️ Пришлите <b>новый текст ответа</b> одним сообщением — он сразу уйдёт на маркетплейс.",
    });
    return;
  }

  if (action === "rgn") {
    await setTelegramSession(supabase, {
      telegramUserId: cb.from.id,
      chatId: cb.message?.chat.id ?? row.chat_id,
      state: "awaiting_regen_hint",
      payload: { messageRowId: row.id },
    });
    await telegramAnswerCallbackQuery({ callbackQueryId: cb.id });
    await telegramSendMessage({
      chatId: cb.message?.chat.id ?? row.chat_id,
      text: "🔄 Напишите <b>уточнение для ИИ</b> (или «-» без подсказки), чтобы перегенерировать ответ.",
    });
    return;
  }

  if (action === "cfm") {
    await telegramAnswerCallbackQuery({ callbackQueryId: cb.id, text: "Отправляем…" });
    const result = await confirmSemiReviewReply(supabase, {
      userId: row.user_id,
      shopId: row.shop_id,
      marketplaceId: row.marketplace_id as AutoRepliesMarketplaceId,
      reviewId: row.review_id,
      replyText: row.reply_draft,
      source: "telegram",
    });

    if (!result.ok) {
      await telegramSendMessage({
        chatId: row.chat_id,
        text: `❌ ${result.error ?? "Не удалось отправить"}`,
      });
    }
    return;
  }

  await telegramAnswerCallbackQuery({ callbackQueryId: cb.id });
}

async function handleMessage(
  supabase: SupabaseClient,
  message: TgMessage
): Promise<void> {
  const from = message.from;
  if (!from) return;

  const text = message.text?.trim() ?? "";
  const chat = message.chat;

  if (text.startsWith("/start")) {
    const parts = text.split(/\s+/);
    const arg = parts[1]?.trim();
    if (arg?.startsWith("link_")) {
      await handleStartLink(supabase, arg.slice(5), from, chat);
      return;
    }

    const linked = await fetchTelegramLinkByTelegramUserId(supabase, from.id);
    if (linked) {
      await completeTelegramLink(supabase, {
        userId: linked.user_id,
        from,
        chat,
        wasRelink: linked.chat_id !== chat.id,
      });
      return;
    }

    await telegramSendMessage({
      chatId: chat.id,
      text: TELEGRAM_WELCOME_GUEST,
    });
    return;
  }

  if (text === "/link") {
    await setTelegramSession(supabase, {
      telegramUserId: from.id,
      chatId: chat.id,
      state: "awaiting_email",
      payload: {},
    });
    await telegramSendMessage({
      chatId: chat.id,
      text: "Введите email, с которым вы зарегистрированы в KARTO:",
    });
    return;
  }

  const session = await getTelegramSession(supabase, from.id);
  if (session?.state === "awaiting_email") {
    await handleEmailStep(supabase, text, from, chat);
    return;
  }
  if (session?.state === "awaiting_code") {
    const email = String(session.payload.email ?? "");
    await handleCodeStep(supabase, text, from, chat, email);
    return;
  }
  if (session?.state === "awaiting_edit_text") {
    await handleEditTextStep(supabase, text, from, chat, session.payload);
    return;
  }
  if (session?.state === "awaiting_regen_hint") {
    await handleRegenHintStep(supabase, text, from, chat, session.payload);
    return;
  }

  const linked = await fetchTelegramLinkByTelegramUserId(supabase, from.id);
  if (!linked) {
    await telegramSendMessage({
      chatId: chat.id,
      text: "Сначала подключите аккаунт: ссылка из кабинета KARTO или /link",
    });
  }
}

export async function handleTelegramWebhookUpdate(
  supabase: SupabaseClient,
  update: TgUpdate
): Promise<void> {
  if (update.callback_query) {
    await handleCallback(supabase, update.callback_query);
    return;
  }
  if (update.message?.text) {
    await handleMessage(supabase, update.message);
  }
}
