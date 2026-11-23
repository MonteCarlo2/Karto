"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { BookOpen, Eye, EyeOff, ExternalLink, KeyRound, Link2, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import type { AutoRepliesMarketplaceId, AutoRepliesUsageId } from "@/lib/auto-replies/types";
import type { AutoRepliesMarketplaceSettings } from "@/lib/auto-replies/settings-types";
import {
  deriveConnectionDisplay,
  getMarketplaceApiGuide,
  maskApiKey,
  resolveConnectionStatus,
} from "@/lib/auto-replies/marketplace-api-guide";
import { verifyMarketplaceConnection } from "@/lib/auto-replies/marketplace-live";
import { scheduleAutoRepliesSync } from "@/lib/auto-replies/auto-replies-sync";
import { ozonReviewApiBlocked, ozonReviewApiReady } from "@/lib/auto-replies/ozon-subscription";
import { AUTO_REPLIES_MARKETPLACE_UI } from "@/lib/auto-replies/workspace-prefs";
import { OzonSubscriptionVerifyResult } from "./ozon-subscription-callout";
import { WorkspaceApiGuideModal } from "./workspace-api-guide-modal";
import { WorkspaceConfirmDialog } from "./workspace-confirm-dialog";
import { WsGlassPanel, glass, panel, wsSans } from "./settings-ui";

const MARKETPLACE_ICON: Record<AutoRepliesMarketplaceId, string> = {
  wildberries: "/logos/marketplace-wildberries-app.png",
  ozon: "/logos/marketplace-ozon-app.png",
  yandex: "/logos/marketplace-yandex-market-app.png",
};

const serif = {
  fontFamily: "var(--font-auto-replies-serif), var(--font-playfair), Georgia, serif",
} as const;

function guideStepsSubtitle(stepCount: number): string {
  const mod10 = stepCount % 10;
  const mod100 = stepCount % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? "шаг"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "шага"
        : "шагов";
  return `${stepCount} ${word} со скриншотами, если не нашли сами`;
}

function connectionTypeLabel(usage: AutoRepliesUsageId, apiKeyLabel: string): string {
  if (usage === "manual") return "По тексту отзыва";
  if (apiKeyLabel.toLowerCase().includes("токен")) return "API-токен";
  return "API-ключ";
}

