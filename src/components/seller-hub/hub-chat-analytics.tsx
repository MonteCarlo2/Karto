"use client";

import { useMemo, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, BarChart3 } from "lucide-react";
import { ANALYTICS_TAB_HINT_KEY } from "@/lib/seller-hub/events-actions";
import { buildMoneyAnalytics } from "@/lib/seller-hub/money-analytics";
import type { AnalyticsPeriod } from "@/lib/seller-hub/analytics-periods";
import type { SellerCatalogItem, SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { ChatAds, ChatProducts, ChatStock } from "./hub-chat-data";
import { CompareChart, type ComparePoint } from "./hub-analytics-charts";
import { FunnelSteps, type FunnelStage } from "./hub-analytics-funnel";
import { chartColors, fmtPct } from "./hub-analytics-ui";
import { PolarCurve, TreemapChart } from "./hub-analytics-viz";
import { formatInt, formatRub, hub, hubNumeric, hubSans } from "./hub-ui";
import { useAnalyticsData } from "./use-analytics-data";
import { useAnalyticsPeriod } from "./use-analytics-period";
import { useDailyOrdersCompare } from "./use-daily-orders";

/**
 * Графики из «Аналитики» в переписке. Это не вырезки страницы: рамка своя, как у остальных блоков чата, а внутри те же графики
 * (с наведением) и те же данные. Простые цифры (сумма, средний чек) остаются в тексте ответа.
 * Таблицы (остатки, реклама, товары, рынок) в чат не помещаются красиво: для них короткая карточка со ссылкой на нужную вкладку.
 */
export type AnalyticsView = "trend" | "summary" | "funnel" | "products" | "money" | "stock" | "ads" | "market";
export type AnalyticsPart = "orders" | "sum" | "weekdays" | "low" | "over" | "worst";

const TAB_OF: Record<AnalyticsView, string> = { trend: "daily", summary: "daily", funnel: "funnel", products: "products", money: "money", stock: "stock", ads: "ads", market: "market" };
const TITLE: Record<AnalyticsView, string> = { trend: "Динамика заказов", summary: "Сводка магазина", funnel: "Воронка", products: "Товары", money: "Куда уходит выручка", stock: "Остатки", ads: "Реклама", market: "Рынок WB" };
const NOTE: Partial<Record<AnalyticsView, string>> = {
  stock: "Таблица остатков, дни запаса и излишки по каждому товару.",
  ads: "Расходы, ДРР и кампании по дням с фильтрами.",
  products: "Все показатели по каждому товару с сортировкой и ABC.",
  market: "Спрос и динамика категорий Wildberries.",
};

const EASE = [0.22, 1, 0.36, 1] as const;

export function Frame({ title, hint, children, onOpen, onOpenLabel = "Открыть в Аналитике", icon, delay = 0 }: { title: string; hint?: string; children: ReactNode; onOpen?: () => void; onOpenLabel?: string; icon?: ReactNode; delay?: number }) {
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay }} className="rounded-[20px] p-4 sm:p-5" style={{ backgroundColor: "transparent", boxShadow: "inset 0 0 0 1px rgba(1, 20, 8, 0.12)" }}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
            {icon ?? <BarChart3 className="h-4 w-4" aria-hidden />}
            {title}
          </p>
          {hint ? (
            <p className="mt-1 text-[13.5px] leading-[1.45]" style={{ ...hubSans, color: hub.textSubtle }}>
              {hint}
            </p>
          ) : null}
        </div>
        {onOpen ? (
          <button type="button" onClick={onOpen} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold outline-none transition-[filter] hover:brightness-95 focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, backgroundColor: hub.lime, color: "#011408" }}>
            {onOpenLabel}
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </motion.section>
  );
}

function Skeleton({ height = 260 }: { height?: number }) {
  return <div className="animate-pulse rounded-[14px]" style={{ height, backgroundColor: "rgba(1, 20, 8, 0.05)" }} aria-hidden />;
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.textSubtle }}>
      {children}
    </p>
  );
}

const delta = (cur: number, prev: number | null | undefined) => (prev == null || prev <= 0 ? null : Math.round(((cur - prev) / prev) * 100));

