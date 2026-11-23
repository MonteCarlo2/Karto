import { telegramSendMessage, type InlineKeyboardButton, type ReplyKeyboardMarkup } from "./bot-api";

/** Превращает наше HTML-сообщение в обычный текст: теги убираются, ссылки остаются адресом, сущности возвращаются в символы. */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<a\s+href="([^"]*)">([^<]*)<\/a>/g, (_m, url: string, label: string) => `${label}: ${url.replace(/&amp;/g, "&")}`)
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const PARSE_ERROR = /can't parse entities|unsupported start tag|can't find end tag|unclosed|bad request: .*entit/i;

/**
 * Отправка с запасным путём: если Telegram по какой-то причине не принял разметку, то же сообщение уходит обычным текстом.
 * Человек получает текст в любом случае, а не молчание или ошибку.
 */
export async function sendHtmlSafe(input: { chatId: number | string; html: string; replyMarkup?: ReplyKeyboardMarkup | { inline_keyboard: InlineKeyboardButton[][] } }): Promise<{ plain: boolean; messageId?: number }> {
  try {
    const sent = await telegramSendMessage({ chatId: input.chatId, text: input.html, parseMode: "HTML", replyMarkup: input.replyMarkup });
    return { plain: false, messageId: sent.message_id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!PARSE_ERROR.test(message)) throw error;
    console.warn("[telegram] разметка не принята, отправляю простым текстом:", message);
    const sent = await telegramSendMessage({ chatId: input.chatId, text: htmlToPlain(input.html).slice(0, 4000), parseMode: null, replyMarkup: input.replyMarkup });
    return { plain: true, messageId: sent.message_id };
  }
}
