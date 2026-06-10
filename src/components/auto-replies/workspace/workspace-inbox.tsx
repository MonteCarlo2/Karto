"use client";



import { useCallback, useEffect, useMemo, useRef, useState } from "react";


import type { AutoRepliesMarketplaceId, AutoRepliesUsageId } from "@/lib/auto-replies/types";

import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings } from "@/lib/auto-replies/settings-types";

import {
  inboxAutoPendingCount,
  inboxAutoSendablePendingCount,
  inboxAutoSentCount,
  inboxSemiPendingCount,
  inboxSemiSentCount,
  inboxVisibleItems,
  shouldShowInboxDemo,
  demoInboxItemsForMarketplace,
  type InboxFeedTab,
  type InboxReviewItem,
} from "@/lib/auto-replies/inbox-demo-data";
import {
  INBOX_FEED_DEFAULT_FILTERS,
  applyInboxFeedFilters,
  type InboxFeedFilters,
} from "@/lib/auto-replies/inbox-feed-filters";
import { loadInboxClientCache, saveInboxClientCache, isInboxClientCacheFresh, inboxCacheSecondaryId } from "@/lib/auto-replies/inbox-client-cache";
import { fetchAutoReplyInboxSnapshotFromApi } from "@/lib/auto-replies/auto-replies-sync";
import {
  filterInboxItemsForMarketplace,
  isPlaceholderProductName,
  mergeInboxReviewItem,
} from "@/lib/auto-replies/inbox-item-merge";

import {
  isMarketplaceCredentialsReady,
  isMarketplaceLiveReady,
  syncMarketplaceInbox,
} from "@/lib/auto-replies/marketplace-live";
import { reassignInboxItemFeeds } from "@/lib/auto-replies/inbox-auto-send";
import { shouldAutoSendInboxItem } from "@/lib/auto-replies/inbox-star-rules";
import { hydrateInboxReplyDrafts } from "@/lib/auto-replies/empty-review-settings";
import { sendWildberriesPendingAuto, sendWildberriesReply } from "@/lib/auto-replies/wildberries-client-api";
import { sendYandexReply } from "@/lib/auto-replies/yandex-client-api";
import { sendOzonReply } from "@/lib/auto-replies/ozon-client-api";
import { applyReviewScopeEligibility, consumeReviewScopeLimit, filterInboxItemsByReviewScope } from "@/lib/auto-replies/inbox-review-scope";
import { appendReplyHistory, usageModeLabel } from "@/lib/auto-replies/reply-history-store";
import { OZON_REVIEW_SUBSCRIPTION_DENIED, ozonReviewApiBlocked } from "@/lib/auto-replies/ozon-subscription";

import { AUTO_REPLIES_MARKETPLACE_UI } from "@/lib/auto-replies/workspace-prefs";

import { WorkspaceManualCompose } from "./workspace-manual-compose";

import { WorkspaceInboxDetail } from "./workspace-inbox-detail";

import { WorkspaceInboxFeed } from "./workspace-inbox-feed";

import { WsGlassPanel, glass, panel, wsSans } from "./settings-ui";
import { inboxTheme } from "./inbox-theme";



const SYNC_COOLDOWN_MS = 120_000;
const SYNC_COOLDOWN_MS_WB_INCOMPLETE = 1_500;
const AUTO_SYNC_MS = 180_000;
const AUTO_SYNC_MS_WB_BACKOFF = 600_000;
const AUTO_SYNC_MS_WB_INCREMENTAL = 3_000;
const WB_RATE_LIMIT_SESSION_KEY = "karto-wb-rate-limit-until";
const WB_FAIL_STREAK_KEY = "karto-wb-fail-streak";

function readWbRateLimitUntil(apiKey: string): number {
  if (typeof window === "undefined" || !apiKey.trim()) return 0;
  try {
    const raw = sessionStorage.getItem(`${WB_RATE_LIMIT_SESSION_KEY}:${apiKey.trim().slice(-12)}`);
    const ts = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(ts) && ts > Date.now() ? ts : 0;
  } catch {
    return 0;
  }
}

function writeWbRateLimitUntil(apiKey: string, untilMs: number) {
  if (typeof window === "undefined" || !apiKey.trim()) return;
  try {
    sessionStorage.setItem(
      `${WB_RATE_LIMIT_SESSION_KEY}:${apiKey.trim().slice(-12)}`,
      String(untilMs)
    );
  } catch {
    /* noop */
  }
}

function bumpWbFailStreak(apiKey: string): number {
  if (typeof window === "undefined" || !apiKey.trim()) return 0;
  try {
    const key = `${WB_FAIL_STREAK_KEY}:${apiKey.trim().slice(-12)}`;
    const next = (Number.parseInt(sessionStorage.getItem(key) ?? "0", 10) || 0) + 1;
    sessionStorage.setItem(key, String(next));
    return next;
  } catch {
    return 1;
  }
}

function resetWbFailStreak(apiKey: string) {
  if (typeof window === "undefined" || !apiKey.trim()) return;
  try {
    sessionStorage.removeItem(`${WB_FAIL_STREAK_KEY}:${apiKey.trim().slice(-12)}`);
  } catch {
    /* noop */
  }
}



