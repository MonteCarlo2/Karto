"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Activity, BarChart3, Bot, Boxes, Image as ImageIcon, Megaphone, Newspaper, PackageSearch, Settings2, ShoppingCart, Star, Tag, TrendingUp, Trophy, Wallet, type LucideIcon } from "lucide-react";
import { loadSellerHubAdsStats } from "@/lib/seller-hub/client-api";
import { buildStockAnalytics, type StockRow } from "@/lib/seller-hub/stock-analytics";
import type { SellerProductEvent } from "@/lib/seller-hub/event-engine/types";
import type { AnalyticsPeriod } from "@/lib/seller-hub/analytics-periods";
import type { SellerAdsStats, SellerCatalogItem, SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { CompareChart, type ComparePoint } from "./hub-analytics-charts";
import { chartColors, fmtPct } from "./hub-analytics-ui";
import { Frame } from "./hub-chat-analytics";
import { formatInt, formatRub, hub, hubNumeric, hubSans } from "./hub-ui";
import { useAnalyticsData } from "./use-analytics-data";
import { useAnalyticsPeriod } from "./use-analytics-period";

/**
 * Лента событий, реклама, остатки и товары прямо в переписке. Данные те же, что в разделах: ничего не выдумывается,
 * а если данных нет, блок так и говорит. Каждый блок короткий (до 5 строк) и ведёт в раздел за остальным.
 */
const EASE = [0.22, 1, 0.36, 1] as const;
const LIST_MAX = 5;
const orders = (n: number) => `${formatInt(n)} ${n % 10 === 1 && n % 100 !== 11 ? "заказ" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "заказа" : "заказов"}`;

function Photo({ src, size = 44 }: { src?: string; size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-[6px]" style={{ width: size, height: size, backgroundColor: "rgba(1, 20, 8, 0.05)" }} aria-hidden>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-contain" loading="lazy" />
      ) : null}
    </span>
  );
}

export function Row({ index, photo, title, sub, right, rightSub, tone }: { index: number; photo?: string | null; title: string; sub?: string; right?: ReactNode; rightSub?: ReactNode; tone?: string }) {
  return (
    <motion.li initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * index, duration: 0.3, ease: EASE }} className="flex items-center gap-3 py-2.5" style={{ borderColor: "rgba(1, 20, 8, 0.08)" }}>
      {photo !== null ? <Photo src={photo} /> : tone ? <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tone }} aria-hidden /> : null}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-[14.5px] font-semibold leading-[1.35] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
          {title}
        </span>
        {sub ? (
          <span className="mt-0.5 line-clamp-2 block text-[13px] leading-[1.4] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.textSubtle }}>
            {sub}
          </span>
        ) : null}
      </span>
      {right != null ? (
        <span className="shrink-0 text-right">
          <span className="block text-[15px] font-semibold" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
            {right}
          </span>
          {rightSub ? (
            <span className="block text-[12.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
              {rightSub}
            </span>
          ) : null}
        </span>
      ) : null}
    </motion.li>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.textSubtle }}>
      {children}
    </p>
  );
}

export function List({ children }: { children: ReactNode }) {
  return (
    <ul className="divide-y" style={{ borderColor: "rgba(1, 20, 8, 0.08)" }}>
      {children}
    </ul>
  );
}

export function Skeleton({ height = 180 }: { height?: number }) {
  return <div className="animate-pulse rounded-[14px]" style={{ height, backgroundColor: "rgba(1, 20, 8, 0.05)" }} aria-hidden />;
}

export function MoreNote({ shown, total }: { shown: number; total: number }) {
  return total > shown ? (
    <p className="mt-2 text-[13px]" style={{ ...hubSans, color: hub.textSubtle }}>
      Показаны {shown} из {total}. Остальные в разделе.
    </p>
  ) : null;
}

/* ───────────── События ───────────── */

