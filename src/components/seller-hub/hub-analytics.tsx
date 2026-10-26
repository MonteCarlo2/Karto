"use client";

import { ANALYTICS_TAB_HINT_KEY, ANALYTICS_TABS } from "@/lib/seller-hub/events-actions";
import { useState } from "react";
import { BarChart3 } from "lucide-react";
import type { SellerAnalyticsSummary, SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import {
  formatCompactRub,
  formatInt,
  formatRub,
  formatSyncTime,
  hub,
  HubButton,
  HubEmptyState,
  HubPanel,
  HubPanelHeader,
  hubNumeric,
  HubSegmented,
  hubSans,
  MetricTile,
} from "./hub-ui";
import { HubAnalyticsAds } from "./hub-analytics-ads";
import { HubAnalyticsFunnel } from "./hub-analytics-funnel";
import { HubAnalyticsMarket } from "./hub-analytics-market";
import { HubAnalyticsMoney } from "./hub-analytics-money";
import { HubAnalyticsProducts } from "./hub-analytics-products";
import { HubAnalyticsStock } from "./hub-analytics-stock";
import { HubAnalyticsTrend } from "./hub-analytics-trend";
import { HubAnalyticsSummary } from "./hub-analytics-summary";
import { useAnalyticsData } from "./use-analytics-data";
import { useAnalyticsPeriod, type AnalyticsPeriodState } from "./use-analytics-period";
import { ANALYTICS_PERIODS, type AnalyticsPeriod } from "@/lib/seller-hub/analytics-periods";

function DailyBarChart({ daily }: { daily: SellerAnalyticsSummary["daily"] }) {
  const maxOrders = Math.max(1, ...daily.map((d) => d.orders));
  const maxRevenue = Math.max(1, ...daily.map((d) => d.revenue));

  return (
    <div className="mt-4">
      <div className="mb-3 flex gap-4 text-[12px] font-semibold" style={hubSans}>
        <span className="inline-flex items-center gap-1.5" style={{ color: hub.text }}>
          <i className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: hub.lime }} /> Заказы
        </span>
        <span className="inline-flex items-center gap-1.5" style={{ color: hub.text }}>
          <i className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: hub.blue }} /> Оборот
        </span>
      </div>
      <div className="flex items-end gap-2 sm:gap-3" style={{ minHeight: 168 }}>
        {daily.map((point) => {
          const ordersHeight = Math.max(6, (point.orders / maxOrders) * 120);
          const revenueHeight = Math.max(6, (point.revenue / maxRevenue) * 120);
          const label = new Date(point.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
          return (
            <div key={point.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex h-[120px] w-full items-end justify-center gap-1">
                <div
                  className="w-2/5 rounded-t-[6px]"
                  style={{ height: ordersHeight, backgroundColor: hub.lime }}
                  title={`${label}: ${formatInt(point.orders)} заказов, выкупов ${formatInt(point.buyouts)}`}
                />
                <div
                  className="w-2/5 rounded-t-[6px]"
                  style={{ height: revenueHeight, backgroundColor: hub.blue }}
                  title={`${label}: ${formatRub(point.revenue)}, выкупов ${formatInt(point.buyouts)}`}
                />
              </div>
              <span className="truncate text-[11px] font-medium" style={{ color: hub.textSubtle }}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Прежний экран «Аналитики»: заказы и оборот за 7 дней по дням. Сохранён целиком, теперь это вкладка «Динамика». */
function HubAnalyticsDaily({ snapshot }: { snapshot?: SellerCatalogSnapshot }) {
  const analytics = snapshot?.analytics;

  if (!analytics || analytics.daily.length === 0) {
    return (
      <HubPanel className="flex min-h-[420px] flex-col">
        <HubEmptyState
          icon={<BarChart3 className="h-7 w-7" />}
          title="Аналитика пока недоступна"
          description="После выгрузки здесь появятся заказы и оборот за 7 дней. Нужна категория «Аналитика» в API-токене WB."
        />
      </HubPanel>
    );
  }

  const avgDailyOrders =
    analytics.daily.length > 0 ? analytics.ordersTotal / analytics.daily.length : 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Оборот за 7 дней"
          value={formatCompactRub(analytics.revenueTotal)}
          sub={`${formatInt(analytics.ordersTotal)} заказов`}
        />
        <MetricTile
          label="Заказов в день"
          value={avgDailyOrders >= 1 ? formatInt(Math.round(avgDailyOrders)) : avgDailyOrders.toFixed(1)}
          sub={`период ${analytics.periodStart} — ${analytics.periodEnd}`}
        />
        <MetricTile
          label="Выкупы"
          value={formatInt(analytics.buyoutsTotal)}
          sub="за тот же период"
        />
        <MetricTile
          label="Средний чек"
          value={analytics.avgOrderValue != null ? formatRub(analytics.avgOrderValue) : "—"}
          sub={analytics.currency}
        />
      </div>

      <HubPanel padded>
        <HubPanelHeader
          title="Заказы по дням"
          hint={`Обновлено ${formatSyncTime(snapshot?.syncedAt)}`}
        />
        <DailyBarChart daily={analytics.daily} />
      </HubPanel>

      <HubPanel>
        <HubPanelHeader title="Детализация по дням" />
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead style={{ backgroundColor: hub.surfaceMuted }}>
              <tr>
                {["Дата", "Заказы", "Оборот", "Выкупы"].map((label) => (
                  <th
                    key={label}
                    className="border-b px-5 py-3 text-[11.5px] font-bold uppercase tracking-[0.06em] sm:px-6"
                    style={{ ...hubSans, color: hub.textSubtle, borderColor: hub.borderSoft }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...analytics.daily].reverse().map((row) => (
                <tr key={row.date} className="border-b transition-colors duration-150 hover:bg-[#1C1915]/[0.04]" style={{ borderColor: hub.borderSoft }}>
                  <td className="px-5 py-3 text-[13px] sm:px-6" style={{ color: hub.text }}>
                    {new Date(row.date).toLocaleDateString("ru-RU", {
                      day: "numeric",
                      month: "long",
                      weekday: "short",
                    })}
                  </td>
                  <td
                    className="px-5 py-3 text-[13.5px] font-semibold sm:px-6"
                    style={{ ...hubSans, ...hubNumeric, color: hub.text }}
                  >
                    {formatInt(row.orders)}
                  </td>
                  <td
                    className="px-5 py-3 text-[13.5px] font-semibold sm:px-6"
                    style={{ ...hubSans, ...hubNumeric, color: hub.text }}
                  >
                    {formatRub(row.revenue)}
                  </td>
                  <td
                    className="px-5 py-3 text-[13.5px] sm:px-6"
                    style={{ ...hubSans, ...hubNumeric, color: hub.textMuted }}
                  >
                    {formatInt(row.buyouts)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </HubPanel>
    </div>
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
function HubAnalyticsDataTab({ tab, snapshot, period }: { tab: "summary" | "funnel" | "products"; snapshot?: SellerCatalogSnapshot; period: AnalyticsPeriodState }) {
  const data = useAnalyticsData(snapshot, { days: period.days, funnel: period.funnel, stocksReport: period.stocksReport });
  if (tab === "summary") return <HubAnalyticsSummary data={data} />;
  if (tab === "funnel") return <HubAnalyticsFunnel data={data} days={period.days} />;
  return <HubAnalyticsProducts data={data} snapshot={snapshot} days={period.days} />;
}

/** Аналитика по личному кабинету: сводка, динамика по дням, воронка, матрица товаров, деньги, остатки, рынок. Все цифры — данные WB по вашему магазину за выбранный период. */
export function HubAnalytics({ snapshot, connected }: { snapshot?: SellerCatalogSnapshot; connected?: boolean }) {
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
    <div className="space-y-4">
      <div className="flex flex-col gap-2.5 rounded-2xl border px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between" style={{ borderColor: hub.border, backgroundColor: hub.surface }}>
        <HubSegmented<AnalyticsTab> layoutId="analytics-tabs" value={tab} onChange={setTab} options={TABS} />
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
            Период
          </span>
          <HubSegmented<string> layoutId="analytics-period" value={String(period.days)} onChange={(v) => period.setDays(Number(v) as AnalyticsPeriod)} options={PERIOD_OPTIONS} />
        </div>
      </div>

      {period.error && needsPeriodData ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5 text-[13px]" style={{ ...hubSans, backgroundColor: hub.dangerSoft, color: hub.danger }}>
          <span>
            Не удалось получить данные за {period.days} дней: {period.error}. WB ограничивает частоту запросов, попробуйте через минуту.
          </span>
          <HubButton size="sm" variant="secondary" onClick={period.reload}>
            Повторить
          </HubButton>
        </div>
      ) : null}

      {needsPeriodData && period.loading ? (
        <HubPanel className="px-5 py-8">
          <p className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
            Загружаю данные за {period.days} дней…
          </p>
          <p className="mt-1 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
            WB отдаёт воронку и остатки с ограничением частоты запросов, первая загрузка периода занимает до минуты. Повторно данные берутся из кэша на 30 минут.
          </p>
        </HubPanel>
      ) : (
        <>
          {tab === "summary" || tab === "funnel" || tab === "products" ? <HubAnalyticsDataTab tab={tab} snapshot={snapshot} period={period} /> : null}
          {tab === "daily" ? (
            <div className="space-y-4">
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
  );
}