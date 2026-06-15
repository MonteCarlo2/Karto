import { NextRequest, NextResponse } from "next/server";
import { requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import { createServerClient } from "@/lib/supabase/server";
import { cleanupTelegramOnUnlink } from "@/lib/telegram/telegram-db";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = createServerClient();
    await cleanupTelegramOnUnlink(supabase, auth.user.id);
    return NextResponse.json({ ok: true, linked: false });
  } catch (e) {
    console.error("[telegram/unlink]", e);
    return NextResponse.json({ error: "Не удалось отключить Telegram" }, { status: 500 });
  }
}
