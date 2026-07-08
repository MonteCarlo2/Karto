import { NextRequest, NextResponse } from "next/server";
import { requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import { createServerClient } from "@/lib/supabase/server";
import type { AutoRepliesMarketplaceId } from "@/lib/auto-replies/types";
import { syncTelegramPendingReviewCard, patchInboxReplyDraft } from "@/lib/telegram/semi-confirm-server";

export const runtime = "nodejs";

const MP_SET = new Set<AutoRepliesMarketplaceId>(["wildberries", "ozon", "yandex"]);

export async function POST(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    shopId?: string;
    marketplaceId?: string;
    reviewId?: string;
    replyDraft?: string;
    source?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Нужен JSON" }, { status: 400 });
  }

  const shopId = String(body.shopId ?? "main").trim() || "main";
  const marketplaceId = body.marketplaceId as AutoRepliesMarketplaceId;
  const reviewId = String(body.reviewId ?? "").trim();
  const replyDraft = String(body.replyDraft ?? "").trim();
  const sourceRaw = String(body.source ?? "").trim();

  if (!MP_SET.has(marketplaceId) || !reviewId || replyDraft.length < 2) {
    return NextResponse.json({ error: "Некорректные параметры" }, { status: 400 });
  }

  const source =
    sourceRaw === "web_regen" ? "web_regen" : sourceRaw === "web_edit" ? "web_edit" : undefined;

  const supabase = createServerClient();

  const patched = await patchInboxReplyDraft(supabase, {
    userId: auth.user.id,
    shopId,
    marketplaceId,
    reviewId,
    replyDraft,
  });
  if (!patched) {
    return NextResponse.json({ error: "Отзыв не найден в ленте" }, { status: 404 });
  }

  const result = await syncTelegramPendingReviewCard(supabase, {
    userId: auth.user.id,
    shopId,
    marketplaceId,
    reviewId,
    replyDraft,
    source,
  });

  if (!result.synced) {
    try {
      const { notifyTelegramSemiPendingReviews } = await import("@/lib/telegram/notify-semi-pending");
      await notifyTelegramSemiPendingReviews(supabase, {
        userId: auth.user.id,
        shopId,
        marketplaceId,
        items: [patched],
      });
    } catch (e) {
      console.warn("[telegram/sync-review] notify missing card failed", e);
    }
  }

  return NextResponse.json({ ok: true, synced: result.synced });
}
