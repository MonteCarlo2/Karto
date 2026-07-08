"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { NetworkTimeoutError, withNetworkTimeout } from "@/lib/supabase/network-timeout";
import { fetchUserBrandOnboarding } from "@/lib/brand/user-brand-onboarding-db";
import type { AutoRepliesMarketplaceId, AutoRepliesUsageId } from "@/lib/auto-replies/types";
import {
  AUTO_REPLIES_MARKETPLACE_UI,
  persistAutoRepliesWorkspacePrefs,
  readAutoRepliesWorkspacePrefs,
  readNavigationSession,
  setWorkspacePrefsUserId,
  type WorkspaceAreaId,
  type WorkspaceSettingsNavKey,
} from "@/lib/auto-replies/workspace-prefs";
import {
  bootstrapAutoRepliesFromSupabase,
  deleteAutoReplyShopCompletely,
  disconnectMarketplaceCompletely,
  isAutoRepliesBootstrapComplete,
  setAutoRepliesSyncContext,
} from "@/lib/auto-replies/auto-replies-sync";
import {
  createAutoReplyShop,
  deriveConnectedMarketplacesForShop,
  ensureMainShopNamed,
  getMarketplaceSettings,
  getShopDisplayName,
  getShopSettings,
  listAutoReplyShops,
  patchMarketplaceSettings,
  patchShopSettings,
} from "@/lib/auto-replies/settings-store";
import type {
  AutoRepliesMarketplaceSettings,
  AutoRepliesShopSettings,
} from "@/lib/auto-replies/settings-types";
import {
  WorkspacePanels,
  type WorkspaceNavKey,
} from "@/components/auto-replies/workspace/workspace-panels";
import {
  WorkspaceShell,
  type WorkspaceArea,
} from "@/components/auto-replies/workspace/workspace-shell";
import { WorkspaceSidebar } from "@/components/auto-replies/workspace/workspace-sidebar";
import { WorkspaceSupportChrome } from "@/components/auto-replies/workspace/workspace-support-chrome";
import { WorkspaceInbox, inboxPendingCount } from "@/components/auto-replies/workspace/workspace-inbox";
import { WorkspaceAnalytics } from "@/components/auto-replies/workspace/workspace-analytics";
import { useToast } from "@/components/ui/toast";
import { deriveConnectionDisplay } from "@/lib/auto-replies/marketplace-api-guide";

/** Компактные app-иконки площадок для панели (лежат в `/public/logos`). */
const MARKETPLACE_COMPACT_ICON_SRC: Record<AutoRepliesMarketplaceId, string> = {
  wildberries: "/logos/marketplace-wildberries-app.png",
  ozon: "/logos/marketplace-ozon-app.png",
  yandex: "/logos/marketplace-yandex-market-app.png",
};

const serif = {
  fontFamily:
    "var(--font-auto-replies-serif), var(--font-playfair), Georgia, serif",
} as const;

const sans = {
  fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
} as const;

type NavKey = WorkspaceNavKey;

function readInitialNavigation(): { area: WorkspaceArea; navKey: NavKey } {
  const sessionNav = readNavigationSession();
  const prefs = readAutoRepliesWorkspacePrefs();
  const areaCandidate = sessionNav?.workspaceArea ?? prefs?.workspaceArea;
  const area =
    areaCandidate === "inbox" ||
    areaCandidate === "analytics" ||
    areaCandidate === "integration" ||
    areaCandidate === "settings"
      ? areaCandidate
      : "settings";
  const navCandidate = sessionNav?.settingsNavKey ?? prefs?.settingsNavKey;
  const navKey =
    navCandidate === "overview" ||
    navCandidate === "mode" ||
    navCandidate === "integration" ||
    navCandidate === "style" ||
    navCandidate === "templates" ||
    navCandidate === "training" ||
    navCandidate === "advanced"
      ? navCandidate
      : "mode";
  return { area, navKey };
}

