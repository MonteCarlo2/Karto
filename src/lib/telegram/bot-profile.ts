import { telegramSetMyCommands, telegramSetMyDescription, telegramSetMyName, telegramSetMyShortDescription } from "./bot-api";
import { isTelegramConfigured } from "./config";

declare global {
  // eslint-disable-next-line no-var
  var __kartoTelegramProfileDone: boolean | undefined;
}

export const TELEGRAM_BOT_DISPLAY_NAME = process.env.TELEGRAM_BOT_DISPLAY_NAME?.trim() || "KARTO";

export const TELEGRAM_BOT_SHORT_DESCRIPTION =
  process.env.TELEGRAM_BOT_SHORT_DESCRIPTION?.trim() ||
  "Помощник вашего магазина на WB: ответы на вопросы, уведомления, отзывы, цена и реклама с подтверждением. karto.pro";

export const TELEGRAM_BOT_DESCRIPTION =
  process.env.TELEGRAM_BOT_DESCRIPTION?.trim() ||
  `Официальный бот сервиса KARTO (karto.pro).

• Присылает важное: события, срочные задачи, итоги работы агента, срок токена WB
• Отзывы: подтвердить, изменить, перегенерировать
• Отвечает на вопросы о магазине и Wildberries, понимает голосовые
• Меняет цену и рекламу после вашего подтверждения

Подключение: karto.pro, «Кабинет и API», «Уведомления».`;

export const TELEGRAM_COMMANDS = [
  { command: "summary", description: "Сводка по магазину" },
  { command: "tasks", description: "Задачи в работе" },
  { command: "events", description: "Последние события" },
  { command: "plans", description: "Планы агента" },
  { command: "orders", description: "Поручения агента" },
  { command: "reviews", description: "Отзывы и вопросы" },
  { command: "help", description: "Что умеет бот" },
];

export const TELEGRAM_WELCOME_LINKED =
  "✅ <b>KARTO подключён</b>\n\n" +
  "Сюда будут приходить:\n" +
  "🔔 важные события магазина\n" +
  "📌 срочные задачи\n" +
  "🤖 результаты работы агента\n" +
  "🔑 напоминания о сроке токена Wildberries\n" +
  "💬 отзывы на подтверждение (полуавтомат)\n\n" +
  "А ещё можно спросить, как дела: нажмите кнопку внизу или напишите «сводка».\n" +
  "Что именно присылать и в какие часы, настраивается в KARTO: «Кабинет и API» → «Уведомления».";

export const TELEGRAM_WELCOME_LINKED_BASIC = "✅ <b>KARTO подключён</b>\n\nСюда будут приходить карточки отзывов на подтверждение: можно подтвердить, изменить или перегенерировать ответ.";

export const TELEGRAM_WELCOME_RELINKED = "🔗 <b>Чат восстановлен</b>\n\nВы снова на связи с KARTO. Уведомления приходят сюда.";

export const TELEGRAM_WELCOME_ALREADY = "Вы уже подключены к <b>KARTO</b>. Карточки отзывов приходят сюда.";

export const TELEGRAM_WELCOME_GUEST =
  "👋 <b>KARTO</b>\n\n" +
  "Бот личного кабинета <b>karto.pro</b>: уведомления о магазине, подтверждение ответов на отзывы и ответы на вопросы о делах.\n\n" +
  "Подключение:\n" +
  "• ссылка из кабинета («Кабинет и API» → «Уведомления» → «Подключить Telegram»)\n" +
  "• или /link → email → код из письма";

/** Обновляет имя и описание бота в Telegram (BotFather preview). */
export async function ensureTelegramBotProfile() {
  if (globalThis.__kartoTelegramProfileDone) return;
  if (!isTelegramConfigured()) return;

  try {
    // Имя Telegram разрешает менять редко: отказ (лимит) не должен мешать описанию и командам.
    await telegramSetMyName(TELEGRAM_BOT_DISPLAY_NAME).catch(() => undefined);
    await telegramSetMyShortDescription(TELEGRAM_BOT_SHORT_DESCRIPTION);
    await telegramSetMyDescription(TELEGRAM_BOT_DESCRIPTION);
    await telegramSetMyCommands(TELEGRAM_COMMANDS);
    globalThis.__kartoTelegramProfileDone = true;
    console.info("[telegram] bot profile updated:", TELEGRAM_BOT_DISPLAY_NAME);
  } catch (e) {
    console.warn("[telegram] bot profile update failed", e);
  }
}
