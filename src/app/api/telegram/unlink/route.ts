import { NextRequest, NextResponse } from "next/server";
import { requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import { createServerClient } from "@/lib/supabase/server";
import {
  cleanupTelegramMarketplaceUnlink,
  parseTelegramMarketplaceId,
} from "@/lib/telegram/telegram-db";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { shopId?: string; marketplaceId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Нужен JSON-тело запроса" }, { status: 400 });
  }

  const shopId = body.shopId?.trim() || "main";
  const marketplaceId = parseTelegramMarketplaceId(body.marketplaceId);
  if (!marketplaceId) {
    return NextResponse.json({ error: "Укажите marketplaceId" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    await cleanupTelegramMarketplaceUnlink(supabase, auth.user.id, shopId, marketplaceId);
    return NextResponse.json({ ok: true, linked: false, shopId, marketplaceId });
  } catch (e) {
    console.error("[telegram/unlink]", e);
    return NextResponse.json({ error: "Не удалось отключить Telegram" }, { status: 500 });
  }
}
