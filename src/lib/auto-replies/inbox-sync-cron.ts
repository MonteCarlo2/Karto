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
import type { InboxReviewItem } from "@/lib/auto-replies/inbox-demo-data";
import { shouldAutoSendInboxItem } from "@/lib/auto-replies/inbox-star-rules";

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

declare global {
  // eslint-disable-next-line no-var
  var __kartoInboxCronRunning: boolean | undefined;
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
  autoSent: number;
}> {
  if (globalThis.__kartoInboxCronRunning) {
    return { users: 0, synced: 0, skipped: 0, errors: 0, zeroBalance: 0, autoSent: 0 };
  }
  globalThis.__kartoInboxCronRunning = true;
  try {
    return await processAutoReplyInboxCronInner(supabase, opts);
  } finally {
    globalThis.__kartoInboxCronRunning = false;
  }
}

async function processAutoReplyInboxCronInner(
  supabase: SupabaseClient,
  opts?: { userLimit?: number }
): Promise<{
  users: number;
  synced: number;
  skipped: number;
  errors: number;
  zeroBalance: number;
  autoSent: number;
}> {
  const userLimit = opts?.userLimit ?? 500;
  const [{ data: stateRows }, { data: secretRows }] = await Promise.all([
    supabase
      .from("auto_reply_user_state")
      .select("user_id, settings_json")
      .order("updated_at", { ascending: false })
      .limit(userLimit),
    supabase.from("auto_reply_marketplace_secrets").select("user_id"),
  ]);

  const settingsByUser = new Map<string, AutoRepliesSettingsRoot>();
  for (const row of stateRows ?? []) {
    const uid = row.user_id as string;
    if (!settingsByUser.has(uid)) {
      settingsByUser.set(uid, (row.settings_json as AutoRepliesSettingsRoot) ?? { version: 1, marketplaces: {}, shops: {} });
    }
  }

  const secretUserIds = [
    ...new Set((secretRows ?? []).map((row) => row.user_id as string).filter(Boolean)),
  ];
  const missingStateIds = secretUserIds.filter((uid) => !settingsByUser.has(uid));
  if (missingStateIds.length > 0) {
    const { data: extraStateRows } = await supabase
      .from("auto_reply_user_state")
      .select("user_id, settings_json")
      .in("user_id", missingStateIds.slice(0, 500));
    for (const row of extraStateRows ?? []) {
      const uid = row.user_id as string;
      settingsByUser.set(uid, (row.settings_json as AutoRepliesSettingsRoot) ?? { version: 1, marketplaces: {}, shops: {} });
    }
  }

  for (const uid of secretUserIds) {
    if (!settingsByUser.has(uid)) {
      settingsByUser.set(uid, { version: 1, marketplaces: {}, shops: {} });
    }
  }

  for (const uid of secretUserIds) {
    if (!settingsByUser.get(uid)?.marketplaces || Object.keys(settingsByUser.get(uid)!.marketplaces ?? {}).length === 0) {
      console.info("[auto-reply-inbox-cron] user has server secrets but empty settings", uid);
    }
  }

  let synced = 0;
  let skipped = 0;
  let errors = 0;
  let zeroBalance = 0;
  let autoSent = 0;
  let users = 0;

  for (const [userId, settings] of settingsByUser) {
    if (!settings?.marketplaces) settings.marketplaces = {};

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
      if (!mpCfg.connection.verifiedAt?.trim()) {
        skipped += 1;
        continue;
      }

      const secret = secretByKey.get(mpKey);
      if (!secret?.apiKey?.trim()) {
        skipped += 1;
        console.info(
          "[auto-reply-inbox-cron] skip no_server_secret",
          userId,
          mpKey,
          "— откройте Автоответы на karto.pro или нажмите «Проверить подключение» для сохранения ключа на сервере"
        );
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
          const { data: wbSnap } = await supabase
            .from("auto_reply_inbox_snapshots")
            .select("items_json")
            .eq("user_id", userId)
            .eq("shop_id", shopId)
            .eq("marketplace_id", "wildberries")
            .maybeSingle();

          result = await runWildberriesInboxSync({
            supabase,
            userId,
            apiKey: secret.apiKey,
            usage,
            shop,
            mp: mpSettings,
            sellerName: mpCfg.connection.sellerName ?? null,
            mode: "full",
            seedItems: (wbSnap?.items_json as InboxReviewItem[] | null) ?? undefined,
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

        if (usage === "semi") {
          try {
            const { notifyTelegramSemiPendingReviews } = await import(
              "@/lib/telegram/notify-semi-pending"
            );
            const tgSent = await notifyTelegramSemiPendingReviews(supabase, {
              userId,
              shopId,
              marketplaceId,
              items: result.items ?? [],
            });
            if (tgSent > 0) {
              console.info("[auto-reply-inbox-cron] telegram_notified", userId, marketplaceId, tgSent);
            }
          } catch (e) {
            console.warn("[auto-reply-inbox-cron] telegram_notify_failed", userId, marketplaceId, e);
          }
        }

        synced += 1;
        autoSent += Number(result.autoSentCount ?? 0);
        if ((result.autoSentCount ?? 0) > 0) {
          console.info(
            "[auto-reply-inbox-cron] auto_sent",
            userId,
            marketplaceId,
            result.autoSentCount
          );
          try {
            const { markTelegramReviewMessageSent } = await import("@/lib/telegram/telegram-db");
            const { editTelegramReviewCard } = await import("@/lib/telegram/send-review-card");
            for (const item of result.items ?? []) {
              if (item.status !== "sent" || !item.autoSent) continue;
              const tgRow = await markTelegramReviewMessageSent(supabase, {
                userId,
                shopId,
                marketplaceId,
                reviewId: item.id,
              });
              if (!tgRow) continue;
              try {
                await editTelegramReviewCard({
                  chatId: tgRow.chat_id,
                  messageId: tgRow.telegram_message_id,
                  item,
                  messageRowId: tgRow.id,
                  hasPhoto: Boolean(tgRow.has_photo),
                  status: "sent",
                  footer: "✅ Отправлено автоматически · синхронизировано с karto.pro",
                });
              } catch (editErr) {
                console.warn("[auto-reply-inbox-cron] telegram_edit_after_auto_sent", item.id, editErr);
              }
            }
          } catch (e) {
            console.warn("[auto-reply-inbox-cron] telegram_sync_after_auto_sent", e);
          }
        } else if (result.autoSendWarning) {
          console.warn(
            "[auto-reply-inbox-cron] auto_send_blocked",
            userId,
            marketplaceId,
            result.autoSendWarning
          );
        } else {
          const pendingAuto = (result.items ?? []).filter(
            (item) => shouldAutoSendInboxItem(item, mpSettings, shop) && item.status === "pending"
          ).length;
          if (pendingAuto > 0) {
            console.info(
              "[auto-reply-inbox-cron] pending_auto_unsent",
              userId,
              marketplaceId,
              pendingAuto
            );
          }
        }
      } catch (e) {
        errors += 1;
        console.error("[auto-reply-inbox-cron]", userId, marketplaceId, e);
      }
    }
  }

  return { users, synced, skipped, errors, zeroBalance, autoSent };
}
