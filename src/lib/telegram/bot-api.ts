import { fetch as undiciFetch, ProxyAgent } from "undici";
import {
  getTelegramApiBase,
  getTelegramBotToken,
  getTelegramProxyLabel,
  getTelegramProxyUrl,
} from "./config";

type TelegramApiResult<T> = { ok: true; result: T } | { ok: false; description?: string };

let proxyDispatcher: ProxyAgent | null | undefined;

export function resetTelegramApiCache() {
  proxyDispatcher = undefined;
}

function getTelegramProxyDispatcher(): ProxyAgent | undefined {
  if (proxyDispatcher !== undefined) return proxyDispatcher ?? undefined;
  const proxy = getTelegramProxyUrl();
  if (!proxy) {
    proxyDispatcher = null;
    return undefined;
  }
  console.info("[telegram] Node.js использует прокси:", getTelegramProxyLabel());
  proxyDispatcher = new ProxyAgent({
    uri: proxy,
    connect: { timeout: 30_000 },
    requestTls: { rejectUnauthorized: true },
  });
  return proxyDispatcher;
}

async function telegramFetch(
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
): Promise<Response> {
  const dispatcher = getTelegramProxyDispatcher();
  if (!dispatcher) return fetch(url, init);
  return undiciFetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    signal: init.signal,
    dispatcher,
  }) as unknown as Promise<Response>;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function networkErrorFingerprint(e: unknown): string {
  const parts: string[] = [];
  let cur: unknown = e;
  for (let depth = 0; depth < 6 && cur != null; depth += 1) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      cur = cur.cause;
      continue;
    }
    if (typeof cur === "object") {
      const o = cur as Record<string, unknown>;
      if (typeof o.message === "string") parts.push(o.message);
      if (typeof o.code === "string" || typeof o.code === "number") parts.push(String(o.code));
      cur = o.cause;
      continue;
    }
    parts.push(String(cur));
    break;
  }
  return parts.join(" ").toLowerCase();
}

function isTransientTelegramFailure(e: unknown): boolean {
  const fp = networkErrorFingerprint(e);
  return /econnreset|etimedout|econnrefused|fetch failed|connect timeout|und_err_connect_timeout|socket hang up|enotfound|eai_again|network|4077|-4077|abort/.test(
    fp
  );
}

async function telegramRequest<T>(
  method: string,
  body?: Record<string, unknown>,
  options?: { longPollSeconds?: number; maxAttempts?: number; timeoutMs?: number }
): Promise<T> {
  const token = getTelegramBotToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не задан");

  const pollSec = options?.longPollSeconds ?? 0;
  const timeoutMs =
    options?.timeoutMs ??
    (pollSec > 0
      ? (pollSec + 25) * 1000
      : Number(process.env.TELEGRAM_FETCH_TIMEOUT_MS) || 20_000);
  const maxAttempts = options?.maxAttempts ?? (pollSec > 0 ? 1 : 2);
  const url = `${getTelegramApiBase()}/bot${token}/${method}`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await telegramFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const data = (await res.json().catch(() => ({}))) as TelegramApiResult<T>;
      if (!data.ok) {
        throw new Error(
          ("description" in data && data.description) || `Telegram API ${method} failed`
        );
      }
      return data.result;
    } catch (e) {
      if (attempt < maxAttempts && isTransientTelegramFailure(e)) {
        const backoff = 400 + attempt * 300;
        if (maxAttempts > 1) {
          console.warn(
            `[telegram] ${method} failed, retry ${attempt}/${maxAttempts} in ${backoff}ms:`,
            networkErrorFingerprint(e)
          );
        }
        await sleep(backoff);
        continue;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`Telegram API ${method} failed after retries`);
}

export type InlineKeyboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
  copy_text?: { text: string };
};

export type ForceReplyMarkup = {
  force_reply: true;
  selective?: boolean;
  input_field_placeholder?: string;
};

export type ReplyKeyboardMarkup = {
  keyboard: string[][];
  resize_keyboard?: boolean;
  is_persistent?: boolean;
  /** Клавиатура скрывается после нажатия: быстрые ответы не навязываются. */
  one_time_keyboard?: boolean;
  input_field_placeholder?: string;
};

/** Статус «печатает…»: пока готовим ответ, чат не выглядит зависшим. */
export async function telegramSendChatAction(input: { chatId: number | string; action: "typing" }): Promise<void> {
  await telegramRequest("sendChatAction", { chat_id: input.chatId, action: input.action });
}

/** Меню команд бота (кнопка «Меню» слева от поля ввода). */
export async function telegramSetMyCommands(commands: Array<{ command: string; description: string }>): Promise<void> {
  await telegramRequest("setMyCommands", { commands });
}

export async function telegramSendPhoto(input: {
  chatId: number | string;
  photoUrl: string;
  caption: string;
  replyMarkup?: { inline_keyboard: InlineKeyboardButton[][] };
  parseMode?: "HTML" | "Markdown";
}): Promise<{ message_id: number }> {
  return telegramRequest("sendPhoto", {
    chat_id: input.chatId,
    photo: input.photoUrl,
    caption: input.caption,
    parse_mode: input.parseMode ?? "HTML",
    reply_markup: input.replyMarkup,
  });
}