function Delta({ value, good = "up" }: { value: number | null; good?: "up" | "down" }) {
  if (value == null) return null;
  const ok = good === "up" ? value >= 0 : value <= 0;
  return (
    <span className="text-[13px] font-semibold" style={{ ...hubSans, color: ok ? hub.greenDark : "#C2410C" }}>
      {value >= 0 ? "+" : ""}
      {value}% к прошлому периоду
    </span>
  );
}

function totals(days: Array<{ net: number; sum: number; cancelled: number; partial: boolean }> | null | undefined) {
  const done = (days ?? []).filter((d) => !d.partial);
  const net = done.reduce((s, d) => s + d.net, 0);
  const cancelled = done.reduce((s, d) => s + d.cancelled, 0);
  const sum = done.reduce((s, d) => s + d.sum, 0);
  return { net, cancelled, sum, avg: net > 0 ? sum / net : null, share: net + cancelled > 0 ? cancelled / (net + cancelled) : null };
}

/** Заказы или сумма по дням: график этого периода и пунктир прошлого. */
function OrdersChart({ part, days, connected, onOpen }: { part: "orders" | "sum"; days: number; connected: boolean; onOpen?: () => void }) {
  const { ready, current, previous, error } = useDailyOrdersCompare(connected, days);
  const points = useMemo<ComparePoint[]>(
    () =>
      (current ?? []).map((d, i) => {
        const pd = previous?.[i];
        const pick = (x: { net: number; sum: number }) => (part === "orders" ? x.net : x.sum);
        return { date: d.date, value: pick(d), partial: d.partial, prevDate: pd?.date, prev: pd ? pick(pd) : null, note: d.cancelled > 0 ? `Отменено: ${formatInt(d.cancelled)}` : undefined };
      }),
    [current, previous, part],
  );
  const cur = totals(current);
  const prev = previous ? totals(previous) : null;
  const total = part === "orders" ? cur.net : cur.sum;
  const was = prev ? (part === "orders" ? prev.net : prev.sum) : null;
  return (
    <Frame title={part === "orders" ? `Заказы по дням · ${days} дн.` : `Сумма заказов по дням · ${days} дн.`} onOpen={onOpen}>
      {!connected || error ? (
        <Note>Данных по дням пока нет. Откройте раздел «Аналитика».</Note>
      ) : !ready || !current ? (
        <Skeleton />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[28px] font-bold leading-none tracking-[-0.02em]" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
              {part === "orders" ? `${formatInt(total)} шт.` : formatRub(total)}
            </span>
            <Delta value={delta(total, was)} />
          </div>
          <CompareChart points={points} height={260} color={part === "orders" ? chartColors.teal : chartColors.blue} label={part === "orders" ? "Заказы без отмен" : "Сумма без отмен"} fmt={part === "orders" ? (n) => `${formatInt(n)} шт.` : formatRub} yFormat={part === "orders" ? undefined : (n) => (n >= 1000 ? `${Math.round(n / 1000)} тыс` : `${n}`)} />
        </>
      )}
    </Frame>
  );
}

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;
const WEEKDAYS_FULL = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"] as const;

function WeekdaysChart({ days, connected, onOpen }: { days: number; connected: boolean; onOpen?: () => void }) {
  const { ready, current } = useDailyOrdersCompare(connected, Math.max(days, 28));
  const avgs = useMemo(() => {
    const done = (current ?? []).filter((d) => !d.partial);
    if (done.length < 14) return null;
    const sums = Array<number>(7).fill(0);
    const counts = Array<number>(7).fill(0);
    for (const d of done) {
      const idx = (new Date(`${d.date}T00:00:00Z`).getUTCDay() + 6) % 7;
      sums[idx] = (sums[idx] ?? 0) + d.net;
      counts[idx] = (counts[idx] ?? 0) + 1;
    }
    return sums.map((v, i) => (counts[i]! > 0 ? v / counts[i]! : 0));
  }, [current]);
  const top = avgs ? avgs.indexOf(Math.max(...avgs)) : -1;
  const low = avgs ? avgs.indexOf(Math.min(...avgs)) : -1;
  return (
    <Frame title="Заказы по дням недели" hint={avgs ? `В среднем за день. Больше всего заказов в ${WEEKDAYS_FULL[top]}, меньше всего в ${WEEKDAYS_FULL[low]}.` : undefined} onOpen={onOpen}>
      {!connected ? (
        <Note>Данных по дням пока нет.</Note>
      ) : !ready ? (
        <Skeleton height={300} />
      ) : !avgs ? (
        <Note>Для этого графика нужно хотя бы 14 законченных дней.</Note>
      ) : (
        <div className="mx-auto max-w-[460px]">
          <PolarCurve size={460} color={chartColors.teal} format={(n) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} items={avgs.map((v, i) => ({ id: String(i), label: WEEKDAYS[i]!, value: Math.round(v * 10) / 10, hint: `${WEEKDAYS_FULL[i]}, заказов в день` }))} />
        </div>
      )}
    </Frame>
  );
}

