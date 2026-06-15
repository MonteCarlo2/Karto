import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getTelegramWebhookSecret, isTelegramConfigured } from "@/lib/telegram/config";
import { handleTelegramWebhookUpdate } from "@/lib/telegram/webhook-handler";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!isTelegramConfigured()) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const secret = getTelegramWebhookSecret();
  if (secret) {
    const header = request.headers.get("x-telegram-bot-api-secret-token");
    if (header !== secret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    await handleTelegramWebhookUpdate(supabase, update as Parameters<typeof handleTelegramWebhookUpdate>[1]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[telegram/webhook]", e);
    return NextResponse.json({ ok: true });
  }
}