function brandNameFromRow(draftJson: Record<string, unknown> | undefined) {
  if (!draftJson || typeof draftJson !== "object") return null;
  const n = String(draftJson.name ?? "").trim();
  return n.length >= 2 ? n : null;
}

function brandDescriptionFromRow(draftJson: Record<string, unknown> | undefined) {
  if (!draftJson || typeof draftJson !== "object") return null;
  const formatted = String(draftJson.formatted_description ?? "").trim();
  if (formatted.length >= 20) return formatted;
  const raw = String(draftJson.description ?? "").trim();
  return raw.length >= 10 ? raw : null;
}

export default function AutoRepliesWorkspacePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [authReady, setAuthReady] = useState(false);
  const [authBootstrapError, setAuthBootstrapError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userMeta, setUserMeta] = useState<{
    id: string;
    email?: string;
    user_metadata?: { name?: string; full_name?: string };
  } | null>(null);
  const [syncReady, setSyncReady] = useState(false);

  const [brandName, setBrandName] = useState<string | null>(null);
  const [brandDescription, setBrandDescription] = useState<string | null>(null);
  const [brandLoaded, setBrandLoaded] = useState(false);

  const [prefs, setPrefs] = useState(() => ({
    marketplace: null as AutoRepliesMarketplaceId | null,
    connectedMarketplaces: [] as AutoRepliesMarketplaceId[],
    usage: null as AutoRepliesUsageId | null,
  }));

  const [shopsRevision, setShopsRevision] = useState(0);

  const shops = useMemo(() => {
    if (!syncReady) {
      const fallback =
        brandLoaded && brandName !== null ? brandName : brandLoaded ? "Мой магазин" : "…";
      return [{ id: "main", name: fallback }];
    }
    ensureMainShopNamed(brandName);
    return listAutoReplyShops(brandName);
  }, [syncReady, brandLoaded, brandName, shopsRevision]);

  const [selectedShopId, setSelectedShopId] = useState("main");

  const [navKey, setNavKeyState] = useState<NavKey>(() => readInitialNavigation().navKey);
  const [workspaceArea, setWorkspaceAreaState] = useState<WorkspaceArea>(
    () => readInitialNavigation().area
  );
  const [navCollapsed, setNavCollapsed] = useState(false);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistNavigationPrefs = useCallback(
    (patch: { workspaceArea?: WorkspaceAreaId; settingsNavKey?: WorkspaceSettingsNavKey }) => {
      persistAutoRepliesWorkspacePrefs({
        marketplace: prefs.marketplace,
        connectedMarketplaces: prefs.connectedMarketplaces,
        usage: prefs.usage,
        shopId: selectedShopId,
        workspaceArea: patch.workspaceArea,
        settingsNavKey: patch.settingsNavKey,
      });
    },
    [prefs, selectedShopId]
  );

  const setNavKey = useCallback(
    (key: NavKey) => {
      setNavKeyState(key);
      persistNavigationPrefs({ settingsNavKey: key });
    },
    [persistNavigationPrefs]
  );

  const selectWorkspaceArea = useCallback(
    (area: WorkspaceArea) => {
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }

      setWorkspaceAreaState(area);
      persistNavigationPrefs({ workspaceArea: area });

      if (area === "inbox") {
        if (navCollapsed) {
          setNavCollapsed(false);
          collapseTimerRef.current = setTimeout(() => setNavCollapsed(true), 520);
        } else {
          collapseTimerRef.current = setTimeout(() => setNavCollapsed(true), 180);
        }
      } else {
        setNavCollapsed(false);
      }
    },
    [navCollapsed, persistNavigationPrefs]
  );

  useEffect(
    () => () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (navKey === "activity") setNavKey("mode");
  }, [navKey]);

  const [shopSettings, setShopSettings] = useState<AutoRepliesShopSettings | null>(null);
  const [mpSettings, setMpSettings] = useState<AutoRepliesMarketplaceSettings | null>(null);
  const [liveInboxPending, setLiveInboxPending] = useState<number | null>(null);
  const [repliesRemaining, setRepliesRemaining] = useState<number | null>(null);
  const [welcomeRemaining, setWelcomeRemaining] = useState<number | null>(null);
  const [paidRemaining, setPaidRemaining] = useState<number | null>(null);
  const [repliesPeriodEnd, setRepliesPeriodEnd] = useState<string | null>(null);
  const [removingIntegration, setRemovingIntegration] = useState(false);
  const [deletingShopId, setDeletingShopId] = useState<string | null>(null);

  const activeMarketplace = prefs.marketplace ?? prefs.connectedMarketplaces[0] ?? "wildberries";

  const reloadSettings = useCallback((shopId: string, mp: AutoRepliesMarketplaceId) => {
    setShopSettings(getShopSettings(shopId));
    const mpCfg = getMarketplaceSettings(shopId, mp, "manual");
    setMpSettings(mpCfg);
    return mpCfg;
  }, []);

  /** Локально меняем режим — сохраняем в store и sessionStorage. */
  const setUsageLocal = useCallback(
    (u: AutoRepliesUsageId) => {
      const nextMp = patchMarketplaceSettings(selectedShopId, activeMarketplace, { usage: u }, u);
      setMpSettings(nextMp);
      setPrefs((p) => {
        const next = { ...p, usage: u };
        persistAutoRepliesWorkspacePrefs({
          marketplace: next.marketplace,
          connectedMarketplaces: next.connectedMarketplaces,
          usage: next.usage,
          shopId: selectedShopId,
        });
        return next;
      });
    },
    [activeMarketplace, selectedShopId]
  );

  const navigateConnectMarketplace = useCallback(
    (id: AutoRepliesMarketplaceId) => {
      persistAutoRepliesWorkspacePrefs({
        marketplace: prefs.marketplace,
        connectedMarketplaces: prefs.connectedMarketplaces,
        usage: prefs.usage,
        shopId: selectedShopId,
      });
      router.push(`/studio/auto-replies?connect=${encodeURIComponent(id)}&add=1`);
    },
    [router, selectedShopId, prefs]
  );

  const selectActiveMarketplace = useCallback(
    (id: AutoRepliesMarketplaceId) => {
      const mpCfg = reloadSettings(selectedShopId, id);
      setPrefs((p) => {
        const next = {
          ...p,
          marketplace: id,
          usage: mpCfg.usage,
        };
        persistAutoRepliesWorkspacePrefs({
          marketplace: next.marketplace,
          connectedMarketplaces: next.connectedMarketplaces,
          usage: next.usage,
          shopId: selectedShopId,
        });
        return next;
      });
    },
    [reloadSettings, selectedShopId]
  );

  /* Auth + Supabase bootstrap */
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await withNetworkTimeout(
        supabase.auth.getSession(),
        15_000,
        "Проверка входа"
      );
      if (cancel) return;
      if (!session?.user?.id) {
        router.replace(
          `/login?redirect=${encodeURIComponent("/studio/auto-replies/workspace")}`
        );
        return;
      }

      const uid = session.user.id;
      const email = session.user.email ?? null;
      setUserId(uid);
      setUserEmail(email);
      setUserMeta({
        id: uid,
        email: email ?? undefined,
        user_metadata: session.user.user_metadata as { name?: string; full_name?: string },
      });
      setWorkspacePrefsUserId(uid);
      setAutoRepliesSyncContext(uid, email, null);

      const boot = await bootstrapAutoRepliesFromSupabase(uid, email, null);
      if (cancel) return;
      if (boot.brandName) {
        setBrandName(boot.brandName);
        setBrandLoaded(true);
        ensureMainShopNamed(boot.brandName);
        setShopsRevision((n) => n + 1);
      }

      const r = readAutoRepliesWorkspacePrefs(uid);
      const shopId = r?.shopId?.trim() || "main";
      const connectedMarketplaces = deriveConnectedMarketplacesForShop(shopId);
      const marketplace =
        r?.marketplace && connectedMarketplaces.includes(r.marketplace)
          ? r.marketplace
          : connectedMarketplaces[0] ?? null;
      const usage =
        marketplace != null
          ? getMarketplaceSettings(shopId, marketplace, r?.usage ?? "manual").usage
          : r?.usage ?? null;
      setSelectedShopId(shopId);
      setPrefs({ marketplace, connectedMarketplaces, usage });
      const navFromPrefs = readNavigationSession() ?? {
        workspaceArea: r?.workspaceArea,
        settingsNavKey: r?.settingsNavKey,
      };
      if (navFromPrefs.workspaceArea) setWorkspaceAreaState(navFromPrefs.workspaceArea);
      if (navFromPrefs.settingsNavKey && navFromPrefs.settingsNavKey !== "activity") {
        setNavKeyState(navFromPrefs.settingsNavKey);
      }

      setSyncReady(true);
      setAuthReady(true);
      setAuthBootstrapError(null);
      } catch (e) {
        if (cancel) return;
        const msg =
          e instanceof NetworkTimeoutError
            ? "Не удалось подключиться к облаку авторизации. Включите VPN или проверьте интернет и обновите страницу."
            : e instanceof Error
              ? e.message
              : "Не удалось загрузить автоответы";
        setAuthBootstrapError(msg);
        setAuthReady(true);
        setSyncReady(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [router]);

  /* Черновик бренда из того же источника, что и профиль */
  useEffect(() => {
    if (!userId) return;
    let cancel = false;
    (async () => {
      try {
        const supabase = createBrowserClient();
        const row = await fetchUserBrandOnboarding(supabase, userId);
        if (cancel) return;
        const name = brandNameFromRow(row?.draft_json as Record<
          string,
          unknown
        >);
        const desc = brandDescriptionFromRow(row?.draft_json as Record<
          string,
          unknown
        >);
        if (name) setBrandName(name);
        setBrandDescription(desc);
        setAutoRepliesSyncContext(userId, userEmail, name ?? null);
        if (isAutoRepliesBootstrapComplete()) {
          ensureMainShopNamed(name);
          setShopsRevision((n) => n + 1);
          void import("@/lib/auto-replies/auto-replies-sync").then(({ pushAutoRepliesStateToSupabase }) => {
            void pushAutoRepliesStateToSupabase();
          });
        }
      } catch {
        /* Не сбрасываем имя — остаётся из bootstrap / локальных настроек магазина */
      } finally {
        if (!cancel) setBrandLoaded(true);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [userId, userEmail]);

  const refreshReplyBalance = useCallback(async () => {
    if (!userId) return;
    const supabase = createBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch("/api/auto-replies/subscription", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      balance?: number;
      welcomeRemaining?: number;
      paidRemaining?: number;
      periodEnd?: string;
    };
    setRepliesRemaining(typeof data.balance === "number" ? data.balance : 0);
    setWelcomeRemaining(typeof data.welcomeRemaining === "number" ? data.welcomeRemaining : 0);
    setPaidRemaining(typeof data.paidRemaining === "number" ? data.paidRemaining : 0);
    setRepliesPeriodEnd(typeof data.periodEnd === "string" ? data.periodEnd : null);
  }, [userId]);

  useEffect(() => {
    void refreshReplyBalance();
  }, [refreshReplyBalance]);

  useEffect(() => {
    const msg = sessionStorage.getItem("auto_replies_welcome_toast");
    if (!msg) return;
    sessionStorage.removeItem("auto_replies_welcome_toast");
    showToast({ type: "success", message: msg });
  }, [showToast]);

  useEffect(() => {
    if (!syncReady) return;
    reloadSettings(selectedShopId, activeMarketplace);
  }, [selectedShopId, activeMarketplace, reloadSettings, syncReady]);

  const marketplaceLabel =
    AUTO_REPLIES_MARKETPLACE_UI.find((m) => m.id === activeMarketplace)?.title ?? "Магазин";

  const handlePatchShop = useCallback(
    (patch: Parameters<typeof patchShopSettings>[1]) => {
      const next = patchShopSettings(selectedShopId, patch);
      setShopSettings(next);
    },
    [selectedShopId]
  );

  const handlePatchMp = useCallback(
    (patch: Parameters<typeof patchMarketplaceSettings>[2]) => {
      const next = patchMarketplaceSettings(
        selectedShopId,
        activeMarketplace,
        patch,
        mpSettings?.usage ?? prefs.usage ?? "manual"
      );
      setMpSettings(next);
    },
    [selectedShopId, activeMarketplace, mpSettings?.usage, prefs.usage]
  );

  const handleInboxConnectionMeta = useCallback(
    (patch: {
      sellerName?: string;
      unansweredCount?: number;
      verifiedAt?: string;
      status?: "active" | "error";
      lastError?: string;
      premiumPlus?: boolean;
      reviewApiAvailable?: boolean;
      businessId?: string;
    }) => {
      handlePatchMp({
        connection: {
          ...patch,
        },
      });
      if (typeof patch.unansweredCount === "number") {
        setLiveInboxPending(patch.unansweredCount);
      }
    },
    [handlePatchMp]
  );

  const handleRemoveMarketplaceIntegration = useCallback(async () => {
    if (!userId || removingIntegration) return;

    setRemovingIntegration(true);
    try {
      const nextPrefs = await disconnectMarketplaceCompletely({
        userId,
        shopId: selectedShopId,
        marketplaceId: activeMarketplace,
      });

      if (nextPrefs.connectedMarketplaces.length === 0) {
        setPrefs({ marketplace: null, connectedMarketplaces: [], usage: null });
        setShopSettings(getShopSettings(selectedShopId));
        setMpSettings(null);
        router.push("/studio/auto-replies?add=1");
        return;
      }

      const nextMp =
        nextPrefs.marketplace && nextPrefs.connectedMarketplaces.includes(nextPrefs.marketplace)
          ? nextPrefs.marketplace
          : nextPrefs.connectedMarketplaces[0]!;
      const mpCfg = reloadSettings(selectedShopId, nextMp);

      setPrefs({
        marketplace: nextMp,
        connectedMarketplaces: nextPrefs.connectedMarketplaces,
        usage: mpCfg.usage,
      });
    } finally {
      setRemovingIntegration(false);
    }
  }, [
    userId,
    removingIntegration,
    selectedShopId,
    activeMarketplace,
    reloadSettings,
    router,
  ]);

  const applyShopContext = useCallback(
    (shopId: string) => {
      setSelectedShopId(shopId);
      const connectedMarketplaces = deriveConnectedMarketplacesForShop(shopId);
      const marketplace = connectedMarketplaces[0] ?? null;
      const usage =
        marketplace != null
          ? getMarketplaceSettings(shopId, marketplace, "manual").usage
          : null;

      setPrefs({ marketplace, connectedMarketplaces, usage });
      persistAutoRepliesWorkspacePrefs({
        marketplace,
        connectedMarketplaces,
        usage,
        shopId,
      });

      setShopSettings(getShopSettings(shopId));
      if (marketplace) {
        reloadSettings(shopId, marketplace);
      } else {
        setMpSettings(null);
      }
    },
    [reloadSettings]
  );

  const selectShopId = useCallback(
    (id: string) => {
      applyShopContext(id);
    },
    [applyShopContext]
  );

  const handleAddShop = useCallback(
    (name: string) => {
      try {
        const created = createAutoReplyShop(name);
        setShopsRevision((n) => n + 1);
        applyShopContext(created.id);
      } catch {
        /* validation in UI */
      }
    },
    [applyShopContext]
  );

  const handleDeleteShop = useCallback(
    async (shopId: string) => {
      if (!userId || shops.length <= 1 || deletingShopId) return;
      setDeletingShopId(shopId);
      try {
        const { nextShopId } = await deleteAutoReplyShopCompletely({
          userId,
          shopId,
        });
        setShopsRevision((n) => n + 1);
        applyShopContext(nextShopId);
      } finally {
        setDeletingShopId(null);
      }
    },
    [userId, shops.length, deletingShopId, applyShopContext]
  );

  const currentShop =
    shops.find((s) => s.id === selectedShopId) ??
    shops[0] ??
    ({
      id: "main",
      name: brandLoaded
        ? getShopDisplayName(selectedShopId, brandName)
        : getShopDisplayName(selectedShopId, brandName ?? null),
    } as const);

  const shopPageTitle = getShopDisplayName(selectedShopId, brandName);

  useEffect(() => {
    document.title = `${shopPageTitle} — Автоответы — KARTO`;
  }, [shopPageTitle]);

  const connectionOk = mpSettings?.connection.status === "active";

  const usage = mpSettings?.usage ?? prefs.usage ?? "manual";
  const inboxBadge = inboxPendingCount(
    usage,
    connectionOk,
    liveInboxPending ?? mpSettings?.connection.unansweredCount ?? null
  );
  const connectionDisplay =
    mpSettings != null
      ? deriveConnectionDisplay(usage, mpSettings.connection, activeMarketplace)
      : null;
  const connectionShellTone =
    connectionDisplay?.tone === "info" || connectionDisplay?.tone === "muted"
      ? "muted"
      : connectionDisplay?.tone === "ok"
        ? "ok"
        : "warn";

  if (!authReady || !syncReady) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F3F1EA] px-6 text-center text-[#4a4a4a]"
        style={sans}
      >
        {authBootstrapError ? (
          <>
            <p className="max-w-md text-[15px] leading-relaxed">{authBootstrapError}</p>
            <button
              type="button"
              className="rounded-lg bg-[#1a1a1a] px-4 py-2 text-sm text-white"
              onClick={() => window.location.reload()}
            >
              Обновить страницу
            </button>
          </>
        ) : (
          <p>Загрузка…</p>
        )}
      </div>
    );
  }

  return (
    <div
      className="relative flex min-h-screen flex-col bg-[#E8E4DC] text-[#0c0c0c] lg:h-screen lg:flex-row lg:overflow-hidden"
      style={serif}
    >
      <WorkspaceSidebar
        collapsed={navCollapsed}
        onCollapsedChange={setNavCollapsed}
        workspaceArea={workspaceArea}
        onSelectArea={selectWorkspaceArea}
        inboxBadge={inboxBadge}
        usage={usage}
        repliesRemaining={repliesRemaining}
        welcomeRemaining={welcomeRemaining}
        paidRemaining={paidRemaining}
        repliesPeriodEnd={repliesPeriodEnd}
        user={userMeta}
        currentShopName={currentShop.name}
        shops={shops}
        selectedShopId={selectedShopId}
        onSelectShop={selectShopId}
        onAddShop={handleAddShop}
        onDeleteShop={handleDeleteShop}
        deletingShopId={deletingShopId}
        connectedMarketplaces={prefs.connectedMarketplaces}
        activeMarketplace={activeMarketplace}
        onSelectMarketplace={selectActiveMarketplace}
        onConnectMarketplace={navigateConnectMarketplace}
      />

      <main
        className={`relative min-h-0 min-w-0 flex-1 ${
          workspaceArea === "inbox"
            ? usage === "manual"
              ? "flex flex-col overflow-y-auto bg-[#F3F1EA] lg:h-screen"
              : "flex flex-col overflow-hidden bg-[#F3F1EA] lg:h-screen"
            : "lg:h-screen lg:overflow-y-auto"
        }`}
        aria-label="Панель инструментов"
      >
        {shopSettings && mpSettings && (prefs.marketplace || prefs.connectedMarketplaces.length > 0) ? (
          <WorkspaceShell
            area={workspaceArea}
            navKey={navKey}
            onNavChange={setNavKey}
            usage={usage}
            onOpenIntegration={
              workspaceArea === "settings"
                ? () => selectWorkspaceArea("integration")
                : undefined
            }
            connectionLabel={connectionDisplay?.label}
            connectionTone={connectionShellTone}
            inboxChildren={
              <WorkspaceInbox
                usage={usage}
                connectionOk={connectionOk}
                marketplaceLabel={marketplaceLabel}
                shopId={selectedShopId}
                marketplaceId={activeMarketplace}
                shopSettings={shopSettings}
                mpSettings={mpSettings}
                brandName={brandName}
                onPendingCountChange={setLiveInboxPending}
                onConnectionMetaChange={handleInboxConnectionMeta}
                onPatchReviewScope={(patch) => handlePatchMp({ reviewScope: patch })}
                onReplyBalanceChange={refreshReplyBalance}
                onGoSettings={() => {
                  selectWorkspaceArea("settings");
                  setNavKey("mode");
                }}
              />
            }
            analyticsChildren={
              <WorkspaceAnalytics
                marketplaceId={activeMarketplace}
                marketplaceLabel={marketplaceLabel}
                connectionOk={connectionOk}
                shopId={selectedShopId}
                usage={usage}
                mpSettings={mpSettings}
                shopSettings={shopSettings}
                brandName={brandName}
                active={workspaceArea === "analytics"}
              />
            }
            integrationChildren={
              <WorkspacePanels
                navKey="integration"
                shopId={selectedShopId}
                marketplaceLabel={marketplaceLabel}
                marketplaceId={activeMarketplace}
                shopSettings={shopSettings}
                mpSettings={mpSettings}
                brandDescription={brandDescription}
                brandName={brandName}
                onPatchShop={handlePatchShop}
                onPatchMp={handlePatchMp}
                onSetUsage={setUsageLocal}
                onGoIntegration={() => selectWorkspaceArea("integration")}
                onGoInbox={() => selectWorkspaceArea("inbox")}
                onRemoveIntegration={handleRemoveMarketplaceIntegration}
                removingIntegration={removingIntegration}
              />
            }
          >
            {workspaceArea === "settings" ? (
              <WorkspacePanels
                navKey={navKey}
                shopId={selectedShopId}
                marketplaceLabel={marketplaceLabel}
                marketplaceId={activeMarketplace}
                shopSettings={shopSettings}
                mpSettings={mpSettings}
                brandDescription={brandDescription}
                brandName={brandName}
                onPatchShop={handlePatchShop}
                onPatchMp={handlePatchMp}
                onSetUsage={setUsageLocal}
                onGoIntegration={() => selectWorkspaceArea("integration")}
                onGoInbox={() => selectWorkspaceArea("inbox")}
                onRemoveIntegration={
                  navKey === "integration" ? handleRemoveMarketplaceIntegration : undefined
                }
                removingIntegration={removingIntegration}
              />
            ) : null}
          </WorkspaceShell>
        ) : shopSettings && prefs.connectedMarketplaces.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 bg-[#F7F5F0] px-6 text-center">
            <p className="text-[18px] font-semibold text-[#0a0a0a]" style={serif}>
              {currentShop.name}
            </p>
            <p className="max-w-md text-[15px] leading-relaxed text-[#5f5a52]" style={sans}>
              Подключите площадки в сайдбаре — нажмите «+» у Ozon, Wildberries или Яндекс Маркета и
              пройдите мастер настройки для этого магазина.
            </p>
          </div>
        ) : (
          <div className="flex min-h-[40vh] items-center justify-center bg-[#F7F5F0] px-6">
            <p className="text-[15px] text-slate-500" style={sans}>
              Загрузка настроек…
            </p>
          </div>
        )}
      </main>
      <WorkspaceSupportChrome workspaceArea={workspaceArea} user={userMeta} />
    </div>
  );
}
