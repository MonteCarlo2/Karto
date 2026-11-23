"use client";

import { ANALYTICS_TAB_HINT_KEY, ANALYTICS_TABS } from "@/lib/seller-hub/events-actions";
import { useState } from "react";
import { Menu } from "lucide-react";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { formatInt, formatRub, formatSyncTime, hub, HubButton, hubSans, hubSerif, hubType } from "./hub-ui";
import { HubAnalyticsAds } from "./hub-analytics-ads";
import { HubAnalyticsFunnel } from "./hub-analytics-funnel";
import { HubAnalyticsMarket } from "./hub-analytics-market";
import { HubAnalyticsMoney } from "./hub-analytics-money";
import { HubAnalyticsProducts } from "./hub-analytics-products";
import { HubAnalyticsStock } from "./hub-analytics-stock";
import { HubAnalyticsTrend } from "./hub-analytics-trend";
import { HubGlassScope } from "./hub-glass";
import { HubAnalyticsSummary } from "./hub-analytics-summary";
import { LoadingPage, AnalyticsMotion, Card, chartColors, EmptyNote, Segmented, StatBlock } from "./hub-analytics-ui";
import { useAnalyticsData } from "./use-analytics-data";
import { useAnalyticsPeriod, type AnalyticsPeriodState } from "./use-analytics-period";
import { ANALYTICS_PERIODS, type AnalyticsPeriod } from "@/lib/seller-hub/analytics-periods";