const GROUP_LABEL: Record<string, string> = { sales: "Продажи", stock: "Остатки", price: "Цены и акции", content: "Карточки", reviews: "Отзывы", orders: "Заказы и поставки", ads: "Реклама", money: "Деньги", agents: "Агенты", system: "Система", news: "Новости", other: "Другое" };
const DAY_MS = 86_400_000;
const short = (t: string, n = 110) => {
  const one = t.replace(/\s+/g, " ").trim();
  return one.length <= n ? one : `${one.slice(0, n).replace(/\s+\S*$/, "")}…`;
};

const GROUP_ICON: Record<string, LucideIcon> = { sales: TrendingUp, stock: Boxes, price: Tag, content: ImageIcon, reviews: Star, orders: ShoppingCart, ads: Megaphone, money: Wallet, agents: Bot, system: Settings2, news: Newspaper, other: Activity };

/** Строка события как в разделе «События»: фото или значок группы, заголовок, группа и товар, справа время и пометка «Важно». */
function EventRow({ e, index, photo }: { e: SellerProductEvent; index: number; photo?: string }) {
  const Icon = GROUP_ICON[e.group] ?? Activity;
  const hot = e.severity !== "info";
  const when = new Date(e.createdAt);
  const today = new Date().toDateString() === when.toDateString();
  const sub = [GROUP_LABEL[e.group] ?? "Другое", e.productTitle].filter(Boolean).join(" · ");
  const detail = e.group === "news" || !e.detail ? "" : short(e.detail);
  return (
    <motion.li initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * index, duration: 0.3, ease: EASE }} className="flex items-start gap-3 rounded-[14px] px-3 py-2.5" style={{ backgroundColor: hot ? "rgba(245, 158, 11, 0.10)" : "rgba(1, 20, 8, 0.035)" }}>
      {photo ? (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[6px]" style={{ backgroundColor: "rgba(1, 20, 8, 0.05)" }} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="" className="h-full w-full object-contain" loading="lazy" />
        </span>
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]" style={{ backgroundColor: "rgba(46, 90, 67, 0.10)", color: hub.greenDark }} aria-hidden>
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-[1.35] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
          {e.title}
        </span>
        <span className="mt-0.5 block text-[13px] leading-[1.4] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.textSubtle }}>
          {sub}
          {detail ? ` · ${detail}` : ""}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-[13px] font-medium" style={{ ...hubSans, ...hubNumeric, color: hub.textSubtle }}>
          {today ? when.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : when.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
        </span>
        {hot ? (
          <span className="rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style={{ ...hubSans, backgroundColor: "rgba(245, 158, 11, 0.22)", color: "#8A5A00" }}>
            Важно
          </span>
        ) : null}
      </span>
    </motion.li>
  );
}

