import { NextRequest, NextResponse } from "next/server";
import { requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import { createServerClient } from "@/lib/supabase/server";
import type { AutoRepliesMarketplaceId } from "@/lib/auto-replies/types";
import { confirmSemiReviewReply } from "@/lib/telegram/semi-confirm-server";

export const runtime = "nodejs";

const MP_SET = new Set<AutoRepliesMarketplaceId>(["wildberries", "ozon", "yandex"]);

export async function POST(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { shopId?: string; marketplaceId?: string; reviewId?: string; replyText?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Нужен JSON" }, { status: 400 });
  }

  const shopId = String(body.shopId ?? "main").trim() || "main";
  const marketplaceId = body.marketplaceId as AutoRepliesMarketplaceId;
  const reviewId = String(body.reviewId ?? "").trim();
  const replyText = String(body.replyText ?? "").trim();

  if (!MP_SET.has(marketplaceId) || !reviewId || replyText.length < 2) {
    return NextResponse.json({ error: "Некорректные параметры" }, { status: 400 });
  }

  const supabase = createServerClient();
  const result = await confirmSemiReviewReply(supabase, {
    userId: auth.user.id,
    shopId,
    marketplaceId,
    reviewId,
    replyText,
    source: "web",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Не удалось отправить" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, item: result.item ?? null });
}
