import { telegramDeleteMessage, telegramEditMessage, telegramSendChatAction, telegramSendMessage } from "./bot-api";
import { italic } from "./format";

/**
 * Ожидание ответа. Пока бот готовит ответ, в чате живёт одно сообщение «Думаю…» с меняющимися точками и фразами; когда ответ готов, оно исчезает.
 * Быстрые ответы (до секунды с небольшим) идут без него, чтобы чат не мигал. Сбой самой анимации никогда не мешает ответу.
 */

export type ProgressApi = {
  typing: (chatId: number) => Promise<unknown>;
  send: (chatId: number, html: string) => Promise<number | undefined>;
  edit: (chatId: number, messageId: number, html: string) => Promise<unknown>;
  remove: (chatId: number, messageId: number) => Promise<unknown>;
};

const realApi: ProgressApi = {
  typing: (chatId) => telegramSendChatAction({ chatId, action: "typing" }),
  send: async (chatId, html) => (await telegramSendMessage({ chatId, text: html })).message_id,
  edit: (chatId, messageId, html) => telegramEditMessage({ chatId, messageId, text: html }),
  remove: (chatId, messageId) => telegramDeleteMessage({ chatId, messageId }),
};

const DOTS = ["", ".", "..", "..."];

/** Кадр анимации: фраза с бегущими точками. Каждый следующий кадр отличается от прежнего, иначе Telegram откажет в правке. */
export function progressFrame(phrases: string[], tick: number): string {
  const phrase = phrases[Math.floor(tick / DOTS.length) % phrases.length] ?? "Думаю";
  return `🧠 ${italic(`${phrase}${DOTS[tick % DOTS.length]}`)}`;
}

export function progressPhrases(kind: string): string[] {
  switch (kind) {
    case "ads":
      return ["Смотрю рекламные кампании", "Считаю расход и ДРР", "Сверяю с заказами", "Готовлю ответ"];
    case "product":
      return ["Ищу товар в каталоге", "Проверяю цену и остаток", "Готовлю ответ"];
    case "reviews":
      return ["Читаю отзывы", "Смотрю, что ждёт ответа", "Готовлю ответ"];
    case "events":
      return ["Просматриваю ленту событий", "Отбираю главное", "Готовлю ответ"];
    case "analyze":
      return ["Разбираюсь в данных магазина", "Ищу причину", "Проверяю цифры", "Готовлю ответ"];
    case "web":
    case "search":
      return ["Ищу ответ", "Читаю справку Wildberries", "Проверяю источники", "Готовлю ответ"];
    default:
      return ["Думаю", "Смотрю данные магазина", "Сверяю цифры", "Готовлю ответ"];
  }
}

export async function withProgress<T>(chatId: number, phrases: string[], run: () => Promise<T>, opts: { api?: Partial<ProgressApi>; delayMs?: number; tickMs?: number } = {}): Promise<T> {
  const api: ProgressApi = { ...realApi, ...opts.api };
  const delayMs = opts.delayMs ?? 1_200;
  const tickMs = opts.tickMs ?? 2_400;
  let messageId: number | undefined;
  let tick = 0;
  let done = false;
  void api.typing(chatId).catch(() => undefined);

  const start = setTimeout(() => {
    void (async () => {
      try {
        const id = await api.send(chatId, progressFrame(phrases, tick));
        if (done) {
          if (id) await api.remove(chatId, id).catch(() => undefined);
          return;
        }
        messageId = id;
      } catch {
        // Анимация не получилась: ответ всё равно придёт.
      }
    })();
  }, delayMs);

  const timer = setInterval(() => {
    void api.typing(chatId).catch(() => undefined);
    tick += 1;
    if (messageId && !done) void api.edit(chatId, messageId, progressFrame(phrases, tick)).catch(() => undefined);
  }, tickMs);

  try {
    return await run();
  } finally {
    done = true;
    clearTimeout(start);
    clearInterval(timer);
    if (messageId) await api.remove(chatId, messageId).catch(() => undefined);
  }
}
