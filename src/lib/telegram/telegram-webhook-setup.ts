import { ensureTelegramBotProfile } from "./bot-profile";
import {
  getTelegramWebhookSecret,
  isTelegramConfigured,
} from "./config";
import { telegramGetWebhookInfo, telegramSetWebhook } from "./bot-api";

declare global {
  // eslint-disable-next-line no-var
  var __kartoTelegramWebhookSetupDone: boolean | undefined;
}

/** Регистрирует webhook на проде (karto.pro / Timeweb). */
export async function ensureTelegramWebhookRegistered() {
  if (globalThis.__kartoTelegramWebhookSetupDone) return;
  if (!isTelegramConfigured()) return;

  void ensureTelegramBotProfile();

  if (process.env.NODE_ENV === "development") return;

  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL?.trim();
  if (!webhookUrl) return;

  const secret = getTelegramWebhookSecret();
  if (!secret) {
    console.warn("[telegram] TELEGRAM_WEBHOOK_SECRET не задан — webhook не зарегистрирован");
    return;
  }

  try {
    const info = await telegramGetWebhookInfo();
    if (info.url === webhookUrl) {
      globalThis.__kartoTelegramWebhookSetupDone = true;
      return;
    }
    await telegramSetWebhook({ url: webhookUrl, secretToken: secret });
    globalThis.__kartoTelegramWebhookSetupDone = true;
    console.info("[telegram] webhook registered:", webhookUrl);
  } catch (e) {
    console.error("[telegram] webhook registration failed", e);
  }
}
