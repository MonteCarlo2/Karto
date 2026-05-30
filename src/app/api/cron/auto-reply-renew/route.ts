import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { processDueAutoReplyRenewals } from "@/lib/auto-replies-billing";

/**
 * GET/POST: продление пакетов автоответов с включённым автопродлением.
 * Защита: Authorization: Bearer CRON_SECRET
 */
async function handleRenew(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 500 });
  }

  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (auth !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const result = await processDueAutoReplyRenewals(supabase);
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: NextRequest) {
  return handleRenew(request);
}

export async function POST(request: NextRequest) {
  return handleRenew(request);
}
