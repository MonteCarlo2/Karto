import { NextRequest, NextResponse } from "next/server";
import { requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import { createServerClient } from "@/lib/supabase/server";
import {
  createLinkToken,
  enableTelegramMarketplace,
  fetchTelegramLinkByUserId,
  parseTelegramMarketplaceId,
} from "@/lib/telegram/telegram-db";
import { getTelegramBotUsername, isTelegramConfigured } from "@/lib/telegram/config";
import { ensureTelegramBotProfile } from "@/lib/telegram/bot-profile";
import { kickTelegramAfterLink } from "@/lib/telegram/process-updates";
import { ensureTelegramPollingStarted } from "@/lib/telegram/telegram-polling";
import { notifyTelegramSemiPendingReviews } from "@/lib/telegram/notify-semi-pending";
import type { InboxReviewItem } from "@/lib/auto-replies/inbox-demo-data";

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

  const existing = await fetchTelegramLinkByUserId(supabase, auth.user.id);
  if (existing) {
    await enableTelegramMarketplace(supabase, {
      userId: auth.user.id,
      shopId,
      marketplaceId,
    });

    const { data: snap } = await supabase
      .from("auto_reply_inbox_snapshots")
      .select("items_json")
      .eq("user_id", auth.user.id)
      .eq("shop_id", shopId)
      .eq("marketplace_id", marketplaceId)
      .maybeSingle();

    const items = (snap?.items_json as InboxReviewItem[] | null) ?? [];
    void notifyTelegramSemiPendingReviews(supabase, {
      userId: auth.user.id,
      shopId,
      marketplaceId,
      items,
    }).catch((e) => console.warn("[telegram/link-token] notify after enable failed", e));

    return NextResponse.json({
      ok: true,
      linked: true,
      alreadyLinked: true,
      botUsername: getTelegramBotUsername(),
      username: existing.username,
      firstName: existing.first_name,
    });
  }

  const token = await createLinkToken(supabase, auth.user.id, { shopId, marketplaceId });
  const username = getTelegramBotUsername();
  const url = `https://t.me/${username}?start=link_${token}`;

  kickTelegramAfterLink();
  ensureTelegramPollingStarted();

  return NextResponse.json({ ok: true, url, botUsername: username, alreadyLinked: false });
}
