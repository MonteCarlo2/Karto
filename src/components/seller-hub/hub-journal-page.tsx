"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Ban, Bell, CalendarClock, Check, CirclePause, CirclePlay, CirclePlus, FlaskConical, Flag, Gauge, Gavel, LayoutGrid, Megaphone, MessageSquare, Package, PackageMinus, PackagePlus, Boxes, ScrollText, Search, Tag, Truck, Wallet, X, XCircle, type LucideIcon } from "lucide-react";
import { loadSellerHubActionLog, loadSellerHubAiFeed, loadSellerHubOrders, type ActionLogRow } from "@/lib/seller-hub/client-api";
import { readHubJournal } from "@/lib/seller-hub/journal";
import { AREA_LABEL, buildJournal, type JournalIcon, type JournalPlan, inPeriod, journalStats, matchesQuery, type JournalArea, type JournalItem, type JournalPeriod } from "@/lib/seller-hub/journal-view";
import type { OrderRun, Order } from "@/lib/seller-hub/orders/types";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { hub, hubNumeric, hubSans } from "./hub-ui";

/**
 * Страница «Журнал» на всю правую часть, как «Поручения»: сводка за период и скачивание слева, поиск, отбор и лента записей справа.
 * Источники: действия в кабинете (серверный журнал), запуски поручений, записи этого браузера. Записи только читаются.
 */

const MSK = 3 * 3_600_000;
const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

const AREA_STYLE: Record<JournalArea, { Icon: LucideIcon; bg: string; fg: string }> = {
  ads: { Icon: Megaphone, bg: "rgba(46,90,67,0.13)", fg: "#2E5A43" },
  prices: { Icon: Tag, bg: "rgba(245,183,59,0.22)", fg: "#7A5200" },
  comms: { Icon: MessageSquare, bg: "rgba(204,92,120,0.14)", fg: "#8A3050" },
  stocks: { Icon: Package, bg: "rgba(74,125,173,0.15)", fg: "#2B5278" },
  plans: { Icon: Flag, bg: "rgba(31,77,179,0.12)", fg: "#1F4DB3" },
  orders: { Icon: CalendarClock, bg: "rgba(185,255,75,0.4)", fg: "#1F4A1A" },
  other: { Icon: ScrollText, bg: "rgba(1,20,8,0.07)", fg: "#4C5A52" },
};

const ICONS: Record<JournalIcon, LucideIcon> = {
  wallet: Wallet,
  pause: CirclePause,
  play: CirclePlay,
  ban: Ban,
  bid: Gavel,
  plus: CirclePlus,
  "package-minus": PackageMinus,
  "package-plus": PackagePlus,
  layout: LayoutGrid,
  gauge: Gauge,
  truck: Truck,
  "x-circle": XCircle,
  tag: Tag,
  boxes: Boxes,
  bell: Bell,
  flask: FlaskConical,
  alert: AlertTriangle,
  flag: Flag,
  check: Check,
  message: MessageSquare,
  scroll: ScrollText,
};

const PERIODS: Array<{ id: JournalPeriod; label: string }> = [
  { id: "today", label: "Сегодня" },
  { id: "7", label: "7 дней" },
  { id: "30", label: "30 дней" },
  { id: "all", label: "Всё" },
];