export function ChatEvents({ events, days, group, itemByNm, onOpen }: { events?: SellerProductEvent[]; days: number; group?: string | null; itemByNm?: Map<string, SellerCatalogItem>; onOpen?: () => void }) {
  const [nowMs] = useState(() => Date.now());
  const list = useMemo(() => {
    const since = nowMs - days * DAY_MS;
    return (events ?? []).filter((e) => Date.parse(e.createdAt) >= since && (!group || e.group === group)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [events, days, group, nowMs]);
  const important = list.filter((e) => e.severity !== "info").length;
  // Показываем сначала важные из последних, затем самые свежие: так в пяти строках оказывается главное.
  const shown = [...list.filter((e) => e.severity !== "info").slice(0, 2), ...list.filter((e) => e.severity === "info")].slice(0, LIST_MAX).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return (
    <Frame title={`${group ? (GROUP_LABEL[group] ?? "События") : "События"} · ${days} дн.`} icon={<Newspaper className="h-4 w-4" aria-hidden />} hint={list.length > 0 ? `Всего ${list.length}${important > 0 ? `, важных ${important}` : ""}. Новые сверху.` : undefined} onOpenLabel="Открыть события" onOpen={onOpen}>
      {events == null ? (
        <Skeleton height={140} />
      ) : shown.length === 0 ? (
        <Empty>За этот период событий нет.</Empty>
      ) : (
        <>
          <ul className="space-y-1.5">
            {shown.map((e, i) => (
              <EventRow key={e.id} e={e} index={i} photo={e.nmId ? (itemByNm?.get(e.nmId)?.imageUrl ?? undefined) : undefined} />
            ))}
          </ul>
          <MoreNote shown={shown.length} total={list.length} />
        </>
      )}
    </Frame>
  );
}

/* ───────────── Реклама ───────────── */

const msk = (ms: number) => new Date(ms + 3 * 3_600_000).toISOString().slice(0, 10);

export function ChatAds({ days, snapshot, connected, onOpen }: { days: number; snapshot?: SellerCatalogSnapshot; connected: boolean; onOpen?: () => void }) {
  const adsDays = Math.min(days, 30);
  const campaigns = snapshot?.ads?.campaigns;
  const ids = useMemo(() => (campaigns ?? []).map((c) => Number(c.id)).filter((id) => Number.isInteger(id) && id > 0), [campaigns]);
  const [state, setState] = useState<{ key: string; stats: SellerAdsStats | null; error?: string } | null>(null);
  const key = `${ids.join(",")}|${adsDays}`;
  useEffect(() => {
    if (!connected || ids.length === 0) return;
    let cancelled = false;
    const now = Date.now();
    void loadSellerHubAdsStats({ campaignIds: ids, dateFrom: msk(now - (adsDays - 1) * DAY_MS), dateTo: msk(now) })
      .then((res) => {
        if (!cancelled) setState({ key, stats: res.ok ? (res.stats ?? null) : null, error: res.ok ? undefined : res.error });
      })
      .catch(() => {
        if (!cancelled) setState({ key, stats: null, error: "Не удалось получить данные рекламы" });
      });
    return () => {
      cancelled = true;
    };
  }, [connected, ids, key, adsDays]);
  const ready = state?.key === key;
  const stats = ready ? state!.stats : null;
  const calc = useMemo(() => {
    if (!stats) return null;
    const total = stats.campaigns.reduce((a, c) => ({ spend: a.spend + c.spend, orders: a.orders + c.orders, sum: a.sum + c.orderSum, views: a.views + c.views, clicks: a.clicks + c.clicks }), { spend: 0, orders: 0, sum: 0, views: 0, clicks: 0 });
    const byDay = new Map<string, number>();
    for (const c of stats.campaigns) for (const d of c.days) byDay.set(d.date, (byDay.get(d.date) ?? 0) + d.spend);
    const points: ComparePoint[] = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value: Math.round(value) }));
    const nameOf = new Map((campaigns ?? []).map((c) => [String(c.id), c.name || `Кампания ${c.id}`]));
    const statusOf = new Map((campaigns ?? []).map((c) => [String(c.id), c.statusLabel ?? ""]));
    const rows = [...stats.campaigns].filter((c) => c.spend > 0 || c.orders > 0).sort((a, b) => b.spend - a.spend);
    return { total, points, rows, nameOf, statusOf };
  }, [stats, campaigns]);
  const drr = calc && calc.total.sum > 0 ? calc.total.spend / calc.total.sum : null;
  return (
    <Frame title={`Реклама · ${adsDays} дн.`} icon={<Megaphone className="h-4 w-4" aria-hidden />} onOpenLabel="Открыть рекламу" onOpen={onOpen}>
      {!connected ? (
        <Empty>Данные кабинета ещё не загружены.</Empty>
      ) : ids.length === 0 ? (
        <Empty>Рекламных кампаний в кабинете пока нет.</Empty>
      ) : !ready ? (
        <Skeleton height={260} />
      ) : !calc ? (
        <Empty>{state?.error ?? "WB не вернул статистику рекламы. WB ограничивает частоту запросов, попробуйте через минуту."}</Empty>
      ) : (
        <>
          <p className="text-[15px] leading-[1.65]" style={{ ...hubSans, color: hub.text }}>
            Потрачено <span className="font-semibold">{formatRub(calc.total.spend)}</span>, реклама дала <span className="font-semibold">{formatInt(calc.total.orders)} заказов на {formatRub(calc.total.sum)}</span>
            {drr != null ? (
              <>
                , ДРР <span className="font-semibold">{fmtPct(drr)}</span>
              </>
            ) : null}
            .
          </p>
          {calc.points.length >= 2 ? (
            <div className="mt-3">
              <CompareChart points={calc.points} height={200} color={chartColors.amber} label="Расход на рекламу" fmt={formatRub} yFormat={(n) => (n >= 1000 ? `${Math.round(n / 1000)} тыс` : `${n}`)} />
            </div>
          ) : null}
          {calc.rows.length > 0 ? (
            <div className="mt-3">
              <ul className="space-y-1.5">
                {calc.rows.slice(0, LIST_MAX).map((c, i) => {
                  const d = c.orderSum > 0 ? c.spend / c.orderSum : null;
                  const waste = c.orders === 0 && c.spend > 0;
                  const top = calc.rows[0]?.spend || 1;
                  const status = calc.statusOf.get(c.advertId) || "";
                  return (
                    <motion.li key={c.advertId} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, duration: 0.3 }} className="rounded-[14px] px-3.5 py-3" style={{ backgroundColor: waste ? "rgba(194, 65, 12, 0.08)" : "rgba(1, 20, 8, 0.035)" }}>
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]" style={{ backgroundColor: waste ? "rgba(194, 65, 12, 0.14)" : "rgba(245, 158, 11, 0.16)", color: waste ? "#C2410C" : "#8A5A00" }} aria-hidden>
                          <Megaphone className="h-[18px] w-[18px]" strokeWidth={1.8} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold leading-[1.35] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                            {calc.nameOf.get(c.advertId) ?? `Кампания ${c.advertId}`}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-1.5">
                            {status ? (
                              <span className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold" style={{ ...hubSans, backgroundColor: "rgba(46, 90, 67, 0.14)", color: hub.greenDark }}>
                                {status}
                              </span>
                            ) : null}
                            <span className="rounded-full px-2.5 py-0.5 text-[12px] font-medium" style={{ ...hubSans, backgroundColor: waste ? "rgba(194, 65, 12, 0.14)" : "rgba(1, 20, 8, 0.06)", color: waste ? "#C2410C" : hub.text }}>
                              {waste ? "Расход без заказов" : orders(c.orders)}
                            </span>
                            {d != null ? (
                              <span className="rounded-full px-2.5 py-0.5 text-[12px] font-medium" style={{ ...hubSans, backgroundColor: "rgba(1, 20, 8, 0.06)", color: hub.text }}>
                                ДРР {fmtPct(d)}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-[16px] font-semibold" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
                          {formatRub(c.spend)}
                        </span>
                      </div>
                      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: "rgba(1, 20, 8, 0.07)" }} aria-hidden>
                        <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(4, Math.round((c.spend / top) * 100))}%` }} transition={{ duration: 0.6, ease: EASE, delay: 0.1 + 0.05 * i }} className="h-full rounded-full" style={{ backgroundColor: waste ? "#C2410C" : "#F59E0B" }} />
                      </div>
                    </motion.li>
                  );
                })}
              </ul>
              <MoreNote shown={Math.min(calc.rows.length, LIST_MAX)} total={calc.rows.length} />
            </div>
          ) : null}
        </>
      )}
    </Frame>
  );
}

type Chip = { text: string; tone?: "good" | "warn" | "bad" | "plain" };
const CHIP_STYLE: Record<NonNullable<Chip["tone"]>, { bg: string; fg: string }> = {
  good: { bg: "rgba(46, 90, 67, 0.14)", fg: "#1B4A32" },
  warn: { bg: "rgba(245, 158, 11, 0.2)", fg: "#8A5A00" },
  bad: { bg: "rgba(194, 65, 12, 0.14)", fg: "#C2410C" },
  plain: { bg: "rgba(1, 20, 8, 0.06)", fg: "#011408" },
};

/** Карточка товара в ленте: фото, название, пометки, число справа и полоска сравнения. */
function RichRow({ index, photo, title, chips, right, rightSub, bar, barTone = "#2E5A43" }: { index: number; photo?: string; title: string; chips: Chip[]; right: string; rightSub?: string; bar?: number; barTone?: string }) {
  return (
    <motion.li initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * index, duration: 0.3, ease: EASE }} className="rounded-[14px] px-3.5 py-3.5" style={{ backgroundColor: "rgba(1, 20, 8, 0.035)" }}>
      <div className="flex items-start gap-3.5">
        <Photo src={photo} size={68} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-[16px] font-semibold leading-[1.35] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
            {title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {chips.map((c) => (
              <span key={c.text} className="rounded-full px-2.5 py-0.5 text-[12px] font-medium" style={{ ...hubSans, backgroundColor: CHIP_STYLE[c.tone ?? "plain"].bg, color: CHIP_STYLE[c.tone ?? "plain"].fg }}>
                {c.text}
              </span>
            ))}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[16px] font-semibold" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
            {right}
          </span>
          {rightSub ? (
            <span className="block text-[12.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
              {rightSub}
            </span>
          ) : null}
        </span>
      </div>
      {bar != null ? (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: "rgba(1, 20, 8, 0.07)" }} aria-hidden>
          <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(3, Math.min(100, Math.round(bar * 100)))}%` }} transition={{ duration: 0.6, ease: EASE, delay: 0.1 + 0.05 * index }} className="h-full rounded-full" style={{ backgroundColor: barTone }} />
        </div>
      ) : null}
    </motion.li>
  );
}