/** Сводка продаж за последние 7 дней по снимку кабинета: прежний экран «Аналитики», теперь блок вкладки «Динамика». */
function HubAnalyticsDaily({ snapshot }: { snapshot?: SellerCatalogSnapshot }) {
  const analytics = snapshot?.analytics;

  if (!analytics || analytics.daily.length === 0) {
    return (
      <Card title="Последние 7 дней">
        <EmptyNote title="Сводки за 7 дней пока нет">После выгрузки здесь появятся заказы и оборот по дням. Нужна категория «Аналитика» в API-токене WB.</EmptyNote>
      </Card>
    );
  }

  const avgDailyOrders = analytics.daily.length > 0 ? analytics.ordersTotal / analytics.daily.length : 0;
  const maxOrders = Math.max(0, ...analytics.daily.map((d) => d.orders));
  const monoStyle = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.05em" } as const;

  return (
    <Card title="Последние 7 дней" hint={`Сводка кабинета WB: ${analytics.periodStart} — ${analytics.periodEnd}. Обновлено ${formatSyncTime(snapshot?.syncedAt)}.`}>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatBlock hero color={chartColors.blue} label="Оборот за 7 дней" value={formatRub(analytics.revenueTotal)} sub={`${formatInt(analytics.ordersTotal)} заказов`} />
        <StatBlock color={chartColors.teal} label="Заказов в день" value={avgDailyOrders >= 1 ? formatInt(Math.round(avgDailyOrders)) : avgDailyOrders.toFixed(1)} sub="в среднем за неделю" />
        <StatBlock color={chartColors.violet} label="Выкупы" value={formatInt(analytics.buyoutsTotal)} sub="за тот же период" />
        <StatBlock color={chartColors.amber} label="Средний чек" value={analytics.avgOrderValue != null ? formatRub(analytics.avgOrderValue) : "—"} sub={analytics.currency} />
      </div>

      <div className="mt-6">
        <p className="mb-3 text-[16px] font-semibold" style={{ ...hubSans, color: hub.text }}>
          Детализация по дням
        </p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
          {[...analytics.daily].reverse().map((row) => {
            const heat = maxOrders > 0 ? row.orders / maxOrders : 0;
            const d = new Date(row.date);
            return (
              <div key={row.date} className="rounded-[18px] px-3.5 py-3.5" style={{ background: `linear-gradient(165deg, rgba(14,165,198,${(0.1 + heat * 0.32).toFixed(2)}) 0%, #FFFFFF 85%)`, border: "1px solid rgba(14,165,198,0.28)" }}>
                <p className="text-[12.5px] font-medium capitalize" style={{ ...hubSans, color: hub.textMuted }}>
                  {d.toLocaleDateString("ru-RU", { weekday: "short" })}, {d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                </p>
                <p className="mt-2 text-[28px] font-medium leading-none" style={{ ...monoStyle, color: hub.text }}>
                  {formatInt(row.orders)}
                  <span className="ml-1 text-[12px]" style={{ color: hub.textSubtle, letterSpacing: 0 }}>зак.</span>
                </p>
                <p className="mt-2.5 text-[14.5px] font-medium" style={{ ...monoStyle, color: chartColors.blue }}>{formatRub(row.revenue)}</p>
                <p className="mt-0.5 text-[12.5px]" style={{ ...monoStyle, color: hub.textMuted, letterSpacing: "-0.02em" }}>выкупов: {formatInt(row.buyouts)}</p>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

type AnalyticsTab = "summary" | "daily" | "funnel" | "products" | "money" | "stock" | "ads" | "market";

const TABS: Array<{ id: AnalyticsTab; label: string }> = [
  { id: "summary", label: "Сводка" },
  { id: "daily", label: "Динамика" },
  { id: "funnel", label: "Воронка" },
  { id: "products", label: "Товары" },
  { id: "money", label: "Деньги" },
  { id: "stock", label: "Остатки" },
  { id: "ads", label: "Реклама" },
  { id: "market", label: "Рынок WB" },
];

const PERIOD_OPTIONS = ANALYTICS_PERIODS.map((d) => ({ id: String(d), label: `${d} дн.` }));

/**
 * Вкладки, которым нужна общая таблица товаров. Тяжёлый расчёт (маржа по всем товарам, ABC) живёт здесь и запускается только когда
 * открыта одна из этих вкладок, а не при каждом обновлении данных на остальных.
 */
export function HubAnalyticsDataTab({ tab, snapshot, period, connected, only }: { tab: "summary" | "funnel" | "products"; snapshot?: SellerCatalogSnapshot; period: AnalyticsPeriodState; connected?: boolean; only?: "funnel" }) {
  const data = useAnalyticsData(snapshot, { days: period.days, funnel: period.funnel, stocksReport: period.stocksReport });
  if (tab === "summary") return <HubAnalyticsSummary data={data} connected={connected} days={period.days} />;
  if (tab === "funnel") return <HubAnalyticsFunnel data={data} days={period.days} snapshot={snapshot} only={only} />;
  return <HubAnalyticsProducts data={data} snapshot={snapshot} days={period.days} />;
}

/** Аналитика по личному кабинету: сводка, динамика по дням, воронка, матрица товаров, деньги, остатки, рынок. Все цифры — данные WB по вашему магазину за выбранный период. */
export function HubAnalytics({ snapshot, connected, onOpenMenu }: { snapshot?: SellerCatalogSnapshot; connected?: boolean; onOpenMenu?: () => void }) {
  const [tab, setTab] = useState<AnalyticsTab>(() => {
    // Переход из уведомления («Открыть динамику заказов») открывает нужную вкладку.
    if (typeof window === "undefined") return "summary";
    try {
      const wanted = sessionStorage.getItem(ANALYTICS_TAB_HINT_KEY);
      sessionStorage.removeItem(ANALYTICS_TAB_HINT_KEY);
      return (ANALYTICS_TABS as readonly string[]).includes(wanted ?? "") ? (wanted as AnalyticsTab) : "summary";
    } catch {
      return "summary";
    }
  });
  const period = useAnalyticsPeriod(snapshot, connected);
  const needsPeriodData = tab === "summary" || tab === "funnel" || tab === "products" || tab === "stock";
  return (
    <HubGlassScope className="space-y-4">
      <AnalyticsMotion />
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <div className="flex items-center gap-3">
          {onOpenMenu ? (
            <button type="button" onClick={onOpenMenu} className="rounded-[10px] p-2 transition-colors hover:bg-[#161814]/[0.05] lg:hidden" style={{ color: hub.textMuted }} aria-label="Открыть меню">
              <Menu className="h-5 w-5" />
            </button>
          ) : null}
          <h1 className={hubType.h1} style={{ ...hubSerif, color: hub.text }}>
            Аналитика
          </h1>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-3">
          <Segmented<AnalyticsTab> layoutId="analytics-tabs" label="Разделы аналитики" value={tab} onChange={setTab} options={TABS} />
          <Segmented<string> layoutId="analytics-period" size="sm" label="Период" value={String(period.days)} onChange={(v) => period.setDays(Number(v) as AnalyticsPeriod)} options={PERIOD_OPTIONS} />
        </div>
      </header>

      {period.error && needsPeriodData ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-[13.5px]" style={{ ...hubSans, backgroundColor: hub.dangerSoft, color: hub.danger }}>
          <span>
            Не удалось получить данные за {period.days} дней: {period.error}. WB ограничивает частоту запросов, попробуйте через минуту.
          </span>
          <HubButton size="sm" variant="secondary" onClick={period.reload}>
            Повторить
          </HubButton>
        </div>
      ) : null}

      <div key={tab} className="hub-fade-in">
        {needsPeriodData && period.loading ? (
          <LoadingPage title={`Загружаю данные за ${period.days} дней`} />
        ) : (
          <>
            {tab === "summary" || tab === "funnel" || tab === "products" ? <HubAnalyticsDataTab tab={tab} snapshot={snapshot} period={period} connected={connected} /> : null}
            {tab === "daily" ? (
              <div className="space-y-3">
                <HubAnalyticsTrend connected={connected} days={period.days} />
                <HubAnalyticsDaily snapshot={snapshot} />
              </div>
            ) : null}
            {tab === "money" ? <HubAnalyticsMoney snapshot={snapshot} days={period.days} /> : null}
            {tab === "stock" ? <HubAnalyticsStock snapshot={snapshot} stocksReport={period.stocksReport} days={period.days} /> : null}
            {tab === "ads" ? <HubAnalyticsAds snapshot={snapshot} connected={connected} days={period.days} funnel={period.funnel} funnelLoading={period.loading} /> : null}
            {tab === "market" ? <HubAnalyticsMarket snapshot={snapshot} days={period.days} /> : null}
          </>
        )}
      </div>
    </HubGlassScope>
  );
}