/** Воронка магазина: просмотр → корзина → заказ → выкуп, конверсии словами под ней. */
function FunnelChart({ days, snapshot, connected, onOpen }: { days: AnalyticsPeriod; snapshot?: SellerCatalogSnapshot; connected: boolean; onOpen?: () => void }) {
  const period = useAnalyticsPeriod(snapshot, connected, days);
  const data = useAnalyticsData(snapshot, { days, funnel: period.funnel, stocksReport: period.stocksReport });
  const k = data.kpis;
  const stages: FunnelStage[] | null = k
    ? [
        { id: "open", label: "Просмотры карточек", cur: k.current.opens, past: k.past?.opens ?? null },
        { id: "cart", label: "Добавили в корзину", cur: k.current.carts, past: k.past?.carts ?? null, rateLabel: "из просмотров", rate: k.current.cartRate, pastRate: k.past?.cartRate },
        { id: "order", label: "Заказали", cur: k.current.orders, past: k.past?.orders ?? null, rateLabel: "из корзины", rate: k.current.orderRate, pastRate: k.past?.orderRate },
        { id: "buy", label: "Выкупили", cur: k.current.buyouts, past: k.past?.buyouts ?? null, rateLabel: "по завершённым заказам", rate: k.current.buyoutRate, pastRate: k.past?.buyoutRate },
      ]
    : null;
  return (
    <Frame title={`Воронка · ${days} дн.`} hint="Между шагами показано, какая доля людей дошла с предыдущего." onOpen={onOpen}>
      {!connected ? (
        <Note>Данные кабинета ещё не загружены.</Note>
      ) : period.loading ? (
        <Skeleton height={320} />
      ) : !stages ? (
        <Note>Воронка берётся из аналитики WB: выгрузите данные кабинета.</Note>
      ) : (
        <>
          <div className="mx-auto max-w-[560px]">
            <FunnelSteps stages={stages} compact />
          </div>
          <p className="mt-4 text-[14.5px] leading-[1.6]" style={{ ...hubSans, color: hub.text }}>
            <span className="font-semibold">Выкуп {fmtPct(k!.current.buyoutRate)}</span> заказов с известным исходом. <span className="font-semibold">Из просмотра в заказ доходит {fmtPct(k!.current.openToOrder)}</span> посетителей карточек.
          </p>
        </>
      )}
    </Frame>
  );
}

/** Куда уходит выручка: плитки по статьям и итог словами. */
function MoneyChart({ days, snapshot, onOpen }: { days: number; snapshot?: SellerCatalogSnapshot; onOpen?: () => void }) {
  const money = useMemo(() => buildMoneyAnalytics(snapshot?.realization, snapshot?.items ?? [], days), [snapshot?.realization, snapshot?.items, days]);
  const c = money?.current;
  return (
    <Frame title={`Куда уходит выручка · ${days} дн.`} hint={c ? `Выручка ${formatRub(c.revenue)}. Чем больше плитка, тем больше доля.` : undefined} onOpen={onOpen}>
      {!c ? (
        <Note>Отчёта реализации за этот период пока нет. После обновления данных кабинета здесь появится разбивка выручки.</Note>
      ) : (
        <TreemapChart
          height={300}
          format={formatRub}
          items={[
            { id: "left", title: "Остаётся", value: Math.max(c.beforeCost, 0), color: chartColors.green },
            { id: "hold", title: "Удержано WB", value: c.wbHold, color: chartColors.magenta, hint: "Комиссия, эквайринг и другие удержания WB" },
            { id: "log", title: "Логистика", value: c.logistics, color: chartColors.amber },
            { id: "stor", title: "Хранение", value: c.storage, color: chartColors.teal },
            { id: "acc", title: "Приёмка", value: c.acceptance, color: chartColors.violet },
          ]}
        />
      )}
    </Frame>
  );
}

