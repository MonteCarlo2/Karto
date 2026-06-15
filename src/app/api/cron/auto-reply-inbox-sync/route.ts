import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { processAutoReplyInboxCron } from "@/lib/auto-replies/inbox-sync-cron";

/**
 * GET/POST: фоновая синхронизация inbox + автоответы (semi/auto).
 * Требует server-side секреты (auto_reply_marketplace_secrets) и CRON_SECRET.
 * Настройте cron (Vercel / внешний) каждые 5–15 мин.
 */
async function handleCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 500 });
  }

  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (auth !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const result = await processAutoReplyInboxCron(supabase);
  try {
    const now = new Date().toISOString();
    await supabase.from("auto_reply_cron_heartbeats").upsert({
      id: "inbox",
      last_tick_at: now,
      last_result: { ...result, source: "http-cron", at: now },
      updated_at: now,
    });
  } catch {
    /* heartbeat table optional until migration applied */
  }
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}