/* ───────────── Остатки ───────────── */

export function ChatStock({ days, mode, snapshot, connected, itemByNm, onOpen }: { days: AnalyticsPeriod; mode: "low" | "over"; snapshot?: SellerCatalogSnapshot; connected: boolean; itemByNm?: Map<string, SellerCatalogItem>; onOpen?: () => void }) {
  const period = useAnalyticsPeriod(snapshot, connected, days);
  const stock = useMemo(() => buildStockAnalytics(period.stocksReport, snapshot?.items ?? []), [period.stocksReport, snapshot?.items]);
  const low = useMemo(() => (stock?.rows ?? []).filter((r) => r.status === "out" || r.status === "low").sort((a, b) => (a.saleRateDays ?? 1e9) - (b.saleRateDays ?? 1e9)), [stock]);
  const over = useMemo(() => (stock?.rows ?? []).filter((r) => r.status === "over").sort((a, b) => (b.saleRateDays ?? 1e9) - (a.saleRateDays ?? 1e9) || b.stock - a.stock), [stock]);
  // Нет товаров, которые скоро закончатся: показываем те, у кого запаса меньше всего по расчёту WB.
  const nearest = useMemo(() => (stock?.rows ?? []).filter((r) => r.saleRateDays != null && !r.noSales).sort((a, b) => a.saleRateDays! - b.saleRateDays!), [stock]);
  const fallback = mode === "low" && low.length === 0 && nearest.length > 0;
  const list: StockRow[] = mode === "low" ? (fallback ? nearest : low) : over;
  const shown = list.slice(0, LIST_MAX);
  return (
    <Frame title={mode === "low" ? (fallback ? "Запаса меньше всего у этих товаров" : "Заканчиваются остатки") : "Излишки запаса"} icon={<PackageSearch className="h-4 w-4" aria-hidden />} hint={stock ? (fallback ? "Скоро заканчивающихся товаров нет, вот те, у кого запаса меньше всего." : `Заканчивается: ${low.length}. Излишек: ${over.length}.`) : undefined} onOpenLabel="Открыть остатки" onOpen={onOpen}>
      {!connected ? (
        <Empty>Данные кабинета ещё не загружены.</Empty>
      ) : period.loading ? (
        <Skeleton />
      ) : !stock ? (
        <Empty>Отчёта об остатках WB пока нет. Обновите данные кабинета.</Empty>
      ) : shown.length === 0 ? (
        <Empty>{mode === "low" ? "Товаров, которые скоро закончатся, нет." : "Явных излишков запаса нет."}</Empty>
      ) : (
        <>
          <ul className="space-y-1.5">
            {shown.map((r, i) => {
              const maxDays = Math.max(1, ...shown.map((x) => x.saleRateDays ?? 0));
              const tone: Chip["tone"] = r.status === "out" ? "bad" : r.status === "low" ? "warn" : r.status === "over" ? "warn" : "plain";
              const chips: Chip[] = [
                r.status === "out" ? { text: "Закончился", tone: "bad" } : r.noSales ? { text: "Продаж не было", tone: "warn" } : r.saleRateDays != null ? { text: `Хватит на ${Math.round(r.saleRateDays)} дн.`, tone } : { text: "WB не рассчитал запас" },
                ...(r.lostOrders > 0 ? [{ text: `Упущено заказов: ${formatInt(r.lostOrders)}`, tone: "bad" as const }] : []),
              ];
              return <RichRow key={r.nmId} index={i} photo={itemByNm?.get(r.nmId)?.imageUrl ?? undefined} title={r.title} chips={chips} right={`${formatInt(r.stock)} шт.`} rightSub="на складах" bar={r.saleRateDays != null ? r.saleRateDays / maxDays : undefined} barTone={tone === "plain" ? "#2E5A43" : "#F59E0B"} />;
            })}
          </ul>
          <MoreNote shown={shown.length} total={list.length} />
        </>
      )}
    </Frame>
  );
}

