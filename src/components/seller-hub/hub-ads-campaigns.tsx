"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Lightbulb, Pause, Play } from "lucide-react";
import { campaignComposition } from "@/lib/seller-hub/ads-review";
import { summarizeAds } from "@/lib/seller-hub/ads-metrics";
import { suggestedDepositRub } from "@/lib/seller-hub/ads-advisor";
import { addSellerHubAdNm, depositSellerHubAdBudget, setSellerHubAdPlacements, toggleSellerHubAd } from "@/lib/seller-hub/client-api";
import { AD_DEPOSIT_MAX_RUB } from "@/lib/seller-hub/ads-deposit";
import { placementsLabel } from "@/lib/seller-hub/ads-placements";
import type { SellerAdCampaignRow } from "@/lib/seller-hub/types";
import { Card, EmptyNote } from "./hub-analytics-ui";
import { Thumb } from "./hub-fulfillment-ui";
import type { AdsData } from "./hub-ads-data";
import { isRecommended, ProductPicker } from "./hub-ads-product-picker";
import { ProductChips } from "./hub-ads-review";
import { HelpTip } from "./hub-help-tip";
import { percent } from "./hub-ads-stats";
import { HubToast, useHubToast, type HubToastState } from "./hub-toast";
import { formatInt, formatRub, hub, HubButton, HubInput, hubSans } from "./hub-ui";
import type { AdsReviewState } from "./use-ads-review";
import { usePagedLimit } from "./use-paged-limit";

