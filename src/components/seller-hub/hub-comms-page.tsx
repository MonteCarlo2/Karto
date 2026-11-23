"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { NetworkTimeoutError, withNetworkTimeout } from "@/lib/supabase/network-timeout";
import { fetchUserBrandOnboarding } from "@/lib/brand/user-brand-onboarding-db";
import type { AutoRepliesUsageId } from "@/lib/auto-replies/types";
import { persistAutoRepliesWorkspacePrefs, readAutoRepliesWorkspacePrefs, setWorkspacePrefsUserId } from "@/lib/auto-replies/workspace-prefs";
import { bootstrapAutoRepliesFromSupabase, isAutoRepliesBootstrapComplete, setAutoRepliesSyncContext } from "@/lib/auto-replies/auto-replies-sync";
import { deriveConnectedMarketplacesForShop, ensureMainShopNamed, getMarketplaceSettings, getShopSettings, patchMarketplaceSettings, patchShopSettings } from "@/lib/auto-replies/settings-store";
import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings } from "@/lib/auto-replies/settings-types";
import { deriveConnectionDisplay } from "@/lib/auto-replies/marketplace-api-guide";
import { WorkspacePanels, type WorkspaceNavKey } from "./comms/workspace-panels";
import { WorkspaceShell } from "./comms/workspace-shell";
import { WorkspaceInbox, inboxPendingCount } from "./comms/workspace-inbox";
import { hub, hubSans } from "./hub-ui";

/**
 * «Отзывы и автоответы» внутри Seller Hub. Это копия рабочего пространства автоответов (оно остаётся отдельным разделом и не менялось),
 * только для Wildberries и только два раздела: «Основное» (режим, подпись, текст, обучение, ограничения) и «Ответы» (лента отзывов).
 * Настройки и данные общие с отдельным разделом: что изменили здесь, видно там, и наоборот. Оформление светлое, как в остальных разделах агента.
 */

const MP = "wildberries" as const;
const SHOP_FALLBACK = "main";

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

export type CommsBalance = { remaining: number | null; periodEnd: string | null };

