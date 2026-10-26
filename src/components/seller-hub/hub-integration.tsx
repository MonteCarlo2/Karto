"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { autoRepliesAuthorizedFetch } from "@/lib/auto-replies/auto-replies-fetch";
import { sellerHubApiGuide } from "@/lib/seller-hub/api-guide";
import { sellerHubMarketplaceMeta } from "@/lib/seller-hub/nav";
import type { SellerHubConnection, SellerHubScope } from "@/lib/seller-hub/types";
import {
  formatSyncTime,
  hub,
  HubBadge,
  HubButton,
  HubField,
  HubInput,
  HubPanel,
  HubPanelHeader,
  hubSans,
  hubSerif,
} from "./hub-ui";

const SCOPE_KEY_BY_LABEL: Record<string, SellerHubScope> = {
  Контент: "content",
  "Цены и скидки": "prices",
  Статистика: "stocks",
  Маркетплейс: "marketplace",
  Аналитика: "analytics",
  Поставки: "supplies",
  Продвижение: "promotion",
  "Календарь акций": "promotion",
  Product: "content",
  Prices: "prices",
  Stocks: "stocks",
  Analytics: "analytics",
  "Просмотр товаров и карточек": "content",
  "Настройка магазинов": "content",
  "Просмотр информации о заказах": "analytics",
};

