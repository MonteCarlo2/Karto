"use client";

import { useMemo, useState, type ReactNode } from "react";
import { snapshotTimeMs } from "@/lib/seller-hub/complete-days";
import { taskFactsFromSnapshot } from "@/lib/seller-hub/task-engine/facts";
import { promoLossOffers, promoOpportunityOffers } from "@/lib/seller-hub/task-engine/promo";
import { LayoutDashboard, Megaphone, Menu, Percent, Search, Users } from "lucide-react";
import { removeSellerHubAdNm, toggleSellerHubAd } from "@/lib/seller-hub/client-api";
import type { SellerAdCampaignRow, SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import type { TaskCategory, SellerTask } from "@/lib/seller-hub/task-engine/types";
import { AnalyticsMotion, Card, EmptyNote, LoadingBlock, Segmented } from "./hub-analytics-ui";
import { Headline, PrimaryTabs } from "./hub-fulfillment-ui";
import { useAdsData, type AdsData } from "./hub-ads-data";
import { HubAdsBids } from "./hub-ads-bids";
import { HubAdsBulk } from "./hub-ads-bulk";
import { HubAdsCampaigns } from "./hub-ads-campaigns";
import { HubAdsCards } from "./hub-ads-cards";
import { HubAdsClusters } from "./hub-ads-clusters";
import { HubAdsOverview } from "./hub-ads-overview";
import { HubAdsReputation } from "./hub-ads-reputation";
import { HubAdsReview } from "./hub-ads-review";
import { HubAdsSources } from "./hub-ads-sources";
import { percent } from "./hub-ads-stats";
import { HubSeo } from "./hub-seo";
import { SectionTasksPanel, type PanelItem } from "./hub-section-tasks";
import { AdviceTile, ADVICE_RANK } from "./hub-ads-advice";
import { TaskTile } from "./hub-fulfillment";
import { HubToast, useHubToast, type HubToastState } from "./hub-toast";
import { formatRub, hub, HubButton, HubEmptyState, hubSans, hubSerif, hubType } from "./hub-ui";
import { useSectionTasks } from "./use-section-tasks";
import { useAdsReview } from "./use-ads-review";

type AdsTab = "overview" | "campaigns" | "queries" | "sources" | "seo" | "reputation" | "cards" | "promotions";
type AdsGroup = "overview" | "campaigns" | "buyers" | "seo" | "promotions";

const TAB_LABEL: Record<AdsTab, string> = {
  overview: "Обзор",
  campaigns: "Список кампаний",
  queries: "Ставки и запросы",
  cards: "Карточки",
  sources: "Откуда покупки",
  reputation: "Репутация",
  seo: "Поиск и SEO",
  promotions: "Акции",
};

const AD_GROUPS: Array<{ id: AdsGroup; label: string; tabs: AdsTab[]; icon: ReactNode }> = [
  { id: "overview", label: "Обзор", tabs: ["overview"], icon: <LayoutDashboard className="h-[18px] w-[18px]" /> },
  { id: "campaigns", label: "Кампании", tabs: ["campaigns", "queries"], icon: <Megaphone className="h-[18px] w-[18px]" /> },
  { id: "buyers", label: "Карточки и покупатели", tabs: ["cards", "sources", "reputation"], icon: <Users className="h-[18px] w-[18px]" /> },
  { id: "seo", label: "Поиск и SEO", tabs: ["seo"], icon: <Search className="h-[18px] w-[18px]" /> },
  { id: "promotions", label: "Акции", tabs: ["promotions"], icon: <Percent className="h-[18px] w-[18px]" /> },
];

/** Вкладки, которым нужны кампании и статистика WB за период. */
const NEEDS_CAMPAIGNS = new Set<AdsTab>(["overview", "campaigns", "queries"]);
/** Вкладки, где виден выбор периода. */
const HAS_PERIOD = new Set<AdsTab>(["overview", "campaigns", "queries", "sources"]);

/** Состояние загрузки статистики: красивая загрузка, ошибка с повтором или «за период данных нет». null — данные есть. */
function AdsGate({ data }: { data: AdsData }) {
  if (data.current.error) {
    return (
      <Card title="Статистику рекламы получить не удалось">
        <p className="text-[15px] leading-[1.55]" style={{ ...hubSans, color: hub.textMuted }}>{data.current.error}. WB ограничивает частоту запросов статистики.</p>
        <div className="mt-4">
          <HubButton size="sm" variant="secondary" onClick={data.retry}>Повторить</HubButton>
        </div>
      </Card>
    );
  }
  if (data.current.loading && !data.current.stats) return <LoadingBlock title="Загружаю статистику рекламы" height={300} />;
  if (!data.summary || !data.current.stats) {
    return (
      <Card title="Статистики за период нет">
        <EmptyNote title="По кампаниям за выбранный период данных нет">Выберите период длиннее или проверьте, что кампании показывались.</EmptyNote>
      </Card>
    );
  }
  return null;
}

/** Рамка блока для экранов, у которых внутри свои заголовки: те же отступ, радиус и линия, что у всех блоков раздела. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[26px] border p-6 sm:p-7" style={{ borderColor: "rgba(1, 20, 8, 0.2)", backgroundColor: hub.canvas }}>
      {children}
    </div>
  );
}

export function HubAds({
  snapshot,
  connected,
  onUpdate,
  promotions,
  onOpenMenu,
  onOpenTasks,
}: {
  snapshot?: SellerCatalogSnapshot;
  connected?: boolean;
  onUpdate?: (campaigns: SellerAdCampaignRow[]) => void;
  /** Экран акций WB: показывается вкладкой «Акции» (та же страница, что и в меню «Акции»). */
  promotions?: ReactNode;
  /** Раньше вёл в «Агенты» из полосы «Агент рекламы предлагает»; полоса убрана, правила агента настраиваются в разделе «Агенты». */
  onOpenAgents?: () => void;
  onOpenMenu?: () => void;
  /** Открыть раздел «Задачи»: на категории или сразу на конкретной задаче. */
  onOpenTasks?: (category: TaskCategory, task?: SellerTask) => void;
}) {
  const [tab, setTab] = useState<AdsTab>("overview");
  const [lastInGroup, setLastInGroup] = useState<Partial<Record<AdsGroup, AdsTab>>>({});
  const activeGroup = AD_GROUPS.find((g) => g.tabs.includes(tab)) ?? AD_GROUPS[0]!;
  const [toast, setToast] = useState<HubToastState | null>(null);
  /** Совет «Пополнить на N ₽» ведёт на вкладку «Кампании» с уже открытой панелью пополнения и подставленной суммой. */
  const [depositPreset, setDepositPreset] = useState<{ id: string; sum: number } | null>(null);
  const { makeToast } = useHubToast();

  const ads = snapshot?.ads;
  const rows = useMemo(() => ads?.campaigns ?? [], [ads]);
  const data = useAdsData({ campaigns: rows, snapshot, connected });
  const adsByNm = useMemo(() => new Map(data.allProductRows.map((r) => [r.nmId, { spend: r.spend, orders: r.orders, orderSum: r.orderSum }])), [data.allProductRows]);
  const itemDetails = useMemo(() => new Map((snapshot?.items ?? []).map((i) => [i.externalId, { category: i.category, description: i.description }])), [snapshot?.items]);
  const section = useSectionTasks(snapshot, connected, [], ["TASK_AD_", "TASK_PROMO_"]);
  const photos = useMemo(() => new Map((snapshot?.items ?? []).map((i) => [i.externalId, i.imageUrl ?? undefined])), [snapshot?.items]);

  /** Артикулы, где вход в акцию выгоден по правилу задач (маржа после списаний WB, остаток, запас хода): только их можно советовать. */
  const promoOk = useMemo(() => {
    if (!snapshot) return new Set<string>();
    const now = snapshotTimeMs(snapshot);
    return new Set(taskFactsFromSnapshot(snapshot).products.filter((f) => promoOpportunityOffers(f, now).length > 0 && promoLossOffers(f, now).length === 0).map((f) => f.nmId));
  }, [snapshot]);

  const review = useAdsReview({ data, campaigns: rows, onCampaignsUpdate: (updated) => onUpdate?.(updated) });
  const statsReady = data.summary != null && data.current.stats != null;
  const groupOptions = AD_GROUPS.filter((g) => g.id !== "promotions" || promotions).map((g) => ({
    id: g.id,
    label: g.label,
    icon: g.icon,
    count: g.id === "overview" && data.advice.length > 0 ? data.advice.length : undefined,
  }));

  async function pauseCampaign(campaignId: string) {
    const row = rows.find((r) => r.id === campaignId);
    if (!row || !connected) return;
    const result = await toggleSellerHubAd({ campaignId: Number(campaignId), action: "pause" });
    if (!result.ok) {
      setToast(makeToast(result.error ?? "Ошибка управления кампанией", "error"));
      return;
    }
    onUpdate?.(rows.map((r) => (r.id === campaignId ? { ...r, status: 4, statusLabel: "На паузе" } : r)));
    setToast(makeToast("Кампания на паузе", "ok"));
  }

  async function removeNm(campaignId: string, nmId: string) {
    const result = await removeSellerHubAdNm({ advertId: Number(campaignId), nmId: Number(nmId) });
    if (!result.ok) {
      setToast(makeToast(result.error ?? "Не удалось убрать товар из кампании", "error"));
      return;
    }
    onUpdate?.(rows.map((row) => (row.id === campaignId ? { ...row, bids: (row.bids ?? []).filter((bid) => bid.nmId !== nmId) } : row)));
    setToast(makeToast("Товар убран из кампании", "ok"));
  }

  /** Справа задачи платформы и советы по цифрам лежат вперемешку, по важности. Совет про бюджет не дублируем задачей про бюджет. */
  const TASK_RANK = { critical: 0, important: 1, opportunity: 2 } as const;
  const hasBudgetAdvice = data.advice.some((a) => a.kind === "budget_low");
  const panelItems: PanelItem[] = [
    ...data.advice.map((item) => ({
      id: `a:${item.id}`,
      rank: ADVICE_RANK[item.level],
      render: () => (
        <AdviceTile
          item={item}
          titles={data.titles}
          onCreated={(row) => onUpdate?.([...rows, row])}
          onDeposit={(id, sum) => {
            setDepositPreset({ id, sum });
            setTab("campaigns");
          }}
          onPause={pauseCampaign}
          onRemoveNm={removeNm}
        />
      ),
    })),
    ...section.tasks
      .filter((t) => !(hasBudgetAdvice && /бюджет/i.test(t.title)))
      .map((t) => ({
        id: `t:${t.id}`,
        rank: TASK_RANK[t.severity],
        render: (close: () => void) => (
          <TaskTile
            task={t}
            onOpen={() => {
              close();
              onOpenTasks?.(t.category, t);
            }}
          />
        ),
      })),
  ];

  const gate = <AdsGate data={data} />;
  const noCampaigns = !ads || rows.length === 0;
  const at = data.current.loadedAt ? new Date(data.current.loadedAt) : null;
  const time = at && !Number.isNaN(at.getTime()) ? at.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : null;

  const headline = (
    <Headline
      items={[
        { value: ads ? `${ads.activeCount} из ${ads.totalCount}` : "—", label: "Кампаний показывается", note: ads ? (ads.pausedCount > 0 ? `${ads.pausedCount} на паузе или готовы к запуску` : "все идут") : "загружаю" },
        { value: ads?.accountNet != null ? formatRub(ads.accountNet) : "—", label: "Счёт продвижения", note: "пополняет продавец" },
        { value: ads?.balance != null ? formatRub(ads.balance) : "—", label: "Баланс WB", note: "взаиморасчёт: оплата из будущих продаж" },
        { value: data.overallDrr ? percent(data.overallDrr.percent) : "—", label: "ДРР общий", note: data.overallDrr ? "расход к заказам всего магазина" : "считается при данных за общие дни" },
      ]}
    />
  );

  const subTabs = activeGroup.tabs.length > 1;
  const showPeriod = HAS_PERIOD.has(tab);

  return (
    <div className="space-y-3">
      <AnalyticsMotion />
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          {onOpenMenu ? (
            <button type="button" onClick={onOpenMenu} className="rounded-[10px] p-2 transition-colors hover:bg-[#161814]/[0.05] lg:hidden" style={{ color: hub.textMuted }} aria-label="Открыть меню">
              <Menu className="h-5 w-5" />
            </button>
          ) : null}
          <h1 className={hubType.h1} style={{ ...hubSerif, color: hub.text }}>
            Продвижение
          </h1>
        </div>
        {showPeriod ? (
          <div className="flex flex-wrap items-center gap-2">
            <HubButton size="sm" variant={data.compare ? "dark" : "secondary"} onClick={() => data.setCompare(!data.compare)} aria-pressed={data.compare}>
              Сравнить с прошлым периодом
            </HubButton>
            <Segmented<"7" | "14" | "30"> size="sm" label="Период" layoutId="ads-period" value={data.days} onChange={data.setDays} options={[{ id: "7", label: "7 дн." }, { id: "14", label: "14 дн." }, { id: "30", label: "30 дн." }]} />
          </div>
        ) : null}
      </header>

      <PrimaryTabs<AdsGroup>
        label="Разделы продвижения"
        value={activeGroup.id}
        onChange={(id) => {
          const group = AD_GROUPS.find((g) => g.id === id)!;
          setTab(lastInGroup[id] ?? group.tabs[0]!);
        }}
        options={groupOptions}
      />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,4fr)_minmax(400px,1fr)]">
        <div className="min-w-0 space-y-6">
          {tab !== "promotions" && tab !== "seo" ? headline : null}

          {subTabs ? (
            <div>
              <Segmented<AdsTab>
                label="Вкладки раздела"
                layoutId="ads-subtabs"
                value={tab}
                onChange={(next) => {
                  setLastInGroup((prev) => ({ ...prev, [activeGroup.id]: next }));
                  setTab(next);
                }}
                options={activeGroup.tabs.map((id) => ({ id, label: TAB_LABEL[id] }))}
              />
            </div>
          ) : null}

          {NEEDS_CAMPAIGNS.has(tab) && noCampaigns ? (
            <Card title="Рекламные кампании">
              <HubEmptyState
                icon={<Megaphone className="h-7 w-7" />}
                title={ads && ads.totalCount > 0 ? "Кампании найдены, но детали не прочитались" : "Рекламные кампании не найдены"}
                description={
                  ads && ads.totalCount > 0
                    ? `WB насчитал кампаний: ${ads.totalCount}, но подробности не вернул${ads.detailsHttpStatus ? ` (код ${ads.detailsHttpStatus})` : ""}. Попробуйте обновить данные позже.`
                    : "После выгрузки здесь появятся кампании из раздела «Продвижение» WB. Нужна соответствующая категория в API-токене."
                }
              />
            </Card>
          ) : null}

          {!noCampaigns && tab === "overview" ? (
            statsReady ? (
              <HubAdsOverview
                data={data}
                review={<HubAdsReview review={review} campaigns={rows} photos={photos} promoOk={promoOk} onGoTab={(next) => setTab(next)} />}
              />
            ) : (
              gate
            )
          ) : null}

          {!noCampaigns && tab === "campaigns" ? (
            <>
              <HubAdsCampaigns campaigns={rows} data={data} connected={connected} accountNet={ads?.accountNet ?? null} onUpdate={onUpdate} preset={depositPreset} onPresetUsed={() => setDepositPreset(null)} photos={photos} review={review} />
              <HubAdsBulk campaigns={rows} products={data.advisorProducts} photos={photos} onCreated={(created) => onUpdate?.([...rows, ...created])} />
            </>
          ) : null}
          {!noCampaigns && tab === "queries" ? (
            <div className="space-y-6">
              <Frame>
                <HubAdsBids campaigns={rows} titles={data.titles} photos={photos} />
              </Frame>
              <Frame>{data.current.stats ? <HubAdsClusters stats={data.current.stats} titles={data.titles} campaignNames={data.campaignNames} details={itemDetails} /> : gate}</Frame>
            </div>
          ) : null}

          {tab === "sources" ? <HubAdsSources snapshot={snapshot} data={data} photos={photos} /> : null}
          {tab === "cards" ? <HubAdsCards snapshot={snapshot} adsByNm={adsByNm} campaigns={rows} onCampaignsUpdate={(updated) => onUpdate?.(updated)} onGoTab={(next) => setTab(next)} /> : null}
          {tab === "reputation" ? <HubAdsReputation snapshot={snapshot} titles={data.titles} photos={photos} /> : null}
          {tab === "seo" ? <HubSeo snapshot={snapshot} connected={connected} /> : null}
          {tab === "promotions" ? promotions : null}

          {showPeriod && !noCampaigns ? (
            <p className="text-[13.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
              {data.current.stats ? `Данные WB за ${data.current.stats.dateFrom} — ${data.current.stats.dateTo} (полные дни), только чтение${time ? `, получены в ${time}` : ""}.` : "Данные WB за выбранный период, только чтение."}
              {data.current.stale ? <span style={{ color: hub.warn }}> WB сейчас не ответил, показаны последние сохранённые данные.</span> : null}
            </p>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-4 xl:sticky xl:top-2">
          <SectionTasksPanel items={panelItems} loading={section.loading} emptyText="По рекламе и акциям срочного нет: расходов без отдачи, бюджетов на исходе и рекламы в минус не видно." />
        </aside>
      </div>

      {toast ? <HubToast toast={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}
