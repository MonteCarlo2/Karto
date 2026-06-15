import { NextRequest, NextResponse } from "next/server";
import { requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import { createServerClient } from "@/lib/supabase/server";
import type { AutoRepliesMarketplaceId } from "@/lib/auto-replies/types";
import { syncTelegramMessageAfterSent } from "@/lib/telegram/semi-confirm-server";

export const runtime = "nodejs";

const MP_SET = new Set<AutoRepliesMarketplaceId>(["wildberries", "ozon", "yandex"]);

export async function POST(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { shopId?: string; marketplaceId?: string; reviewId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Нужен JSON" }, { status: 400 });
  }

  const shopId = String(body.shopId ?? "main").trim() || "main";
  const marketplaceId = body.marketplaceId as AutoRepliesMarketplaceId;
  const reviewId = String(body.reviewId ?? "").trim();

  if (!MP_SET.has(marketplaceId) || !reviewId) {
    return NextResponse.json({ error: "Некорректные параметры" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: snap } = await supabase
    .from("auto_reply_inbox_snapshots")
    .select("items_json")
    .eq("user_id", auth.user.id)
    .eq("shop_id", shopId)
    .eq("marketplace_id", marketplaceId)
    .maybeSingle();

  const items = (snap?.items_json as import("@/lib/auto-replies/inbox-demo-data").InboxReviewItem[]) ?? [];
  const item = items.find((i) => i.id === reviewId) ?? null;

  await syncTelegramMessageAfterSent(supabase, {
    userId: auth.user.id,
    shopId,
    marketplaceId,
    reviewId,
    item,
  });

  return NextResponse.json({ ok: true });
}
