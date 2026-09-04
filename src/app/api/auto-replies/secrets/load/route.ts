import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import { listMarketplaceSecretsForUser } from "@/lib/auto-replies/server-secrets";

/** Возвращает сохранённые на сервере API-ключи (для восстановления в UI после очистки localStorage). */
export async function GET(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const supabase = createServerClient();
  try {
    const entries = await listMarketplaceSecretsForUser(supabase, auth.user.id);
    return NextResponse.json({
      success: true,
      entries: entries.map((e) => ({
        shopId: e.shopId,
        marketplaceId: e.marketplaceId,
        apiKey: e.apiKey,
        clientId: e.clientId ?? null,
        campaignId: e.campaignId ?? null,
        businessId: e.businessId ?? null,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/does not exist|auto_reply_marketplace_secrets/i.test(msg)) {
      return NextResponse.json({ success: true, entries: [] });
    }
    throw e;
  }
}
