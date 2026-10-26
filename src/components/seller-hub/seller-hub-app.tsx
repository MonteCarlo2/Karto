"use client";

import Link from "next/link";
import { SellerHubSyncModeContext } from "./sync-mode-context";
import { ANALYTICS_TAB_HINT_KEY } from "@/lib/seller-hub/events-actions";
import { useCallback, useEffect, useRef, useState } from "react";
import { Menu, Plug, RefreshCw, X } from "lucide-react";
import { autoRepliesAuthorizedFetch } from "@/lib/auto-replies/auto-replies-fetch";
import { createBrowserClient } from "@/lib/supabase/client";
import { lastFullDaysRange, snapshotTimeMs } from "@/lib/seller-hub/complete-days";
import {
  describeDataAge,
  loadServerSnapshot,
  loadServerVersion,
  requestServerRefresh,
  serverSnapshotVersion,
  shouldApplyServerSnapshot,
  type ServerSnapshot,
} from "@/lib/seller-hub/sync/client";
import {
  fetchSellerHubCostPrices,
  loadSellerHubAdsStats,
  loadSellerHubBlockedCards,
  loadSellerHubFeedbacks,
  loadSellerHubFunnel,
  loadSellerHubPaidStorage,
  loadSellerHubRealization,
  loadSellerHubStocksReport,
  loadSellerHubWbConnectionStatus,
  manageSellerHubWbConnection,
  saveSellerHubCostPrice,
  syncSellerHubCatalog,
  verifySellerHubConnection,
} from "@/lib/seller-hub/client-api";
import {
  applyCostPricesToSnapshot,
  costMapFromRecord,
  localOnlyCostEntries,
} from "@/lib/seller-hub/cost-history";
import {
  localRootAfterWbMigration,
  shouldClearLocalApiKeyAfterMigrate,
  stripWbApiKeyForPersist,
} from "@/lib/seller-hub/wb-token";
import { reconcileSellerHubEventsRemote, setBrowserEventsReadOnly } from "@/lib/seller-hub/event-history-client";
import { reconcileSellerHubTasksRemote, setBrowserTaskReconcile } from "@/lib/seller-hub/task-engine/client";
import { canonicalArea, sellerHubArea, type SellerHubAreaId } from "@/lib/seller-hub/nav";
import { reconcileSellerHubEvents } from "@/lib/seller-hub/event-engine";
import type { SellerProductEvent } from "@/lib/seller-hub/event-engine/types";

/** Только кампании в статусах 7, 9, 11: для остальных WB статистику не формирует. */
const AD_STATS_STATUSES = new Set([7, 9, 11]);
import { recordPromoObservations } from "@/lib/seller-hub/promo-observations";
import {
  patchSellerHubConnection,
  readSellerHubRoot,
  saveSellerHubCatalog,
  setSellerHubActiveArea,
  writeSellerHubRoot,
} from "@/lib/seller-hub/store";
import { withFunnelRatingReconcile } from "@/lib/seller-hub/feedbacks/build-snapshot";
import { feedbacksNeedsReload } from "@/lib/seller-hub/feedbacks/reload";
import {
  SELLER_FEEDBACKS_SNAPSHOT_VERSION,
  type SellerFeedbacksSnapshot,
} from "@/lib/seller-hub/feedbacks/types";
import { funnelNeedsReload, mergeFunnelKeepPrevious } from "@/lib/services/wildberries/funnel-parse";
import {
  mergePaidStorageKeepPrevious,
  paidStorageNeedsReload,
} from "@/lib/services/wildberries/paid-storage-parse";
import {
  mergeRealizationKeepPrevious,
  realizationNeedsReload,
} from "@/lib/services/wildberries/realization-margin";
import {
  mergeStocksReportKeepPrevious,
  stocksReportNeedsReload,
} from "@/lib/services/wildberries/stocks-report-parse";
import {
  SELLER_FUNNEL_SNAPSHOT_VERSION,
  SELLER_PAID_STORAGE_SNAPSHOT_VERSION,
  SELLER_STOCKS_REPORT_SNAPSHOT_VERSION,
  type SellerAdCampaignRow,
  type SellerCatalogItem,
  type SellerCatalogSnapshot,
  type SellerHubConnection,
  type SellerHubMarketplaceId,
} from "@/lib/seller-hub/types";
import { HubAds } from "./hub-ads";
import { HubAnalytics } from "./hub-analytics";
import { HubCatalog } from "./hub-catalog";
import { HubDeliveries } from "./hub-deliveries";
import { HubLogistics } from "./hub-logistics";
import { HubIntegration } from "./hub-integration";
import { HubCalcVerification } from "./hub-calc-verification";
import { HubOrders } from "./hub-orders";
import { HubFulfillment } from "./hub-fulfillment";
import { HubOverview } from "./hub-overview";
import { HubEvents } from "./hub-events";
import { HubTasks } from "./hub-tasks";
import { HubPrices } from "./hub-prices";
import { HubPromotions } from "./hub-promotions";
import { HubStocks } from "./hub-stocks";
import { HubFinance } from "./hub-finance";
import { HubAgents } from "./hub-agents";
import { HubKnowledge } from "./hub-knowledge";
import { HubAssistant } from "./hub-assistant";
import {
  formatInt,
  formatSyncTime,
  hub,
  HubBadge,
  HubButton,
  HubPanel,
  hubSans,
  hubSerif,
  hubType,
} from "./hub-ui";
import { HUB_RAIL_COLLAPSED, HUB_RAIL_EXPANDED, HubSidebar } from "./hub-sidebar";

function emptyConnection(marketplaceId: SellerHubMarketplaceId): SellerHubConnection {
  return { marketplaceId, apiKey: "", status: "idle" };
}

