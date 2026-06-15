import { NextRequest, NextResponse } from "next/server";
import { requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import { createServerClient } from "@/lib/supabase/server";
import { createLinkToken } from "@/lib/telegram/telegram-db";
import { getTelegramBotUsername, isTelegramConfigured } from "@/lib/telegram/config";
import { ensureTelegramBotProfile } from "@/lib/telegram/bot-profile";
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

  const supabase = createServerClient();
  void ensureTelegramBotProfile();

  const token = await createLinkToken(supabase, auth.user.id);
  const username = getTelegramBotUsername();
  const url = `https://t.me/${username}?start=link_${token}`;

  kickTelegramAfterLink();
  ensureTelegramPollingStarted();

  return NextResponse.json({ ok: true, url, botUsername: username });
}
