import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AutoRepliesMarketplaceSettings,
  AutoRepliesSettingsRoot,
  AutoRepliesShopSettings,
} from "@/lib/auto-replies/settings-types";
import type { AutoRepliesMarketplaceId } from "@/lib/auto-replies/types";
import { getAutoReplyBalance } from "@/lib/auto-replies-balance";
import { listMarketplaceSecretsForUser } from "@/lib/auto-replies/server-secrets";
import { SELLER_HUB_WB_SHOP_ID } from "@/lib/seller-hub/wb-token";
import { runWildberriesInboxSync } from "@/lib/auto-replies/inbox-sync-wildberries-core";
import { runYandexInboxSync } from "@/lib/auto-replies/inbox-sync-yandex-core";
import { runOzonInboxSync } from "@/lib/auto-replies/inbox-sync-ozon-core";
import { ozonReviewApiBlocked } from "@/lib/auto-replies/ozon-subscription";
import type { InboxReviewItem } from "@/lib/auto-replies/inbox-demo-data";
import { shouldAutoSendInboxItem } from "@/lib/auto-replies/inbox-star-rules";
import { consumeReviewScopeLimit } from "@/lib/auto-replies/inbox-review-scope";

/**
 * Фоновая отправка расходует «Лимит» объёма ответов: новое значение записываем в настройки, иначе лимит никогда не уменьшался бы
 * и каждый тик отправлял бы ещё столько же. Читаем настройки заново прямо перед записью, чтобы не затереть свежие правки.
 */
async function persistReviewScopeConsumed(supabase: SupabaseClient, userId: string, mpKey: string, sent: number): Promise<void> {
  try {
    const { data } = await supabase.from("auto_reply_user_state").select("settings_json").eq("user_id", userId).maybeSingle();
    const root = data?.settings_json as AutoRepliesSettingsRoot | undefined;
    const scope = root?.marketplaces?.[mpKey]?.reviewScope;
    if (!root || !scope || scope.mode !== "limited") return;
    const nextConsumed = consumeReviewScopeLimit(scope, sent).limitConsumed;
    if (nextConsumed === scope.limitConsumed) return;
    root.marketplaces[mpKey]!.reviewScope = { ...scope, limitConsumed: nextConsumed };
    await supabase.from("auto_reply_user_state").update({ settings_json: root, updated_at: new Date().toISOString() }).eq("user_id", userId);
  } catch (e) {
    console.warn("[auto-reply-inbox-cron] не удалось сохранить расход лимита", userId, mpKey, e);
  }
}

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

const LOCK_ID = "inbox_lock";
const LOCK_LEASE_MS = 5 * 60_000;

/**
 * Замок на уровне базы: если одновременно работают два сервера (боевой и чей-то второй), тик выполняет только один.
 * Аренда на 5 минут: если держатель упал, замок освободится сам. Любая неожиданность с замком не должна останавливать работу.
 */
async function acquireCronLock(supabase: SupabaseClient): Promise<boolean> {
  try {
    const nowIso = new Date().toISOString();
    const cutoff = new Date(Date.now() - LOCK_LEASE_MS).toISOString();
    const taken = await supabase.from("auto_reply_cron_heartbeats").update({ last_tick_at: nowIso, updated_at: nowIso, last_result: { lock: true } }).eq("id", LOCK_ID).lt("last_tick_at", cutoff).select("id");
    if (!taken.error && (taken.data?.length ?? 0) > 0) return true;
    const created = await supabase.from("auto_reply_cron_heartbeats").insert({ id: LOCK_ID, last_tick_at: nowIso, updated_at: nowIso, last_result: { lock: true } }).select("id");
    if (!created.error && (created.data?.length ?? 0) > 0) return true;
    // Строка есть и аренда не истекла: тик выполняет другой сервер.
    // Занято только если строка существует (нарушение уникальности). Любая другая неожиданность не должна останавливать работу.
    return created.error?.code !== "23505";
  } catch {
    return true;
  }
}

async function releaseCronLock(supabase: SupabaseClient): Promise<void> {
  try {
    await supabase.from("auto_reply_cron_heartbeats").update({ last_tick_at: "1970-01-01T00:00:00.000Z" }).eq("id", LOCK_ID);
  } catch {
    /* аренда истечёт сама */
  }
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
  concurrentSkip?: boolean;
}> {
  if (globalThis.__kartoInboxCronRunning) {
    return {
      users: 0,
      synced: 0,
      skipped: 0,
      errors: 0,
      zeroBalance: 0,
      autoSent: 0,
      concurrentSkip: true,
    };
  }
  globalThis.__kartoInboxCronRunning = true;
  let locked = false;
  try {
    locked = await acquireCronLock(supabase);
    if (!locked) {
      return { users: 0, synced: 0, skipped: 0, errors: 0, zeroBalance: 0, autoSent: 0, concurrentSkip: true };
    }
    return await processAutoReplyInboxCronInner(supabase, opts);
  } finally {
    if (locked) await releaseCronLock(supabase);
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
  const [{ data: stateRows, error: stateErr }, { data: secretRows, error: secretErr }] =
    await Promise.all([
    supabase
      .from("auto_reply_user_state")
      .select("user_id, settings_json")
      .order("updated_at", { ascending: false })
      .limit(userLimit),
    supabase
      .from("auto_reply_marketplace_secrets")
      .select("user_id")
      .neq("shop_id", SELLER_HUB_WB_SHOP_ID),
  ]);

  if (stateErr) {
    console.error("[auto-reply] cron state query failed", stateErr.message);
  }
  if (secretErr) {
    console.error("[auto-reply] cron secrets query failed", secretErr.message);
  }

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

    const { data: secretRowRefs } = await supabase
      .from("auto_reply_marketplace_secrets")
      .select("shop_id, marketplace_id")
      .eq("user_id", userId)
      .neq("shop_id", SELLER_HUB_WB_SHOP_ID);
    const secretRowKeys = new Set(
      (secretRowRefs ?? []).map((r) => `${r.shop_id as string}:${r.marketplace_id as string}`)
    );

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
        // Площадка помечена active в settings, но ключа на сервере нет — не спамим (напр. Ozon не используется).
        if (secretRowKeys.has(mpKey)) {
          console.info(
            "[auto-reply-inbox-cron] skip no_server_secret",
            userId,
            mpKey,
            "— откройте Автоответы на karto.pro или нажмите «Проверить подключение» для сохранения ключа на сервере"
          );
        }
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
        if (Number(result.autoSentCount ?? 0) > 0 && mpSettings.reviewScope.mode === "limited") {
          await persistReviewScopeConsumed(supabase, userId, mpKey, Number(result.autoSentCount));
        }
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
                  extraMessageIds: tgRow.extra_message_ids ?? [],
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
