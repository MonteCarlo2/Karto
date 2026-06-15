import { NextRequest, NextResponse } from "next/server";
import { requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import { createServerClient } from "@/lib/supabase/server";
import { createLinkToken, parseTelegramMarketplaceId } from "@/lib/telegram/telegram-db";
import { getTelegramBotUsername, isTelegramConfigured } from "@/lib/telegram/config";
import { ensureTelegramBotProfile } from "@/lib/telegram/bot-profile";
import { ensureTelegramWebhookRegistered } from "@/lib/telegram/telegram-webhook-setup";
import { kickTelegramAfterLink } from "@/lib/telegram/process-updates";
import { ensureTelegramPollingStarted } from "@/lib/telegram/telegram-polling";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isTelegramConfigured()) {
    return NextResponse.json(
      { error: "Telegram-бот не настроен на сервере (TELEGRAM_BOT_TOKEN)" },
      { status: 503 }
    );
  }

  let body: { shopId?: string; marketplaceId?: string } = {};
  try {
    body = (await request.json().catch(() => ({}))) as typeof body;
  } catch {
    body = {};
  }

  const shopId = body.shopId?.trim() || "main";
  const marketplaceId = parseTelegramMarketplaceId(body.marketplaceId);
  if (!marketplaceId) {
    return NextResponse.json({ error: "Укажите marketplaceId" }, { status: 400 });
  }

  const supabase = createServerClient();
  void ensureTelegramBotProfile();

  /** Всегда новая ссылка — без опоры на старые записи в БД. */
  let token: string;
  try {
    token = await createLinkToken(supabase, auth.user.id, { shopId, marketplaceId });
  } catch (e) {
    console.error("[telegram/link-token] createLinkToken", e);
    return NextResponse.json(
      {
        error:
          "Не удалось создать ссылку в базе. Примените миграции Telegram в Supabase (20260604) или обратитесь в поддержку.",
      },
      { status: 500 }
    );
  }
  const username = getTelegramBotUsername();
  const url = `https://t.me/${username}?start=link_${token}`;

  if (process.env.NODE_ENV === "development") {
    kickTelegramAfterLink();
    ensureTelegramPollingStarted();
  } else {
    void ensureTelegramWebhookRegistered();
  }

  return NextResponse.json({ ok: true, url, botUsername: username });
}