/** Статусы WB: 9 — идёт показ, 4 и 11 — готова или на паузе, 7 — завершена. */
const ACTIVE_STATES = new Set([9, 4, 11]);
const statusAction = (status: number | undefined): "pause" | "start" | null => (status === 9 ? "pause" : status === 4 || status === 11 ? "start" : null);
const statusColor = (status: number | undefined) => (status === 9 ? "#2E9E6B" : status === 11 || status === 4 ? "#D9912B" : "#9AA0A6");
const daysText = (n: number) => `${n.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} дн.`;
const MONO = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em" } as const;

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="min-w-0" style={{ containerType: "inline-size" }}>
      <p className="text-[14.5px] leading-tight" style={{ ...hubSans, color: hub.textSubtle }}>
        {label}
      </p>
      <p className="mt-2 whitespace-nowrap font-medium leading-none" style={{ ...MONO, fontSize: "clamp(17px, 17cqw, 28px)", color: color ?? hub.text }}>
        {value}
      </p>
      {sub ? (
        <p className="mt-1.5 text-[14px] leading-tight" style={{ ...hubSans, color: hub.textSubtle }}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}

type Panel = { kind: "deposit" | "add" | "place"; id: string } | null;

/**
 * Список кампаний: каждая плиткой. Название и статус, вывод ИИ (если есть), товары с крупными фото, главные цифры периода,
 * умные подсказки (сколько пополнить, какой товар добавить, где показываться) и действия. Пополнение, добавление товара и зоны
 * раскрываются под самой кампанией. Всё, что двигает деньги, только по подтверждению.
 */
export function HubAdsCampaigns({
  campaigns,
  data,
  connected,
  accountNet,
  onUpdate,
  preset,
  onPresetUsed,
  photos,
  review,
}: {
  campaigns: SellerAdCampaignRow[];
  data: AdsData;
  connected?: boolean;
  accountNet: number | null;
  onUpdate?: (campaigns: SellerAdCampaignRow[]) => void;
  preset?: { id: string; sum: number } | null;
  onPresetUsed?: () => void;
  /** Фото товаров по артикулу. */
  photos?: Map<string, string | undefined>;
  /** Разбор нейросетью: вывод по кампании показываем в её плитке. */
  review?: AdsReviewState;
}) {
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState<Panel>(() => (preset ? { kind: "deposit", id: preset.id } : null));
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [depositSum, setDepositSum] = useState(() => (preset ? String(preset.sum) : ""));
  const [depositing, setDepositing] = useState(false);
  const [addNm, setAddNm] = useState("");
  const [adding, setAdding] = useState(false);
  const [placeSearch, setPlaceSearch] = useState(true);
  const [placeRec, setPlaceRec] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [openProducts, setOpenProducts] = useState<string | null>(null);
  const [toast, setToast] = useState<HubToastState | null>(null);
  const { makeToast } = useHubToast();
  const paged = usePagedLimit(search, 10, 10);
  useEffect(() => {
    if (preset) onPresetUsed?.();
    // подставленная сумма берётся один раз при открытии вкладки
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter((row) => row.name?.toLowerCase().includes(q) || row.id.includes(q) || row.statusLabel?.toLowerCase().includes(q));
  }, [campaigns, search]);

  /** Товары, которые уже в какой-либо живой кампании: их заново добавлять не предлагаем. */
  const advertised = useMemo(() => new Set(campaigns.filter((c) => ACTIVE_STATES.has(c.status ?? -1)).flatMap((c) => (c.bids ?? []).map((b) => b.nmId))), [campaigns]);
  /** Кого стоит добавить: с остатком и положительной маржой, самые выгодные первыми. */
  const addCandidates = useMemo(
    () => data.advisorProducts.filter((p) => !advertised.has(p.nmId) && isRecommended(p)).sort((a, b) => (b.marginRub ?? 0) - (a.marginRub ?? 0)),
    [data.advisorProducts, advertised],
  );

  const parsedDeposit = Number(depositSum.replace(/\s/g, ""));
  const depositValid = Number.isInteger(parsedDeposit) && parsedDeposit >= 1 && parsedDeposit <= AD_DEPOSIT_MAX_RUB;
  const closePanel = () => setPanel(null);

  async function toggle(row: SellerAdCampaignRow, action: "start" | "pause") {
    if (!connected) return;
    const campaignId = Number(row.id);
    if (!campaignId) return;
    setTogglingId(row.id);
    try {
      const result = await toggleSellerHubAd({ campaignId, action });
      if (!result.ok) {
        setToast(makeToast(result.error ?? "Ошибка управления кампанией", "error"));
        return;
      }
      onUpdate?.(campaigns.map((r) => (r.id === row.id ? { ...r, status: action === "start" ? 9 : 4, statusLabel: action === "start" ? "Активна" : "На паузе" } : r)));
      setToast(makeToast(action === "start" ? "Кампания запущена" : "Кампания на паузе", "ok"));
    } catch (err) {
      setToast(makeToast(err instanceof Error ? err.message : "Ошибка при переключении кампании", "error"));
    } finally {
      setTogglingId(null);
    }
  }

  /** Пополнение двигает деньги: только по кнопке подтверждения с видимой суммой. */
  async function confirmDeposit(row: SellerAdCampaignRow) {
    if (!connected || !depositValid || depositing) return;
    setDepositing(true);
    try {
      const result = await depositSellerHubAdBudget({ campaignId: Number(row.id), sum: parsedDeposit });
      if (!result.ok) {
        setToast(makeToast(result.error ?? "Не удалось пополнить бюджет", "error"));
        return;
      }
      onUpdate?.(campaigns.map((r) => (r.id === row.id ? { ...r, budget: result.budget ?? (row.budget ?? 0) + parsedDeposit } : r)));
      setToast(makeToast(`Бюджет кампании пополнен на ${formatRub(parsedDeposit)}`, "ok"));
      closePanel();
      setDepositSum("");
    } catch (err) {
      setToast(makeToast(err instanceof Error ? err.message : "Не удалось пополнить бюджет", "error"));
    } finally {
      setDepositing(false);
    }
  }

  async function confirmAdd(row: SellerAdCampaignRow) {
    if (!addNm || adding) return;
    setAdding(true);
    const res = await addSellerHubAdNm({ advertId: Number(row.id), nmId: Number(addNm) });
    setAdding(false);
    if (!res.ok) {
      setToast(makeToast(res.error ?? "Не удалось добавить товар", "error"));
      return;
    }
    onUpdate?.(campaigns.map((r) => (r.id === row.id ? { ...r, bids: [...(r.bids ?? []), { nmId: addNm, searchRub: null, recommendationsRub: null }] } : r)));
    setToast(makeToast("Товар добавлен в кампанию", "ok"));
    closePanel();
    setAddNm("");
  }

  async function confirmPlacements(row: SellerAdCampaignRow) {
    if (placing) return;
    setPlacing(true);
    const res = await setSellerHubAdPlacements({ advertId: Number(row.id), search: placeSearch, recommendations: placeRec });
    setPlacing(false);
    if (!res.ok) {
      setToast(makeToast(res.error ?? "Не удалось изменить зоны", "error"));
      return;
    }
    onUpdate?.(campaigns.map((r) => (r.id === row.id ? { ...r, placements: { search: placeSearch, recommendations: placeRec } } : r)));
    setToast(makeToast(`Зоны показов: ${placementsLabel({ search: placeSearch, recommendations: placeRec })}`, "ok"));
    closePanel();
  }

  const shown = visible.slice(0, paged.limit);
  const hidden = visible.length - shown.length;

  return (
    <Card
      title="Рекламные кампании"
      hint="Цифры за выбранный период, подсказки и управление в одном месте."
      action={<HubInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Название или номер кампании" className="w-64" aria-label="Поиск кампании" />}
    >
      {visible.length === 0 ? (
        <EmptyNote title="Кампаний по такому запросу нет">Попробуйте другое название или номер.</EmptyNote>
      ) : (
        <>
          <ul>
            {shown.map((row, rowIdx) => {
              const statRaw = data.current.stats?.campaigns.find((c) => c.advertId === row.id);
              // Цифры кампании считаем по нынешнему составу: расход товаров, которых из неё убрали, не должен искажать ДРР и выводы (так же считают разбор и советы).
              const comp = campaignComposition(row, statRaw?.byNm);
              const memberRows = statRaw && comp.known ? comp.current.map((nm) => statRaw.byNm?.[nm]).filter((r): r is NonNullable<typeof r> => Boolean(r)) : null;
              const stat = memberRows ? summarizeAds(memberRows.map((r) => ({ views: r.views, clicks: r.clicks, spend: r.spend, orders: r.orders, orderSum: r.orderSum, addToCart: 0 }))) : data.byCampaign.get(row.id);
              const departedSpend = statRaw && comp.known ? comp.departed.reduce((sum, nm) => sum + (statRaw.byNm?.[nm]?.spend ?? 0), 0) : 0;
              const members = row.bids ?? [];
              const memberItems = members.map((b) => ({ nmId: b.nmId, title: data.titles.get(b.nmId) ?? b.nmId }));
              const action = statusAction(row.status);
              const manageable = connected && ACTIVE_STATES.has(row.status ?? -1);
              const canPlace = connected && row.paymentType === "cpm" && (row.bidType == null || row.bidType === "manual") && ACTIVE_STATES.has(row.status ?? -1);
              const dailyLimit = row.paymentType !== "cpc" ? null : row.dailyLimit === undefined ? undefined : row.dailyLimit === null ? "не задан" : formatRub(row.dailyLimit.limitRub);
              const dailySpend = stat && stat.spend > 0 ? stat.spend / Math.max(1, Number(data.days)) : 0;
              const runway = row.budget != null && dailySpend > 0 ? row.budget / dailySpend : null;
              const color = statusColor(row.status);
              const ai = review?.reviewById.get(row.id);
              const aiShown = ai && ai.verdict !== "no_data" && ai.headline;

              /**
               * Подсказки по этой кампании: каждая считается по её цифрам и объясняет почему. Без цифр для вывода подсказки нет.
               * Зоны показов советуем менять только когда есть довод: окупаемость кампании против маржи товаров.
               */
              const hints: Array<{ key: string; text: string; label?: string; onClick?: () => void }> = [];
              const margins = members.map((b) => data.marginByNm.get(b.nmId)).filter((m): m is number => m != null);
              const avgMargin = margins.length > 0 ? Math.round((margins.reduce((a, m) => a + m, 0) / margins.length) * 10) / 10 : null;
              const campDrr = stat && stat.orders > 0 && stat.drr != null ? stat.drr : null;
              const noOrdersLoss = Boolean(stat && stat.orders === 0 && data.summary?.cpo != null && stat.spend >= data.summary.cpo);
              const paysBack = campDrr != null && avgMargin != null ? campDrr < avgMargin : noOrdersLoss ? false : null;
              const recommendedSum = suggestedDepositRub(dailySpend);
              if (manageable && row.budget != null && (row.budget <= 0 || (runway != null && runway < 7)) && paysBack === false) {
                hints.push({
                  key: "deposit-no",
                  text: `Бюджет заканчивается, но кампания пока не окупается: ${campDrr != null ? `ДРР ${percent(campDrr)} выше маржи ${percent(avgMargin)}` : "заказов нет, а деньги уходят"}. Пополнять не стоит: сначала снизьте ставку или уберите товары, которые тратят без заказов.`,
                });
              } else if (manageable && row.budget != null && (row.budget <= 0 || (runway != null && runway < 7))) {
                hints.push({
                  key: "deposit",
                  text: row.budget <= 0 ? `Бюджет закончился, показы остановлены. Кампания тратит около ${formatRub(dailySpend)} в день: на неделю нужно ${formatRub(recommendedSum)}.` : `Бюджета хватит на ${daysText(runway ?? 0)}: кампания тратит около ${formatRub(dailySpend)} в день. На неделю нужно ${formatRub(recommendedSum)}, иначе показы остановятся.`,
                  label: `Пополнить на ${formatRub(recommendedSum)}`,
                  onClick: () => {
                    setPanel({ kind: "deposit", id: row.id });
                    setDepositSum(String(recommendedSum));
                  },
                });
              }
              if (manageable && paysBack === false && !hints.some((h) => h.key === "deposit-no")) {
                hints.push({
                  key: "loss",
                  text: `Кампания не окупается: ${campDrr != null ? `ДРР ${percent(campDrr)} выше маржи ${percent(avgMargin)}` : "заказов нет, а деньги уходят"}. Снизьте ставку или уберите товар, который тратит без заказов; если помочь нечем, поставьте кампанию на паузу.`,
                });
              }
              const best = addCandidates.find((p) => !members.some((b) => b.nmId === p.nmId));
              if (manageable && best && members.length < 50 && paysBack !== false) {
                hints.push({
                  key: "add",
                  text: `Можно добавить «${best.title}»: маржа ${formatRub(best.marginRub ?? 0)} с каждой продажи, на складе ${formatInt(best.stock ?? 0)} шт., в рекламе его пока нет.${paysBack ? ` Кампания окупается (ДРР ${percent(campDrr)} при марже ${percent(avgMargin)}).` : ""}`,
                  label: "Добавить товар",
                  onClick: () => {
                    setPanel({ kind: "add", id: row.id });
                    setAddNm(best.nmId);
                  },
                });
              }
              if (canPlace && row.placements && paysBack === true && row.placements.search && !row.placements.recommendations) {
                hints.push({
                  key: "place-on",
                  text: `Кампания окупается: ДРР ${percent(campDrr)} при марже ${percent(avgMargin)}. Сейчас показы только в поиске. Рекомендации дадут больше охвата; включите и проверьте ДРР через несколько дней.`,
                  label: "Включить рекомендации",
                  onClick: () => {
                    setPanel({ kind: "place", id: row.id });
                    setPlaceSearch(true);
                    setPlaceRec(true);
                  },
                });
              }
              if (canPlace && row.placements && paysBack === false && campDrr != null && row.placements.search && row.placements.recommendations) {
                hints.push({
                  key: "place-off",
                  text: `Реклама пока не окупается: ДРР ${percent(campDrr)} выше маржи ${percent(avgMargin)}. Чтобы не тратить на менее целевой показ, оставьте только поиск, где покупатель уже ищет такой товар, и сравните ДРР через неделю.`,
                  label: "Оставить только поиск",
                  onClick: () => {
                    setPanel({ kind: "place", id: row.id });
                    setPlaceSearch(true);
                    setPlaceRec(false);
                  },
                });
              }

              return (
                <li key={row.id} className="hub-rise mb-4 rounded-[24px] border p-5 sm:p-6" style={{ animationDelay: `${Math.min(rowIdx, 8) * 45}ms`, borderColor: `color-mix(in srgb, ${color} 30%, white)`, background: `linear-gradient(160deg, color-mix(in srgb, ${color} 8%, white), ${hub.canvas} 65%)` }}>
                  <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-[20px] font-semibold leading-[1.25] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                        {row.name ?? "Без названия"}
                      </p>
                      <p className="mt-1 text-[13.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                        № {row.id}
                        {row.paymentType ? ` · оплата за ${row.paymentType === "cpc" ? "клики" : "показы"}` : ""}
                        {row.placements ? ` · показы: ${placementsLabel(row.placements).toLowerCase()}` : ""}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-2 rounded-[12px] border px-3.5 py-2 text-[14px] font-semibold" style={{ ...hubSans, color, backgroundColor: `color-mix(in srgb, ${color} 13%, white)`, borderColor: `color-mix(in srgb, ${color} 32%, white)` }}>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                      {row.statusLabel ?? "—"}
                    </span>
                  </div>

                  {aiShown ? (
                    <p className="mt-4 text-[19px] font-semibold leading-[1.35] tracking-[-0.01em]" style={{ ...hubSans, color: hub.text }}>
                      {ai.headline}
                    </p>
                  ) : null}

                  {memberItems.length > 0 ? (
                    <div className="mt-4">
                      <ProductChips products={memberItems} photos={photos} />
                    </div>
                  ) : null}

                  <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 2xl:grid-cols-5">
                    <Metric label="Бюджет" value={row.budget != null ? formatRub(row.budget) : "—"} sub={runway != null ? `хватит на ${daysText(runway)}` : dailyLimit ? `лимит в день: ${dailyLimit}` : undefined} color={runway != null && runway < 3 ? "#C8453F" : undefined} />
                    <Metric label="Расход" value={stat ? formatRub(stat.spend) : "—"} />
                    <Metric label="Заказы" value={stat ? formatInt(stat.orders) : "—"} sub={stat ? formatRub(stat.orderSum) : undefined} />
                    <Metric label="ДРР" value={stat ? percent(stat.drr) : "—"} color={stat?.drr != null && stat.drr > 100 ? hub.danger : undefined} />
                    <Metric label="CTR" value={stat ? percent(stat.ctr) : "—"} sub={stat ? `${formatInt(stat.clicks)} кликов` : undefined} />
                  </div>
                  {departedSpend > 0 ? (
                    <p className="mt-3 text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.textSubtle }}>
                      Состав кампании менялся: цифры только по нынешним товарам, расход ушедших ({formatRub(departedSpend)}) сюда не входит.
                    </p>
                  ) : null}

                  {hints.length > 0 ? (
                    <ul className="mt-6 divide-y border-t" style={{ borderColor: "rgba(1, 20, 8, 0.1)" }}>
                      {hints.map((h) => (
                        <li key={h.key} className="grid gap-x-5 gap-y-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                          <p className="flex items-start gap-3 text-[16.5px] leading-[1.5]" style={{ ...hubSans, color: hub.text }}>
                            <span className="mt-[2px] flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(185, 255, 75, 0.55)" }} aria-hidden>
                              <Lightbulb className="h-[18px] w-[18px]" style={{ color: hub.text }} />
                            </span>
                            <span>{h.text}</span>
                          </p>
                          {h.label && h.onClick ? (
                            <HubButton variant="secondary" onClick={h.onClick}>
                              {h.label}
                            </HubButton>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="mt-5 flex flex-wrap items-center gap-2.5">
                    {connected && action ? (
                      <HubButton variant={action === "pause" ? "secondary" : "primary"} loading={togglingId === row.id} onClick={() => void toggle(row, action)}>
                        {action === "start" ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                        {action === "start" ? "Запустить" : "Поставить на паузу"}
                      </HubButton>
                    ) : null}
                    {manageable ? (
                      <HubButton variant="secondary" onClick={() => { const open = panel?.kind === "deposit" && panel.id === row.id; setPanel(open ? null : { kind: "deposit", id: row.id }); setDepositSum(dailySpend > 0 ? String(recommendedSum) : ""); }}>
                        Пополнить бюджет
                        {dailySpend > 0 ? (
                          <span className="ml-1 rounded-full px-2.5 py-0.5 text-[13.5px] font-bold" style={{ backgroundColor: "#B9FF4B", color: hub.text }}>
                            {formatRub(recommendedSum)}
                          </span>
                        ) : null}
                      </HubButton>
                    ) : null}
                    {manageable ? (
                      <HubButton variant="secondary" onClick={() => { setPanel(panel?.kind === "add" && panel.id === row.id ? null : { kind: "add", id: row.id }); setAddNm(""); }}>
                        Добавить товар
                      </HubButton>
                    ) : null}
                    {canPlace ? (
                      <HubButton variant="secondary" onClick={() => { const open = panel?.kind === "place" && panel.id === row.id; setPanel(open ? null : { kind: "place", id: row.id }); setPlaceSearch(row.placements?.search ?? true); setPlaceRec(row.placements?.recommendations ?? true); }}>
                        Зоны показов
                      </HubButton>
                    ) : null}
                    {members.length > 0 ? (
                      <button type="button" onClick={() => setOpenProducts(openProducts === row.id ? null : row.id)} aria-expanded={openProducts === row.id} className="ml-auto inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[15px] font-semibold outline-none transition-colors hover:bg-black/[0.05]" style={{ ...hubSans, color: hub.text }}>
                        Каждый товар отдельно
                        <ChevronDown className="h-4 w-4 transition-transform" style={{ transform: openProducts === row.id ? "rotate(180deg)" : undefined }} />
                      </button>
                    ) : null}
                  </div>

                  {openProducts === row.id ? (
                    <div className="mt-4 rounded-[18px] px-4 pb-1 pt-4" style={{ backgroundColor: "rgba(1, 20, 8, 0.04)" }}>
                      <div className="flex items-center gap-2 text-[15px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                        Как работает каждый товар в этой кампании
                        <HelpTip title="Как читать цифры по товарам" align="left">
                          <p>Расход, заказы и ДРР посчитаны отдельно по каждому товару за выбранный период.</p>
                          <p className="mt-2">Запас по марже = маржа товара минус его ДРР. Плюс: реклама окупается, и чем он больше, тем безопаснее поднимать ставку. Минус: на этом товаре реклама обходится дороже, чем он приносит.</p>
                        </HelpTip>
                      </div>
                      <div className="mt-3 hidden gap-x-4 border-b pb-2 text-[13.5px] md:grid md:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(90px,1fr))]" style={{ ...hubSans, color: hub.textSubtle, borderColor: "rgba(1, 20, 8, 0.1)" }}>
                        <span>Товар</span>
                        <span className="text-right">Расход</span>
                        <span className="text-right">Заказы</span>
                        <span className="text-right">ДРР</span>
                        <span className="text-right">Запас по марже</span>
                      </div>
                      <ul className="divide-y" style={{ borderColor: "rgba(1, 20, 8, 0.08)" }}>
                        {members.map((b) => {
                          const s = statRaw?.byNm?.[b.nmId];
                          const margin = data.marginByNm.get(b.nmId) ?? null;
                          const drr = s && s.orderSum > 0 ? Math.round((s.spend / s.orderSum) * 1000) / 10 : null;
                          const headroom = margin != null && drr != null ? Math.round((margin - drr) * 10) / 10 : null;
                          return (
                            <li key={b.nmId} className="grid items-center gap-x-4 gap-y-2 py-3.5 md:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(90px,1fr))]" style={{ borderColor: "rgba(1, 20, 8, 0.08)" }}>
                              <div className="flex min-w-0 items-center gap-3">
                                <Thumb src={photos?.get(b.nmId)} className="h-[56px] w-[42px]" />
                                <p className="line-clamp-2 text-[15.5px] font-semibold leading-[1.3]" style={{ ...hubSans, color: hub.text }}>
                                  {data.titles.get(b.nmId) ?? b.nmId}
                                </p>
                              </div>
                              {[
                                ["Расход", s ? formatRub(s.spend) : "—"],
                                ["Заказы", s ? formatInt(s.orders) : "—"],
                                ["ДРР", drr != null ? percent(drr) : "—"],
                                ["Запас по марже", headroom != null ? `${headroom > 0 ? "+" : ""}${headroom.toLocaleString("ru-RU")} п. п.` : "—"],
                              ].map(([label, value]) => (
                                <p key={label} className="flex items-baseline justify-between gap-3 md:block md:text-right" style={MONO}>
                                  <span className="text-[13.5px] md:hidden" style={{ ...hubSans, letterSpacing: 0, color: hub.textSubtle }}>{label}</span>
                                  <span className="text-[18px] font-medium" style={{ color: label === "Запас по марже" && headroom != null && headroom < 0 ? hub.danger : hub.text }}>{value}</span>
                                </p>
                              ))}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}

                  {panel?.id === row.id ? (
                    <div className="mt-5 rounded-[20px] p-5" style={{ backgroundColor: "rgba(1, 20, 8, 0.045)" }}>
                      {panel.kind === "deposit" ? (
                        <>
                          <p className="text-[16px] font-semibold" style={{ ...hubSans, color: hub.text }}>Пополнить бюджет кампании</p>
                          <p className="mt-1.5 max-w-[68ch] text-[14.5px] leading-[1.55]" style={{ ...hubSans, color: hub.textMuted }}>
                            Деньги спишутся со счёта продвижения WB{accountNet != null ? ` (сейчас на счёте ${formatRub(accountNet)})` : ""}. Сейчас бюджет кампании {row.budget != null ? formatRub(row.budget) : "неизвестен"}. Отменить пополнение после подтверждения нельзя.
                          </p>
                          <div className="mt-4 flex flex-wrap items-center gap-2.5">
                            <HubInput value={depositSum} onChange={(e) => setDepositSum(e.target.value)} placeholder="Сумма, ₽" inputMode="numeric" className="w-40" aria-label="Сумма пополнения, рублей" />
                            {[500, 1000, 3000, 5000].map((p) => (
                              <HubButton key={p} size="sm" variant="secondary" onClick={() => setDepositSum(String(p))}>
                                {formatRub(p)}
                              </HubButton>
                            ))}
                            {dailySpend > 0 ? (
                              <button type="button" onClick={() => setDepositSum(String(recommendedSum))} className="ml-auto inline-flex items-center gap-2 rounded-full px-4 py-2 text-[14.5px] font-bold outline-none transition-[filter] hover:brightness-95" style={{ ...hubSans, backgroundColor: "#B9FF4B", color: hub.text }}>
                                Рекомендуем {formatRub(recommendedSum)}
                                <span className="font-medium opacity-70">на неделю</span>
                              </button>
                            ) : null}
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <HubButton loading={depositing} disabled={!depositValid || depositing} onClick={() => void confirmDeposit(row)}>
                              {depositValid ? `Пополнить на ${formatRub(parsedDeposit)}` : "Введите сумму"}
                            </HubButton>
                            <HubButton size="sm" variant="ghost" disabled={depositing} onClick={closePanel}>Отмена</HubButton>
                            <span className="text-[13px]" style={{ ...hubSans, color: hub.textSubtle }}>Не больше {formatRub(AD_DEPOSIT_MAX_RUB)} за раз.</span>
                          </div>
                        </>
                      ) : null}
                      {panel.kind === "add" ? (
                        <>
                          <p className="text-[16px] font-semibold" style={{ ...hubSans, color: hub.text }}>Добавить товар в кампанию</p>
                          <p className="mt-1.5 max-w-[68ch] text-[14.5px] leading-[1.55]" style={{ ...hubSans, color: hub.textMuted }}>
                            WB поставит новому товару минимальную ставку, деньги не списываются. Ставку и бюджет задайте после. В кампании не больше 50 товаров.
                          </p>
                          <div className="mt-4">
                            <ProductPicker
                              products={data.advisorProducts.filter((p) => !members.some((b) => b.nmId === p.nmId))}
                              photos={photos}
                              selected={new Set(addNm ? [addNm] : [])}
                              onToggle={(id) => setAddNm((cur) => (cur === id ? "" : id))}
                              disabled={adding}
                            />
                          </div>
                          <div className="mt-5 flex flex-wrap items-center gap-2.5">
                            <HubButton loading={adding} disabled={!addNm || adding} onClick={() => void confirmAdd(row)}>
                              {addNm ? "Добавить в кампанию" : "Выберите товар"}
                            </HubButton>
                            <HubButton variant="ghost" disabled={adding} onClick={closePanel}>Отмена</HubButton>
                          </div>
                        </>
                      ) : null}
                      {panel.kind === "place" ? (
                        <>
                          <p className="text-[16px] font-semibold" style={{ ...hubSans, color: hub.text }}>Зоны показов</p>
                          <p className="mt-1.5 max-w-[68ch] text-[14.5px] leading-[1.55]" style={{ ...hubSans, color: hub.textMuted }}>
                            Сейчас: {row.placements ? placementsLabel(row.placements) : "WB не вернул текущие зоны"}. Деньги не списываются, меняется только то, где показывается реклама. Обе зоны отключить нельзя: для остановки есть пауза.
                          </p>
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            {([
                              ["Поиск", "Реклама в результатах поиска. Покупатель уже ищет такой товар, поэтому показ целевой.", placeSearch, setPlaceSearch],
                              ["Рекомендации", "Реклама в блоках «Похожие товары» и в ленте. Охват шире, но покупатель товар специально не искал.", placeRec, setPlaceRec],
                            ] as const).map(([name, text, on, set]) => (
                              <button key={name} type="button" role="switch" aria-checked={on} onClick={() => set(!on)} className="relative rounded-[18px] border p-4 pr-12 text-left outline-none transition-[background-color,border-color] focus-visible:shadow-[0_0_0_2px_var(--hub-canvas),0_0_0_4px_var(--hub-lime-ring)]" style={{ borderColor: on ? "#2E9E6B" : "rgba(1, 20, 8, 0.16)", backgroundColor: on ? "rgba(46, 158, 107, 0.1)" : "rgba(1, 20, 8, 0.03)", boxShadow: on ? "0 0 0 1px #2E9E6B" : undefined }}>
                                <span className="block text-[17px] font-semibold" style={{ ...hubSans, color: hub.text }}>{name}</span>
                                <span className="mt-1 block text-[14.5px] leading-[1.45]" style={{ ...hubSans, color: hub.textMuted }}>{text}</span>
                                <span className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full border-2" style={{ borderColor: on ? "#2E9E6B" : "rgba(1, 20, 8, 0.25)", backgroundColor: on ? "#2E9E6B" : "transparent" }} aria-hidden>
                                  {on ? <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} /> : null}
                                </span>
                              </button>
                            ))}
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-2.5">
                            <HubButton loading={placing} disabled={placing || (!placeSearch && !placeRec)} onClick={() => void confirmPlacements(row)}>Применить</HubButton>
                            <HubButton variant="ghost" disabled={placing} onClick={closePanel}>Отмена</HubButton>
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {hidden > 0 ? (
            <div className="mt-2 flex justify-center">
              <HubButton size="sm" variant="secondary" onClick={paged.more}>
                Показать ещё {Math.min(paged.step, hidden)} из {formatInt(hidden)}
              </HubButton>
            </div>
          ) : null}
          {data.associated ? (
            <p className="mt-5 text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.textSubtle }}>
              Ещё {formatInt(data.associated.orders)} шт. на {formatRub(data.associated.orderSum)} WB отнёс к рекламе по товарам без расхода: это ассоциированные заказы, их ДРР не считаем.
            </p>
          ) : null}
        </>
      )}
      {toast ? <HubToast toast={toast} onDismiss={() => setToast(null)} /> : null}
    </Card>
  );
}