/* ───────────── Товары ───────────── */

export function ChatProducts({ days, mode, snapshot, connected, itemByNm, onOpen }: { days: AnalyticsPeriod; mode: "orders" | "worst"; snapshot?: SellerCatalogSnapshot; connected: boolean; itemByNm?: Map<string, SellerCatalogItem>; onOpen?: () => void }) {
  const period = useAnalyticsPeriod(snapshot, connected, days);
  const data = useAnalyticsData(snapshot, { days, funnel: period.funnel, stocksReport: period.stocksReport });
  const rows = data.rows;
  const list = useMemo(() => {
    if (mode === "worst") return rows.filter((r) => r.prevOrderSum != null && r.prevOrderSum > 0 && r.sumChange != null && r.sumChange < 0).sort((a, b) => (a.sumDelta ?? 0) - (b.sumDelta ?? 0));
    return rows.filter((r) => r.orderSum > 0).sort((a, b) => b.orderSum - a.orderSum);
  }, [rows, mode]);
  const shown = list.slice(0, LIST_MAX);
  return (
    <Frame title={mode === "worst" ? `Больше всего просели · ${days} дн.` : `Лучшие товары по сумме заказов · ${days} дн.`} icon={mode === "worst" ? <BarChart3 className="h-4 w-4" aria-hidden /> : <Trophy className="h-4 w-4" aria-hidden />} onOpenLabel="Открыть товары" onOpen={onOpen}>
      {!connected ? (
        <Empty>Данные кабинета ещё не загружены.</Empty>
      ) : period.loading ? (
        <Skeleton />
      ) : shown.length === 0 ? (
        <Empty>{mode === "worst" ? "Товаров с заметным падением продаж нет." : "Данных по заказам за период пока нет."}</Empty>
      ) : (
        <>
          <ul className="space-y-1.5">
            {shown.map((r, i) => {
              const top = Math.max(1, ...shown.map((x) => x.orderSum));
              const chips: Chip[] = [
                { text: orders(r.orders) },
                ...(r.sumChange != null ? [{ text: `${r.sumChange >= 0 ? "+" : ""}${Math.round(r.sumChange)}% к прошлому периоду`, tone: (r.sumChange >= 0 ? "good" : "bad") as Chip["tone"] }] : []),
              ];
              return <RichRow key={r.nmId} index={i} photo={itemByNm?.get(r.nmId)?.imageUrl ?? undefined} title={r.title} chips={chips} right={formatRub(r.orderSum)} rightSub={r.share > 0 ? `${fmtPct(r.share, 0)} выручки` : undefined} bar={r.orderSum / top} barTone={mode === "worst" ? "#C2410C" : "#2E5A43"} />;
            })}
          </ul>
          <MoreNote shown={shown.length} total={list.length} />
        </>
      )}
    </Frame>
  );
}