const mskKey = (ms: number) => new Date(ms + MSK).toISOString().slice(0, 10);
function dayLabel(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "Без даты";
  const k = mskKey(t);
  if (k === mskKey(nowMs)) return "Сегодня";
  if (k === mskKey(nowMs - 86_400_000)) return "Вчера";
  return `${Number(k.slice(8, 10))} ${MONTHS[Number(k.slice(5, 7)) - 1]}`;
}
const timeOf = (iso: string) => {
  const d = new Date(Date.parse(iso) + MSK);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

function Chip({ on, count, children, onClick, danger }: { on: boolean; count?: number; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14.5px] font-medium outline-none transition-colors focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, backgroundColor: on ? (danger ? "#C2410C" : hub.ink) : "rgba(1,20,8,0.06)", color: on ? "#fff" : danger ? "#C2410C" : hub.text }}>
      {children}
      {count != null ? (
        <span className="text-[13px] tabular-nums" style={{ ...hubNumeric, opacity: on ? 0.8 : 0.55 }}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

function Stat({ value, label, tone, onClick }: { value: string; label: string; tone?: "danger"; onClick?: () => void }) {
  const inner = (
    <>
      <p className="text-[32px] font-semibold leading-none tracking-[-0.02em] tabular-nums" style={{ ...hubSans, ...hubNumeric, color: tone === "danger" ? "#C2410C" : hub.text }}>
        {value}
      </p>
      <p className="mt-2 text-[14px] leading-[1.35]" style={{ ...hubSans, color: hub.textMuted }}>
        {label}
      </p>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="rounded-[14px] text-left outline-none transition-colors hover:bg-[rgba(194,65,12,0.06)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]">
      {inner}
    </button>
  ) : (
    <div>{inner}</div>
  );
}

function Row({ item, selected, onSelect }: { item: JournalItem; selected: boolean; onSelect: () => void }) {
  const style = item.tone === "danger" ? { bg: "rgba(194,65,12,0.14)", fg: "#C2410C" } : AREA_STYLE[item.area];
  const Icon = ICONS[item.icon];
  return (
    <li className="border-t first:border-t-0" style={{ borderColor: "rgba(1,20,8,0.09)" }}>
      <button type="button" onClick={onSelect} aria-pressed={selected} className="grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-start gap-x-4 rounded-[14px] px-3 py-4 text-left outline-none transition-colors hover:bg-[rgba(1,20,8,0.03)] focus-visible:shadow-[inset_0_0_0_2px_var(--hub-lime-ring)]" style={{ backgroundColor: selected ? "rgba(185,255,75,0.22)" : undefined }}>
        <span className="flex h-12 w-12 items-center justify-center rounded-[14px]" style={{ backgroundColor: style.bg, color: style.fg }}>
          <Icon className="h-[22px] w-[22px]" strokeWidth={1.8} aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-[17px] font-semibold leading-[1.35] tracking-[-0.005em] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
            {item.title}
          </span>
          {item.detail ? (
            <span className="mt-1 line-clamp-2 block text-[15px] leading-[1.5] [overflow-wrap:anywhere]" style={{ ...hubSans, color: item.tone === "danger" ? "#9A3412" : hub.textMuted }}>
              {item.detail}
            </span>
          ) : null}
          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
            <span>{AREA_LABEL[item.area]}</span>
            <span aria-hidden>·</span>
            <span>{item.who}</span>
            {item.tone === "test" ? <span className="rounded-full px-2.5 py-0.5 text-[12.5px] font-medium" style={{ backgroundColor: "rgba(245,183,59,0.25)", color: "#7A5200" }}>тест, в WB ничего не ушло</span> : null}
            {item.tone === "danger" ? <span className="rounded-full px-2.5 py-0.5 text-[12.5px] font-medium" style={{ backgroundColor: "rgba(194,65,12,0.12)", color: "#C2410C" }}>ошибка</span> : null}
          </span>
        </span>
        <span className="pt-0.5 text-[15px] tabular-nums" style={{ ...hubSans, ...hubNumeric, color: hub.textSubtle }}>
          {timeOf(item.at)}
        </span>
      </button>
    </li>
  );
}

/** Правая панель, как в «Событиях»: период и сводка сверху, ниже подробности выбранной записи. */
function SidePanel({ period, onPeriod, stats, selected, titles, onOpenOrders, onFilterProduct, onErrors }: { period: JournalPeriod; onPeriod: (p: JournalPeriod) => void; stats: ReturnType<typeof journalStats>; selected: JournalItem | null; titles: Map<string, string>; onOpenOrders: (orderId?: string) => void; onFilterProduct: (t: string) => void; onErrors: () => void }) {
  const style = selected ? (selected.tone === "danger" ? { bg: "rgba(194,65,12,0.14)", fg: "#C2410C" } : AREA_STYLE[selected.area]) : null;
  const Icon = selected ? ICONS[selected.icon] : null;
  const productTitle = selected?.nmId ? titles.get(selected.nmId) : undefined;
  return (
    <aside className="space-y-8 xl:sticky xl:top-4" aria-label="Период и подробности">
      <div className="rounded-[22px] p-6" style={{ boxShadow: "inset 0 0 0 1.5px rgba(1,20,8,0.78)" }}>
        <p className="text-[13px] font-semibold uppercase tracking-[0.07em]" style={{ ...hubSans, color: hub.textSubtle }}>
          Период
        </p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Период">
          {PERIODS.map((p) => (
            <Chip key={p.id} on={period === p.id} onClick={() => onPeriod(p.id)}>
              {p.label}
            </Chip>
          ))}
        </div>
        <div className="mt-6 grid grid-cols-3 gap-4">
          <Stat value={String(stats.total)} label="записей" />
          <Stat value={String(stats.ok)} label="выполнено" />
          <Stat value={String(stats.errors)} label={stats.errors === 1 ? "ошибка" : "ошибок"} tone={stats.errors > 0 ? "danger" : undefined} onClick={stats.errors > 0 ? onErrors : undefined} />
        </div>
        {stats.depositRub > 0 || stats.priceChanges > 0 ? (
          <p className="mt-5 border-t pt-4 text-[14.5px] leading-[1.6]" style={{ ...hubSans, borderColor: "rgba(1,20,8,0.1)", color: hub.textMuted }}>
            {stats.depositRub > 0 ? <>Пополнено на рекламу: <strong style={{ color: hub.text }}>{stats.depositRub.toLocaleString("ru-RU")} ₽</strong>. </> : null}
            {stats.priceChanges > 0 ? <>Изменений цены: <strong style={{ color: hub.text }}>{stats.priceChanges}</strong>.</> : null}
          </p>
        ) : null}
      </div>

      <div className="px-1">
        {selected && Icon && style ? (
          <div>
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]" style={{ backgroundColor: style.bg, color: style.fg }}>
                <Icon className="h-[22px] w-[22px]" strokeWidth={1.8} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[20px] font-semibold leading-[1.3] tracking-[-0.01em] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                  {selected.title}
                </p>
                <p className="mt-1 text-[14px]" style={{ ...hubSans, color: hub.textSubtle }}>
                  {new Date(Date.parse(selected.at) + MSK).toISOString().slice(0, 10).split("-").reverse().join(".")} в {timeOf(selected.at)} по Москве · {selected.who}
                </p>
              </div>
            </div>
            {selected.facts.length > 0 ? (
              <dl className="mt-5 divide-y" style={{ borderColor: "rgba(1,20,8,0.09)" }}>
                {selected.facts.map((f) => (
                  <div key={f.label} className="py-3.5" style={{ borderColor: "rgba(1,20,8,0.09)" }}>
                    <dt className="text-[13.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                      {f.label}
                    </dt>
                    <dd className="mt-1 text-[16px] leading-[1.5] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                      {f.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-4 text-[15px]" style={{ ...hubSans, color: hub.textSubtle }}>
                Подробностей у этой записи нет.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {selected.orderId ? (
                <button type="button" onClick={() => onOpenOrders(selected.orderId)} className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[14.5px] font-medium outline-none transition-colors hover:bg-[rgba(1,20,8,0.09)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, backgroundColor: "rgba(1,20,8,0.06)", color: hub.text }}>
                  Открыть поручения
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
              {productTitle ? (
                <button type="button" onClick={() => onFilterProduct(productTitle)} className="inline-flex h-10 items-center rounded-full px-4 text-[14.5px] font-medium outline-none transition-colors hover:bg-[rgba(1,20,8,0.09)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, backgroundColor: "rgba(1,20,8,0.06)", color: hub.text }}>
                  Все записи по этому товару
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-[15px] leading-[1.6]" style={{ ...hubSans, color: hub.textSubtle }}>
            Выберите запись слева, и здесь появятся подробности: что именно изменилось, по какой кампании или товару, что ответил Wildberries.
          </p>
        )}
      </div>
    </aside>
  );
}

const PAGE = 25;

export function HubJournalPage({ snapshot, onOpenOrders }: { snapshot?: SellerCatalogSnapshot; onOpenOrders: (orderId?: string) => void }) {
  const [actions, setActions] = useState<ActionLogRow[] | null>(null);
  const [runs, setRuns] = useState<OrderRun[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [plans, setPlans] = useState<JournalPlan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<JournalPeriod>("30");
  const [area, setArea] = useState<JournalArea | "all" | "errors">("all");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [selId, setSelId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const [local] = useState(() => readHubJournal());

  const load = useCallback(async () => {
    setError(null);
    const [a, o, f] = await Promise.all([loadSellerHubActionLog(), loadSellerHubOrders(), loadSellerHubAiFeed()]);
    if (f.ok) setPlans(f.items.flatMap((x) => (x.finding?.ownerAccepted ? [{ id: x.finding.id, title: x.title, nmId: x.finding.nmId, strategy: x.finding.strategy, state: x.finding.strategyState }] : [])));
    if (a.ok) setActions(a.entries);
    else setError(a.error ?? "Журнал не загрузился");
    if (o.ok && o.data) {
      setRuns(o.data.runs);
      setOrders(o.data.orders);
    }
  }, []);

  useEffect(() => {
    let off = false;
    void Promise.all([loadSellerHubActionLog(), loadSellerHubOrders(), loadSellerHubAiFeed().catch(() => null)]).then(([a, o, f]) => {
      if (off) return;
      if (f && f.ok) setPlans(f.items.flatMap((x) => (x.finding?.ownerAccepted ? [{ id: x.finding.id, title: x.title, nmId: x.finding.nmId, strategy: x.finding.strategy, state: x.finding.strategyState }] : [])));
      if (a.ok) setActions(a.entries);
      else setError(a.error ?? "Журнал не загрузился");
      if (o.ok && o.data) {
        setRuns(o.data.runs);
        setOrders(o.data.orders);
      }
    });
    return () => {
      off = true;
    };
  }, []);

  const titles = useMemo(() => new Map((snapshot?.items ?? []).map((i) => [String(i.externalId), i.title])), [snapshot?.items]);
  const campaigns = useMemo(() => new Map((snapshot?.ads?.campaigns ?? []).map((c) => [String(c.id), c.name || `Кампания ${c.id}`])), [snapshot?.ads]);
  const all = useMemo(() => buildJournal({ actions: actions ?? [], plans, runs, local, titles, campaigns, orderTitles: new Map(orders.map((o) => [o.id, o.title])) }), [actions, plans, runs, local, titles, campaigns, orders]);

  const byPeriod = useMemo(() => all.filter((i) => inPeriod(i, period, now)), [all, period, now]);
  const stats = useMemo(() => journalStats(byPeriod), [byPeriod]);
  const areaCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of byPeriod) c[i.area] = (c[i.area] ?? 0) + 1;
    return c;
  }, [byPeriod]);
  const visible = useMemo(() => byPeriod.filter((i) => (area === "all" ? true : area === "errors" ? i.tone === "danger" : i.area === area) && matchesQuery(i, q)), [byPeriod, area, q]);

  const groups = useMemo(() => {
    const out: Array<{ label: string; rows: JournalItem[] }> = [];
    for (const r of visible.slice(0, shown)) {
      const label = dayLabel(r.at, now);
      const g = out[out.length - 1];
      if (g && g.label === label) g.rows.push(r);
      else out.push({ label, rows: [r] });
    }
    return out;
  }, [visible, shown, now]);

  const loading = actions == null && !error;
  const filtersOn = area !== "all" || q.trim() !== "";

  return (
    <div className="hub-fade-in min-h-0 flex-1 overflow-y-auto">
      <div className="w-full px-5 pb-20 pt-7 sm:px-8 lg:px-14 lg:pt-8">
        <header className="mx-auto max-w-[860px] text-center">
          <h1 className="text-[34px] font-normal leading-[1.08] tracking-[-0.025em] sm:text-[44px]" style={{ fontFamily: "var(--font-serif, Georgia, serif)", color: hub.text }}>
            Журнал
          </h1>
          <p className="mx-auto mt-2 max-w-[60ch] text-[15.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
            Всё, что менялось в кабинете через KARTO, и что делали ваши поручения: кто, когда, с каким результатом.
          </p>
        </header>

        <div className="mt-10 grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-14">
          <section aria-label="Записи журнала" className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex h-12 min-w-[240px] flex-1 items-center gap-2.5 rounded-full px-5" style={{ boxShadow: "inset 0 0 0 1px rgba(1,20,8,0.16)" }}>
                <Search className="h-[18px] w-[18px] shrink-0" style={{ color: hub.textSubtle }} aria-hidden />
                <input value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder="Найти по товару, кампании, действию" aria-label="Поиск по журналу" className="min-w-0 flex-1 bg-transparent text-[15.5px] outline-none" style={{ ...hubSans, color: hub.text }} />
                {q ? (
                  <button type="button" onClick={() => setQ("")} aria-label="Очистить поиск" className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-[rgba(1,20,8,0.08)]">
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Раздел">
              <Chip on={area === "all"} count={byPeriod.length} onClick={() => { setArea("all"); setShown(PAGE); }}>Все</Chip>
              {(["ads", "prices", "comms", "stocks", "orders", "plans", "other"] as JournalArea[]).filter((a) => (areaCounts[a] ?? 0) > 0).map((a) => (
                <Chip key={a} on={area === a} count={areaCounts[a]} onClick={() => { setArea(a); setShown(PAGE); }}>{AREA_LABEL[a]}</Chip>
              ))}
              {stats.errors > 0 ? <Chip danger on={area === "errors"} count={stats.errors} onClick={() => { setArea("errors"); setShown(PAGE); }}>Ошибки</Chip> : null}
            </div>

            {error ? (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[16px] px-5 py-4" style={{ backgroundColor: hub.dangerSoft }} role="alert">
                <p className="text-[15px]" style={{ ...hubSans, color: hub.text }}>
                  Журнал сейчас не открылся. Это временно, данные не потеряны.
                </p>
                <button type="button" onClick={() => void load()} className="inline-flex h-9 items-center rounded-full px-4 text-[14px] font-medium" style={{ ...hubSans, backgroundColor: "rgba(1,20,8,0.08)", color: hub.text }}>
                  Повторить
                </button>
              </div>
            ) : null}

            <div className="mt-6">
              {loading ? (
                <div className="space-y-4" aria-busy="true">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-[84px] animate-pulse rounded-[16px]" style={{ backgroundColor: "rgba(1,20,8,0.04)" }} />
                  ))}
                </div>
              ) : visible.length === 0 ? (
                <div className="rounded-[22px] px-7 py-10 text-center" style={{ boxShadow: "inset 0 0 0 1px rgba(1,20,8,0.1)" }}>
                  <ScrollText className="mx-auto h-8 w-8" style={{ color: hub.textSubtle }} aria-hidden />
                  <p className="mt-3 text-[18px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                    {filtersOn ? "По этому отбору записей нет" : "Журнал пока пуст"}
                  </p>
                  <p className="mx-auto mt-1 max-w-[52ch] text-[15px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
                    {filtersOn ? "Попробуйте другой период, раздел или поисковое слово." : "Здесь появится каждое действие в кабинете и каждый запуск поручения: что, когда и с каким результатом."}
                  </p>
                  {filtersOn ? (
                    <button type="button" onClick={() => { setArea("all"); setQ(""); }} className="mt-4 inline-flex h-10 items-center rounded-full px-5 text-[14.5px] font-medium" style={{ ...hubSans, backgroundColor: "rgba(1,20,8,0.06)", color: hub.text }}>
                      Сбросить отбор
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-9">
                  {groups.map((g) => (
                    <div key={g.label}>
                      <h2 className="mb-1 text-[13px] font-semibold uppercase tracking-[0.08em]" style={{ ...hubSans, color: hub.textSubtle }}>
                        {g.label}
                      </h2>
                      <ul>
                        {g.rows.map((r) => (
                          <Row key={r.id} item={r} selected={selId === r.id} onSelect={() => setSelId((cur) => (cur === r.id ? null : r.id))} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              {visible.length > shown ? (
                <button type="button" onClick={() => setShown((n) => n + PAGE)} className="mt-6 inline-flex h-11 items-center rounded-full px-6 text-[15px] font-medium outline-none transition-colors hover:bg-[rgba(1,20,8,0.09)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, backgroundColor: "rgba(1,20,8,0.06)", color: hub.text }}>
                  Показать ещё {Math.min(PAGE, visible.length - shown)} из {visible.length - shown}
                </button>
              ) : null}
            </div>
          </section>
          <SidePanel period={period} onPeriod={(p) => { setPeriod(p); setShown(PAGE); }} stats={stats} selected={visible.find((v) => v.id === selId) ?? null} titles={titles} onOpenOrders={onOpenOrders} onFilterProduct={(t) => { setQ(t); setShown(PAGE); }} onErrors={() => { setArea("errors"); setShown(PAGE); }} />
        </div>
      </div>
    </div>
  );
}