export function HubCommsPage({ area, onArea, onBadge, onBalance }: { area: "settings" | "inbox"; onArea: (a: "settings" | "inbox") => void; onBadge: (n: number | null) => void; onBalance: (b: CommsBalance) => void }) {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [syncReady, setSyncReady] = useState(false);
  const [brandName, setBrandName] = useState<string | null>(null);
  const [brandDescription, setBrandDescription] = useState<string | null>(null);
  const [shopId, setShopId] = useState(SHOP_FALLBACK);
  const [wbConnected, setWbConnected] = useState(false);
  const [usagePref, setUsagePref] = useState<AutoRepliesUsageId | null>(null);

  // Выбор раздела приходит из левого меню; подпункт настроек запоминается только здесь, в отдельном разделе автоответов он не меняется.
  const [navKey, setNavKey] = useState<WorkspaceNavKey>("mode");

  const [shopSettings, setShopSettings] = useState<AutoRepliesShopSettings | null>(null);
  const [mpSettings, setMpSettings] = useState<AutoRepliesMarketplaceSettings | null>(null);
  const [liveInboxPending, setLiveInboxPending] = useState<number | null>(null);

  const reloadSettings = useCallback((id: string) => {
    setShopSettings(getShopSettings(id));
    const cfg = getMarketplaceSettings(id, MP, "manual");
    setMpSettings(cfg);
    return cfg;
  }, []);

  /* Вход и загрузка настроек из облака, как в отдельном разделе */
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const supabase = createBrowserClient();
        const {
          data: { session },
        } = await withNetworkTimeout(supabase.auth.getSession(), 15_000, "Проверка входа");
        if (cancel) return;
        if (!session?.user?.id) {
          router.replace(`/login?redirect=${encodeURIComponent("/studio/seller-hub")}`);
          return;
        }
        const uid = session.user.id;
        const email = session.user.email ?? null;
        setUserId(uid);
        setUserEmail(email);
        setWorkspacePrefsUserId(uid);
        setAutoRepliesSyncContext(uid, email, null);
        const boot = await bootstrapAutoRepliesFromSupabase(uid, email, null);
        if (cancel) return;
        if (boot.brandName) {
          setBrandName(boot.brandName);
          ensureMainShopNamed(boot.brandName);
        }
        const r = readAutoRepliesWorkspacePrefs(uid);
        const id = r?.shopId?.trim() || SHOP_FALLBACK;
        setShopId(id);
        const connected = deriveConnectedMarketplacesForShop(id).includes(MP);
        setWbConnected(connected);
        if (connected) {
          const cfg = reloadSettings(id);
          setUsagePref(cfg.usage);
        }
        setSyncReady(true);
        setAuthReady(true);
        setError(null);
      } catch (e) {
        if (cancel) return;
        setError(e instanceof NetworkTimeoutError ? "Не удалось подключиться к облаку авторизации. Проверьте интернет и обновите страницу." : e instanceof Error ? e.message : "Не удалось загрузить автоответы");
        setAuthReady(true);
        setSyncReady(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [router, reloadSettings]);

  /* Название и описание бренда: из них собираются ответы */
  useEffect(() => {
    if (!userId) return;
    let cancel = false;
    (async () => {
      try {
        const supabase = createBrowserClient();
        const row = await fetchUserBrandOnboarding(supabase, userId);
        if (cancel) return;
        const name = brandNameFromRow(row?.draft_json as Record<string, unknown>);
        const desc = brandDescriptionFromRow(row?.draft_json as Record<string, unknown>);
        if (name) setBrandName(name);
        setBrandDescription(desc);
        setAutoRepliesSyncContext(userId, userEmail, name ?? null);
        if (isAutoRepliesBootstrapComplete()) {
          ensureMainShopNamed(name);
          void import("@/lib/auto-replies/auto-replies-sync").then(({ pushAutoRepliesStateToSupabase }) => {
            void pushAutoRepliesStateToSupabase();
          });
        }
      } catch {
        /* имя остаётся из облака или из локальных настроек магазина */
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
    const res = await fetch("/api/auto-replies/subscription", { headers: { Authorization: `Bearer ${session.access_token}` } });
    if (!res.ok) return;
    const data = (await res.json()) as { balance?: number; periodEnd?: string };
    onBalance({ remaining: typeof data.balance === "number" ? data.balance : 0, periodEnd: typeof data.periodEnd === "string" ? data.periodEnd : null });
  }, [userId, onBalance]);

  useEffect(() => {
    void refreshReplyBalance();
  }, [refreshReplyBalance]);

  const setUsageLocal = useCallback(
    (u: AutoRepliesUsageId) => {
      const next = patchMarketplaceSettings(shopId, MP, { usage: u }, u);
      setMpSettings(next);
      setUsagePref(u);
      const r = readAutoRepliesWorkspacePrefs(userId);
      persistAutoRepliesWorkspacePrefs({ marketplace: MP, connectedMarketplaces: r?.connectedMarketplaces ?? [MP], usage: u, shopId });
    },
    [shopId, userId],
  );

  const handlePatchShop = useCallback(
    (patch: Parameters<typeof patchShopSettings>[1]) => {
      setShopSettings(patchShopSettings(shopId, patch));
    },
    [shopId],
  );

  const handlePatchMp = useCallback(
    (patch: Parameters<typeof patchMarketplaceSettings>[2]) => {
      setMpSettings(patchMarketplaceSettings(shopId, MP, patch, mpSettings?.usage ?? usagePref ?? "manual"));
    },
    [shopId, mpSettings?.usage, usagePref],
  );

  const handleInboxConnectionMeta = useCallback(
    (patch: { sellerName?: string; unansweredCount?: number; verifiedAt?: string; status?: "active" | "error"; lastError?: string; premiumPlus?: boolean; reviewApiAvailable?: boolean; businessId?: string }) => {
      handlePatchMp({ connection: { ...patch } });
      if (typeof patch.unansweredCount === "number") setLiveInboxPending(patch.unansweredCount);
    },
    [handlePatchMp],
  );

  const connectionOk = mpSettings?.connection.status === "active";
  const usage = mpSettings?.usage ?? usagePref ?? "manual";
  const inboxBadge = inboxPendingCount(usage, connectionOk, liveInboxPending ?? mpSettings?.connection.unansweredCount ?? null);
  const connectionDisplay = mpSettings != null ? deriveConnectionDisplay(usage, mpSettings.connection, MP) : null;
  const connectionTone = connectionDisplay?.tone === "info" || connectionDisplay?.tone === "muted" ? "muted" : connectionDisplay?.tone === "ok" ? "ok" : "warn";

  useEffect(() => {
    onBadge(inboxBadge ?? null);
  }, [inboxBadge, onBadge]);

  const goConnect = () => router.push("/studio/auto-replies/workspace");

  return (
    <div className="hub-fade-in flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={`min-h-0 flex-1 ${area === "inbox" && usage !== "manual" ? "flex flex-col overflow-hidden" : "overflow-y-auto"}`} style={{ backgroundColor: "var(--hub-canvas)" }}>
        {!authReady || !syncReady ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center" style={hubSans}>
            {error ? (
              <>
                <p className="max-w-md text-[16px] leading-relaxed" style={{ color: hub.text }}>
                  {error}
                </p>
                <button type="button" onClick={() => window.location.reload()} className="inline-flex h-11 items-center rounded-full px-6 text-[15px] font-medium text-white" style={{ backgroundColor: hub.ink }}>
                  Обновить страницу
                </button>
              </>
            ) : (
              <div className="h-24 w-full max-w-[640px] animate-pulse rounded-[22px]" style={{ backgroundColor: "rgba(1,20,8,0.04)" }} aria-busy="true" />
            )}
          </div>
        ) : !wbConnected ? (
          <div className="mx-auto flex min-h-[40vh] max-w-[560px] flex-col items-center justify-center gap-3 px-6 text-center" style={hubSans}>
            <p className="text-[22px] font-semibold" style={{ color: hub.text }}>
              Wildberries ещё не подключён к автоответам
            </p>
            <p className="text-[16px] leading-[1.55]" style={{ color: hub.textMuted }}>
              Подключите кабинет Wildberries в разделе автоответов один раз, и здесь появятся настройки и лента отзывов.
            </p>
            <button type="button" onClick={goConnect} className="mt-2 inline-flex h-11 items-center gap-2 rounded-full px-6 text-[15px] font-medium text-white" style={{ backgroundColor: hub.ink }}>
              Подключить
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : shopSettings && mpSettings ? (
          <WorkspaceShell
            area={area}
            navKey={navKey}
            onNavChange={setNavKey}
            usage={usage}
            connectionLabel={connectionDisplay?.label}
            connectionTone={connectionTone}
            inboxChildren={
              <WorkspaceInbox
                usage={usage}
                connectionOk={connectionOk}
                marketplaceLabel="Wildberries"
                shopId={shopId}
                marketplaceId={MP}
                shopSettings={shopSettings}
                mpSettings={mpSettings}
                brandName={brandName}
                onPendingCountChange={setLiveInboxPending}
                onConnectionMetaChange={handleInboxConnectionMeta}
                onPatchReviewScope={(patch) => handlePatchMp({ reviewScope: patch })}
                onReplyBalanceChange={refreshReplyBalance}
                onGoSettings={() => {
                  onArea("settings");
                  setNavKey("mode");
                }}
              />
            }
          >
            {area === "settings" ? (
              <WorkspacePanels
                navKey={navKey}
                shopId={shopId}
                marketplaceLabel="Wildberries"
                marketplaceId={MP}
                shopSettings={shopSettings}
                mpSettings={mpSettings}
                brandDescription={brandDescription}
                brandName={brandName}
                onPatchShop={handlePatchShop}
                onPatchMp={handlePatchMp}
                onSetUsage={setUsageLocal}
                onGoIntegration={goConnect}
                onGoInbox={() => onArea("inbox")}
                removingIntegration={false}
              />
            ) : null}
          </WorkspaceShell>
        ) : (
          <div className="flex min-h-[40vh] items-center justify-center px-6">
            <p className="text-[15px]" style={{ ...hubSans, color: hub.textSubtle }}>
              Загрузка настроек…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
