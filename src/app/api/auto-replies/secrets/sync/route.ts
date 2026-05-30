import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import { upsertMarketplaceSecrets } from "@/lib/auto-replies/server-secrets";
import type { AutoRepliesMarketplaceId } from "@/lib/auto-replies/types";

const VALID_MP = new Set<AutoRepliesMarketplaceId>(["wildberries", "ozon", "yandex"]);

export async function POST(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  let body: {
    entries?: Array<{
      shopId?: string;
      marketplaceId?: string;
      apiKey?: string;
      clientId?: string | null;
      campaignId?: string | null;
      businessId?: string | null;
    }>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Нужен JSON" }, { status: 400 });
  }

  const entries = (body.entries ?? [])
    .map((e) => ({
      shopId: String(e.shopId ?? "main").trim() || "main",
      marketplaceId: e.marketplaceId as AutoRepliesMarketplaceId,
      apiKey: String(e.apiKey ?? ""),
      clientId: e.clientId ?? null,
      campaignId: e.campaignId ?? null,
      businessId: e.businessId ?? null,
    }))
    .filter((e) => VALID_MP.has(e.marketplaceId));

  if (entries.length === 0) {
    return NextResponse.json({ success: true, stored: 0 });
  }

  const supabase = createServerClient();
  try {
    await upsertMarketplaceSecrets(supabase, auth.user.id, entries);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/does not exist|auto_reply_marketplace_secrets/i.test(msg)) {
      return NextResponse.json({
        success: false,
        error: "Примените миграцию auto_reply_marketplace_secrets в Supabase (см. supabase/migrations/20260531_auto_reply_server_secrets.sql)",
      }, { status: 503 });
    }
    throw e;
  }
  return NextResponse.json({ success: true, stored: entries.filter((e) => e.apiKey.trim()).length });
}