function marketplaceTitle(id: AutoRepliesMarketplaceId): string {

  return AUTO_REPLIES_MARKETPLACE_UI.find((entry) => entry.id === id)?.title ?? "Маркетплейс";

}



export function WorkspaceInbox({

  usage,

  connectionOk,

  marketplaceLabel: _marketplaceLabel,

  shopId: _shopId,

  marketplaceId,

  shopSettings,

  mpSettings,

  brandName,

  onGoSettings,

  onPendingCountChange,

  onConnectionMetaChange,

  onPatchReviewScope,

  onReplyBalanceChange,

}: {

  usage: AutoRepliesUsageId;

  connectionOk: boolean;

  marketplaceLabel: string;

  shopId: string;

  marketplaceId: AutoRepliesMarketplaceId;

  shopSettings: AutoRepliesShopSettings;

  mpSettings: AutoRepliesMarketplaceSettings;

  brandName?: string | null;

  onGoSettings?: () => void;

  onPendingCountChange?: (count: number) => void;

  onConnectionMetaChange?: (patch: {

    sellerName?: string;

    unansweredCount?: number;

    verifiedAt?: string;

    status?: "active" | "error";

    lastError?: string;

    premiumPlus?: boolean;

    reviewApiAvailable?: boolean;

    businessId?: string;

  }) => void;

  onPatchReviewScope?: (patch: { limitConsumed?: number }) => void;

  onReplyBalanceChange?: () => void | Promise<void>;

}) {

  const connection = mpSettings.connection;

  const effectiveUsage = mpSettings.usage ?? usage;

  const credentialsReady = isMarketplaceCredentialsReady(marketplaceId, connection);

  const liveReady =

    effectiveUsage !== "manual" && isMarketplaceLiveReady(marketplaceId, effectiveUsage, connection);

  const showLiveUi = liveReady && credentialsReady;

  const showDemo = shouldShowInboxDemo(effectiveUsage);

  const needsVerify = credentialsReady && !connection.verifiedAt;

  const mpTitle = marketplaceTitle(marketplaceId);

  const inboxCacheKey = inboxCacheSecondaryId(marketplaceId, connection);



  const [items, setItems] = useState<InboxReviewItem[]>(() => {
    if (showDemo) return demoInboxItemsForMarketplace(marketplaceId);
    if (liveReady && credentialsReady) {
      const cached = loadInboxClientCache(_shopId, marketplaceId, connection.apiKey, inboxCacheKey);
      if (cached?.items.length) return cached.items;
    }
    return [];
  });

  const [tab, setTab] = useState<InboxFeedTab>("semi");

  const [feedFilters, setFeedFilters] = useState<InboxFeedFilters>(INBOX_FEED_DEFAULT_FILTERS);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const [syncError, setSyncError] = useState<string | null>(null);

  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const [sellerName, setSellerName] = useState(connection.sellerName ?? "");



  const onPendingRef = useRef(onPendingCountChange);

  const onConnectionMetaRef = useRef(onConnectionMetaChange);

  const lastSyncAtRef = useRef(0);

  const syncInFlightRef = useRef(false);
  const autoSendInFlightRef = useRef(false);
  const rateLimitUntilRef = useRef(0);
  const wbFetchCompleteRef = useRef(false);
  const marketplaceIdRef = useRef(marketplaceId);
  const semiPendingRef = useRef(0);
  const itemsRef = useRef<InboxReviewItem[]>([]);
  const onReplyBalanceRef = useRef(onReplyBalanceChange);

  useEffect(() => {
    onReplyBalanceRef.current = onReplyBalanceChange;
  }, [onReplyBalanceChange]);

  const mpSettingsRef = useRef(mpSettings);

  const shopSettingsRef = useRef(shopSettings);



  useEffect(() => {

    onPendingRef.current = onPendingCountChange;

  }, [onPendingCountChange]);



  useEffect(() => {

    onConnectionMetaRef.current = onConnectionMetaChange;

  }, [onConnectionMetaChange]);



  useEffect(() => {

    mpSettingsRef.current = mpSettings;

  }, [mpSettings]);



  useEffect(() => {

    shopSettingsRef.current = shopSettings;

  }, [shopSettings]);

  useEffect(() => {
    marketplaceIdRef.current = marketplaceId;
  }, [marketplaceId]);

  const applyMergedInboxItems = useCallback(
    (prev: InboxReviewItem[], incoming: InboxReviewItem[], mp: AutoRepliesMarketplaceSettings, seller: string, fetchComplete: boolean) => {
      const prevForMarket = filterInboxItemsForMarketplace(prev, marketplaceId);
      const byId = new Map<string, InboxReviewItem>();

      for (const item of prevForMarket) byId.set(item.id, item);
      for (const item of incoming) {
        const old = byId.get(item.id);
        byId.set(item.id, old ? mergeInboxReviewItem(old, item) : item);
      }

      const merged = hydrateInboxReplyDrafts(
        applyReviewScopeEligibility(
          filterInboxItemsByReviewScope(reassignInboxItemFeeds(Array.from(byId.values()), mp), mp.reviewScope),
          mp.reviewScope
        ),
        shopSettingsRef.current
      );
      saveInboxClientCache(_shopId, marketplaceId, mp.connection.apiKey, {
        items: merged,
        sellerName: seller,
        unansweredCount: inboxSemiPendingCount(merged),
        fetchComplete,
      }, inboxCacheSecondaryId(marketplaceId, mp.connection));
      return merged;
    },
    [_shopId, marketplaceId]
  );

  const runPendingAutoSend = useCallback(
    async (currentItems: InboxReviewItem[]) => {
      if (marketplaceId !== "wildberries") return null;
      const mp = mpSettingsRef.current;
      const shop = shopSettingsRef.current;
      const usageNow = mp.usage ?? usage;
      if (usageNow === "manual") return null;
      if (Date.now() < rateLimitUntilRef.current) return null;
      if (autoSendInFlightRef.current) return null;

      const pending = reassignInboxItemFeeds(currentItems, mp).filter(
        (item) =>
          item.feed === "auto" &&
          item.status === "pending" &&
          shouldAutoSendInboxItem(item, mp, shop)
      );
      if (pending.length === 0) return null;

      autoSendInFlightRef.current = true;
      try {
        return await sendWildberriesPendingAuto({
          apiKey: mp.connection.apiKey,
          usage: usageNow,
          shopSettings: shop,
          mpSettings: mp,
          brandName,
          items: currentItems,
        });
      } finally {
        autoSendInFlightRef.current = false;
      }
    },
    [brandName, marketplaceId, usage]
  );



  const refreshLiveInbox = useCallback(

    async (force = false) => {

      const mp = mpSettingsRef.current;

      const shop = shopSettingsRef.current;

      const usageNow = mp.usage ?? usage;

      if (

        usageNow === "manual" ||

        !isMarketplaceLiveReady(marketplaceId, usageNow, mp.connection)

      ) {

        return;

      }



      const now = Date.now();
      const syncCooldownMs =
        marketplaceId === "wildberries" && !wbFetchCompleteRef.current
          ? SYNC_COOLDOWN_MS_WB_INCOMPLETE
          : SYNC_COOLDOWN_MS;

      if (!force && now - lastSyncAtRef.current < syncCooldownMs) {

        return;

      }

      if (syncInFlightRef.current) return;
      if (!force && Date.now() < rateLimitUntilRef.current) return;

      if (
        marketplaceId === "ozon" &&
        mp.connection.verifiedAt &&
        ozonReviewApiBlocked(mp.connection.reviewApiAvailable, mp.connection.premiumPlus)
      ) {
        setSyncError(OZON_REVIEW_SUBSCRIPTION_DENIED);
        return;
      }

      syncInFlightRef.current = true;

      setLoading(true);

      try {

        const result = await syncMarketplaceInbox({

          marketplaceId,

          connection: mp.connection,

          tab: "semi",

          usage: usageNow,

          shopSettings: shop,

          mpSettings: mp,

          brandName,

          sellerName: sellerName || mp.connection.sellerName || null,

          force,

        });



        lastSyncAtRef.current = Date.now();

        const fetchComplete = result.meta.fetchComplete === true;
        wbFetchCompleteRef.current = fetchComplete;

        let mergedItems: InboxReviewItem[] = [];
        setItems((prev) => {
          mergedItems = applyMergedInboxItems(prev, result.items, mp, result.sellerName, fetchComplete);
          return mergedItems;
        });
        setSellerName(result.sellerName);
        setLastSyncedAt(new Date().toISOString());
        let softWarning =
          result.meta.warning ?? result.meta.autoSendWarning ?? null;

        const autoSendResult = await runPendingAutoSend(mergedItems);
        if (autoSendResult) {
          setItems((prev) => applyMergedInboxItems(prev, autoSendResult.items, mp, result.sellerName, fetchComplete));
          if (typeof autoSendResult.reviewScopeLimitConsumed === "number") {
            onPatchReviewScope?.({ limitConsumed: autoSendResult.reviewScopeLimitConsumed });
          }
          if (autoSendResult.autoSendWarning) {
            softWarning = autoSendResult.autoSendWarning;
          } else if (autoSendResult.autoSentCount > 0) {
            softWarning = null;
          }
        }

        setSyncError(softWarning);

        if (
          marketplaceId === "wildberries" &&
          !fetchComplete &&
          !(typeof result.meta.retryAfterSec === "number" && result.meta.retryAfterSec > 0)
        ) {
          window.setTimeout(() => {
            void refreshLiveInboxRef.current(false);
          }, SYNC_COOLDOWN_MS_WB_INCOMPLETE);
        }

        const pendingAutoSend = reassignInboxItemFeeds(mergedItems, mp).filter(
          (item) =>
            item.feed === "auto" &&
            item.status === "pending" &&
            shouldAutoSendInboxItem(item, mp, shop)
        );
        if (pendingAutoSend.length > 0 && !force && !autoSendResult?.autoSentCount) {
          window.setTimeout(() => {
            void runPendingAutoSendRef.current(itemsRef.current)?.then((retry) => {
              if (!retry) return;
              setItems((prev) =>
                applyMergedInboxItems(
                  prev,
                  retry.items,
                  mpSettingsRef.current,
                  result.sellerName,
                  fetchComplete
                )
              );
              if (typeof retry.reviewScopeLimitConsumed === "number") {
                onPatchReviewScope?.({ limitConsumed: retry.reviewScopeLimitConsumed });
              }
            });
          }, 5000);
        }

        if (
          marketplaceId === "wildberries" &&
          typeof result.meta.retryAfterSec === "number" &&
          result.meta.retryAfterSec > 0
        ) {
          const until = Date.now() + result.meta.retryAfterSec * 1000;
          rateLimitUntilRef.current = until;
          writeWbRateLimitUntil(mp.connection.apiKey, until);
        } else if (marketplaceId === "wildberries" && result.items.length > 0) {
          resetWbFailStreak(mp.connection.apiKey);
        }



        onConnectionMetaRef.current?.({

          sellerName: result.sellerName,

          unansweredCount: result.meta.unansweredCount,

          status: "active",

          lastError: undefined,

          premiumPlus: result.meta.premiumPlus,

          reviewApiAvailable: result.meta.reviewApiAvailable,

        });

        if (typeof result.meta.reviewScopeLimitConsumed === "number") {
          onPatchReviewScope?.({ limitConsumed: result.meta.reviewScopeLimitConsumed });
        }



      } catch (e) {

        const err = e as Error & { premiumPlusRequired?: boolean; retryAfterSec?: number };

        let message = err.message || "Не удалось загрузить отзывы";
        if (message.includes("Failed to fetch") || message.includes("связаться с сервером") || message.includes("не ответил вовремя")) {
          message = err.message.includes("Wildberries")
            ? err.message
            : "Не удалось связаться с сервером. Проверьте интернет и попробуйте «Обновить».";
        }

        if (/блокирует|429|ограничивает|огранил|ограничил/i.test(message)) {
          const streak =
            marketplaceId === "wildberries" ? bumpWbFailStreak(mp.connection.apiKey) : 1;
          const retrySec =
            err.retryAfterSec && err.retryAfterSec > 0
              ? Math.min(600, Math.max(60, err.retryAfterSec * streak))
              : Math.min(600, 60 * streak);
          const until = Date.now() + retrySec * 1000;
          rateLimitUntilRef.current = until;
          if (marketplaceId === "wildberries") {
            writeWbRateLimitUntil(mp.connection.apiKey, until);
          }
        }

        let restoredFromCache = false;

        setItems((prev) => {
          if (prev.length > 0) {
            restoredFromCache = true;
            return prev;
          }
          const cached = loadInboxClientCache(_shopId, marketplaceId, mp.connection.apiKey);
          if (cached?.items.length) {
            restoredFromCache = true;
            setSellerName(cached.sellerName);
            return cached.items;
          }
          return prev;
        });

        setSyncError(
          restoredFromCache
            ? `${mpTitle} временно ограничивает запросы. Показана сохранённая лента.`
            : message
        );

        const isAuthError = /401|403|не принят|недостаточно прав/i.test(message);
        if (isAuthError) {
          onConnectionMetaRef.current?.({
            status: "error",
            lastError: message,
            premiumPlus: err.premiumPlusRequired ? false : undefined,
            reviewApiAvailable: err.premiumPlusRequired ? false : undefined,
          });
        }

      } finally {

        syncInFlightRef.current = false;

        setLoading(false);

        void onReplyBalanceRef.current?.();

      }

    },

    [brandName, marketplaceId, sellerName, usage, _shopId, applyMergedInboxItems, runPendingAutoSend]

  );



  const refreshLiveInboxRef = useRef(refreshLiveInbox);
  const runPendingAutoSendRef = useRef(runPendingAutoSend);

  refreshLiveInboxRef.current = refreshLiveInbox;
  runPendingAutoSendRef.current = runPendingAutoSend;

  useEffect(() => {
    if (!liveReady || showDemo) return;
    let cancel = false;
    void fetchAutoReplyInboxSnapshotFromApi({ shopId: _shopId, marketplaceId }).then((snapshot) => {
      if (cancel || !snapshot?.items?.length) return;
      const mp = mpSettingsRef.current;
      setItems((prev) => {
        const other = prev.filter((item) => item.marketplaceId !== marketplaceId);
        const byId = new Map(
          filterInboxItemsForMarketplace(prev, marketplaceId).map((item) => [item.id, item])
        );
        for (const item of snapshot.items) {
          const old = byId.get(item.id);
          byId.set(item.id, old ? mergeInboxReviewItem(old, item) : item);
        }
        const mergedMp = hydrateInboxReplyDrafts(
          applyReviewScopeEligibility(
            filterInboxItemsByReviewScope(reassignInboxItemFeeds(Array.from(byId.values()), mp), mp.reviewScope),
            mp.reviewScope
          ),
          shopSettingsRef.current
        );
        saveInboxClientCache(
          _shopId,
          marketplaceId,
          mp.connection.apiKey,
          {
            items: mergedMp,
            sellerName: snapshot.sellerName ?? (sellerName || mp.connection.sellerName || ""),
            unansweredCount: inboxSemiPendingCount(mergedMp),
            fetchComplete: wbFetchCompleteRef.current === true,
          },
          inboxCacheSecondaryId(marketplaceId, mp.connection)
        );
        return [...other, ...mergedMp];
      });
      if (snapshot.sellerName) setSellerName(snapshot.sellerName);
    });
    return () => {
      cancel = true;
    };
  }, [liveReady, showDemo, marketplaceId, _shopId, sellerName]);

  useEffect(() => {
    setSelectedId(null);
    setTab("semi");

    const mp = mpSettingsRef.current;

    if (!liveReady) {
      if (showDemo) {
        const demo = demoInboxItemsForMarketplace(marketplaceId);
        setItems(demo);
        onPendingRef.current?.(inboxSemiPendingCount(demo));
      } else {
        const cached = loadInboxClientCache(_shopId, marketplaceId, connection.apiKey, inboxCacheKey);
        const cachedItems = cached?.items
          ? hydrateInboxReplyDrafts(
              applyReviewScopeEligibility(
                filterInboxItemsByReviewScope(reassignInboxItemFeeds(cached.items, mp), mp.reviewScope),
                mp.reviewScope
              ),
              shopSettingsRef.current
            )
          : [];
        setItems(cachedItems);
        setSellerName(cached?.sellerName ?? connection.sellerName ?? "");
        onPendingRef.current?.(inboxSemiPendingCount(cachedItems));
      }
      setSyncError(null);
      return;
    }

    const cached = loadInboxClientCache(_shopId, marketplaceId, connection.apiKey, inboxCacheKey);
    const cachedItems = cached?.items
      ? hydrateInboxReplyDrafts(
          applyReviewScopeEligibility(
            filterInboxItemsByReviewScope(reassignInboxItemFeeds(cached.items, mp), mp.reviewScope),
            mp.reviewScope
          ),
          shopSettingsRef.current
        )
      : [];
    wbFetchCompleteRef.current = cached?.fetchComplete === true;
    setItems(cachedItems);
    setSellerName(cached?.sellerName ?? connection.sellerName ?? "");
    onPendingRef.current?.(inboxSemiPendingCount(cachedItems));

    const wbRateLimit =
      marketplaceId === "wildberries"
        ? Math.max(rateLimitUntilRef.current, readWbRateLimitUntil(connection.apiKey))
        : rateLimitUntilRef.current;
    if (wbRateLimit > Date.now()) {
      rateLimitUntilRef.current = wbRateLimit;
    }

    if (Date.now() < rateLimitUntilRef.current) {
      setSyncError(
        cached?.items?.length
          ? `${mpTitle} временно ограничивает запросы. Показана сохранённая лента — обновим, когда WB разрешит.`
          : `${mpTitle} временно ограничивает запросы. Подождите пару минут и нажмите «Обновить».`
      );
      setLoading(false);
      return;
    }

    const cacheFreshMs = marketplaceId === "wildberries" ? 5 * 60_000 : 25_000;
    const cacheFresh = cached ? isInboxClientCacheFresh(cached.savedAt, cacheFreshMs) : false;
    const needsProductRefresh =
      marketplaceId === "yandex" &&
      (cached?.items ?? []).some((item) =>
        isPlaceholderProductName(item.productName, "yandex")
      );
    const needsSync =
      needsProductRefresh ||
      !cached?.items.length ||
      (marketplaceId === "wildberries" && wbFetchCompleteRef.current !== true);

    if (cacheFresh && !needsSync && !needsProductRefresh) {
      setSyncError(null);
      setLoading(false);
      const mp = mpSettingsRef.current;
      const shop = shopSettingsRef.current;
      const pendingAutoSendable = cachedItems.filter((item) =>
        shouldAutoSendInboxItem(item, mp, shop)
      ).length;

      if (marketplaceId === "wildberries" && pendingAutoSendable > 0) {
        window.setTimeout(() => {
          void runPendingAutoSendRef.current(cachedItems).then((result) => {
            if (!result) return;
            setItems((current) =>
              applyMergedInboxItems(
                current,
                result.items,
                mpSettingsRef.current,
                cached?.sellerName ?? connection.sellerName ?? "",
                wbFetchCompleteRef.current === true
              )
            );
            if (typeof result.reviewScopeLimitConsumed === "number") {
              onPatchReviewScope?.({ limitConsumed: result.reviewScopeLimitConsumed });
            }
          });
        }, 800);
      } else if (pendingAutoSendable > 0) {
        window.setTimeout(() => {
          void syncMarketplaceInbox({
            marketplaceId,
            connection,
            tab: "semi",
            usage: mp.usage ?? usage,
            shopSettings: shop,
            mpSettings: mp,
            brandName,
            sellerName: sellerName || connection.sellerName || null,
            force: false,
          }).then((result) => {
            setItems((prev) =>
              applyMergedInboxItems(
                prev,
                result.items,
                mp,
                result.sellerName,
                wbFetchCompleteRef.current === true
              )
            );
            if (typeof result.meta.reviewScopeLimitConsumed === "number") {
              onPatchReviewScope?.({ limitConsumed: result.meta.reviewScopeLimitConsumed });
            }
            if (result.meta.autoSendWarning) setSyncError(result.meta.autoSendWarning);
          }).catch(() => {
            /* keep cached feed */
          });
        }, 800);
      }
      return;
    }

    void refreshLiveInboxRef.current(false);

  }, [liveReady, showDemo, marketplaceId, connection.apiKey, connection.campaignId, connection.clientId, _shopId, inboxCacheKey]);



  useEffect(() => {
    if (!liveReady || showDemo) return;
    const mp = mpSettings;
    const shop = shopSettingsRef.current;
    let pendingAuto = 0;

    setItems((prev) => {
      const next = hydrateInboxReplyDrafts(
        applyReviewScopeEligibility(
          filterInboxItemsByReviewScope(reassignInboxItemFeeds(prev, mp), mp.reviewScope),
          mp.reviewScope
        ),
        shop
      );
      pendingAuto = next.filter(
        (item) =>
          item.feed === "auto" &&
          item.status === "pending" &&
          shouldAutoSendInboxItem(item, mp, shop)
      ).length;
      const changed =
        next.some((item, index) => item.feed !== prev[index]?.feed || item.canSend !== prev[index]?.canSend) ||
        pendingAuto > 0;
      if (changed) {
        saveInboxClientCache(_shopId, marketplaceId, connection.apiKey, {
          items: next,
          sellerName: sellerName || connection.sellerName || "",
          unansweredCount: inboxSemiPendingCount(next),
          fetchComplete: wbFetchCompleteRef.current === true,
        }, inboxCacheSecondaryId(marketplaceId, connection));
        return next;
      }
      return prev;
    });

    if (pendingAuto > 0 && Date.now() >= rateLimitUntilRef.current) {
      window.setTimeout(() => {
        void runPendingAutoSendRef.current(
          reassignInboxItemFeeds(itemsRef.current, mp)
        ).then((result) => {
          if (!result) return;
          setItems((current) =>
            applyMergedInboxItems(
              current,
              result.items,
              mpSettingsRef.current,
              sellerName || connection.sellerName || "",
              wbFetchCompleteRef.current === true
            )
          );
          if (typeof result.reviewScopeLimitConsumed === "number") {
            onPatchReviewScope?.({ limitConsumed: result.reviewScopeLimitConsumed });
          }
          if (result.autoSendWarning) setSyncError(result.autoSendWarning);
          else if (result.autoSentCount > 0) setSyncError(null);
        });
      }, 1200);
    }
  }, [
    mpSettings.starRules.byStar,
    mpSettings.reviewScope,
    liveReady,
    showDemo,
    marketplaceId,
    connection.apiKey,
    _shopId,
    sellerName,
    connection.sellerName,
  ]);



  useEffect(() => {

    if (!liveReady) return;

    const id = window.setInterval(() => {

      if (document.visibilityState !== "visible") return;
      if (Date.now() < rateLimitUntilRef.current) return;

      const mp = marketplaceIdRef.current;
      const intervalMs =
        mp === "wildberries"
          ? wbFetchCompleteRef.current
            ? AUTO_SYNC_MS_WB_BACKOFF
            : AUTO_SYNC_MS_WB_INCREMENTAL
          : AUTO_SYNC_MS;

      if (Date.now() - lastSyncAtRef.current < intervalMs) return;

      void refreshLiveInboxRef.current(false);

    }, AUTO_SYNC_MS_WB_INCREMENTAL);

    return () => window.clearInterval(id);

  }, [liveReady]);



  const tabItems = useMemo(() => {

    return inboxVisibleItems(items, tab, showLiveUi);

  }, [items, tab, showLiveUi]);



  const displayItems = useMemo(

    () => applyInboxFeedFilters(tabItems, feedFilters),

    [tabItems, feedFilters],

  );



  const semiPendingCount = inboxSemiPendingCount(items);
  const semiSentCount = inboxSemiSentCount(items);
  const autoSentCount = inboxAutoSentCount(items);
  const autoPendingCount = inboxAutoPendingCount(items);
  const autoSendablePendingCount = useMemo(
    () =>
      inboxAutoSendablePendingCount(items, (item) =>
        shouldAutoSendInboxItem(item, mpSettings, shopSettings)
      ),
    [items, mpSettings, shopSettings]
  );

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const feedAlertMessage = useMemo(() => {
    if (autoSendablePendingCount > 0) {
      const pendingNote = `Отправляем ${autoSendablePendingCount} автоответ${autoSendablePendingCount === 1 ? "" : autoSendablePendingCount < 5 ? "а" : "ов"} на маркетплейс…`;
      return syncError ? `${pendingNote} ${syncError}` : pendingNote;
    }
    return syncError;
  }, [autoSendablePendingCount, syncError]);

  useEffect(() => {
    semiPendingRef.current = semiPendingCount;
    onPendingRef.current?.(semiPendingCount);
  }, [semiPendingCount]);

  useEffect(() => {
    if (!liveReady || showDemo || autoSendablePendingCount === 0) return;
    if (Date.now() < rateLimitUntilRef.current) return;
    if (marketplaceId !== "wildberries") return;

    const id = window.setTimeout(() => {
      void runPendingAutoSendRef.current(itemsRef.current).then((result) => {
        if (!result) return;
        setItems((current) =>
          applyMergedInboxItems(
            current,
            result.items,
            mpSettingsRef.current,
            sellerName || connection.sellerName || "",
            wbFetchCompleteRef.current === true
          )
        );
        if (typeof result.reviewScopeLimitConsumed === "number") {
          onPatchReviewScope?.({ limitConsumed: result.reviewScopeLimitConsumed });
        }
        if (result.autoSendWarning) setSyncError(result.autoSendWarning);
        else if (result.autoSentCount > 0) setSyncError(null);
      });
    }, 2000);

    return () => window.clearTimeout(id);
  }, [autoSendablePendingCount, liveReady, showDemo, marketplaceId, applyMergedInboxItems, sellerName, connection.sellerName]);

  useEffect(() => {
    const displayName = brandName?.trim() || sellerName?.trim();
    if (!displayName) return;
    setItems((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if (item.shopName === displayName) return item;
        changed = true;
        return { ...item, shopName: displayName };
      });
      return changed ? next : prev;
    });
  }, [brandName, sellerName]);

  const shopTitle = brandName?.trim() || sellerName?.trim() || "Отзывы";



  const selected = displayItems.find((item) => item.id === selectedId) ?? displayItems[0] ?? null;



  useEffect(() => {

    if (displayItems.length === 0) {

      setSelectedId(null);

      return;

    }

    if (!selectedId || !displayItems.some((item) => item.id === selectedId)) {

      setSelectedId(displayItems[0]?.id ?? null);

    }

  }, [displayItems, selectedId]);



  const updateItem = (id: string, patch: Partial<InboxReviewItem>) => {

    setItems((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  };

  const handlePublishReply = useCallback(
    async (id: string, replyText: string) => {
      const item = items.find((entry) => entry.id === id);
      const feedbackId = item?.externalId?.trim();
      if (!feedbackId) {
        throw new Error("Не найден ID отзыва");
      }

      const apiKey = mpSettings.connection.apiKey.trim();
      if (!apiKey) {
        throw new Error(`Укажите API-токен в разделе «Кабинет и API»`);
      }

      const bumpReviewScopeAfterSend = () => {
        const scope = mpSettingsRef.current.reviewScope;
        if (scope.mode === "limited") {
          onPatchReviewScope?.({
            limitConsumed: consumeReviewScopeLimit(scope, 1).limitConsumed,
          });
        }
      };

      const logSentReply = () => {
        if (!item) return;
        appendReplyHistory({
          shopId: _shopId,
          marketplaceId,
          usageMode: usage,
          usageModeLabel: usageModeLabel(usage),
          starRating: item.starRating,
          reviewText: item.reviewText,
          replyText,
          generationSource: "openrouter-dual",
        });
      };

      if (marketplaceId === "wildberries") {
        await sendWildberriesReply({
          apiKey,
          feedbackId,
          text: replyText,
        });

        setItems((list) => {
          const next = list.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  status: "sent" as const,
                  feed: "semi" as const,
                  replyDraft: replyText,
                  canSend: false,
                  autoSent: false,
                  sentAtLabel: "Только что · подтверждено",
                }
              : entry
          );
          saveInboxClientCache(_shopId, marketplaceId, mpSettings.connection.apiKey, {
            items: next,
            sellerName: sellerName || mpSettings.connection.sellerName || "",
            unansweredCount: Math.max(0, semiPendingCount - 1),
            fetchComplete: wbFetchCompleteRef.current === true,
          }, inboxCacheSecondaryId(marketplaceId, mpSettings.connection));
          return next;
        });
        bumpReviewScopeAfterSend();
        logSentReply();
        return;
      }

      if (marketplaceId === "yandex") {
        const campaignId = mpSettings.connection.campaignId?.trim();
        const businessId = mpSettings.connection.businessId?.trim();
        if (!campaignId) {
          throw new Error("Укажите Campaign ID Яндекс Маркета в разделе «Кабинет и API»");
        }
        if (!businessId) {
          throw new Error("Нажмите «Проверить подключение» в разделе «Кабинет и API»");
        }

        await sendYandexReply({
          apiKey,
          campaignId,
          businessId,
          feedbackId,
          text: replyText,
        });

        setItems((list) => {
          const next = list.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  status: "sent" as const,
                  feed: "semi" as const,
                  replyDraft: replyText,
                  canSend: false,
                  autoSent: false,
                  sentAtLabel: "Только что · подтверждено",
                }
              : entry
          );
          saveInboxClientCache(_shopId, marketplaceId, mpSettings.connection.apiKey, {
            items: next,
            sellerName: sellerName || mpSettings.connection.sellerName || "",
            unansweredCount: Math.max(0, semiPendingCount - 1),
            fetchComplete: wbFetchCompleteRef.current === true,
          }, inboxCacheSecondaryId(marketplaceId, mpSettings.connection));
          return next;
        });
        bumpReviewScopeAfterSend();
        logSentReply();
        return;
      }

      if (marketplaceId === "ozon") {
        const clientId = mpSettings.connection.clientId?.trim();
        if (!clientId) {
          throw new Error("Укажите Client ID Ozon в разделе «Кабинет и API»");
        }

        await sendOzonReply({
          clientId,
          apiKey,
          reviewId: feedbackId,
          text: replyText,
        });

        setItems((list) => {
          const next = list.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  status: "sent" as const,
                  feed: "semi" as const,
                  replyDraft: replyText,
                  canSend: false,
                  autoSent: false,
                  sentAtLabel: "Только что · подтверждено",
                }
              : entry
          );
          saveInboxClientCache(_shopId, marketplaceId, mpSettings.connection.apiKey, {
            items: next,
            sellerName: sellerName || mpSettings.connection.sellerName || "",
            unansweredCount: Math.max(0, semiPendingCount - 1),
            fetchComplete: wbFetchCompleteRef.current === true,
          }, inboxCacheSecondaryId(marketplaceId, mpSettings.connection));
          return next;
        });
        bumpReviewScopeAfterSend();
        logSentReply();
        return;
      }

      throw new Error("Отправка для этой площадки пока недоступна");
    },
    [items, marketplaceId, mpSettings.connection, semiPendingCount, sellerName, _shopId, onPatchReviewScope]
  );



  if (usage === "manual") {

    return (

      <WorkspaceManualCompose

        shopId={_shopId}

        marketplaceId={marketplaceId}

        usage={usage}

        shopSettings={shopSettings}

        mpSettings={mpSettings}

        brandName={brandName}

        onGoSettings={onGoSettings}

        onReplyBalanceChange={onReplyBalanceChange}

      />

    );

  }



  const connectHint =

    marketplaceId === "ozon"

      ? "Подключите Client ID и API Key Ozon в разделе «Кабинет и API», затем нажмите «Проверить подключение»."

      : marketplaceId === "yandex"

        ? "Подключите Campaign ID и токен Яндекс Маркета в разделе «Кабинет и API», затем нажмите «Проверить подключение»."

        : `Подключите API-токен ${mpTitle} в разделе «Кабинет и API», чтобы загрузить реальные отзывы.`;



  return (
    <div
      className="flex h-full min-h-0 w-full flex-1 overflow-hidden"
      style={{ backgroundColor: inboxTheme.canvas }}
    >
      <WorkspaceInboxFeed

        tab={tab}

        onTabChange={setTab}

        items={displayItems}

        selectedId={selected?.id ?? null}

        onSelect={setSelectedId}

        semiPendingCount={semiPendingCount}
        semiSentCount={semiSentCount}
        autoSentCount={autoSentCount}
        autoPendingCount={autoSendablePendingCount}

        liveMode={showLiveUi}

        shopTitle={shopTitle}

        filters={feedFilters}

        onFiltersChange={setFeedFilters}

        onFiltersReset={() => setFeedFilters(INBOX_FEED_DEFAULT_FILTERS)}

        loading={loading}

        totalItemCount={items.length}

        alertMessage={feedAlertMessage}

        onRefresh={() => void refreshLiveInboxRef.current(true)}

        refreshDisabled={loading}

        reviewScope={mpSettings.reviewScope}

      />

      <div
        className="w-[2px] shrink-0 self-stretch"
        style={{ backgroundColor: inboxTheme.rail }}
        aria-hidden
      />

      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        style={{ backgroundColor: inboxTheme.canvas }}
      >

        {!showLiveUi && !selected ? (

          <div className="shrink-0 px-5 py-4 sm:px-7">

            <p className="text-[13px] leading-[1.6]" style={{ ...wsSans, color: panel.textMuted }}>

              {needsVerify

                ? `Ключ сохранён. Откройте «Кабинет и API» и нажмите «Проверить подключение», затем обновите ленту — подтянутся реальные отзывы ${mpTitle}.`

                : connectHint}

            </p>

          </div>

        ) : null}

        {selected ? (

          <WorkspaceInboxDetail

            key={selected.id}

            item={selected}

            usage={usage}

            shopSettings={shopSettings}

            mpSettings={mpSettings}

            brandName={brandName}

            onUpdateDraft={(id, draft) => updateItem(id, { replyDraft: draft })}

            onPublish={
              showLiveUi ? (replyText) => handlePublishReply(selected.id, replyText) : undefined
            }

            onReplyBalanceChange={onReplyBalanceChange}

          />

        ) : (

          <div className="flex min-w-0 flex-1 items-center justify-center px-6 py-12">

            <p className="max-w-[20rem] text-center text-[14px] leading-[1.65]" style={{ ...wsSans, color: panel.textMuted }}>

              {loading && items.length === 0

                ? `Загружаем отзывы из ${mpTitle}…`

                : syncError && items.length === 0

                  ? syncError

                  : tab === "semi"

                    ? showLiveUi

                      ? "В кабинете маркетплейса пока нет отзывов — нажмите «Обновить» в ленте слева"

                      : showDemo

                        ? "Выберите отзыв в ленте — ответ уже подготовлен с учётом ваших настроек"

                        : "Подключите и проверьте API в разделе «Кабинет и API»"

                    : showLiveUi

                      ? "Авто-журнал пуст — ответы без подтверждения появятся здесь"

                      : "Здесь — история автоматически отправленных ответов"}

            </p>

          </div>

        )}

      </div>

    </div>

  );

}



export function inboxPendingCount(

  usage: AutoRepliesUsageId,

  connectionOk: boolean,

  liveCount?: number | null

): number {

  if (usage === "manual") return 0;

  if (typeof liveCount === "number") return liveCount;

  return 0;

}

