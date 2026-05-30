import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AutoRepliesMarketplaceSettings,
  AutoRepliesSettingsRoot,
  AutoRepliesShopSettings,
} from "@/lib/auto-replies/settings-types";
import type { AutoRepliesMarketplaceId } from "@/lib/auto-replies/types";
import { getAutoReplyBalance } from "@/lib/auto-replies-balance";
import { listMarketplaceSecretsForUser } from "@/lib/auto-replies/server-secrets";
import { runWildberriesInboxSync } from "@/lib/auto-replies/inbox-sync-wildberries-core";
import { runYandexInboxSync } from "@/lib/auto-replies/inbox-sync-yandex-core";
import { runOzonInboxSync } from "@/lib/auto-replies/inbox-sync-ozon-core";
import { ozonReviewApiBlocked } from "@/lib/auto-replies/ozon-subscription";

function parseMpKey(key: string): { shopId: string; marketplaceId: AutoRepliesMarketplaceId } | null {
  const idx = key.indexOf(":");
  if (idx <= 0) return null;
  const shopId = key.slice(0, idx);
  const marketplaceId = key.slice(idx + 1) as AutoRepliesMarketplaceId;
  if (marketplaceId !== "wildberries" && marketplaceId !== "ozon" && marketplaceId !== "yandex") {
    return null;
  }
  return { shopId, marketplaceId };
}

export async function processAutoReplyInboxCron(
  supabase: SupabaseClient,
  opts?: { userLimit?: number }
): Promise<{
  users: number;
  synced: number;
  skipped: number;
  errors: number;
  zeroBalance: number;
}> {
  const userLimit = opts?.userLimit ?? 40;
  const { data: rows } = await supabase
    .from("auto_reply_user_state")
    .select("user_id, settings_json")
    .order("updated_at", { ascending: false })
    .limit(userLimit);

  let synced = 0;
  let skipped = 0;
  let errors = 0;
  let zeroBalance = 0;
  let users = 0;

  for (const row of rows ?? []) {
    const userId = row.user_id as string;
    const settings = row.settings_json as AutoRepliesSettingsRoot;
    if (!settings?.marketplaces) continue;

    users += 1;
    const balance = await getAutoReplyBalance(supabase, userId);
    if (balance <= 0) {
      zeroBalance += 1;
      skipped += 1;
      continue;
    }

    const secrets = await listMarketplaceSecretsForUser(supabase, userId);
    const secretByKey = new Map(secrets.map((s) => [`${s.shopId}:${s.marketplaceId}`, s]));

    for (const [mpKey, mpCfg] of Object.entries(settings.marketplaces)) {
      const parsed = parseMpKey(mpKey);
      if (!parsed) continue;
      const { shopId, marketplaceId } = parsed;
      const usage = mpCfg.usage;
      if (usage !== "semi" && usage !== "auto") continue;
      if (mpCfg.connection.status !== "active") continue;

      const secret = secretByKey.get(mpKey);
      if (!secret?.apiKey?.trim()) {
        skipped += 1;
        continue;
      }

      const shop = settings.shops?.[shopId] as AutoRepliesShopSettings | undefined;
      if (!shop?.style || !shop.templates) {
        skipped += 1;
        continue;
      }

      if (
        marketplaceId === "ozon" &&
        ozonReviewApiBlocked(mpCfg.connection.reviewApiAvailable, mpCfg.connection.premiumPlus)
      ) {
        skipped += 1;
        continue;
      }

      const mpSettings: AutoRepliesMarketplaceSettings = {
        ...mpCfg,
        connection: {
          ...mpCfg.connection,
          apiKey: secret.apiKey,
          clientId: secret.clientId ?? mpCfg.connection.clientId,
          campaignId: secret.campaignId ?? mpCfg.connection.campaignId,
          businessId: secret.businessId ?? mpCfg.connection.businessId,
        },
      };

      try {
        let result:
          | Awaited<ReturnType<typeof runWildberriesInboxSync>>
          | Awaited<ReturnType<typeof runYandexInboxSync>>
          | Awaited<ReturnType<typeof runOzonInboxSync>>;

        if (marketplaceId === "wildberries") {
          result = await runWildberriesInboxSync({
            supabase,
            userId,
            apiKey: secret.apiKey,
            usage,
            shop,
            mp: mpSettings,
            sellerName: mpCfg.connection.sellerName ?? null,
            mode: "full",
          });
        } else if (marketplaceId === "yandex") {
          const campaignId = secret.campaignId ?? mpCfg.connection.campaignId;
          if (!campaignId?.trim()) {
            skipped += 1;
            continue;
          }
          result = await runYandexInboxSync({
            supabase,
            userId,
            apiKey: secret.apiKey,
            campaignId,
            businessId: secret.businessId ?? mpCfg.connection.businessId,
            usage,
            shop,
            mp: mpSettings,
            sellerName: mpCfg.connection.sellerName ?? null,
            mode: "full",
          });
        } else if (marketplaceId === "ozon") {
          const clientId = secret.clientId ?? mpCfg.connection.clientId;
          if (!clientId?.trim()) {
            skipped += 1;
            continue;
          }
          result = await runOzonInboxSync({
            supabase,
            userId,
            clientId,
            apiKey: secret.apiKey,
            usage,
            shop,
            mp: mpSettings,
            sellerName: mpCfg.connection.sellerName ?? null,
            mode: "full",
          });
        } else {
          skipped += 1;
          continue;
        }

        await supabase.from("auto_reply_inbox_snapshots").upsert(
          {
            user_id: userId,
            shop_id: shopId,
            marketplace_id: marketplaceId,
            items_json: result.items,
            seller_name: result.sellerName,
            unanswered_count: result.unansweredCount,
            synced_at: new Date().toISOString(),
          },
          { onConflict: "user_id,shop_id,marketplace_id" }
        );
        synced += 1;
      } catch (e) {
        errors += 1;
        console.error("[auto-reply-inbox-cron]", userId, marketplaceId, e);
      }
    }
  }

  return { users, synced, skipped, errors, zeroBalance };
}
