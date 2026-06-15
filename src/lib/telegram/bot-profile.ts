import { telegramSetMyDescription, telegramSetMyName, telegramSetMyShortDescription } from "./bot-api";
import { isTelegramConfigured } from "./config";

declare global {
  // eslint-disable-next-line no-var
  var __kartoTelegramProfileDone: boolean | undefined;
}

export const TELEGRAM_BOT_DISPLAY_NAME =
  process.env.TELEGRAM_BOT_DISPLAY_NAME?.trim() || "KARTO · Отзывы";

export const TELEGRAM_BOT_SHORT_DESCRIPTION =
  process.env.TELEGRAM_BOT_SHORT_DESCRIPTION?.trim() ||
  "Подтверждение ответов на отзывы WB, Ozon и Яндекс Маркет — синхронно с karto.pro";

export const TELEGRAM_BOT_DESCRIPTION =
  process.env.TELEGRAM_BOT_DESCRIPTION?.trim() ||
  `Официальный бот сервиса KARTO (karto.pro) для полуавтоматического режима автоответов.

Что умеет:
• Присылает только отзывы, которые ждут вашего подтверждения
• Кнопки: подтвердить, изменить текст, перегенерировать ИИ
• Синхронизация с личным кабинетом — действия в боте и на сайте совпадают

Как подключить:
1. Войдите на karto.pro → Автоответы → Полуавтомат
2. Нажмите «Подключить Telegram» и Start в этом чате
Альтернатива: /link → email → код из письма

Если удалили чат — снова откройте ссылку из кабинета или напишите /start.`;

export const TELEGRAM_WELCOME_LINKED =
  "✅ <b>KARTO · Отзывы подключён</b>\n\n" +
  "Сюда приходят <b>только отзывы на подтверждение</b> (полуавтомат).\n\n" +
  "В карточке отзыва:\n" +
  "✅ Подтвердить — отправить черновик на маркетплейс\n" +
  "✏️ Изменить — ваш текст сразу уходит на маркетплейс\n" +
  "🔄 Перегенерировать — новый черновик ИИ в этой же карточке\n\n" +
  "Всё синхронизируется с karto.pro.";

export const TELEGRAM_WELCOME_RELINKED =
  "🔗 <b>Чат восстановлен</b>\n\nВы снова на связи с KARTO. Уведомления о отзывах на подтверждение приходят сюда.";

export const TELEGRAM_WELCOME_ALREADY =
  "Вы уже подключены к <b>KARTO · Отзывы</b>. Ожидайте уведомления о отзывах на подтверждение.";

export const TELEGRAM_WELCOME_GUEST =
  "👋 <b>KARTO · Отзывы</b>\n\n" +
  "Бот личного кабинета <b>karto.pro</b> для подтверждения ответов на отзывы.\n\n" +
  "Подключение:\n" +
  "• ссылка из кабинета (Полуавтомат → Подключить Telegram)\n" +
  "• или /link → email → код из письма";

/** Обновляет имя и описание бота в Telegram (BotFather preview). */
export async function ensureTelegramBotProfile() {
  if (globalThis.__kartoTelegramProfileDone) return;
  if (!isTelegramConfigured()) return;

  try {
    await telegramSetMyName(TELEGRAM_BOT_DISPLAY_NAME);
    await telegramSetMyShortDescription(TELEGRAM_BOT_SHORT_DESCRIPTION);
    await telegramSetMyDescription(TELEGRAM_BOT_DESCRIPTION);
    globalThis.__kartoTelegramProfileDone = true;
    console.info("[telegram] bot profile updated:", TELEGRAM_BOT_DISPLAY_NAME);
  } catch (e) {
    console.warn("[telegram] bot profile update failed", e);
  }
}