/** Сводка: строки с цифрами и дельтой, ниже график заказов. */
function Digest({ days, connected, onOpen }: { days: number; connected: boolean; onOpen?: () => void }) {
  const { ready, current, previous } = useDailyOrdersCompare(connected, days);
  const cur = totals(current);
  const prev = previous ? totals(previous) : null;
  const rows: Array<{ label: string; value: string; change: number | null; good?: "up" | "down" }> = [
    { label: "Заказы без отмен", value: `${formatInt(cur.net)} шт.`, change: delta(cur.net, prev?.net) },
    { label: "Сумма заказов", value: formatRub(cur.sum), change: delta(cur.sum, prev?.sum) },
    { label: "Средний чек", value: cur.avg != null ? formatRub(cur.avg) : "нет данных", change: cur.avg != null && prev?.avg != null ? delta(cur.avg, prev.avg) : null },
    { label: "Доля отмен", value: fmtPct(cur.share), change: cur.share != null && prev?.share != null ? delta(cur.share, prev.share) : null, good: "down" },
  ];
  return (
    <div className="space-y-3">
      <Frame title={`Сводка · ${days} дн.`} onOpen={onOpen}>
        {!connected ? (
          <Note>Данные кабинета ещё не загружены.</Note>
        ) : !ready || !current ? (
          <Skeleton height={140} />
        ) : (
          <dl className="divide-y" style={{ borderColor: "rgba(1, 20, 8, 0.08)" }}>
            {rows.map((r) => (
              <div key={r.label} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 py-2.5" style={{ borderColor: "rgba(1, 20, 8, 0.08)" }}>
                <dt className="min-w-0 flex-1 text-[14.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                  {r.label}
                </dt>
                <dd className="text-[17px] font-semibold" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
                  {r.value}
                </dd>
                <dd className="min-w-[150px] text-right">
                  <Delta value={r.change} good={r.good} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Frame>
      <OrdersChart part="orders" days={days} connected={connected} />
    </div>
  );
}

export function ChatAnalytics({ view, days, part, snapshot, connected, itemByNm, onOpenSection }: { view: AnalyticsView; days: AnalyticsPeriod; nmId?: string; part?: AnalyticsPart; snapshot?: SellerCatalogSnapshot; connected: boolean; itemByNm?: Map<string, SellerCatalogItem>; onOpenSection?: (id: string) => void }) {
  const open = onOpenSection
    ? () => {
        try {
          sessionStorage.setItem(ANALYTICS_TAB_HINT_KEY, TAB_OF[view]);
        } catch {
          // без подсказки откроется сводка
        }
        onOpenSection("analytics");
      }
    : undefined;
  if (view === "trend") {
    if (part === "weekdays") return <WeekdaysChart days={days} connected={connected} onOpen={open} />;
    return <OrdersChart part={part === "sum" ? "sum" : "orders"} days={days} connected={connected} onOpen={open} />;
  }
  if (view === "summary") return <Digest days={days} connected={connected} onOpen={open} />;
  if (view === "funnel") return <FunnelChart days={days} snapshot={snapshot} connected={connected} onOpen={open} />;
  if (view === "money") return <MoneyChart days={days} snapshot={snapshot} onOpen={open} />;
  if (view === "ads") return <ChatAds days={days} snapshot={snapshot} connected={connected} onOpen={open} />;
  if (view === "stock") return <ChatStock days={days} mode={part === "over" ? "over" : "low"} snapshot={snapshot} connected={connected} itemByNm={itemByNm} onOpen={open} />;
  if (view === "products") return <ChatProducts days={days} mode={part === "worst" ? "worst" : "orders"} snapshot={snapshot} connected={connected} itemByNm={itemByNm} onOpen={open} />;
  return (
    <Frame title={TITLE[view]} hint={NOTE[view]} onOpen={open}>
      <Note>Эта таблица большая, поэтому она открывается в разделе «Аналитика» сразу на нужной вкладке.</Note>
    </Frame>
  );
}