export function SellerHubApp() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantExpanded, setAssistantExpanded] = useState(false);
  const [catalogView, setCatalogView] = useState<"matrix" | "stocks">("matrix");
  const [assistantSeed, setAssistantSeed] = useState<string | null>(null);
  const [priceFocusId, setPriceFocusId] = useState<string | null>(null);

  const [area, setArea] = useState<SellerHubAreaId>("overview");
  const [marketplace, setMarketplace] = useState<SellerHubMarketplaceId>("wildberries");
  const [connection, setConnection] = useState<SellerHubConnection>(() =>
    emptyConnection("wildberries")
  );
  /** Черновик WB-токена только в UI; в localStorage не пишется. */
  const [wbTokenDraft, setWbTokenDraft] = useState("");
  const [snapshot, setSnapshot] = useState<SellerCatalogSnapshot | undefined>();

  const [verifying, setVerifying] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [events, setEvents] = useState<SellerProductEvent[]>([]);
  const [eventsReady, setEventsReady] = useState(false);
  const [eventsError, setEventsError] = useState(false);
  const [eventsAttempt, setEventsAttempt] = useState(0);
  /**
   * Кто считает задачи и события: background — сервер по расписанию (браузер только читает), browser — как раньше.
   * Пока режим неизвестен, браузер ничего не пересчитывает: иначе его устаревший снимок мог бы затереть расчёт сервера.
   */
  const [syncMode, setSyncMode] = useState<"unknown" | "browser" | "background">("unknown");
  /** Раздел закрыт для этого аккаунта (пока он не готов для всех, см. lib/seller-hub/access.ts). */
  const [accessClosed, setAccessClosed] = useState(false);
  /** Когда человек последний раз менял кабинет из интерфейса (по часам сервера). Снимок, прочитанный раньше, не показываем: он вернул бы старое значение. */
  const lastLocalChangeAt = useRef(0);
  /** Расхождение часов сервера и браузера, мс. */
  const clockSkew = useRef(0);
  const serverVersion = useRef("");
  const [dataAge, setDataAge] = useState<{ baseLoadedAt: string | null; lastActivityAt: string | null } | null>(null);
  const markLocalChange = useCallback(() => {
    lastLocalChangeAt.current = Date.now() + clockSkew.current;
  }, []);
  const eventsRequest = useRef(0);
  /** Ключ запроса статистики рекламы в полёте или упавшего; загруженного ключа здесь нет. */
  const adsStatsKey = useRef<string | null>(null);
  const adsStatsLoadedKey = useRef<string | null>(null);
  const adsStatsFailures = useRef(0);
  const adsPrevKey = useRef<string | null>(null);
  const blockedKey = useRef<string | null>(null);
  const [adsStatsAttempt, setAdsStatsAttempt] = useState(0);

  const hydrate = useCallback((uid: string, mp: SellerHubMarketplaceId) => {
    const root = readSellerHubRoot(uid);
    setConnection(root.connections[mp] ?? emptyConnection(mp));
    setSnapshot(root.catalogs[mp]);
  }, []);

  /**
   * Себестоимость: источник — seller_hub_cost_history.
   * localStorage только кэш каталога; после очистки LS подтягиваем с сервера.
   * Локальные сироты (были только в кэше) один раз пишем в history.
   */
  const mergeCostsFromServer = useCallback(
    async (uid: string, current: SellerCatalogSnapshot): Promise<SellerCatalogSnapshot> => {
      const remote = await fetchSellerHubCostPrices(current.marketplaceId ?? "wildberries");
      const costs = costMapFromRecord(remote.costs);
      const orphans = localOnlyCostEntries(current.items, costs);
      for (const row of orphans) {
        const saved = await saveSellerHubCostPrice({
          nmId: row.nmId,
          costPrice: row.costPrice,
          marketplaceId: current.marketplaceId ?? "wildberries",
        });
        if (saved.ok) costs.set(row.nmId, row.costPrice);
      }
      const next = applyCostPricesToSnapshot(current, costs);
      saveSellerHubCatalog(uid, next);
      return next;
    },
    [],
  );

  const migrateLocalWbToken = useCallback(async (uid: string) => {
    const root = readSellerHubRoot(uid);
    const local = root.connections.wildberries;
    const localToken = local?.apiKey?.trim() ?? "";
    if (!localToken) {
      const status = await loadSellerHubWbConnectionStatus();
      if (status.ok && status.connected && local && local.status !== "active") {
        const next = {
          ...local,
          status: "active" as const,
          verifiedAt: local.verifiedAt ?? new Date().toISOString(),
          apiKey: "",
        };
        patchSellerHubConnection(uid, "wildberries", next);
        setConnection(next);
      }
      return;
    }
    const result = await manageSellerHubWbConnection({ action: "migrate", apiKey: localToken });
    if (!result.ok || !shouldClearLocalApiKeyAfterMigrate(result)) {
      setError(
        result.error ??
          "Не удалось подтвердить серверное подключение. Локальный токен сохранён. Если нужен другой ключ — замените токен явно.",
      );
      return;
    }
    const cleared = localRootAfterWbMigration(root, result);
    const wb = cleared.connections.wildberries;
    if (wb) {
      const next = {
        ...wb,
        apiKey: "",
        status: "active" as const,
        verifiedAt: result.verifiedAt ?? wb.verifiedAt ?? new Date().toISOString(),
        sellerName: result.sellerName ?? wb.sellerName,
        scopes: result.scopes ?? wb.scopes,
        lastError: undefined,
      };
      patchSellerHubConnection(uid, "wildberries", next);
      setConnection(next);
      setWbTokenDraft("");
      setNotice(
        result.alreadyStored
          ? "Кабинет на сервере проверен. Локальный токен убран. Если нужен другой ключ — замените токен явно."
          : "Токен перенесён на сервер и убран из браузера.",
      );
    }
  }, []);

  // WB не отдаёт порог входа в автоакции через API, поэтому запоминаем цены, при
  // которых товары фактически участвуют в акциях: по ним возврат в акцию считается
  // точно и без ручного ввода.
  useEffect(() => {
    if (!snapshot?.items?.length) return;
    const trusted = new Set(
      (snapshot.promotions ?? []).filter((p) => p.type !== "auto").map((p) => p.id)
    );
    recordPromoObservations(snapshot.items, trusted);
  }, [snapshot]);

  useEffect(() => {
    const supabase = createBrowserClient();
    void supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id ?? null;
      setUserId(uid);
      setAuthReady(true);
      if (!uid) return;
      const root = readSellerHubRoot(uid);
      setMarketplace("wildberries");
      const stored = String(root.activeArea);
      if (stored === "journal") setArea("agents");
      else if (stored === "stocks") {
        setCatalogView("stocks");
        setArea("catalog");
      } else setArea(root.activeArea);
      hydrate(uid, "wildberries");
      void migrateLocalWbToken(uid);
      const cached = readSellerHubRoot(uid).catalogs.wildberries;
      if (cached?.items?.length) {
        void mergeCostsFromServer(uid, cached).then((next) => {
          setSnapshot(next);
        });
      }
    });
  }, [hydrate, mergeCostsFromServer, migrateLocalWbToken]);

  const changeArea = (next: SellerHubAreaId) => {
    if (next === "stocks") {
      setCatalogView("stocks");
      setArea("catalog");
      setMobileNavOpen(false);
      if (userId) setSellerHubActiveArea(userId, "catalog");
      return;
    }
    if (next === "catalog") setCatalogView("matrix");
    setArea(next);
    setMobileNavOpen(false);
    if (userId) setSellerHubActiveArea(userId, next);
  };

  const persistConnection = (patch: Partial<SellerHubConnection>) => {
    const merged = { ...connection, ...patch };
    const next = stripWbApiKeyForPersist(marketplace, merged);
    setConnection(next);
    if (userId) {
      patchSellerHubConnection(userId, marketplace, next);
      hydrate(userId, marketplace);
    }
  };

  const handleVerify = async (mode: "connect" | "replace" | "recheck" = "connect") => {
    if (!userId) {
      setError("Войдите в аккаунт KARTO, чтобы подключить кабинет.");
      return;
    }
    setError(null);
    setNotice(null);
    setVerifying(true);
    try {
      const draftKey =
        marketplace === "wildberries" ? wbTokenDraft.trim() : connection.apiKey.trim();
      const wbMode =
        marketplace === "wildberries"
          ? mode === "recheck"
            ? "recheck"
            : mode === "replace" || (connection.status === "active" && connection.verifiedAt)
              ? "replace"
              : "connect"
          : undefined;
      if (marketplace === "wildberries" && wbMode !== "recheck" && !draftKey) {
        setError("Укажите API-токен Wildberries");
        return;
      }
      const result = await verifySellerHubConnection({
        marketplaceId: marketplace,
        apiKey: draftKey || undefined,
        clientId: connection.clientId,
        campaignId: connection.campaignId,
        businessId: connection.businessId,
        wbMode,
      });

      if (!result.ok) {
        if (marketplace !== "wildberries") {
          persistConnection({ status: "error", lastError: result.error, scopes: result.scopes });
        }
        setError(result.error ?? "Не удалось проверить подключение.");
        return;
      }

      persistConnection({
        status: "active",
        verifiedAt: result.verifiedAt,
        sellerName: result.sellerName,
        businessId: result.businessId ?? connection.businessId,
        campaignId: result.campaignId ?? connection.campaignId,
        scopes: result.scopes,
        lastError: undefined,
        ...(marketplace === "wildberries" ? { apiKey: "" } : {}),
      });
      if (marketplace === "wildberries") setWbTokenDraft("");

      setNotice(
        result.totalCards != null
          ? `Подключение подтверждено. В кабинете найдено ${formatInt(result.totalCards)} карточек — можно выгружать.`
          : result.sampleCount != null
            ? `Подключение подтверждено. Пробный запрос вернул ${formatInt(result.sampleCount)} позиций.`
            : "Подключение подтверждено."
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка проверки подключения.";
      if (marketplace !== "wildberries") persistConnection({ status: "error", lastError: msg });
      setError(msg);
    } finally {
      setVerifying(false);
    }
  };

  const handleSync = async () => {
    if (!userId) {
      setError("Войдите в аккаунт KARTO.");
      return;
    }
    if (connection.status !== "active") {
      setError("Сначала проверьте подключение в разделе «Кабинет и API».");
      changeArea("integration");
      return;
    }
    setError(null);
    setNotice(null);
    if (syncMode === "background") {
      setSyncing(true);
      try {
        // С чем сравнивать: что лежит на сервере прямо сейчас (а не то, что мы успели показать).
        const current = await loadServerVersion();
        const before = current.ok ? (current.loadedAt.base ?? null) : (dataAge?.baseLoadedAt ?? null);
        const requested = await requestServerRefresh();
        if (!requested.ok) {
          setError("Не удалось попросить сервер обновить данные. Попробуйте ещё раз.");
          return;
        }
        setNotice("Сервер читает кабинет: обычно это занимает около минуты. Кнопка нужна, только чтобы не ждать плановое обновление, оно идёт само.");
        // Читает воркер по своей очереди (учитывая лимиты WB): ждём, пока появится более свежий снимок.
        const deadline = Date.now() + 120_000;
        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 4_000));
          // Ждём лёгкой проверкой версии; сам снимок скачиваем один раз, когда он действительно обновился.
          const version = await loadServerVersion();
          if (!version.ok) continue;
          const base = version.loadedAt.base ?? null;
          if (base && base !== before) {
            const loaded = await loadServerSnapshot();
            if (!loaded.ok) continue;
            applyServerSnapshot(loaded.data, true);
            setNotice("Данные обновлены.");
            return;
          }
        }
        // Объясняем причину честно: что записал сам воркер, а не просто «не обновилось».
        const state = await loadServerVersion();
        const lastGood = state.ok ? (state.loadedAt.base ?? null) : null;
        const age = describeDataAge(lastGood ?? dataAge?.baseLoadedAt ?? snapshot?.syncedAt, Date.now());
        const reason = state.ok ? state.errors.base : undefined;
        setError(
          reason
            ? `Сервер пробует обновить данные, но пока не получилось: ${reason} Последнее удачное обновление: ${age.label}. Он повторит попытку сам.`
            : `Сервер пока не успел обновить данные (последнее обновление: ${age.label}). Фоновый сбор мог быть остановлен.`,
        );
      } finally {
        setSyncing(false);
      }
      return;
    }
    setSyncing(true);
    try {
      const result = await syncSellerHubCatalog({
        marketplaceId: marketplace,
        apiKey: marketplace === "wildberries" ? undefined : connection.apiKey,
        clientId: connection.clientId,
        campaignId: connection.campaignId,
        businessId: connection.businessId,
        categoryCharcCache: snapshot?.categoryCharcCache,
      });

      if (!result.ok || !result.snapshot) {
        setError(result.error ?? "Не удалось выгрузить каталог.");
        return;
      }

      if (snapshot?.realization && !snapshot.realization.error) {
        result.snapshot.realization = snapshot.realization;
      }
      if (snapshot?.funnel && !snapshot.funnel.error) {
        result.snapshot.funnel = snapshot.funnel;
      }
      /** Остатки и платное хранение грузятся эффектами после sync — не затираем снимок. */
      if (snapshot?.stocksReport && !snapshot.stocksReport.error) {
        result.snapshot.stocksReport = snapshot.stocksReport;
      }
      if (snapshot?.paidStorage && !snapshot.paidStorage.error) {
        result.snapshot.paidStorage = snapshot.paidStorage;
      }

      // Себестоимость с сервера (не из предыдущего localStorage).
      const withCosts = await mergeCostsFromServer(userId, result.snapshot);
      setSnapshot(withCosts);
      persistConnection({
        catalogCount: result.snapshot.totalCount,
        lastSyncAt: result.snapshot.syncedAt,
        scopes: { ...connection.scopes, ...result.snapshot.scopes },
      });
      setNotice(`Каталог обновлён: ${formatInt(result.snapshot.totalCount)} SKU.`);
      if (area === "integration") changeArea("catalog");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка выгрузки каталога.");
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = () => {
    if (!userId) return;
    void (async () => {
      setError(null);
      if (marketplace === "wildberries") {
        const result = await manageSellerHubWbConnection({ action: "disconnect" });
        if (!result.ok) {
          setError(result.error ?? "Не удалось отключить кабинет на сервере.");
          return;
        }
        persistConnection({
          apiKey: "",
          status: "idle",
          verifiedAt: undefined,
          sellerName: undefined,
          lastError: undefined,
          scopes: undefined,
        });
        setWbTokenDraft("");
        setNotice("Площадка отключена. Каталог и закупка в Seller Hub сохранены. Данные в кабинете WB не менялись.");
        return;
      }
      const root = readSellerHubRoot(userId);
      delete root.connections[marketplace];
      delete root.catalogs[marketplace];
      writeSellerHubRoot(userId, root);
      setConnection(emptyConnection(marketplace));
      setSnapshot(undefined);
      setNotice("Площадка отключена. Данные кабинета в маркетплейсе не изменились.");
      hydrate(userId, marketplace);
    })();
  };

  /** Merges updated catalog items into the current snapshot and persists to localStorage. */
  const handleRealization = useCallback(
    (realization: NonNullable<SellerCatalogSnapshot["realization"]>) => {
      setSnapshot((current) => {
        if (!current) return current;
        const merged = mergeRealizationKeepPrevious(current.realization, realization);
        const next: SellerCatalogSnapshot = { ...current, realization: merged };
        if (userId) saveSellerHubCatalog(userId, next);
        return next;
      });
    },
    [userId],
  );

  const handleFunnel = useCallback(
    (funnel: NonNullable<SellerCatalogSnapshot["funnel"]>) => {
      setSnapshot((current) => {
        if (!current) return current;
        const merged = mergeFunnelKeepPrevious(current.funnel, funnel);
        const next: SellerCatalogSnapshot = { ...current, funnel: merged };
        if (userId) saveSellerHubCatalog(userId, next);
        return next;
      });
    },
    [userId],
  );

  const handleFeedbacks = useCallback(
    (feedbacks: SellerFeedbacksSnapshot) => {
      setSnapshot((current) => {
        if (!current) return current;
        const next: SellerCatalogSnapshot = { ...current, feedbacks };
        if (userId) saveSellerHubCatalog(userId, next);
        return next;
      });
    },
    [userId],
  );

  const handleStocksReport = useCallback(
    (stocksReport: NonNullable<SellerCatalogSnapshot["stocksReport"]>) => {
      setSnapshot((current) => {
        if (!current) return current;
        const merged = mergeStocksReportKeepPrevious(current.stocksReport, stocksReport);
        const next: SellerCatalogSnapshot = { ...current, stocksReport: merged };
        if (userId) saveSellerHubCatalog(userId, next);
        return next;
      });
    },
    [userId],
  );

  const handlePaidStorage = useCallback(
    (paidStorage: NonNullable<SellerCatalogSnapshot["paidStorage"]>) => {
      setSnapshot((current) => {
        if (!current) return current;
        const merged = mergePaidStorageKeepPrevious(current.paidStorage, paidStorage);
        const next: SellerCatalogSnapshot = { ...current, paidStorage: merged };
        if (userId) saveSellerHubCatalog(userId, next);
        return next;
      });
    },
    [userId],
  );

  const handleSnapshotItemsUpdate = useCallback(
    (updatedItems: SellerCatalogItem[]) => {
      markLocalChange();
      setSnapshot((current) => {
        if (!current) return current;
        const next: SellerCatalogSnapshot = { ...current, items: updatedItems };
        if (userId) saveSellerHubCatalog(userId, next);
        return next;
      });
    },
    [userId, markLocalChange],
  );

  /** Merges updated ad campaigns into the current snapshot. */
  const handleSnapshotAdsUpdate = useCallback(
    (updatedCampaigns: SellerAdCampaignRow[]) => {
      if (!snapshot?.ads) return;
      markLocalChange();
      const activeCount = updatedCampaigns.filter((c) => c.status === 9).length;
      const pausedCount = updatedCampaigns.filter((c) => c.status === 4 || c.status === 11).length;
      const next: SellerCatalogSnapshot = {
        ...snapshot,
        ads: { ...snapshot.ads, campaigns: updatedCampaigns, activeCount, pausedCount },
      };
      setSnapshot(next);
      if (userId) saveSellerHubCatalog(userId, next);
    },
    [snapshot, userId, markLocalChange]
  );

  /**
   * Применяет серверный снимок (фоновый режим). Не применяет, если данные те же или прочитаны раньше последнего действия человека.
   * Возвращает true, если показанные данные заменены.
   */
  const applyServerSnapshot = useCallback(
    (data: ServerSnapshot, force = false): boolean => {
      if (data.serverNow != null) clockSkew.current = data.serverNow - Date.now();
      setDataAge({ baseLoadedAt: data.loadedAt.base ?? null, lastActivityAt: data.lastActivityAt });
      const version = serverSnapshotVersion(data.loadedAt);
      if (!force && version === serverVersion.current) return false;
      if (!shouldApplyServerSnapshot({ baseLoadedAt: data.loadedAt.base, lastLocalChangeAt: lastLocalChangeAt.current })) return false;
      serverVersion.current = version;
      setSnapshot(data.snapshot);
      if (userId) saveSellerHubCatalog(userId, data.snapshot);
      return true;
    },
    [userId],
  );

  const meta = sellerHubArea(canonicalArea(area) === "orders" ? "orders" : area);
  const isConnected = connection.status === "active" && Boolean(connection.verifiedAt);
  const visibleSnapshot = isConnected ? snapshot : undefined;

  const refreshEvents = useCallback(() => {
    setEventsAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    if (!userId) {
      setSyncMode("unknown");
      return;
    }
    let cancelled = false;
    void autoRepliesAuthorizedFetch("/api/seller-hub/sync/status?marketplaceId=wildberries", { method: "GET", timeoutMs: 15_000 })
      .then(async (res) => {
        if (res.status === 403) {
          if (!cancelled) setAccessClosed(true);
          return;
        }
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; backgroundEnabled?: boolean };
        const background = res.ok && data.ok === true && data.backgroundEnabled === true;
        setBrowserTaskReconcile(!background);
        setBrowserEventsReadOnly(background);
        if (!cancelled) setSyncMode(background ? "background" : "browser");
      })
      .catch(() => {
        // Статус неизвестен: работаем по-старому, как до фонового сбора.
        setBrowserTaskReconcile(true);
        setBrowserEventsReadOnly(false);
        if (!cancelled) setSyncMode("browser");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !visibleSnapshot) {
      setEvents([]);
      setEventsReady(true);
      setEventsError(false);
      return;
    }
    if (syncMode === "unknown") return;
    const requestId = ++eventsRequest.current;
    const snapshot = visibleSnapshot;
    let cancelled = false;
    void (async () => {
      try {
        const remote = await reconcileSellerHubEventsRemote(snapshot);
        if (cancelled || requestId !== eventsRequest.current) return;
        if (remote.ok) {
          setEvents(remote.events);
          setEventsError(false);
          return;
        }
        setEvents(reconcileSellerHubEvents(userId, snapshot));
        setEventsError(false);
      } catch {
        if (cancelled || requestId !== eventsRequest.current) return;
        try {
          setEvents(reconcileSellerHubEvents(userId, snapshot));
          setEventsError(false);
        } catch {
          setEventsError(true);
        }
      } finally {
        if (!cancelled && requestId === eventsRequest.current) setEventsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, visibleSnapshot, eventsAttempt, syncMode]);

  useEffect(() => {
    if (!userId || !visibleSnapshot || syncMode === "unknown") return;
    void reconcileSellerHubTasksRemote(visibleSnapshot).catch(() => undefined);
  }, [userId, visibleSnapshot, syncMode]);

  /** Realization нужен task-engine для дней запаса / OOS; без Каталога раньше не грузился. */
  useEffect(() => {
    // Фоновый режим: эти данные читает сервер и отдаёт готовым снимком, браузер WB для них не вызывает.
    if (syncMode !== "browser") return;
    if (!userId || connection.status !== "active" || !Boolean(connection.verifiedAt)) return;
    if (!snapshot?.items.length) return;
    const realization = snapshot.realization;
    if (!realizationNeedsReload(realization, snapshot.syncedAt)) return;
    let cancelled = false;
    void loadSellerHubRealization().then((result) => {
      if (cancelled) return;
      if (result.realization) {
        handleRealization(result.realization);
        return;
      }
      if (!result.error) return;
      handleRealization({
        loadedAt: new Date().toISOString(),
        dateFrom: "",
        dateTo: "",
        accountRetail: 0,
        accountNet: 0,
        byNm: {},
        error: result.error,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    userId,
    connection.status,
    connection.verifiedAt,
    snapshot?.items.length,
    snapshot?.realization,
    snapshot?.syncedAt,
    handleRealization,
    syncMode,
  ]);

  /**
   * Статистика рекламы за 7 полных дней для задач по рекламе. Тот же запрос, что на вкладке «Продвижение»
   * (одинаковые кампании и даты), поэтому WB второй раз не спрашивается: ответ берётся из серверного кэша.
   * Лимит WB на статистику строгий, поэтому ошибку повторяем не чаще раза в 90 секунд и не больше двух раз.
   */
  useEffect(() => {
    // Фоновый режим: эти данные читает сервер и отдаёт готовым снимком, браузер WB для них не вызывает.
    if (syncMode !== "browser") return;
    if (!userId || connection.status !== "active" || !connection.verifiedAt) return;
    const campaigns = snapshot?.ads?.campaigns;
    if (!campaigns || !snapshot?.syncedAt) return;
    const ids = campaigns
      .filter((c) => c.status != null && AD_STATS_STATUSES.has(c.status))
      .map((c) => Number(c.id))
      .filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length === 0) return;
    const range = lastFullDaysRange(snapshotTimeMs({ syncedAt: snapshot.syncedAt }), 7);
    const key = `${ids.join(",")}|${range.dateFrom}|${range.dateTo}`;
    // Уже загружено для этих кампаний и дат (после выгрузки каталога статистика из снимка пропадает: тогда грузим снова).
    if (snapshot.adsStats && adsStatsLoadedKey.current === key) return;
    if (adsStatsKey.current === key) return;
    adsStatsKey.current = key;
    // Ответ принимаем, пока этот запрос ещё актуален (ключ не сменился), даже если эффект перезапускался из-за других зависимостей.
    void loadSellerHubAdsStats({ campaignIds: ids, ...range })
      .then((result) => {
        if (adsStatsKey.current !== key) return;
        if (result.ok && result.stats) {
          adsStatsFailures.current = 0;
          adsStatsLoadedKey.current = key;
          adsStatsKey.current = null;
          setSnapshot((current) => (current ? { ...current, adsStats: result.stats } : current));
          return;
        }
        throw new Error(result.error ?? "ads stats");
      })
      .catch(() => {
        if (adsStatsKey.current !== key || adsStatsFailures.current >= 2) return;
        adsStatsFailures.current += 1;
        setTimeout(() => {
          if (adsStatsKey.current !== key) return;
          adsStatsKey.current = null;
          setAdsStatsAttempt((n) => n + 1);
        }, 90_000);
      });
  }, [
    userId,
    connection.status,
    connection.verifiedAt,
    snapshot?.ads?.campaigns,
    snapshot?.syncedAt,
    snapshot?.adsStats,
    adsStatsAttempt,
    syncMode,
  ]);

  /**
   * Фоновый режим: данные берём готовыми с сервера, WB из браузера не вызываем. Обновляем раз в минуту и когда вкладку снова открыли.
   * Это только чтение нашей базы, лимиты WB не расходуются.
   */
  useEffect(() => {
    if (!userId || syncMode !== "background" || connection.status !== "active" || !connection.verifiedAt) return;
    let cancelled = false;
    const load = async () => {
      // Сначала лёгкая проверка версии: полный снимок качаем, только если воркер прочитал что-то новое.
      const version = await loadServerVersion();
      if (cancelled) return;
      if (version.ok && serverSnapshotVersion(version.loadedAt) === serverVersion.current) return;
      const result = await loadServerSnapshot();
      if (cancelled) return;
      if (result.ok) {
        applyServerSnapshot(result.data);
        return;
      }
      if (result.reason === "no_snapshot") setNotice("Фоновый сбор ещё не прочитал кабинет: данные появятся в течение минуты.");
    };
    void load();
    const timer = setInterval(() => void load(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, syncMode, connection.status, connection.verifiedAt, applyServerSnapshot]);

  /**
   * Предыдущие 7 дней рекламы для тренда («реклама подорожала»). Грузим только после текущей недели: у WB жёсткий лимит
   * на статистику. Не вышло — тренд просто не считается, остальные рекламные задачи работают.
   */
  useEffect(() => {
    // Фоновый режим: эти данные читает сервер и отдаёт готовым снимком, браузер WB для них не вызывает.
    if (syncMode !== "browser") return;
    if (!userId || connection.status !== "active" || !connection.verifiedAt) return;
    const current = snapshot?.adsStats;
    const campaigns = snapshot?.ads?.campaigns;
    if (!current || !campaigns) return;
    const ids = campaigns
      .filter((c) => c.status != null && AD_STATS_STATUSES.has(c.status))
      .map((c) => Number(c.id))
      .filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length === 0) return;
    const shift = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
    const range = { dateFrom: shift(current.dateFrom), dateTo: shift(current.dateTo) };
    const key = `${ids.join(",")}|${range.dateFrom}|${range.dateTo}`;
    if (snapshot.adsStatsPrev?.dateFrom === range.dateFrom && snapshot.adsStatsPrev?.dateTo === range.dateTo) return;
    if (adsPrevKey.current === key) return;
    adsPrevKey.current = key;
    void loadSellerHubAdsStats({ campaignIds: ids, ...range })
      .then((result) => {
        if (adsPrevKey.current !== key || !result.ok || !result.stats) return;
        adsPrevKey.current = null;
        setSnapshot((now) => (now ? { ...now, adsStatsPrev: result.stats } : now));
      })
      .catch(() => {
        // Лимит WB: попробуем снова при следующей выгрузке каталога.
        if (adsPrevKey.current === key) adsPrevKey.current = null;
      });
  }, [userId, connection.status, connection.verifiedAt, snapshot?.adsStats, snapshot?.ads?.campaigns, snapshot?.adsStatsPrev, syncMode]);

  /** Заблокированные WB карточки для событий «заблокирована / разблокирована». После выгрузки каталога читаем заново. */
  useEffect(() => {
    // Фоновый режим: эти данные читает сервер и отдаёт готовым снимком, браузер WB для них не вызывает.
    if (syncMode !== "browser") return;
    if (!userId || connection.status !== "active" || !connection.verifiedAt) return;
    if (!snapshot?.items.length || snapshot.blockedCards) return;
    const key = snapshot.syncedAt;
    if (blockedKey.current === key) return;
    blockedKey.current = key;
    void loadSellerHubBlockedCards()
      .then((result) => {
        if (blockedKey.current !== key || !result.ok || !result.blocked) return;
        setSnapshot((now) => (now ? { ...now, blockedCards: result.blocked } : now));
      })
      .catch(() => {
        if (blockedKey.current === key) blockedKey.current = null;
      });
  }, [userId, connection.status, connection.verifiedAt, snapshot?.items.length, snapshot?.syncedAt, snapshot?.blockedCards, syncMode]);

  /** Воронка заказов для задач по спросу; тот же клиент, что Каталог/Акции. */
  useEffect(() => {
    // Фоновый режим: эти данные читает сервер и отдаёт готовым снимком, браузер WB для них не вызывает.
    if (syncMode !== "browser") return;
    if (!userId || connection.status !== "active" || !Boolean(connection.verifiedAt)) return;
    if (!snapshot?.items.length) return;
    const funnel = snapshot.funnel;
    if (!funnelNeedsReload(funnel, snapshot.syncedAt)) return;
    if (
      funnel?.status === "jam_required" ||
      funnel?.status === "forbidden" ||
      funnel?.status === "rate_limited"
    ) {
      return;
    }
    let cancelled = false;
    void loadSellerHubFunnel().then((result) => {
      if (cancelled) return;
      if (result.funnel) {
        handleFunnel(result.funnel);
        return;
      }
      if (!result.error) return;
      handleFunnel({
        loadedAt: new Date().toISOString(),
        version: SELLER_FUNNEL_SNAPSHOT_VERSION,
        dateFrom: "",
        dateTo: "",
        status: "error",
        byNm: {},
        error: result.error,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    userId,
    connection.status,
    connection.verifiedAt,
    snapshot?.items.length,
    snapshot?.funnel,
    snapshot?.syncedAt,
    handleFunnel,
    syncMode,
  ]);

  /** Отзывы/вопросы — лёгкая загрузка, не чаще раза в час. */
  useEffect(() => {
    // Фоновый режим: эти данные читает сервер и отдаёт готовым снимком, браузер WB для них не вызывает.
    if (syncMode !== "browser") return;
    if (!userId || connection.status !== "active" || !Boolean(connection.verifiedAt)) return;
    if (!snapshot?.items.length) return;
    const feedbacks = snapshot.feedbacks;
    if (!feedbacksNeedsReload(feedbacks, snapshot.syncedAt)) return;
    const wbFeedbackRatingByNm: Record<string, number | null> = {};
    for (const [nmId, row] of Object.entries(snapshot.funnel?.byNm ?? {})) {
      wbFeedbackRatingByNm[nmId] = row.feedbackRating;
    }
    let cancelled = false;
    void loadSellerHubFeedbacks({
      wbFeedbackRatingByNm:
        Object.keys(wbFeedbackRatingByNm).length > 0 ? wbFeedbackRatingByNm : undefined,
    }).then((result) => {
      if (cancelled) return;
      if (result.feedbacks) {
        handleFeedbacks(
          withFunnelRatingReconcile(
            result.feedbacks,
            Object.keys(wbFeedbackRatingByNm).length > 0 ? wbFeedbackRatingByNm : undefined,
          ),
        );
        return;
      }
      if (!result.error) return;
      handleFeedbacks({
        loadedAt: new Date().toISOString(),
        version: SELLER_FEEDBACKS_SNAPSHOT_VERSION,
        status: "error",
        dateFrom: "",
        dateTo: "",
        byNm: {},
        unansweredPositiveCount: 0,
        unansweredPositiveProductCount: 0,
        ratingMismatches: [],
        error: result.error,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    userId,
    connection.status,
    connection.verifiedAt,
    snapshot?.items.length,
    snapshot?.feedbacks,
    snapshot?.funnel,
    snapshot?.syncedAt,
    handleFeedbacks,
    syncMode,
  ]);

  /** Отчёт по остаткам (в пути, упущенные, availability) — после sync, как воронка. */
  useEffect(() => {
    // Фоновый режим: эти данные читает сервер и отдаёт готовым снимком, браузер WB для них не вызывает.
    if (syncMode !== "browser") return;
    if (!userId || connection.status !== "active" || !Boolean(connection.verifiedAt)) return;
    if (!snapshot?.items.length) return;
    const report = snapshot.stocksReport;
    if (!stocksReportNeedsReload(report, snapshot.syncedAt)) return;
    if (
      report?.status === "jam_required" ||
      report?.status === "forbidden" ||
      report?.status === "rate_limited"
    ) {
      return;
    }
    let cancelled = false;
    void loadSellerHubStocksReport().then((result) => {
      if (cancelled) return;
      if (result.stocksReport) {
        handleStocksReport(result.stocksReport);
        return;
      }
      if (!result.error) return;
      handleStocksReport({
        loadedAt: new Date().toISOString(),
        version: SELLER_STOCKS_REPORT_SNAPSHOT_VERSION,
        dateFrom: "",
        dateTo: "",
        status: "error",
        byNm: {},
        error: result.error,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    userId,
    connection.status,
    connection.verifiedAt,
    snapshot?.items.length,
    snapshot?.stocksReport,
    snapshot?.syncedAt,
    handleStocksReport,
    syncMode,
  ]);

  /** Платное хранение (ставка ₽/шт/день) — после sync, как воронка и остатки. Max 8 дней API. */
  useEffect(() => {
    // Фоновый режим: эти данные читает сервер и отдаёт готовым снимком, браузер WB для них не вызывает.
    if (syncMode !== "browser") return;
    if (!userId || connection.status !== "active" || !Boolean(connection.verifiedAt)) return;
    if (!snapshot?.items.length) return;
    const report = snapshot.paidStorage;
    if (!paidStorageNeedsReload(report, snapshot.syncedAt)) return;
    if (
      report?.status === "payment_required" ||
      report?.status === "jam_required" ||
      report?.status === "forbidden" ||
      report?.status === "rate_limited"
    ) {
      return;
    }
    let cancelled = false;
    const pendingRetry =
      report?.status === "pending" || (report?.pendingChunks?.length ?? 0) > 0;
    const waitMs = pendingRetry ? 8_000 : 0;
    const timer = window.setTimeout(() => {
      void loadSellerHubPaidStorage(report)
        .then((result) => {
          if (cancelled) return;
          if (result.paidStorage) {
            handlePaidStorage(result.paidStorage);
            return;
          }
          handlePaidStorage({
            loadedAt: new Date().toISOString(),
            version: SELLER_PAID_STORAGE_SNAPSHOT_VERSION,
            dateFrom: report?.dateFrom ?? "",
            dateTo: report?.dateTo ?? "",
            status: "error",
            byNm: report?.byNm ?? {},
            lastOkDateFrom: report?.lastOkDateFrom ?? report?.dateFrom,
            lastOkDateTo: report?.lastOkDateTo ?? report?.dateTo,
            lastOkLoadedAt: report?.lastOkLoadedAt ?? report?.loadedAt,
            error: result.error ?? "Отчёт о платном хранении не вернулся с сервера",
          });
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          handlePaidStorage({
            loadedAt: new Date().toISOString(),
            version: SELLER_PAID_STORAGE_SNAPSHOT_VERSION,
            dateFrom: report?.dateFrom ?? "",
            dateTo: report?.dateTo ?? "",
            status: "error",
            byNm: report?.byNm ?? {},
            lastOkDateFrom: report?.lastOkDateFrom ?? report?.dateFrom,
            lastOkDateTo: report?.lastOkDateTo ?? report?.dateTo,
            lastOkLoadedAt: report?.lastOkLoadedAt ?? report?.loadedAt,
            error: error instanceof Error ? error.message : "Ошибка загрузки отчёта о платном хранении",
          });
        });
    }, waitMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    userId,
    connection.status,
    connection.verifiedAt,
    snapshot?.items.length,
    snapshot?.paidStorage,
    snapshot?.syncedAt,
    handlePaidStorage,
    syncMode,
  ]);

  const railWidth = collapsed ? HUB_RAIL_COLLAPSED : HUB_RAIL_EXPANDED;

  const renderContent = () => {
    if (!authReady) {
      return (
        <HubPanel className="flex min-h-[320px] items-center justify-center">
          <span
            className="h-6 w-6 animate-spin rounded-full border-2 border-[#161814]/10 border-t-[#1F4E3D]"
            aria-label="Загрузка"
          />
        </HubPanel>
      );
    }

    if (!userId) {
      return (
        <HubPanel padded className="text-center">
          <p className="text-[16px] font-semibold" style={{ ...hubSans, color: hub.text }}>
            Нужен аккаунт KARTO
          </p>
          <p
            className="mx-auto mt-2 max-w-md text-[14px] leading-[1.65]"
            style={{ ...hubSans, color: hub.textMuted }}
          >
            Seller Hub работает с вашим личным кабинетом маркетплейса — токен и выгрузки
            сохраняются в вашем профиле.
          </p>
          <Link href="/login" className="mt-5 inline-block">
            <HubButton>Войти в KARTO</HubButton>
          </Link>
        </HubPanel>
      );
    }

    if (accessClosed) {
      return (
        <HubPanel padded className="text-center">
          <p className="text-[16px] font-semibold" style={{ ...hubSans, color: hub.text }}>
            Seller Hub пока в разработке
          </p>
          <p className="mx-auto mt-2 max-w-md text-[14px] leading-[1.65]" style={{ ...hubSans, color: hub.textMuted }}>
            Раздел откроется, когда будет готов. Остальные инструменты KARTO работают как обычно.
          </p>
        </HubPanel>
      );
    }

    if (syncMode === "unknown") {
      return (
        <HubPanel className="flex min-h-[320px] items-center justify-center">
          <span
            className="h-6 w-6 animate-spin rounded-full border-2 border-[#161814]/10 border-t-[#1F4E3D]"
            aria-label="Загрузка"
          />
        </HubPanel>
      );
    }

    switch (area) {
      case "overview":
        return (
          <HubOverview
            snapshot={visibleSnapshot}
            connection={connection}
            syncing={syncing}
            onSync={() => void handleSync()}
            onNavigate={changeArea}
            onOpenReviews={() => {
              window.location.href = "/studio/auto-replies/workspace";
            }}
          />
        );
      case "tasks":
        return (
          <HubTasks
            snapshot={visibleSnapshot}
            connected={isConnected}
            events={events}
            onItemsUpdate={handleSnapshotItemsUpdate}
            onOpenPrices={(itemId) => {
              setPriceFocusId(itemId);
              changeArea("prices");
            }}
            onOpenStocks={() => changeArea("stocks")}
            onOpenSupplies={() => changeArea("deliveries")}
            onOpenPromotions={() => changeArea("promotions")}
            onOpenAds={() => changeArea("ads")}
            onOpenReviews={() => {
              window.location.href = "/studio/auto-replies/workspace";
            }}
            onOpenQuestions={() => {
              window.location.href = "/studio/auto-replies/workspace";
            }}
          />
        );
      case "events":
        return (
          <HubEvents
            events={events}
            snapshot={visibleSnapshot}
            loading={!eventsReady}
            error={eventsError}
            onRetry={refreshEvents}
            connected={isConnected}
            onItemsUpdate={handleSnapshotItemsUpdate}
            onOpenPrices={(itemId) => {
              setPriceFocusId(itemId);
              changeArea("prices");
            }}
            onNavigate={(target) => {
              if (target.kind === "reviews") {
                window.location.href = "/studio/auto-replies/workspace";
                return;
              }
              if (target.analyticsTab) {
                try {
                  sessionStorage.setItem(ANALYTICS_TAB_HINT_KEY, target.analyticsTab);
                } catch {
                  // без подсказки откроется вкладка по умолчанию
                }
              }
              changeArea(target.area);
            }}
            onOpenTasks={() => changeArea("tasks")}
          />
        );
      case "catalog":
        return (
          <HubCatalog
            snapshot={visibleSnapshot}
            marketplaceId={marketplace}
            syncing={syncing}
            canSync={isConnected}
            view={catalogView}
            onViewChange={setCatalogView}
            connected={isConnected}
            onItemsUpdate={handleSnapshotItemsUpdate}
            onRealization={syncMode === "background" ? undefined : handleRealization}
            onFunnel={syncMode === "background" ? undefined : handleFunnel}
            onSync={() => void handleSync()}
            onOpenIntegration={() => changeArea("integration")}
            onAsk={(prompt) => {
              setAssistantSeed(prompt);
              setAssistantOpen(true);
            }}
            onOpenPrices={(itemId) => {
              setPriceFocusId(itemId);
              changeArea("prices");
            }}
          />
        );
      case "verification":
        return (
          <HubCalcVerification snapshot={visibleSnapshot ?? null} connected={isConnected} />
        );
      case "integration":
        return (
          <HubIntegration
            connection={connection}
            wbTokenDraft={wbTokenDraft}
            onWbTokenDraftChange={setWbTokenDraft}
            onPatch={persistConnection}
            onVerify={(mode) => void handleVerify(mode)}
            onSync={() => void handleSync()}
            onDisconnect={handleDisconnect}
            verifying={verifying}
            syncing={syncing}
            error={error}
            notice={notice}
          />
        );
      case "prices":
        return (
          <HubPrices
            snapshot={visibleSnapshot}
            connected={isConnected}
            onUpdate={handleSnapshotItemsUpdate}
            focusId={priceFocusId}
            onFocusConsumed={() => setPriceFocusId(null)}
            onAsk={(prompt) => {
              setAssistantSeed(prompt);
              setAssistantOpen(true);
            }}
          />
        );
      case "stocks":
        return (
          <HubStocks
            snapshot={visibleSnapshot}
            connected={isConnected}
            onUpdate={handleSnapshotItemsUpdate}
            onAsk={(prompt) => {
              setAssistantSeed(prompt);
              setAssistantOpen(true);
            }}
          />
        );
      case "promotions":
        return (
          <HubPromotions
            snapshot={visibleSnapshot}
            connected={isConnected}
            catalogItems={snapshot?.items}
            onUpdate={handleSnapshotItemsUpdate}
            onRealization={syncMode === "background" ? undefined : handleRealization}
            onFunnel={syncMode === "background" ? undefined : handleFunnel}
            onAsk={(prompt) => {
              setAssistantSeed(prompt);
              setAssistantOpen(true);
            }}
          />
        );
      case "analytics":
        return <HubAnalytics snapshot={visibleSnapshot} connected={isConnected} />;
      case "orders":
      case "deliveries":
      case "logistics":
        return (
          <HubFulfillment
            tab={area}
            onTab={changeArea}
            snapshot={visibleSnapshot}
            connected={isConnected}
            onOpenAgents={() => {
              try {
                sessionStorage.setItem("karto-hub-agents-tab", "logistics");
              } catch {
                /* хранилище недоступно: откроется вкладка по умолчанию */
              }
              changeArea("agents");
            }}
          >
            {(fulfillment) =>
              area === "orders" ? (
                <HubOrders
                  snapshot={visibleSnapshot}
                  connected={isConnected}
                  onSupplyCreated={(supplyId) => {
                    setNotice(`Поставка ${supplyId} создана и заказы добавлены.`);
                  }}
                />
              ) : area === "deliveries" ? (
                <HubDeliveries snapshot={visibleSnapshot} connected={isConnected} fulfillment={fulfillment} />
              ) : (
                <HubLogistics snapshot={visibleSnapshot} connected={isConnected} />
              )
            }
          </HubFulfillment>
        );
      case "ads":
        return (
          <HubAds
            snapshot={visibleSnapshot}
            connected={isConnected}
            onUpdate={handleSnapshotAdsUpdate}
            onOpenAgents={() => {
              try {
                sessionStorage.setItem("karto-hub-agents-tab", "ads");
              } catch {
                /* хранилище недоступно: откроется вкладка по умолчанию */
              }
              changeArea("agents");
            }}
            promotions={
              <HubPromotions
                snapshot={visibleSnapshot}
                connected={isConnected}
                catalogItems={snapshot?.items}
                onUpdate={handleSnapshotItemsUpdate}
                onRealization={syncMode === "background" ? undefined : handleRealization}
                onFunnel={syncMode === "background" ? undefined : handleFunnel}
                onAsk={(prompt) => {
                  setAssistantSeed(prompt);
                  setAssistantOpen(true);
                }}
              />
            }
          />
        );
      case "finance":
        return <HubFinance snapshot={visibleSnapshot} connected={isConnected} />;
      case "agents":
        return (
          <HubAgents
            snapshot={visibleSnapshot}
            connected={isConnected}
            onAdsUpdate={handleSnapshotAdsUpdate}
            onOpenFulfillment={(tab) => changeArea(tab)}
            onAsk={(prompt) => {
              setAssistantSeed(prompt ?? null);
              setAssistantOpen(true);
            }}
          />
        );
      case "knowledge":
        return <HubKnowledge />;
      default: {
        const exhaustive: never = area;
        return exhaustive;
      }
    }
  };

  return (
    <div
      className="flex h-[100dvh] overflow-hidden [&_a]:text-inherit selection:bg-[#ECF7DB] selection:text-[#161814]"
      style={{ backgroundColor: hub.canvas, color: hub.text, accentColor: "#1F4E3D", ...hubSans }}
    >
      <div
        className="hidden h-full shrink-0 transition-[width] duration-300 lg:block"
        style={{ width: railWidth }}
      >
        <HubSidebar
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((v) => !v)}
          area={canonicalArea(area)}
          onAreaChange={changeArea}
        />
      </div>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button
            type="button"
            aria-label="Закрыть меню"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
          />
          <div className="relative h-full" style={{ width: HUB_RAIL_EXPANDED }}>
            <HubSidebar
              collapsed={false}
              onToggleCollapsed={() => setMobileNavOpen(false)}
              area={canonicalArea(area)}
              onAreaChange={changeArea}
            />
          </div>
        </div>
      ) : null}

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className={`shrink-0 py-3 ${area === "catalog" || area === "promotions" ? "px-2 sm:px-3 lg:px-3" : "px-4 sm:px-6 lg:px-8"}`}
          style={{ backgroundColor: hub.canvas }}
        >
          <div className={`mx-auto flex w-full flex-wrap items-start justify-between gap-4 ${area === "catalog" || area === "promotions" ? "max-w-[1680px]" : "max-w-[1440px]"}`}>
            <div className="flex min-w-0 items-start gap-3">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="mt-0.5 rounded-[10px] p-2 transition-colors hover:bg-[#161814]/[0.05] lg:hidden"
                style={{ color: hub.textMuted }}
                aria-label="Открыть меню"
              >
                {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>

              <div className="min-w-0">
                <h1
                  className={hubType.h1}
                  style={{ ...hubSerif, color: hub.text }}
                >
                  {meta.title}
                </h1>
                {area === "overview" || area === "catalog" || !meta.description ? null : (
                  <p
                    className="mt-1.5 max-w-2xl text-[14px] leading-[1.55]"
                    style={{ color: hub.textSubtle }}
                  >
                    {meta.description}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {isConnected && connection.catalogCount != null ? (
                <HubBadge tone="ok">
                  {syncMode === "background" && snapshot
                    ? `${formatInt(snapshot.totalCount)} SKU · ${formatSyncTime(snapshot.syncedAt)}`
                    : `${formatInt(connection.catalogCount)} SKU · ${formatSyncTime(connection.lastSyncAt)}`}
                </HubBadge>
              ) : null}
              {isConnected && syncMode === "background" && dataAge && describeDataAge(dataAge.baseLoadedAt, Date.now()).stale ? (
                <HubBadge tone="warn" title="Фоновый сбор давно не обновлял кабинет. Данные могут быть неактуальны.">
                  {`Данные от ${describeDataAge(dataAge.baseLoadedAt, Date.now()).label}`}
                </HubBadge>
              ) : null}

              {isConnected ? (
                <HubButton size="sm" variant="secondary" onClick={() => void handleSync()} loading={syncing}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Обновить данные
                </HubButton>
              ) : (
                <HubButton size="sm" variant="secondary" onClick={() => changeArea("integration")}>
                  <Plug className="h-3.5 w-3.5" />
                  Подключить кабинет
                </HubButton>
              )}
            </div>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className={`min-h-0 min-w-0 flex-1 overflow-y-auto pb-24 ${area === "catalog" || area === "promotions" ? "px-2 sm:px-3 lg:px-3" : "px-4 sm:px-6 lg:px-8"} ${area === "overview" || area === "promotions" ? "pt-1" : "py-4 lg:py-5"}`}>
            <div className={`mx-auto w-full space-y-4 pb-4 ${area === "catalog" || area === "promotions" ? "max-w-[1680px]" : "max-w-[1440px]"}`}>
              {error && area !== "integration" ? (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border px-4 py-3"
                  style={{ backgroundColor: hub.dangerSoft, borderColor: "rgba(192,57,43,0.2)" }}
                >
                  <p className="text-[13px] leading-[1.55]" style={{ color: hub.danger }}>
                    {error}
                  </p>
                  <HubButton variant="secondary" size="sm" onClick={() => changeArea("integration")}>
                    Открыть «Кабинет и API»
                  </HubButton>
                </div>
              ) : null}
              <SellerHubSyncModeContext.Provider value={syncMode}>{renderContent()}</SellerHubSyncModeContext.Provider>
            </div>
          </div>
          <HubAssistant
            open={assistantOpen}
            expanded={assistantExpanded}
            onOpenChange={(next) => {
              setAssistantOpen(next);
              if (!next) setAssistantExpanded(false);
            }}
            onExpandedChange={setAssistantExpanded}
            seed={assistantSeed}
            onSeedConsumed={() => setAssistantSeed(null)}
            snapshot={isConnected ? snapshot : undefined}
            connected={isConnected}
          />
        </div>

      </main>
    </div>
  );
}