function IntegrationStatusBadge({
  label,
  tone,
  active,
}: {
  label: string;
  tone: "ok" | "warn" | "muted" | "info";
  active?: boolean;
}) {
  const isOk = tone === "ok" && active;
  const bg = isOk
    ? "rgba(185,255,75,0.22)"
    : tone === "warn"
      ? panel.warnSoft
      : tone === "ok"
        ? panel.successSoft
        : "rgba(10,10,10,0.06)";
  const color = isOk
    ? panel.greenDark
    : tone === "warn"
      ? panel.warn
      : tone === "ok"
        ? panel.success
        : panel.textMuted;
  const ring = isOk ? "inset 0 0 0 1.5px rgba(46,90,67,0.22)" : "inset 0 0 0 1px rgba(10,10,10,0.08)";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-[0.85rem] px-3.5 py-2 text-[13px] font-semibold sm:text-[14px] ${
        isOk ? "shadow-[0_10px_28px_-14px_rgba(46,90,67,0.45)]" : ""
      }`}
      style={{ ...wsSans, backgroundColor: bg, color, boxShadow: ring }}
    >
      {isOk ? (
        <span className="h-2 w-2 shrink-0 rounded-full bg-[#2E5A43] shadow-[0_0_0_3px_rgba(185,255,75,0.35)]" />
      ) : null}
      {label}
    </span>
  );
}

type WorkspaceIntegrationPanelProps = {
  marketplaceId: AutoRepliesMarketplaceId;
  shopName?: string | null;
  usage: AutoRepliesUsageId;
  mpSettings: AutoRepliesMarketplaceSettings;
  onPatchMp: (
    patch: Parameters<
      typeof import("@/lib/auto-replies/settings-store").patchMarketplaceSettings
    >[2]
  ) => void;
  onRemoveIntegration?: () => void | Promise<void>;
  removingIntegration?: boolean;
};

export function WorkspaceIntegrationPanel({
  marketplaceId,
  shopName,
  usage,
  mpSettings,
  onPatchMp,
  onRemoveIntegration,
  removingIntegration = false,
}: WorkspaceIntegrationPanelProps) {
  const [showKey, setShowKey] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [wbTokenHint, setWbTokenHint] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const verifyLockRef = useRef(false);
  const autoVerifyKeyRef = useRef<string | null>(null);
  const conn = mpSettings.connection;
  const guide = getMarketplaceApiGuide(marketplaceId);
  const display = deriveConnectionDisplay(usage, conn, marketplaceId);
  const mpUi = AUTO_REPLIES_MARKETPLACE_UI.find((m) => m.id === marketplaceId);
  const shopTitle = shopName?.trim() || "Магазин";
  const isConnected = display.tone === "ok" && conn.status === "active" && Boolean(conn.verifiedAt);
  const connectionType = connectionTypeLabel(usage, guide.apiKeyLabel);
  const showApiField = usage !== "manual";
  const supportsVerify =
    marketplaceId === "wildberries" || marketplaceId === "ozon" || marketplaceId === "yandex";

  const ozonSubscriptionStatus: "unknown" | "confirmed" | "denied" =
    marketplaceId !== "ozon" || !conn.verifiedAt
      ? "unknown"
      : ozonReviewApiReady(conn.reviewApiAvailable, conn.premiumPlus)
        ? "confirmed"
        : ozonReviewApiBlocked(conn.reviewApiAvailable, conn.premiumPlus)
          ? "denied"
          : "unknown";

  const secondaryId =
    marketplaceId === "ozon"
      ? conn.clientId
      : marketplaceId === "yandex"
        ? conn.campaignId
        : undefined;

  const resetVerifyMeta = {
    verifiedAt: undefined as string | undefined,
    sellerName: undefined as string | undefined,
    unansweredCount: undefined as number | undefined,
    premiumPlus: undefined as boolean | undefined,
    reviewApiAvailable: undefined as boolean | undefined,
    businessId: undefined as string | undefined,
    lastError: undefined as string | undefined,
  };

  useEffect(() => {
    if (!cooldownUntil) return;
    const timer = window.setInterval(() => {
      if (Date.now() >= cooldownUntil) {
        setCooldownUntil(null);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  const cooldownSec =
    cooldownUntil && cooldownUntil > Date.now()
      ? Math.ceil((cooldownUntil - Date.now()) / 1000)
      : 0;

  const patchKey = (apiKey: string) => {
    autoVerifyKeyRef.current = null;
    onPatchMp({
      connection: {
        apiKey,
        status: resolveConnectionStatus(apiKey, marketplaceId, secondaryId),
        ...resetVerifyMeta,
      },
    });
  };

  const patchClientId = (clientId: string) => {
    autoVerifyKeyRef.current = null;
    onPatchMp({
      connection: {
        clientId,
        status: resolveConnectionStatus(conn.apiKey, marketplaceId, clientId),
        ...resetVerifyMeta,
      },
    });
  };

  const patchCampaignId = (campaignId: string) => {
    onPatchMp({
      connection: {
        campaignId,
        status: resolveConnectionStatus(conn.apiKey, marketplaceId, campaignId),
        ...resetVerifyMeta,
      },
    });
  };

  const handleVerify = async () => {
    if (!supportsVerify) return;
    const key = conn.apiKey.trim();
    const clientId = conn.clientId?.trim() ?? "";
    const campaignId = conn.campaignId?.trim() ?? "";
    if (!key) {
      setVerifyError(
        marketplaceId === "ozon"
          ? "Вставьте API Key"
          : marketplaceId === "yandex"
            ? "Вставьте токен Яндекс Маркета"
            : "Вставьте API-токен"
      );
      return;
    }
    if (marketplaceId === "ozon" && !clientId) {
      setVerifyError("Укажите Client ID Ozon");
      return;
    }
    if (marketplaceId === "yandex" && !campaignId) {
      setVerifyError("Укажите Campaign ID магазина");
      return;
    }
    if (verifying || verifyLockRef.current || cooldownSec > 0) return;

    verifyLockRef.current = true;
    setVerifying(true);
    setVerifyError(null);
    try {
      const result = await verifyMarketplaceConnection(marketplaceId, conn, shopTitle);
      if (marketplaceId === "wildberries") {
        const wb = result as {
          tokenTypeLabel?: string;
          tokenRateLimitHint?: string;
          tokenWarning?: string;
        };
        if (wb.tokenTypeLabel) {
          setWbTokenHint(
            `${wb.tokenTypeLabel}${wb.tokenRateLimitHint ? ` · ${wb.tokenRateLimitHint}` : ""}`
          );
        }
      }
      onPatchMp({
        connection: {
          apiKey: key,
          clientId: marketplaceId === "ozon" ? clientId : conn.clientId,
          campaignId: marketplaceId === "yandex" ? campaignId : conn.campaignId,
          businessId:
            marketplaceId === "yandex" && "businessId" in result && result.businessId
              ? String(result.businessId)
              : conn.businessId,
          status: "active",
          sellerName: result.sellerName,
          verifiedAt: result.verifiedAt,
          unansweredCount: result.unansweredCount,
          premiumPlus: "premiumPlus" in result ? result.premiumPlus : conn.premiumPlus,
          reviewApiAvailable:
            "reviewApiAvailable" in result ? result.reviewApiAvailable : conn.reviewApiAvailable,
          lastError: "warning" in result && result.warning ? result.warning : undefined,
        },
      });
      if (
        marketplaceId === "ozon" &&
        "reviewApiAvailable" in result &&
        result.reviewApiAvailable === false
      ) {
        setVerifyError(null);
      }
      scheduleAutoRepliesSync(200);
    } catch (e) {
      const err = e as Error & { retryAfterSec?: number; premiumPlusRequired?: boolean };
      let message = err.message || "Не удалось проверить подключение";
      if (message.includes("Failed to fetch") || message.includes("связаться с сервером")) {
        message = "Не удалось связаться с сервером. Убедитесь, что сайт запущен, и попробуйте снова.";
      }
      setVerifyError(message);
      if (err.retryAfterSec && err.retryAfterSec > 0) {
        setCooldownUntil(Date.now() + err.retryAfterSec * 1000);
      }
      onPatchMp({
        connection: {
          status: "error",
          premiumPlus: err.premiumPlusRequired ? false : conn.premiumPlus,
          lastError: message,
        },
      });
    } finally {
      verifyLockRef.current = false;
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (marketplaceId !== "ozon" || usage === "manual" || !showApiField) return;
    const clientId = conn.clientId?.trim() ?? "";
    const apiKey = conn.apiKey.trim();
    if (!clientId || !apiKey) return;
    if (verifying || cooldownSec > 0) return;

    const fingerprint = `${clientId}:${apiKey.slice(0, 12)}:${apiKey.length}`;
    if (autoVerifyKeyRef.current === fingerprint && conn.verifiedAt) return;
    if (autoVerifyKeyRef.current === fingerprint) return;

    autoVerifyKeyRef.current = fingerprint;
    void handleVerify();
  }, [
    marketplaceId,
    usage,
    showApiField,
    conn.clientId,
    conn.apiKey,
    conn.verifiedAt,
    verifying,
    cooldownSec,
  ]);

  return (
    <>
      <div className="w-full max-w-[680px] pb-4">
        <WsGlassPanel>
          <div
            className="border-b px-4 py-5 sm:px-6"
            style={{
              borderColor: glass.borderSoft,
              background:
                "linear-gradient(120deg, rgba(46,90,67,0.06) 0%, rgba(255,255,255,0.55) 50%, rgba(185,255,75,0.1) 100%)",
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3.5 sm:gap-4">
                <div
                  className="relative mt-0.5 h-12 w-12 shrink-0 overflow-hidden rounded-[0.9rem] ring-1 ring-black/[0.06] sm:h-[3.25rem] sm:w-[3.25rem]"
                  style={{ boxShadow: "0 8px 22px -12px rgba(46,90,67,0.35)" }}
                >
                  <Image
                    src={MARKETPLACE_ICON[marketplaceId]}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="52px"
                  />
                </div>
                <div className="min-w-0">
                  <h2
                    className="text-[20px] font-bold leading-[1.15] tracking-[-0.03em] sm:text-[22px]"
                    style={{ ...serif, color: panel.text }}
                  >
                    {shopTitle}
                  </h2>
                  <p className="mt-1.5 text-[12px] sm:text-[13px]" style={{ ...wsSans, color: panel.textMuted }}>
                    {mpUi?.short ?? "MP"} · {guide.cabinetName}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2.5">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] sm:text-[12px]"
                      style={{
                        ...wsSans,
                        color: panel.textSubtle,
                        backgroundColor: "rgba(255,255,255,0.72)",
                        boxShadow: "inset 0 0 0 1px rgba(46,90,67,0.1)",
                      }}
                    >
                      <Link2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                      {connectionType}
                    </span>
                  </div>
                </div>
              </div>

              <IntegrationStatusBadge
                label={display.label}
                tone={display.tone === "info" ? "muted" : display.tone}
                active={isConnected}
              />
            </div>
          </div>

          <div className="px-4 py-4 sm:px-6 sm:py-5">
            <p className="text-[13px] leading-[1.65] sm:text-[14px]" style={{ ...wsSans, color: panel.textMuted }}>
              {display.detail}
            </p>

            {showApiField ? (
              <div className="mt-6">
                {marketplaceId === "ozon" && guide.clientIdLabel ? (
                  <>
                    <label
                      htmlFor="marketplace-client-id"
                      className="flex items-center gap-2 text-[14px] font-semibold sm:text-[15px]"
                      style={{ ...wsSans, color: panel.text }}
                    >
                      <KeyRound className="h-4 w-4" style={{ color: panel.green }} strokeWidth={2} />
                      {guide.clientIdLabel}
                    </label>
                    <input
                      id="marketplace-client-id"
                      type="text"
                      inputMode="numeric"
                      value={conn.clientId ?? ""}
                      onChange={(e) => patchClientId(e.target.value)}
                      placeholder={guide.clientIdPlaceholder}
                      autoComplete="off"
                      spellCheck={false}
                      className="mt-3 w-full rounded-[0.95rem] border px-4 py-3.5 text-[14px] outline-none transition focus:ring-2 focus:ring-[rgba(46,90,67,0.16)] sm:text-[15px]"
                      style={{
                        ...wsSans,
                        borderColor: glass.borderSoft,
                        backgroundColor: "rgba(255,255,255,0.82)",
                        color: panel.text,
                      }}
                    />
                  </>
                ) : null}

                {marketplaceId === "yandex" && guide.campaignIdLabel ? (
                  <>
                    <label
                      htmlFor="marketplace-campaign-id"
                      className="flex items-center gap-2 text-[14px] font-semibold sm:text-[15px]"
                      style={{ ...wsSans, color: panel.text }}
                    >
                      <KeyRound className="h-4 w-4" style={{ color: panel.green }} strokeWidth={2} />
                      {guide.campaignIdLabel}
                    </label>
                    <input
                      id="marketplace-campaign-id"
                      type="text"
                      inputMode="numeric"
                      value={conn.campaignId ?? ""}
                      onChange={(e) => patchCampaignId(e.target.value)}
                      placeholder={guide.campaignIdPlaceholder}
                      autoComplete="off"
                      spellCheck={false}
                      className="mt-3 w-full rounded-[0.95rem] border px-4 py-3.5 text-[14px] outline-none transition focus:ring-2 focus:ring-[rgba(46,90,67,0.16)] sm:text-[15px]"
                      style={{
                        ...wsSans,
                        borderColor: glass.borderSoft,
                        backgroundColor: "rgba(255,255,255,0.82)",
                        color: panel.text,
                      }}
                    />
                  </>
                ) : null}

                <label
                  htmlFor="marketplace-api-key"
                  className={`flex items-center gap-2 text-[14px] font-semibold sm:text-[15px] ${
                    marketplaceId === "ozon" || marketplaceId === "yandex" ? "mt-5" : ""
                  }`}
                  style={{ ...wsSans, color: panel.text }}
                >
                  <KeyRound className="h-4 w-4" style={{ color: panel.green }} strokeWidth={2} />
                  {guide.apiKeyLabel}
                </label>
                <p className="mt-1.5 text-[12px] leading-[1.6] sm:text-[13px]" style={{ ...wsSans, color: panel.textMuted }}>
                  {guide.scopesHint}
                </p>

                <div className="relative mt-3">
                  <input
                    id="marketplace-api-key"
                    type={showKey ? "text" : "password"}
                    value={conn.apiKey}
                    onChange={(e) => patchKey(e.target.value)}
                    placeholder={guide.apiKeyPlaceholder}
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full rounded-[0.95rem] border py-3.5 pl-4 pr-12 text-[14px] outline-none transition focus:ring-2 focus:ring-[rgba(46,90,67,0.16)] sm:text-[15px]"
                    style={{
                      ...wsSans,
                      borderColor: glass.borderSoft,
                      backgroundColor: "rgba(255,255,255,0.82)",
                      color: panel.text,
                      fontFamily: showKey ? wsSans.fontFamily : "ui-monospace, monospace",
                    }}
                  />
                  <button
                    type="button"
                    aria-label={showKey ? "Скрыть ключ" : "Показать ключ"}
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg transition hover:bg-black/[0.04]"
                  >
                    {showKey ? (
                      <EyeOff className="h-4 w-4" style={{ color: panel.textSubtle }} strokeWidth={2} />
                    ) : (
                      <Eye className="h-4 w-4" style={{ color: panel.textSubtle }} strokeWidth={2} />
                    )}
                  </button>
                </div>

                {conn.apiKey.trim() && !showKey ? (
                  <p className="mt-2 text-[12px] tabular-nums" style={{ ...wsSans, color: panel.textSubtle }}>
                    Сохранено: {maskApiKey(conn.apiKey)}
                  </p>
                ) : null}

                {conn.sellerName ? (
                  <p className="mt-2 text-[12px]" style={{ ...wsSans, color: panel.greenDark }}>
                    Продавец: {conn.sellerName}
                    {typeof conn.unansweredCount === "number" ? ` · неотвеченных: ${conn.unansweredCount}` : ""}
                  </p>
                ) : null}

                {marketplaceId === "wildberries" && wbTokenHint && isConnected ? (
                  <p className="mt-1 text-[12px]" style={{ ...wsSans, color: panel.textMuted }}>
                    Токен WB: {wbTokenHint}
                  </p>
                ) : null}

                {verifyError || (conn.status === "error" && conn.lastError) ? (
                  <p className="mt-2 text-[12px]" style={{ ...wsSans, color: panel.warn }}>
                    {verifyError || conn.lastError}
                  </p>
                ) : null}

                {supportsVerify ? (
                  <>
                    {marketplaceId === "wildberries" ? (
                      <p className="mt-3 text-[11px] leading-[1.55]" style={{ ...wsSans, color: panel.textSubtle }}>
                        Для автоответов нужен <strong>персональный</strong> токен с категорией «Вопросы и
                        отзывы» (чтение и запись). Базовый — только 5 запросов в час и не подходит для
                        автоматизации. Каждый продавец создаёт свой токен в ЛК WB и вставляет его сюда.
                      </p>
                    ) : marketplaceId === "yandex" ? (
                      <p className="mt-3 text-[11px] leading-[1.55]" style={{ ...wsSans, color: panel.textSubtle }}>
                        Campaign ID — ID конкретного магазина в Partner API. Его можно найти в кабинете: Настройки → API и
                        модули.
                      </p>
                    ) : null}
                    <button
                      type="button"
                      disabled={
                        verifying ||
                        cooldownSec > 0 ||
                        !conn.apiKey.trim() ||
                        (marketplaceId === "ozon" && !conn.clientId?.trim()) ||
                        (marketplaceId === "yandex" && !conn.campaignId?.trim())
                      }
                      onClick={() => void handleVerify()}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[1rem] border px-5 py-3.5 text-[14px] font-semibold transition hover:brightness-[1.02] disabled:opacity-45 sm:w-auto"
                      style={{
                        ...wsSans,
                        borderColor: "rgba(46,90,67,0.18)",
                        backgroundColor: "rgba(185,255,75,0.18)",
                        color: panel.text,
                      }}
                    >
                      {verifying ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-4 w-4" style={{ color: panel.green }} strokeWidth={2.1} />
                      )}
                      {cooldownSec > 0
                        ? `Подождите ${Math.ceil(cooldownSec / 60)} мин`
                        : "Проверить подключение"}
                    </button>

                    {marketplaceId === "ozon" && conn.verifiedAt && ozonSubscriptionStatus === "denied" ? (
                      <OzonSubscriptionVerifyResult status="denied" />
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : (
              <div
                className="mt-6 rounded-[0.95rem] border px-4 py-3.5 text-[13px] leading-[1.65]"
                style={{
                  ...wsSans,
                  borderColor: glass.borderSoft,
                  backgroundColor: "rgba(255,255,255,0.55)",
                  color: panel.textMuted,
                }}
              >
                Сейчас выбран режим без API. Чтобы подключить кабинет, переключите источник на «Кабинет» в
                разделе «Режим ответов».
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                className="inline-flex min-h-[3.25rem] flex-1 items-center justify-center gap-2.5 rounded-[1rem] border px-5 py-3.5 text-left transition hover:brightness-[1.02] sm:min-w-[240px] sm:flex-[1.4]"
                style={{
                  borderColor: "rgba(46,90,67,0.18)",
                  backgroundColor: "rgba(185,255,75,0.18)",
                  boxShadow: "0 14px 36px -18px rgba(46,90,67,0.35), inset 0 1px 0 rgba(255,255,255,0.55)",
                }}
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.85rem]"
                  style={{ backgroundColor: "rgba(255,255,255,0.72)" }}
                >
                  <BookOpen className="h-5 w-5" style={{ color: panel.green }} strokeWidth={2} />
                </span>
                <span className="min-w-0">
                  <span
                    className="block text-[15px] font-semibold tracking-[-0.02em]"
                    style={{ ...wsSans, color: panel.text }}
                  >
                    Инструкция: как получить ключ
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-[1.5]" style={{ ...wsSans, color: panel.textMuted }}>
                    {guideStepsSubtitle(guide.steps.length)}
                  </span>
                </span>
              </button>

              <a
                href={guide.cabinetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[3.25rem] flex-1 items-center justify-center gap-2 rounded-[1rem] border px-5 py-3.5 text-[14px] font-semibold transition hover:brightness-[1.02] sm:min-w-[180px]"
                style={{
                  ...wsSans,
                  borderColor: glass.borderSoft,
                  backgroundColor: "rgba(255,255,255,0.78)",
                  color: panel.greenDark,
                  boxShadow: "inset 0 0 0 1px rgba(46,90,67,0.08)",
                }}
              >
                Открыть кабинет
                <ExternalLink className="h-4 w-4" strokeWidth={2.2} />
              </a>
            </div>
          </div>
        </WsGlassPanel>

        {onRemoveIntegration ? (
          <div className="mt-8 border-t pt-6" style={{ borderColor: glass.borderSoft }}>
            <p className="text-[13px] leading-[1.6]" style={{ ...wsSans, color: panel.textMuted }}>
              Полный сброс площадки: исчезнет из списка подключённых, очистятся ключи, кэш отзывов и
              настройки этой площадки. Можно добавить её заново через мастер.
            </p>
            <button
              type="button"
              disabled={removingIntegration}
              onClick={() => setRemoveConfirmOpen(true)}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[1rem] border px-5 py-3.5 text-[14px] font-semibold transition hover:brightness-[1.02] disabled:opacity-50 sm:w-auto"
              style={{
                ...wsSans,
                borderColor: "rgba(180, 40, 40, 0.28)",
                backgroundColor: "rgba(220, 38, 38, 0.08)",
                color: "#9b2c2c",
              }}
            >
              {removingIntegration ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" strokeWidth={2.1} />
              )}
              {removingIntegration ? "Удаляем…" : "Удалить интеграцию площадки"}
            </button>
          </div>
        ) : null}
      </div>

      <WorkspaceApiGuideModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        marketplaceLabel={mpUi?.title ?? "Маркетплейс"}
        guide={guide}
      />

      <WorkspaceConfirmDialog
        open={removeConfirmOpen}
        title={`Удалить интеграцию ${mpUi?.title ?? "площадки"}?`}
        description="Будут сброшены подключение, настройки площадки, кэш отзывов и история ответов по этой площадке. Площадка исчезнет из списка — её можно добавить заново через мастер."
        confirmLabel="Удалить интеграцию"
        confirming={removingIntegration}
        onClose={() => {
          if (!removingIntegration) setRemoveConfirmOpen(false);
        }}
        onConfirm={async () => {
          if (!onRemoveIntegration) return;
          await onRemoveIntegration();
          setRemoveConfirmOpen(false);
        }}
      />
    </>
  );
}
