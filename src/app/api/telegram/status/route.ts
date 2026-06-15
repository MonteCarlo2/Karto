import { NextRequest, NextResponse } from "next/server";
import { requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import { createServerClient } from "@/lib/supabase/server";
import {
  fetchTelegramLinkByUserId,
  isTelegramMarketplaceEnabled,
  parseTelegramMarketplaceId,
} from "@/lib/telegram/telegram-db";
import { getTelegramBotUsername, isTelegramConfigured } from "@/lib/telegram/config";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const shopId = request.nextUrl.searchParams.get("shopId")?.trim() || "main";
  const marketplaceId = parseTelegramMarketplaceId(request.nextUrl.searchParams.get("marketplaceId"));
  if (!marketplaceId) {
    return NextResponse.json({ error: "Укажите marketplaceId" }, { status: 400 });
  }

  const supabase = createServerClient();
  const account = await fetchTelegramLinkByUserId(supabase, auth.user.id);
  const mpEnabled = account
    ? await isTelegramMarketplaceEnabled(supabase, auth.user.id, shopId, marketplaceId)
    : false;

  return NextResponse.json({
    configured: isTelegramConfigured(),
    linked: Boolean(account) && mpEnabled,
    accountLinked: Boolean(account),
    botUsername: getTelegramBotUsername(),
    username: account?.username ?? null,
    firstName: account?.first_name ?? null,
    linkedAt: account?.linked_at ?? null,
    shopId,
    marketplaceId,
  });
}
