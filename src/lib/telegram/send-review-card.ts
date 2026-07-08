import type { InboxReviewItem } from "@/lib/auto-replies/inbox-demo-data";
import {
  telegramDeleteMessage,
  telegramEditMessage,
  telegramSendMediaGroup,
  telegramSendMessage,
  telegramSendPhoto,
} from "./bot-api";
import {
  formatTelegramReviewCard,
  getReviewCardPhotos,
  getReviewPhotoUrl,
  reviewActionKeyboard,
  reviewSentKeyboard,
} from "./review-message";

export type TelegramReviewCardSendResult = {
  message_id: number;
  has_photo: boolean;
  extra_message_ids: number[];
};

async function deleteTelegramReviewCardMessages(input: {
  chatId: number;
  messageId: number;
  extraMessageIds?: number[];
}): Promise<void> {
  const ids = [...(input.extraMessageIds ?? []), input.messageId];
  for (const messageId of ids) {
    try {
      await telegramDeleteMessage({ chatId: input.chatId, messageId });
    } catch (e) {
      console.warn("[telegram] delete review card message failed", messageId, e);
    }
  }
}

export async function deleteTelegramReviewCard(input: {
  chatId: number;
  messageId: number;
  extraMessageIds?: number[];
}): Promise<void> {
  await deleteTelegramReviewCardMessages(input);
}

function isTelegramBadPhotoUrlError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /wrong type of the web page content|failed to get http url content|wrong remote file identifier|content-type/i.test(
    msg
  );
}

async function sendTelegramReviewCardTextOnly(input: {
  chatId: number;
  item: InboxReviewItem;
  messageRowId: string;
  status?: "pending" | "sent";
  footer?: string;
}): Promise<TelegramReviewCardSendResult> {
  const caption = formatTelegramReviewCard({
    item: input.item,
    status: input.status ?? "pending",
    footer: input.footer,
    format: "text-message",
  });
  const keyboard =
    input.status === "sent" ? reviewSentKeyboard() : reviewActionKeyboard(input.messageRowId);
  const msg = await telegramSendMessage({
    chatId: input.chatId,
    text: caption,
    replyMarkup: keyboard,
  });
  return { message_id: msg.message_id, has_photo: false, extra_message_ids: [] };
}

export async function sendTelegramReviewCard(input: {
  chatId: number;
  item: InboxReviewItem;
  messageRowId: string;
  status?: "pending" | "sent";
  footer?: string;
}): Promise<TelegramReviewCardSendResult> {
  const { productPhotoUrl, reviewPhotoUrl } = getReviewCardPhotos(input.item);
  const hasDualPhotos = Boolean(
    productPhotoUrl && reviewPhotoUrl && productPhotoUrl !== reviewPhotoUrl
  );
  const singlePhotoCaption = Boolean(getReviewPhotoUrl(input.item)) && !hasDualPhotos;
  const caption = formatTelegramReviewCard({
    item: input.item,
    status: input.status ?? "pending",
    footer: input.footer,
    format: singlePhotoCaption ? "photo-caption" : "text-message",
  });
  const keyboard =
    input.status === "sent" ? reviewSentKeyboard() : reviewActionKeyboard(input.messageRowId);

  if (hasDualPhotos) {
    try {
      const mediaMessages = await telegramSendMediaGroup({
        chatId: input.chatId,
        media: [
          { type: "photo", media: productPhotoUrl!, caption: "📦 <b>Товар</b>" },
          { type: "photo", media: reviewPhotoUrl!, caption: "📷 <b>Фото из отзыва</b>" },
        ],
      });
      const msg = await telegramSendMessage({
        chatId: input.chatId,
        text: caption,
        replyMarkup: keyboard,
      });
      return {
        message_id: msg.message_id,
        has_photo: true,
        extra_message_ids: mediaMessages.map((m) => m.message_id),
      };
    } catch (e) {
      if (!isTelegramBadPhotoUrlError(e)) throw e;
      console.warn("[telegram] dual photo card rejected, fallback to text", input.item.id, e);
      return sendTelegramReviewCardTextOnly(input);
    }
  }

  const photoUrl = getReviewPhotoUrl(input.item);
  if (photoUrl) {
    try {
      const msg = await telegramSendPhoto({
        chatId: input.chatId,
        photoUrl,
        caption,
        replyMarkup: keyboard,
      });
      return { message_id: msg.message_id, has_photo: true, extra_message_ids: [] };
    } catch (e) {
      if (!isTelegramBadPhotoUrlError(e)) throw e;
      console.warn("[telegram] photo card rejected, fallback to text", input.item.id, photoUrl.slice(0, 96), e);
      return sendTelegramReviewCardTextOnly(input);
    }
  }

  const msg = await telegramSendMessage({
    chatId: input.chatId,
    text: caption,
    replyMarkup: keyboard,
  });
  return { message_id: msg.message_id, has_photo: false, extra_message_ids: [] };
}

export async function replaceTelegramReviewCard(input: {
  chatId: number;
  oldMessageId: number;
  oldExtraMessageIds?: number[];
  item: InboxReviewItem;
  messageRowId: string;
  status?: "pending" | "sent";
  footer?: string;
}): Promise<TelegramReviewCardSendResult> {
  await deleteTelegramReviewCardMessages({
    chatId: input.chatId,
    messageId: input.oldMessageId,
    extraMessageIds: input.oldExtraMessageIds,
  });
  return sendTelegramReviewCard({
    chatId: input.chatId,
    item: input.item,
    messageRowId: input.messageRowId,
    status: input.status,
    footer: input.footer,
  });
}

export async function editTelegramReviewCard(input: {
  chatId: number;
  messageId: number;
  item: InboxReviewItem;
  messageRowId: string;
  hasPhoto: boolean;
  extraMessageIds?: number[];
  status?: "pending" | "sent";
  footer?: string;
}): Promise<void> {
  const isDualPhotoText =
    input.hasPhoto && (input.extraMessageIds?.length ?? 0) > 0;
  const text = formatTelegramReviewCard({
    item: input.item,
    status: input.status ?? "pending",
    footer: input.footer,
    format: isDualPhotoText || !input.hasPhoto ? "text-message" : "photo-caption",
  });
  const keyboard =
    input.status === "sent" ? reviewSentKeyboard() : reviewActionKeyboard(input.messageRowId);

  if (input.hasPhoto && (input.extraMessageIds?.length ?? 0) > 0) {
    await telegramEditMessage({
      chatId: input.chatId,
      messageId: input.messageId,
      text,
      replyMarkup: keyboard,
    });
    return;
  }

  if (input.hasPhoto) {
    await telegramEditMessage({
      chatId: input.chatId,
      messageId: input.messageId,
      text,
      replyMarkup: keyboard,
      asCaption: true,
    });
    return;
  }

  await telegramEditMessage({
    chatId: input.chatId,
    messageId: input.messageId,
    text,
    replyMarkup: keyboard,
  });
}
