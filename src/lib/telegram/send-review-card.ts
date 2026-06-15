import type { InboxReviewItem } from "@/lib/auto-replies/inbox-demo-data";
import {
  telegramEditMessage,
  telegramSendMessage,
  telegramSendPhoto,
} from "./bot-api";
import {
  formatTelegramReviewCard,
  getReviewPhotoUrl,
  reviewActionKeyboard,
  reviewSentKeyboard,
} from "./review-message";

export async function sendTelegramReviewCard(input: {
  chatId: number;
  item: InboxReviewItem;
  messageRowId: string;
  status?: "pending" | "sent";
  footer?: string;
}): Promise<{ message_id: number; has_photo: boolean }> {
  const photoUrl = getReviewPhotoUrl(input.item);
  const caption = formatTelegramReviewCard({
    item: input.item,
    status: input.status ?? "pending",
    footer: input.footer,
    compact: Boolean(photoUrl),
  });
  const keyboard =
    input.status === "sent" ? reviewSentKeyboard() : reviewActionKeyboard(input.messageRowId);

  if (photoUrl) {
    const msg = await telegramSendPhoto({
      chatId: input.chatId,
      photoUrl,
      caption,
      replyMarkup: keyboard,
    });
    return { message_id: msg.message_id, has_photo: true };
  }

  const msg = await telegramSendMessage({
    chatId: input.chatId,
    text: caption,
    replyMarkup: keyboard,
  });
  return { message_id: msg.message_id, has_photo: false };
}

export async function editTelegramReviewCard(input: {
  chatId: number;
  messageId: number;
  item: InboxReviewItem;
  messageRowId: string;
  hasPhoto: boolean;
  status?: "pending" | "sent";
  footer?: string;
}): Promise<void> {
  const text = formatTelegramReviewCard({
    item: input.item,
    status: input.status ?? "pending",
    footer: input.footer,
    compact: input.hasPhoto,
  });
  const keyboard =
    input.status === "sent" ? reviewSentKeyboard() : reviewActionKeyboard(input.messageRowId);

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
