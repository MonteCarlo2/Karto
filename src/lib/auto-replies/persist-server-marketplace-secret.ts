import type { SupabaseClient } from "@supabase/supabase-js";
import type { AutoRepliesMarketplaceId } from "./types";
import { upsertMarketplaceSecrets } from "./server-secrets";

export type ServerMarketplaceSecretInput = {
  shopId?: string;
  marketplaceId: AutoRepliesMarketplaceId;
  apiKey: string;
  clientId?: string | null;
  campaignId?: string | null;
  businessId?: string | null;
};

/** Сохранить токен на сервере для фонового cron (без localStorage). */
export async function persistServerMarketplaceSecret(
  supabase: SupabaseClient,
  userId: string,
  entry: ServerMarketplaceSecretInput
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = entry.apiKey.trim();
  if (!apiKey) return { ok: true };

  try {
    await upsertMarketplaceSecrets(supabase, userId, [
      {
        shopId: (entry.shopId ?? "main").trim() || "main",
        marketplaceId: entry.marketplaceId,
        apiKey,
        clientId: entry.clientId ?? null,
        campaignId: entry.campaignId ?? null,
        businessId: entry.businessId ?? null,
      },
    ]);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/does not exist|auto_reply_marketplace_secrets/i.test(msg)) {
      return {
        ok: false,
        error:
          "Примените миграцию auto_reply_marketplace_secrets в Supabase (20260531_auto_reply_server_secrets.sql)",
      };
    }
    console.error("[auto-reply] persist server secret failed", entry.marketplaceId, msg);
    return { ok: false, error: msg };
  }
}