export function HubIntegration({
  connection,
  wbTokenDraft = "",
  onWbTokenDraftChange,
  onPatch,
  onVerify,
  onSync,
  onDisconnect,
  verifying,
  syncing,
  error,
  notice,
}: {
  connection: SellerHubConnection;
  /** Черновик WB-токена только в UI; не через onPatch / localStorage. */
  wbTokenDraft?: string;
  onWbTokenDraftChange?: (value: string) => void;
  onPatch: (patch: Partial<SellerHubConnection>) => void;
  onVerify: (mode?: "connect" | "replace" | "recheck") => void;
  onSync: () => void;
  onDisconnect: () => void;
  verifying: boolean;
  syncing: boolean;
  error: string | null;
  notice: string | null;
}) {
  const [showKey, setShowKey] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const marketplaceId = connection.marketplaceId;
  const meta = sellerHubMarketplaceMeta(marketplaceId);
  const guide = sellerHubApiGuide(marketplaceId);
  const isConnected = connection.status === "active" && Boolean(connection.verifiedAt);

  const secondaryReady =
    marketplaceId === "ozon"
      ? Boolean(connection.clientId?.trim())
      : marketplaceId === "yandex"
        ? Boolean(connection.campaignId?.trim())
        : true;
  const draftKey =
    marketplaceId === "wildberries" ? wbTokenDraft.trim() : connection.apiKey.trim();
  const canConnect = Boolean(draftKey) && secondaryReady && !verifying;
  const canReplace = isConnected && Boolean(draftKey) && !verifying;
  const canRecheck = marketplaceId === "wildberries" && isConnected && !draftKey && !verifying;

  const resetVerification = {
    status: "idle" as const,
    verifiedAt: undefined,
    lastError: undefined,
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="space-y-5">
        <HubPanel padded>
          <h2 className="text-[16px] font-semibold" style={hubSans}>Какая категория токена за какой экран</h2>
          <ul className="mt-3 space-y-1.5 text-[14px]" style={{ color: hub.textMuted }}>
            <li>Контент — товары, фото и описание.</li>
            <li>Цены и скидки — правка цены и участие в акциях.</li>
            <li>Маркетплейс — заказы, сборка и остатки FBS.</li>
            <li>Аналитика — заказы, оборот и выкупы по дням.</li>
            <li>Поставки — план FBS и FBO.</li>
            <li>Продвижение — кампании и баланс рекламы.</li>
            <li>Финансы — баланс, к выводу и документы.</li>
          </ul>
        </HubPanel>
        <HubPanel>
          <div
            className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-5 sm:px-6"
            style={{
              borderColor: hub.borderSoft,
              background:
                "linear-gradient(118deg, rgba(46,90,67,0.055) 0%, rgba(255,255,255,0.6) 52%, rgba(185,255,75,0.1) 100%)",
            }}
          >
            <div className="flex min-w-0 items-start gap-3.5">
              <div
                className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[13px] ring-1 ring-black/[0.06]"
                style={{ boxShadow: "0 8px 22px -14px rgba(46,90,67,0.4)" }}
              >
                <Image src={meta.logo} alt="" fill className="object-cover" sizes="48px" unoptimized />
              </div>
              <div className="min-w-0">
                <h2
                  className="text-[20px] font-bold leading-[1.15] tracking-[-0.025em]"
                  style={{ ...hubSerif, color: hub.text }}
                >
                  {connection.sellerName?.trim() || meta.name}
                </h2>
                <p className="mt-1 text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
                  {meta.name} · {guide.cabinetName}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              {isConnected ? (
                <HubBadge tone="ok">
                  <Check className="h-3 w-3" />
                  Подключён
                </HubBadge>
              ) : connection.status === "error" ? (
                <HubBadge tone="danger">Ошибка подключения</HubBadge>
              ) : (
                <HubBadge tone="muted">Не подключён</HubBadge>
              )}
              {connection.verifiedAt ? (
                <span className="text-[11.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                  проверен {formatSyncTime(connection.verifiedAt)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="space-y-4 px-5 py-5 sm:px-6">
            <p className="text-[13.5px] leading-[1.65]" style={{ ...hubSans, color: hub.textMuted }}>
              {guide.scopesHint}
            </p>

            {marketplaceId === "ozon" ? (
              <HubField label={guide.clientIdLabel ?? "Client ID"}>
                <HubInput
                  value={connection.clientId ?? ""}
                  onChange={(e) => onPatch({ clientId: e.target.value, ...resetVerification })}
                  placeholder={guide.clientIdPlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                />
              </HubField>
            ) : null}

            {marketplaceId === "yandex" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <HubField label={guide.campaignIdLabel ?? "Campaign ID"}>
                  <HubInput
                    value={connection.campaignId ?? ""}
                    onChange={(e) => onPatch({ campaignId: e.target.value, ...resetVerification })}
                    placeholder={guide.campaignIdPlaceholder}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </HubField>
                <HubField label={guide.businessIdLabel ?? "Business ID"}>
                  <HubInput
                    value={connection.businessId ?? ""}
                    onChange={(e) => onPatch({ businessId: e.target.value, ...resetVerification })}
                    placeholder={guide.businessIdPlaceholder}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </HubField>
              </div>
            ) : null}

            <HubField
              label={guide.apiKeyLabel}
              hint={
                marketplaceId === "wildberries"
                  ? isConnected
                    ? "Токен уже сохранён на сервере. Поле нужно только чтобы заменить его — после сохранения оно очищается."
                    : "Токен проверяется и сохраняется на сервере в зашифрованном виде. В браузере после подключения он не остаётся."
                  : "Ключ хранится в вашем браузере и уходит на сервер KARTO только на время запроса к маркетплейсу."
              }
            >
              <div className="relative">
                <HubInput
                  type={showKey ? "text" : "password"}
                  value={marketplaceId === "wildberries" ? wbTokenDraft : connection.apiKey}
                  onChange={(e) => {
                    if (marketplaceId === "wildberries") {
                      onWbTokenDraftChange?.(e.target.value);
                      if (!isConnected) onPatch({ ...resetVerification });
                      return;
                    }
                    onPatch({
                      apiKey: e.target.value,
                      ...resetVerification,
                    });
                  }}
                  placeholder={
                    marketplaceId === "wildberries" && isConnected
                      ? "Новый токен для замены"
                      : guide.apiKeyPlaceholder
                  }
                  autoComplete="off"
                  spellCheck={false}
                  className="pr-11 font-mono text-[13px]"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[8px] p-2 transition-colors hover:bg-black/[0.05]"
                  style={{ color: hub.textMuted }}
                  aria-label={showKey ? "Скрыть ключ" : "Показать ключ"}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </HubField>

            {error ? (
              <div
                className="flex items-start gap-2.5 rounded-[12px] border px-3.5 py-3"
                style={{ backgroundColor: hub.dangerSoft, borderColor: "rgba(192,57,43,0.2)" }}
              >
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: hub.danger }} />
                <p className="text-[13px] leading-[1.55]" style={{ ...hubSans, color: hub.danger }}>
                  {error}
                </p>
              </div>
            ) : null}

            {notice && !error ? (
              <div
                className="flex items-start gap-2.5 rounded-[12px] border px-3.5 py-3"
                style={{ backgroundColor: hub.greenSoft, borderColor: "rgba(46,90,67,0.18)" }}
              >
                <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: hub.greenDark }} />
                <p className="text-[13px] leading-[1.55]" style={{ ...hubSans, color: hub.greenDark }}>
                  {notice}
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              {marketplaceId === "wildberries" && isConnected ? (
                <HubButton
                  onClick={() => onVerify(draftKey ? "replace" : "recheck")}
                  disabled={draftKey ? !canReplace : !canRecheck}
                  loading={verifying}
                >
                  <ShieldCheck className="h-4 w-4" />
                  {draftKey ? "Заменить токен" : "Проверить подключение"}
                </HubButton>
              ) : (
                <HubButton onClick={() => onVerify("connect")} disabled={!canConnect} loading={verifying}>
                  <ShieldCheck className="h-4 w-4" />
                  Проверить подключение
                </HubButton>
              )}
              <HubButton variant="secondary" onClick={onSync} disabled={!isConnected || syncing} loading={syncing}>
                <RefreshCw className="h-4 w-4" />
                Выгрузить каталог
              </HubButton>
              <a
                href={guide.cabinetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[42px] items-center gap-2 rounded-[11px] px-3.5 text-[13.5px] font-semibold transition-colors hover:bg-black/[0.05]"
                style={{ ...hubSans, color: hub.textMuted }}
              >
                Открыть кабинет
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </HubPanel>

        <HubPanel>
          <button
            type="button"
            onClick={() => setGuideOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-[#161814]/[0.035] sm:px-6"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
                style={{ backgroundColor: hub.greenSoft, color: hub.greenDark }}
              >
                <BookOpen className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span
                  className="block text-[14.5px] font-semibold"
                  style={{ ...hubSans, color: hub.text }}
                >
                  Инструкция: как получить токен
                </span>
                <span className="block text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
                  {guide.steps.length} шагов · если не нашли ключ сами
                </span>
              </span>
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform duration-200 ${guideOpen ? "rotate-180" : ""}`}
              style={{ color: hub.textMuted }}
            />
          </button>

          {guideOpen ? (
            <div
              className="space-y-3 border-t px-5 py-5 sm:px-6"
              style={{ borderColor: hub.borderSoft, backgroundColor: hub.surfaceMuted }}
            >
              {guide.steps.map((step, index) => (
                <article
                  key={step.title}
                  className="rounded-[14px] border p-4"
                  style={{ borderColor: hub.borderSoft, backgroundColor: hub.surface }}
                >
                  <div className="flex gap-3.5">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[13px] font-bold"
                      style={{
                        ...hubSans,
                        backgroundColor: "rgba(185,255,75,0.28)",
                        color: hub.greenDark,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h4
                        className="text-[14.5px] font-semibold tracking-[-0.01em]"
                        style={{ ...hubSans, color: hub.text }}
                      >
                        {step.title}
                      </h4>
                      <p
                        className="mt-1.5 text-[13px] leading-[1.65]"
                        style={{ ...hubSans, color: hub.textMuted }}
                      >
                        {step.description}
                      </p>
                      {step.bullets?.length ? (
                        <ul className="mt-2.5 flex flex-wrap gap-1.5">
                          {step.bullets.map((b) => (
                            <li key={b}>
                              <HubBadge tone="ok">{b}</HubBadge>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}

              <div className="flex flex-wrap gap-2 pt-1">
                {guide.officialDocs.map((doc) => (
                  <a
                    key={doc.url}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12.5px] font-semibold transition-colors hover:bg-[#161814]/[0.035]"
                    style={{ ...hubSans, color: hub.lime, backgroundColor: hub.surfaceMuted, boxShadow: `inset 0 0 0 1px ${hub.borderSoft}` }}
                  >
                    {doc.label}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </HubPanel>
      </div>

      <div className="space-y-5">
        <HubPanel>
          <HubPanelHeader
            title="Доступы токена"
            hint="После проверки видно, какие данные KARTO уже может забирать из кабинета."
          />
          <ul className="divide-y" style={{ borderColor: hub.borderSoft }}>
            {guide.scopes.map((scope) => {
              const key = SCOPE_KEY_BY_LABEL[scope.label];
              const state = key ? connection.scopes?.[key] : undefined;
              const checked = state === true;
              const failed = state === false;

              return (
                <li key={scope.label} className="flex items-start gap-3 px-5 py-3.5 sm:px-6">
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                    style={{
                      backgroundColor: checked
                        ? hub.greenSoft
                        : failed
                          ? hub.dangerSoft
                          : "rgba(22,24,20,0.06)",
                      color: checked ? hub.green : failed ? hub.danger : hub.textSubtle,
                    }}
                  >
                    {checked ? <Check className="h-3 w-3" /> : failed ? "!" : "•"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className="text-[13.5px] font-semibold"
                        style={{ ...hubSans, color: hub.text }}
                      >
                        {scope.label}
                      </p>
                      {scope.required ? <HubBadge tone="warn">обязательно</HubBadge> : null}
                    </div>
                    <p
                      className="mt-0.5 text-[12.5px] leading-[1.55]"
                      style={{ ...hubSans, color: hub.textMuted }}
                    >
                      {scope.purpose}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </HubPanel>

        {marketplaceId === "wildberries" && (isConnected || connection.verifiedAt) ? (
          <MarginCabinetSettings marketplaceId={marketplaceId} />
        ) : null}

        {draftKey || connection.verifiedAt || isConnected ? (
          <HubPanel padded>
            <p className="text-[13px] leading-[1.6]" style={{ ...hubSans, color: hub.textMuted }}>
              {marketplaceId === "wildberries"
                ? "Отключение удалит серверный токен Seller Hub. Каталог и закупка в браузере останутся. Данные в кабинете WB не меняются."
                : "Полный сброс площадки: очистятся ключ, выгруженный каталог и настройки этой площадки в Seller Hub. Данные в кабинете маркетплейса не меняются."}
            </p>
            <div className="mt-3.5">
              <HubButton variant="danger" size="sm" onClick={onDisconnect}>
                <Trash2 className="h-3.5 w-3.5" />
                Отключить площадку
              </HubButton>
            </div>
          </HubPanel>
        ) : null}
      </div>
    </div>
  );
}

function MarginCabinetSettings({ marketplaceId }: { marketplaceId: string }) {
  const [target, setTarget] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await autoRepliesAuthorizedFetch(
          `/api/seller-hub/settings?marketplaceId=${encodeURIComponent(marketplaceId)}`,
          { method: "GET", timeoutMs: 15_000 },
        );
        const data = (await res.json()) as {
          targetMarginPercent?: number | null;
        };
        if (cancelled) return;
        setTarget(
          data.targetMarginPercent == null ? "" : String(data.targetMarginPercent),
        );
      } catch {
        if (!cancelled) setStatus("Не удалось загрузить настройки маржи.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [marketplaceId]);

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await autoRepliesAuthorizedFetch("/api/seller-hub/settings", {
        method: "PATCH",
        body: JSON.stringify({
          marketplaceId,
          targetMarginPercent: target.trim() === "" ? null : Number(target),
          taxRatePercent: null,
        }),
        timeoutMs: 15_000,
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setStatus(data.error ?? "Не сохранилось.");
        return;
      }
      setStatus("Сохранено. Задачи пересчитаются при следующем прогоне.");
    } catch {
      setStatus("Не сохранилось.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <HubPanel padded>
      <HubPanelHeader
        title="Маржа кабинета"
        hint="Необязательно. Без целевой маржи задача «ниже целевой» не создаётся. Маржа = цена − услуги WB − себестоимость; налог в неё не входит."
      />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <HubField label="Целевая маржа, %">
          <HubInput
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Например, 20"
            inputMode="decimal"
          />
        </HubField>
      </div>
      <div className="mt-3.5 flex flex-wrap items-center gap-3">
        <HubButton size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? "Сохраняю…" : "Сохранить"}
        </HubButton>
        {status ? (
          <p className="text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
            {status}
          </p>
        ) : null}
      </div>
    </HubPanel>
  );
}
