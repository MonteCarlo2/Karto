import { NextRequest, NextResponse } from "next/server";
import type { AutoRepliesMarketplaceId } from "@/lib/auto-replies/types";
import { requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import { createServerClient } from "@/lib/supabase/server";

const VALID_MP = new Set<AutoRepliesMarketplaceId>(["wildberries", "ozon", "yandex"]);

export async function GET(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const shopId = request.nextUrl.searchParams.get("shopId")?.trim() || "main";
  const marketplaceId = request.nextUrl.searchParams.get("marketplaceId")?.trim() as
    | AutoRepliesMarketplaceId
    | undefined;

  if (!marketplaceId || !VALID_MP.has(marketplaceId)) {
    return NextResponse.json({ error: "Укажите marketplaceId" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("auto_reply_inbox_snapshots")
    .select("items_json,seller_name,unanswered_count,synced_at")
    .eq("user_id", auth.user.id)
    .eq("shop_id", shopId)
    .eq("marketplace_id", marketplaceId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    items: data?.items_json ?? [],
    sellerName: data?.seller_name ?? null,
    unansweredCount: data?.unanswered_count ?? null,
    syncedAt: data?.synced_at ?? null,
  });
}