export async function telegramSendMediaGroup(input: {
  chatId: number | string;
  media: Array<{
    type: "photo";
    media: string;
    caption?: string;
    parse_mode?: "HTML" | "Markdown";
  }>;
}): Promise<Array<{ message_id: number }>> {
  return telegramRequest("sendMediaGroup", {
    chat_id: input.chatId,
    media: input.media.map((item) => ({
      type: item.type,
      media: item.media,
      ...(item.caption ? { caption: item.caption, parse_mode: item.parse_mode ?? "HTML" } : {}),
    })),
  });
}

export async function telegramDeleteMessage(input: {
  chatId: number | string;
  messageId: number;
}): Promise<void> {
  await telegramRequest("deleteMessage", {
    chat_id: input.chatId,
    message_id: input.messageId,
  });
}

/** Отправка идёт через прокси и бывает медленной: ждём дольше и пробуем до трёх раз, чтобы сообщение не терялось из-за одного сбоя сети. */
const SEND_TIMEOUT_MS = Number(process.env.TELEGRAM_SEND_TIMEOUT_MS) || 35_000;
const SEND_ATTEMPTS = 3;

export async function telegramSendMessage(input: {
  chatId: number | string;
  text: string;
  replyMarkup?:
    | { inline_keyboard: InlineKeyboardButton[][] }
    | ReplyKeyboardMarkup
    | ForceReplyMarkup;
  parseMode?: "HTML" | "Markdown" | null;
  replyToMessageId?: number;
}): Promise<{ message_id: number }> {
  return telegramRequest("sendMessage", {
    chat_id: input.chatId,
    text: input.text,
    ...(input.parseMode === null ? {} : { parse_mode: input.parseMode ?? "HTML" }),
    reply_markup: input.replyMarkup,
    ...(input.replyToMessageId
      ? { reply_parameters: { message_id: input.replyToMessageId } }
      : {}),
    disable_web_page_preview: true,
  }, { timeoutMs: SEND_TIMEOUT_MS, maxAttempts: SEND_ATTEMPTS });
}

export async function telegramEditMessage(input: {
  chatId: number | string;
  messageId: number;
  text: string;
  replyMarkup?: { inline_keyboard: InlineKeyboardButton[][] };
  parseMode?: "HTML" | "Markdown";
  /** Для сообщений sendPhoto — редактировать caption. */
  asCaption?: boolean;
}): Promise<void> {
  const method = input.asCaption ? "editMessageCaption" : "editMessageText";
  await telegramRequest(method, {
    chat_id: input.chatId,
    message_id: input.messageId,
    [input.asCaption ? "caption" : "text"]: input.text,
    parse_mode: input.parseMode ?? "HTML",
    reply_markup: input.replyMarkup,
    disable_web_page_preview: true,
  });
}

/** Скачивает файл по его идентификатору (голосовые сообщения). Через тот же канал, что и остальные запросы к Telegram. */
export async function telegramDownloadFile(fileId: string): Promise<Buffer> {
  const token = getTelegramBotToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не задан");
  const info = await telegramRequest<{ file_path?: string; file_size?: number }>("getFile", { file_id: fileId });
  if (!info.file_path) throw new Error("Telegram не вернул путь к файлу");
  if ((info.file_size ?? 0) > 20 * 1024 * 1024) throw new Error("Файл слишком большой");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40_000);
  try {
    const res = await telegramFetch(`${getTelegramApiBase()}/file/bot${token}/${info.file_path}`, { method: "GET", headers: {}, signal: controller.signal });
    if (!res.ok) throw new Error(`Скачивание файла: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

export async function telegramAnswerCallbackQuery(input: {
  callbackQueryId: string;
  text?: string;
  showAlert?: boolean;
}): Promise<void> {
  await telegramRequest("answerCallbackQuery", {
    callback_query_id: input.callbackQueryId,
    text: input.text,
    show_alert: input.showAlert ?? false,
  });
}

export async function telegramGetMe(): Promise<{ username?: string; id: number }> {
  return telegramRequest("getMe");
}

export async function telegramSetMyName(name: string): Promise<void> {
  await telegramRequest("setMyName", { name });
}

export async function telegramSetMyShortDescription(shortDescription: string): Promise<void> {
  await telegramRequest("setMyShortDescription", { short_description: shortDescription });
}

export async function telegramSetMyDescription(description: string): Promise<void> {
  await telegramRequest("setMyDescription", { description });
}

export async function telegramSetWebhook(input: {
  url: string;
  secretToken: string;
}): Promise<void> {
  await telegramRequest("setWebhook", {
    url: input.url,
    secret_token: input.secretToken,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  });
}

export async function telegramDeleteWebhook(): Promise<void> {
  await telegramRequest("deleteWebhook", { drop_pending_updates: false });
}

export async function telegramGetWebhookInfo(): Promise<{
  url?: string;
  pending_update_count?: number;
}> {
  return telegramRequest("getWebhookInfo");
}

export async function telegramGetUpdates(input?: {
  offset?: number;
  timeout?: number;
}): Promise<
  Array<{
    update_id: number;
    message?: unknown;
    callback_query?: unknown;
  }>
> {
  const timeout = input?.timeout ?? 25;
  return telegramRequest(
    "getUpdates",
    {
      offset: input?.offset,
      timeout,
      allowed_updates: ["message", "callback_query"],
    },
    { longPollSeconds: timeout }
  );
}
