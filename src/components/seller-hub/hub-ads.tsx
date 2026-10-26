"use client";

import { Fragment, useCallback, useMemo, useState, type ReactNode } from "react";
import { Megaphone, Pause, Play } from "lucide-react";
import { addSellerHubAdNm, depositSellerHubAdBudget, removeSellerHubAdNm, setSellerHubAdPlacements, toggleSellerHubAd } from "@/lib/seller-hub/client-api";
import { placementsLabel } from "@/lib/seller-hub/ads-placements";
import { AD_DEPOSIT_MAX_RUB } from "@/lib/seller-hub/ads-deposit";
import type { SellerAdCampaignRow, SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import {
  formatInt,
  formatRub,
  formatSyncTime,
  hub,
  HubBadge,
  HubButton,
  HubEmptyState,
  HubInput,
  HubPanel,
  HubPanelHeader,
  HubSegmented,
  hubNumeric,
  hubSans,
} from "./hub-ui";
import { HubToast, useHubToast, type HubToastState } from "./hub-toast";
import { useAdsData } from "./hub-ads-data";
import { AdsOverview, AdsPeriodCaption, AdsPeriodControls, AdsProducts, AdsStatsGate, percent } from "./hub-ads-stats";
import { HubAdsBids } from "./hub-ads-bids";
import { HubAdsClusters } from "./hub-ads-clusters";
import { HubAdsBulk } from "./hub-ads-bulk";
import { HubSeo } from "./hub-seo";
import { HubAdsSources } from "./hub-ads-sources";
import { HubAdsReputation } from "./hub-ads-reputation";
import { HubAdsCards } from "./hub-ads-cards";
import { HubAdsAgent } from "./hub-ads-agent";
import { HubAdsReview } from "./hub-ads-review";

/** Вкладки раздела группируются: сверху пять-шесть крупных разделов, внутри группы второй ряд. */
type AdsTab = "overview" | "campaigns" | "products" | "queries" | "sources" | "seo" | "reputation" | "cards" | "promotions";

type AdsGroup = "overview" | "campaigns" | "queries" | "buyers" | "seo" | "promotions";

const TAB_LABEL: Record<AdsTab, string> = {
  overview: "Обзор",
  campaigns: "Список кампаний",
  products: "Товары в рекламе",
  queries: "Запросы и ставки",
  cards: "Карточки",
  sources: "Откуда покупки",
  reputation: "Репутация",
  seo: "Поиск и SEO",
  promotions: "Акции",
};

const AD_GROUPS: Array<{ id: AdsGroup; label: string; tabs: AdsTab[] }> = [
  { id: "overview", label: "Обзор", tabs: ["overview"] },
  { id: "campaigns", label: "Кампании", tabs: ["campaigns", "products"] },
  { id: "queries", label: "Запросы и ставки", tabs: ["queries"] },
  { id: "buyers", label: "Карточки и покупатели", tabs: ["cards", "sources", "reputation"] },
  { id: "seo", label: "Поиск и SEO", tabs: ["seo"] },
  { id: "promotions", label: "Акции", tabs: ["promotions"] },
];

/** WB ad status codes: 9 = active, 4/11 = ready/paused, 7 = ended */
function adStatusAction(status: number | undefined): "pause" | "start" | null {
  if (status === 9) return "pause";
  if (status === 4 || status === 11) return "start";
  return null;
}

export function HubAds({
  snapshot,
  connected,
  onUpdate,
  promotions,
  onOpenAgents,
}: {
  snapshot?: SellerCatalogSnapshot;
  connected?: boolean;
  onUpdate?: (campaigns: SellerAdCampaignRow[]) => void;
  /** Экран акций WB: показывается вкладкой «Акции» (та же страница, что и в меню «Акции»). */
  promotions?: ReactNode;
  /** Переход в раздел «Агенты»: правила агента рекламы настраиваются там. */
  onOpenAgents?: () => void;
}) {
  const [tab, setTab] = useState<AdsTab>("overview");
  const [lastInGroup, setLastInGroup] = useState<Partial<Record<AdsGroup, AdsTab>>>({});
  const activeGroup = AD_GROUPS.find((g) => g.tabs.includes(tab)) ?? AD_GROUPS[0]!;
  const [search, setSearch] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [depositFor, setDepositFor] = useState<string | null>(null);
  const [depositSum, setDepositSum] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [addFor, setAddFor] = useState<string | null>(null);
  const [addNm, setAddNm] = useState("");
  const [adding, setAdding] = useState(false);
  const [placeFor, setPlaceFor] = useState<string | null>(null);
  const [placeSearch, setPlaceSearch] = useState(true);
  const [placeRec, setPlaceRec] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [toast, setToast] = useState<HubToastState | null>(null);
  const { makeToast } = useHubToast();

  const ads = snapshot?.ads;
  const rows = useMemo(() => ads?.campaigns ?? [], [ads]);
  const data = useAdsData({ campaigns: rows, snapshot, connected });
  const adsByNm = useMemo(() => new Map(data.allProductRows.map((r) => [r.nmId, { spend: r.spend, orders: r.orders, orderSum: r.orderSum }])), [data.allProductRows]);
  const itemDetails = useMemo(() => new Map((snapshot?.items ?? []).map((i) => [i.externalId, { category: i.category, description: i.description }])), [snapshot?.items]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.name?.toLowerCase().includes(q) ||
        row.id.includes(q) ||
        row.statusLabel?.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const handleToggle = useCallback(
    async (campaign: SellerAdCampaignRow, action: "start" | "pause") => {
      if (!connected) return;
      const campaignId = Number(campaign.id);
      if (!campaignId) return;

      setTogglingId(campaign.id);
      try {
        const result = await toggleSellerHubAd({ campaignId, action });

        if (!result.ok) {
          setToast(makeToast(result.error ?? "Ошибка управления кампанией", "error"));
          return;
        }

        // Optimistic update: flip status
        const newStatus = action === "start" ? 9 : 4;
        const newStatusLabel = action === "start" ? "Активна" : "На паузе";
        const updatedCampaigns = rows.map((r) =>
          r.id === campaign.id ? { ...r, status: newStatus, statusLabel: newStatusLabel } : r
        );
        onUpdate?.(updatedCampaigns);

        setToast(makeToast(action === "start" ? "Кампания запущена" : "Кампания на паузе", "ok"));
      } catch (err) {
        setToast(
          makeToast(err instanceof Error ? err.message : "Ошибка при переключении кампании", "error")
        );
      } finally {
        setTogglingId(null);
      }
    },
    [connected, rows, makeToast, onUpdate]
  );

  const parsedDeposit = Number(depositSum.replace(/\s/g, ""));
  const depositValid = Number.isInteger(parsedDeposit) && parsedDeposit >= 1 && parsedDeposit <= AD_DEPOSIT_MAX_RUB;

  /** Пополнение двигает деньги: вызывается только по кнопке подтверждения с видимой суммой. */
  async function confirmDeposit(campaign: SellerAdCampaignRow) {
    if (!connected || !depositValid || depositing) return;
    setDepositing(true);
    try {
      const result = await depositSellerHubAdBudget({ campaignId: Number(campaign.id), sum: parsedDeposit });
      if (!result.ok) {
        setToast(makeToast(result.error ?? "Не удалось пополнить бюджет", "error"));
        return;
      }
      const newBudget = result.budget ?? (campaign.budget ?? 0) + parsedDeposit;
      onUpdate?.(rows.map((r) => (r.id === campaign.id ? { ...r, budget: newBudget } : r)));
      setToast(makeToast(`Бюджет кампании пополнен на ${formatRub(parsedDeposit)}`, "ok"));
      setDepositFor(null);
      setDepositSum("");
    } catch (err) {
      setToast(makeToast(err instanceof Error ? err.message : "Не удалось пополнить бюджет", "error"));
    } finally {
      setDepositing(false);
    }
  }

  if (!ads || rows.length === 0) {
    return (
      <HubPanel className="flex min-h-[420px] flex-col">
        <HubEmptyState
          icon={<Megaphone className="h-7 w-7" />}
          title={ads && ads.totalCount > 0 ? "Кампании найдены, но детали не прочитались" : "Рекламные кампании не найдены"}
          description={
            ads && ads.totalCount > 0
              ? `WB насчитал кампаний: ${ads.totalCount}, но подробности не вернул${
                  ads.detailsHttpStatus ? ` (код ${ads.detailsHttpStatus})` : ""
                }. Попробуйте обновить данные позже.`
              : "После выгрузки здесь появятся кампании из раздела «Продвижение» WB. Нужна соответствующая категория в API-токене."
          }
        />
      </HubPanel>
    );
  }

  const gate = <AdsStatsGate data={data} />;
  const statsReady = data.summary != null && data.current.stats != null;

  return (
    <div className="space-y-5">
      <div
        className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border sm:grid-cols-3 xl:grid-cols-5"
        style={{ borderColor: hub.border, backgroundColor: hub.border }}
      >
        {[
          { label: "Кампании", value: formatInt(ads.totalCount), sub: "всего в кабинете", color: hub.text },
          { label: "Показываются", value: formatInt(ads.activeCount), sub: "активные сейчас", color: hub.green },
          { label: "На паузе / готовы", value: formatInt(ads.pausedCount), sub: "не показываются", color: ads.pausedCount > 0 ? hub.warn : hub.text },
          { label: "Счёт продвижения", value: ads.accountNet != null ? formatRub(ads.accountNet) : "—", sub: "пополняет продавец", color: hub.text },
          { label: "Баланс (взаиморасчёт)", value: ads.balance != null ? formatRub(ads.balance) : "—", sub: "оплата из будущих продаж", color: hub.text },
        ].map((cell) => (
          <div key={cell.label} className="px-4 py-3" style={{ backgroundColor: hub.surface }}>
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
              {cell.label}
            </p>
            <p className="mt-1 text-[22px] font-semibold leading-none tracking-[-0.02em]" style={{ ...hubSans, ...hubNumeric, color: cell.color }}>
              {cell.value}
            </p>
            <p className="mt-1 text-[12px]" style={{ ...hubSans, color: hub.textMuted }}>
              {cell.sub}
            </p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-3 py-2.5" style={{ borderColor: hub.border, backgroundColor: hub.surface }}>
        <div className="flex min-w-0 flex-col gap-2">
          <HubSegmented<AdsGroup>
            layoutId="ads-groups"
            value={activeGroup.id}
            onChange={(id) => {
              const group = AD_GROUPS.find((g) => g.id === id)!;
              setTab(lastInGroup[id] ?? group.tabs[0]!);
            }}
            options={AD_GROUPS.filter((g) => g.id !== "promotions" || promotions).map((g) => ({
              id: g.id,
              label: g.id === "overview" && data.advice.length > 0 ? `${g.label} · ${data.advice.length}` : g.label,
            }))}
          />
          {activeGroup.tabs.length > 1 ? (
            <HubSegmented<AdsTab>
              layoutId={`ads-sub-${activeGroup.id}`}
              value={tab}
              onChange={(next) => {
                setLastInGroup((prev) => ({ ...prev, [activeGroup.id]: next }));
                setTab(next);
              }}
              options={activeGroup.tabs.map((id) => ({ id, label: TAB_LABEL[id] }))}
            />
          ) : null}
        </div>        {tab !== "promotions" && tab !== "seo" && tab !== "reputation" && tab !== "cards" ? <AdsPeriodControls data={data} /> : null}
      </div>
      {tab !== "promotions" && tab !== "seo" && tab !== "reputation" && tab !== "cards" ? <AdsPeriodCaption data={data} /> : null}

      {tab === "overview" && statsReady ? <HubAdsReview data={data} campaigns={rows} onCampaignsUpdate={(updated) => onUpdate?.(updated)} onGoTab={(next) => setTab(next)} /> : null}
      {tab === "overview" && statsReady ? <HubAdsAgent variant="compact" data={data} campaigns={rows} accountRub={ads.accountNet ?? null} onCampaignsUpdate={(updated) => onUpdate?.(updated)} onOpenAgents={onOpenAgents} /> : null}
      {tab === "overview" ? (statsReady ? <AdsOverview
              data={data}
              onCampaignCreated={(row) => onUpdate?.([...rows, row])}
              onDeposit={(campaignId, sumRub) => {
                setTab("campaigns");
                setDepositFor(campaignId);
                setDepositSum(String(sumRub));
              }}
              onPause={async (campaignId) => {
                const campaign = rows.find((row) => row.id === campaignId);
                if (campaign) await handleToggle(campaign, "pause");
              }}
              onRemoveNm={async (campaignId, nmId) => {
                const result = await removeSellerHubAdNm({ advertId: Number(campaignId), nmId: Number(nmId) });
                if (!result.ok) {
                  setToast(makeToast(result.error ?? "Не удалось убрать товар из кампании", "error"));
                  return;
                }
                onUpdate?.(
                  rows.map((row) =>
                    row.id === campaignId ? { ...row, bids: (row.bids ?? []).filter((bid) => bid.nmId !== nmId) } : row,
                  ),
                );
                setToast(makeToast("Товар убран из кампании", "ok"));
              }}
            /> : gate) : null}
      {tab === "products" ? (statsReady ? <AdsProducts data={data} /> : gate) : null}
      {tab === "sources" ? <HubAdsSources snapshot={snapshot} data={data} /> : null}
      {tab === "promotions" ? promotions : null}
      {tab === "cards" ? <HubAdsCards snapshot={snapshot} adsByNm={adsByNm} campaigns={rows} onCampaignsUpdate={(updated) => onUpdate?.(updated)} onGoTab={(next) => setTab(next)} /> : null}
      {tab === "reputation" ? <HubAdsReputation snapshot={snapshot} titles={data.titles} /> : null}
      {tab === "seo" ? <HubSeo snapshot={snapshot} connected={connected} /> : null}

      {tab === "queries" ? (
        <div className="space-y-4">
          <div className="rounded-2xl p-4" style={{ backgroundColor: hub.surface }}>
            <HubAdsBids campaigns={rows} titles={data.titles} />
          </div>
          <div className="rounded-2xl p-4" style={{ backgroundColor: hub.surface }}>
            {data.current.stats ? (
              <HubAdsClusters stats={data.current.stats} titles={data.titles} campaignNames={data.campaignNames} details={itemDetails} />
            ) : (
              gate
            )}
          </div>
        </div>
      ) : null}

      {tab === "campaigns" ? (
        <HubAdsBulk campaigns={rows} products={data.advisorProducts} onCreated={(created) => onUpdate?.([...rows, ...created])} />
      ) : null}

      {tab === "campaigns" ? (
        <HubPanel>
          <HubPanelHeader
            title="Рекламные кампании"
            hint={`Обновлено ${formatSyncTime(snapshot?.syncedAt)}. Расход, заказы и ДРР — за выбранный период.`}
          />

          <div className="border-b px-5 py-3 sm:px-6" style={{ borderColor: hub.borderSoft }}>
            <HubInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию или ID кампании"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left">
              <thead style={{ backgroundColor: hub.surfaceMuted }}>
                <tr>
                  {["Кампания", "Статус", "Оплата", "Остаток бюджета", "Дневной лимит", "Расход", "Заказы", "ДРР", ""].map((label) => (
                    <th
                      key={label}
                      className="border-b px-4 py-3 text-[11.5px] font-bold uppercase tracking-[0.06em] sm:px-5"
                      style={{ ...hubSans, color: hub.textSubtle, borderColor: hub.borderSoft }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const action = adStatusAction(row.status);
                  const isToggling = togglingId === row.id;
                  const s = data.byCampaign.get(row.id);
                  return (
                    <Fragment key={row.id}>
                      <tr className="border-b transition-colors duration-150 hover:bg-[#1C1915]/[0.04]" style={{ borderColor: hub.borderSoft }}>
                        <td className="max-w-[240px] px-4 py-3 sm:px-5">
                          <p className="truncate text-[13.5px] font-medium">{row.name ?? "—"}</p>
                          <p className="font-mono text-[11.5px]" style={{ color: hub.textSubtle }}>
                            {row.id}
                          </p>
                        </td>
                        <td className="px-4 py-3 sm:px-5">
                          <HubBadge tone={row.status === 9 ? "ok" : row.status === 11 ? "warn" : "accent"}>
                            {row.statusLabel ?? "—"}
                          </HubBadge>
                        </td>
                        <td className="px-4 py-3 text-[13px] uppercase sm:px-5">{row.paymentType ?? "—"}</td>
                        <td className="px-4 py-3 text-[13.5px] font-semibold sm:px-5" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
                          {row.budget != null ? formatRub(row.budget) : "—"}
                        </td>
                        <td className="px-4 py-3 text-[13.5px] sm:px-5" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
                          {row.paymentType !== "cpc"
                            ? "только CPC"
                            : row.dailyLimit === undefined
                              ? "—"
                              : row.dailyLimit === null
                                ? "не задан"
                                : formatRub(row.dailyLimit.limitRub)}
                        </td>
                        <td className="px-4 py-3 text-[13.5px] sm:px-5" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
                          {s ? formatRub(s.spend) : "—"}
                        </td>
                        <td className="px-4 py-3 text-[13.5px] sm:px-5" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
                          {s ? `${formatInt(s.orders)} · ${formatRub(s.orderSum)}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-[13.5px] sm:px-5" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
                          {s ? percent(s.drr) : "—"}
                        </td>
                        <td className="px-4 py-3 sm:px-5">
                          <div className="flex flex-wrap items-center gap-2">
                            {connected && (row.status === 9 || row.status === 4 || row.status === 11) ? (
                              <HubButton
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setDepositFor(depositFor === row.id ? null : row.id);
                                  setDepositSum("");
                                }}
                                aria-label="Пополнить бюджет"
                              >
                                Пополнить
                              </HubButton>
                            ) : null}
                            {connected && (row.status === 9 || row.status === 4 || row.status === 11) ? (
                              <HubButton size="sm" variant="secondary" onClick={() => { setAddFor(addFor === row.id ? null : row.id); setAddNm(""); }}>
                                Добавить товар
                              </HubButton>
                            ) : null}
                            {connected && row.paymentType === "cpm" && (row.bidType == null || row.bidType === "manual") && (row.status === 9 || row.status === 4 || row.status === 11) ? (
                              <HubButton size="sm" variant="secondary" onClick={() => { const open = placeFor === row.id; setPlaceFor(open ? null : row.id); setPlaceSearch(row.placements?.search ?? true); setPlaceRec(row.placements?.recommendations ?? true); }}>
                                Зоны показов
                              </HubButton>
                            ) : null}
                            {connected && action ? (
                              <HubButton
                                size="sm"
                                variant="secondary"
                                loading={isToggling}
                                onClick={() => void handleToggle(row, action)}
                                aria-label={action === "start" ? "Запустить" : "Поставить на паузу"}
                              >
                                {action === "start" ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                                {action === "start" ? "Запустить" : "Пауза"}
                              </HubButton>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {addFor === row.id ? (
                        <tr style={{ backgroundColor: hub.surfaceMuted }}>
                          <td colSpan={9} className="px-5 py-4 sm:px-6">
                            <p className="text-[13.5px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                              Добавить товар в кампанию «{row.name ?? row.id}»
                            </p>
                            <p className="mt-1 text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                              WB поставит новому товару минимальную ставку, деньги не списываются. Ставку и бюджет задайте после. В кампании не больше 50 товаров. Лучше добавлять товары с маржой и остатком.
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <select
                                value={addNm}
                                onChange={(e) => setAddNm(e.target.value)}
                                className="max-w-[420px] rounded-md border px-2 py-2 text-[13px]"
                                style={{ borderColor: hub.border, color: hub.text }}
                                aria-label="Товар для добавления"
                              >
                                <option value="">Выберите товар</option>
                                {data.advisorProducts
                                  .filter((p) => !(row.bids ?? []).some((b) => b.nmId === p.nmId))
                                  .sort((a, b) => Number((b.marginRub ?? 0) > 0 && (b.stock ?? 0) > 0) - Number((a.marginRub ?? 0) > 0 && (a.stock ?? 0) > 0) || (b.marginRub ?? 0) - (a.marginRub ?? 0))
                                  .slice(0, 80)
                                  .map((p) => (
                                    <option key={p.nmId} value={p.nmId}>
                                      {p.title} · {p.nmId}
                                      {p.marginRub != null ? ` · маржа ${formatRub(p.marginRub)}` : ""}
                                      {p.stock != null ? ` · остаток ${p.stock}` : ""}
                                    </option>
                                  ))}
                              </select>
                              <HubButton
                                size="sm"
                                loading={adding}
                                disabled={!addNm || adding}
                                onClick={async () => {
                                  setAdding(true);
                                  const res = await addSellerHubAdNm({ advertId: Number(row.id), nmId: Number(addNm) });
                                  setAdding(false);
                                  if (!res.ok) {
                                    setToast(makeToast(res.error ?? "Не удалось добавить товар", "error"));
                                    return;
                                  }
                                  onUpdate?.(rows.map((r) => (r.id === row.id ? { ...r, bids: [...(r.bids ?? []), { nmId: addNm, searchRub: null, recommendationsRub: null }] } : r)));
                                  setToast(makeToast("Товар добавлен в кампанию", "ok"));
                                  setAddFor(null);
                                  setAddNm("");
                                }}
                              >
                                Добавить в кампанию
                              </HubButton>
                              <HubButton size="sm" variant="secondary" disabled={adding} onClick={() => setAddFor(null)}>
                                Отмена
                              </HubButton>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                      {placeFor === row.id ? (
                        <tr style={{ backgroundColor: hub.surfaceMuted }}>
                          <td colSpan={9} className="px-5 py-4 sm:px-6">
                            <p className="text-[13.5px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                              Зоны показов кампании «{row.name ?? row.id}»
                            </p>
                            <p className="mt-1 text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                              Сейчас: {row.placements ? placementsLabel(row.placements) : "WB не вернул текущие зоны"}. Деньги не списываются, меняется только то, где показывается реклама. Обе зоны отключить нельзя: для остановки есть пауза.
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-4">
                              <label className="flex items-center gap-2 text-[13px]" style={{ ...hubSans, color: hub.text }}>
                                <input type="checkbox" checked={placeSearch} onChange={(e) => setPlaceSearch(e.target.checked)} className="h-4 w-4" />
                                Поиск
                              </label>
                              <label className="flex items-center gap-2 text-[13px]" style={{ ...hubSans, color: hub.text }}>
                                <input type="checkbox" checked={placeRec} onChange={(e) => setPlaceRec(e.target.checked)} className="h-4 w-4" />
                                Рекомендации
                              </label>
                              <HubButton
                                size="sm"
                                loading={placing}
                                disabled={placing || (!placeSearch && !placeRec)}
                                onClick={async () => {
                                  setPlacing(true);
                                  const res = await setSellerHubAdPlacements({ advertId: Number(row.id), search: placeSearch, recommendations: placeRec });
                                  setPlacing(false);
                                  if (!res.ok) {
                                    setToast(makeToast(res.error ?? "Не удалось изменить зоны", "error"));
                                    return;
                                  }
                                  onUpdate?.(rows.map((r) => (r.id === row.id ? { ...r, placements: { search: placeSearch, recommendations: placeRec } } : r)));
                                  setToast(makeToast(`Зоны показов: ${placementsLabel({ search: placeSearch, recommendations: placeRec })}`, "ok"));
                                  setPlaceFor(null);
                                }}
                              >
                                Применить
                              </HubButton>
                              <HubButton size="sm" variant="secondary" disabled={placing} onClick={() => setPlaceFor(null)}>
                                Отмена
                              </HubButton>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                      {depositFor === row.id ? (
                        <tr style={{ backgroundColor: hub.surfaceMuted }}>
                          <td colSpan={9} className="px-5 py-4 sm:px-6">
                            <p className="text-[13.5px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                              Пополнить бюджет кампании «{row.name ?? row.id}»
                            </p>
                            <p className="mt-1 text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                              Деньги спишутся со счёта продвижения WB
                              {ads.accountNet != null ? ` (сейчас на счёте ${formatRub(ads.accountNet)})` : ""}. Сейчас бюджет
                              кампании {row.budget != null ? formatRub(row.budget) : "неизвестен"}. Отменить пополнение после
                              подтверждения нельзя.
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <HubInput
                                value={depositSum}
                                onChange={(e) => setDepositSum(e.target.value)}
                                placeholder="Сумма, ₽"
                                inputMode="numeric"
                                className="max-w-[160px]"
                                aria-label="Сумма пополнения, рублей"
                              />
                              {[500, 1000, 3000, 5000].map((preset) => (
                                <HubButton key={preset} size="sm" variant="secondary" onClick={() => setDepositSum(String(preset))}>
                                  {formatRub(preset)}
                                </HubButton>
                              ))}
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <HubButton
                                size="sm"
                                loading={depositing}
                                disabled={!depositValid || depositing}
                                onClick={() => void confirmDeposit(row)}
                              >
                                {depositValid ? `Пополнить на ${formatRub(parsedDeposit)}` : "Введите сумму"}
                              </HubButton>
                              <HubButton size="sm" variant="secondary" disabled={depositing} onClick={() => setDepositFor(null)}>
                                Отмена
                              </HubButton>
                              <span className="text-[12px]" style={{ ...hubSans, color: hub.textSubtle }}>
                                Не больше {formatRub(AD_DEPOSIT_MAX_RUB)} за раз.
                              </span>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </HubPanel>
      ) : null}

      {toast ? <HubToast toast={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}
