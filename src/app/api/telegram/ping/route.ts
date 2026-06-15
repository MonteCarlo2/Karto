import { NextResponse } from "next/server";
import { ensureTelegramBotProfile } from "@/lib/telegram/bot-profile";
import { telegramGetMe } from "@/lib/telegram/bot-api";
import {
  getTelegramBotUsername,
  getTelegramProxyLabel,
  isTelegramConfigured,
} from "@/lib/telegram/config";

export const runtime = "nodejs";

/** Локальная проверка: достучится ли сервер до Telegram API. Только development. */
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!isTelegramConfigured()) {
    return NextResponse.json({
      ok: false,
      error: "TELEGRAM_BOT_TOKEN не задан",
    });
  }

  const proxy = getTelegramProxyLabel();
  try {
    const { resetTelegramApiCache } = await import("@/lib/telegram/bot-api");
    resetTelegramApiCache();
    await ensureTelegramBotProfile();
    const me = await telegramGetMe();
    return NextResponse.json({
      ok: true,
      botUsername: me.username ?? getTelegramBotUsername(),
      proxy: proxy ?? "не задан (прямое подключение)",
      hint: "Если ok:true — бот сможет отвечать при TELEGRAM_POLLING=1",
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      proxy: proxy ?? "не задан",
      error: e instanceof Error ? e.message : "Telegram API недоступен",
      hint:
        "Zero Omega проксирует только браузер. В .env.local нужны TELEGRAM_PROXY, TELEGRAM_PROXY_USER и TELEGRAM_PROXY_PASSWORD (логин/пароль от продавца прокси, замок в Zero Omega).",
    });
  }
}
