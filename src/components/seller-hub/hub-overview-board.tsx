"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { TASK_CATEGORY_LABEL } from "@/lib/seller-hub/task-engine/breakdown";
import type { SellerHubAreaId } from "@/lib/seller-hub/nav";
import type { SellerCatalogSnapshot, SellerDailySalesPoint } from "@/lib/seller-hub/types";
import { storeBuyoutFromFunnel } from "@/lib/seller-hub/buyout";
import { snapshotTimeMs, withoutIncompleteDay } from "@/lib/seller-hub/complete-days";
import { loadStoredSellerHubTasks } from "@/lib/seller-hub/task-engine/client";
import { isActionableTask } from "@/lib/seller-hub/task-engine/lifecycle";
import { compareByPriority } from "@/lib/seller-hub/task-engine/priority";
import { taskDisplayTitle } from "@/lib/seller-hub/task-engine/story";
import type { SellerTask } from "@/lib/seller-hub/task-engine/types";
import { loadSellerHubAgentProposals, loadSellerHubAiActivity, loadSellerHubAutopilot, loadSellerHubOrders } from "@/lib/seller-hub/client-api";
import type { Order, OrderRun } from "@/lib/seller-hub/orders/types";
import { RETIRED_EVENT_KINDS, type SellerProductEvent } from "@/lib/seller-hub/event-engine/types";
import { formatInt, formatRub, hub, hubSans, HubBadge, HubButton } from "./hub-ui";
import { BigNumber, chartColors, DeltaChip, Segmented } from "./hub-analytics-ui";
import { CompareChart, type ComparePoint } from "./hub-analytics-charts";
import { setTaskFocus } from "./task-focus";

/**
 * «Обзор магазина» в стиле раздела «Аналитика»: цветные плитки показателей, график в рамке, что важно сейчас, четыре рабочих блока в рамках.
 * Всё нажимается и ведёт в нужный раздел. Числа из снимка кабинета, задач и агента; нет данных, стоит прочерк.
 */

type ChartMetric = "revenue" | "orders";

const SEV_TONE: Record<SellerTask["severity"], "danger" | "warn" | "ok"> = { critical: "danger", important: "warn", opportunity: "ok" };
const SEV_LABEL: Record<SellerTask["severity"], string> = { critical: "Срочно", important: "Важно", opportunity: "Возможность" };
const SEV_DOT: Record<SellerTask["severity"], string> = { critical: "#D33A3C", important: "#D29922", opportunity: "#14874E" };
const ROW_H = 68;
const HAIR = "rgba(1,20,8,0.1)";
const PLATE = "#F4F6F0";
const AI_COLOR = "#2E5A43";
const INK_GRADIENT = "linear-gradient(135deg, #1F4E3D 0%, #2E5A43 70%, #3C6B52 100%)";
const CELL_HOVER = "transition-colors hover:bg-[rgba(1,20,8,0.03)] focus-visible:bg-[rgba(1,20,8,0.03)] focus-visible:outline-none";
const CAPTION = "text-[12.5px] font-semibold uppercase tracking-[0.08em]";

export function HubOverviewBoard({ snapshot, events = [], onNavigate, onOpenReviews }: { snapshot?: SellerCatalogSnapshot; events?: SellerProductEvent[]; onNavigate: (area: SellerHubAreaId) => void; onOpenReviews: () => void }) {
  const analytics = snapshot?.analytics;
  const orders = snapshot?.orders;
  const daily = analytics?.daily ?? [];
  const complete = withoutIncompleteDay(daily, snapshotTimeMs(snapshot));
  const revenueDelta = dayChange(complete, "revenue");
  const ordersDelta = dayChange(complete, "orders");
  const checkDelta = rateChange(complete);
  const buyoutStat = storeBuyoutFromFunnel(snapshot?.funnel);
  const financeKnown = Boolean(snapshot?.finance?.available && snapshot.finance.balance != null);
  const days = daily.length;

  const [tasks, setTasks] = useState<SellerTask[] | null>(null);
  const [agent, setAgent] = useState<{ orders: Order[]; runs: OrderRun[]; proposals: number } | null>(null);
  const [autopilot, setAutopilot] = useState<{ recent: Array<{ id: string; title: string; status: string; note: string; at: string }> } | null>(null);
  const [plansRunning, setPlansRunning] = useState<number | null>(null);
  useEffect(() => {
    let off = false;
    if (snapshot) {
      void loadStoredSellerHubTasks(snapshot)
        .then((t) => !off && setTasks(t))
        .catch(() => !off && setTasks([]));
    }
    void Promise.all([loadSellerHubOrders(), loadSellerHubAgentProposals()]).then(([o, p]) => {
      if (off) return;
      setAgent({ orders: o.ok && o.data ? o.data.orders : [], runs: o.ok && o.data ? o.data.runs : [], proposals: p.ok ? p.proposals.length : 0 });
    });
    void loadSellerHubAutopilot()
      .then((r) => !off && setAutopilot({ recent: r.ok && r.data ? r.data.recent : [] }))
      .catch(() => !off && setAutopilot({ recent: [] }));
    void loadSellerHubAiActivity()
      .then((r) => !off && setPlansRunning(r.ok && r.data ? r.data.plans.filter((x) => x.accepted && !x.state.resolvedAt && !x.state.pausedAt).length : 0))
      .catch(() => !off && setPlansRunning(0));
    return () => {
      off = true;
    };
  }, [snapshot?.marketplaceId, snapshot?.syncedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const [now] = useState(() => Date.now());
  const actionable = useMemo(() => (tasks ?? []).filter((t) => isActionableTask(t, now)).sort(compareByPriority), [tasks, now]);
  const sevCount = (s: SellerTask["severity"]) => actionable.filter((t) => t.severity === s).length;

  // Сколько задач помещается в колонку: по высоте списка, чтобы строка не обрезалась и прокрутки не было.
  const listRef = useRef<HTMLDivElement | null>(null);
  const [rows, setRows] = useState(4);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const fit = () => setRows(Math.max(2, Math.min(9, Math.floor(el.clientHeight / ROW_H))));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Высота графика берётся из высоты блока, чтобы он занимал всё место без прокрутки страницы.
  const chartBoxRef = useRef<HTMLDivElement | null>(null);
  const [boxH, setBoxH] = useState(0);
  useEffect(() => {
    const el = chartBoxRef.current;
    if (!el) return;
    const fit = () => setBoxH(el.clientHeight);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [metric, setMetric] = useState<ChartMetric>("revenue");
  const completeDates = new Set(complete.map((d) => d.date));
  const points: ComparePoint[] = daily.map((d) => ({ date: d.date.slice(0, 10), value: metric === "revenue" ? Math.round(d.revenue) : d.orders, partial: !completeDates.has(d.date) }));

  const exhaustedAds = (snapshot?.ads?.campaigns ?? []).filter((c) => c.status === 9 && c.budget === 0).length;
  const activeOrders = (agent?.orders ?? []).filter((o) => o.status === "active");
  const nextOrder = activeOrders.filter((o) => o.nextRunAt).sort((a, b) => String(a.nextRunAt).localeCompare(String(b.nextRunAt)))[0] ?? null;

  // Лента работы агента: запуски поручений и действия автопилота, свежие сверху.
  const feed = useMemo(() => {
    if (agent == null || autopilot == null) return null;
    const runKind: Record<OrderRun["status"], string> = { reminder: "Напоминание", done: "Выполнено", simulated: "Проверка", failed: "Ошибка", skipped: "Пропуск" };
    const fromRuns = agent.runs.filter((r) => r.status !== "skipped").map((r) => ({ id: `r${r.id}`, kind: runKind[r.status], title: r.orderTitle ?? "Поручение", note: r.summary, at: r.at, failed: r.status === "failed" }));
    const fromAuto = autopilot.recent.map((r) => ({ id: `a${r.id}`, kind: "Агент", title: r.title, note: r.note, at: r.at, failed: r.status === "failed" || r.status === "error" }));
    return [...fromRuns, ...fromAuto].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 3);
  }, [agent, autopilot]);
  // События: свежие, сначала те, что требуют внимания.
  const news = useMemo(
    () =>
      events
        .filter((e) => !RETIRED_EVENT_KINDS.has(e.kind))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .sort((a, b) => Number(b.severity !== "info") - Number(a.severity !== "info"))
        .slice(0, 3),
    [events],
  );
  const feedbacks = snapshot?.comms?.unansweredFeedbacks;
  const questions = snapshot?.comms?.unansweredQuestions;
  const chartH = Math.max(150, boxH - 70);

  return (
    <div className="-mx-3 sm:-mx-4 lg:-mx-5 lg:-mb-4 lg:grid lg:h-[calc(100dvh-72px)] lg:min-h-[640px] lg:grid-cols-12 lg:grid-rows-[minmax(0,1fr)_auto]" style={{ ...hubSans, backgroundColor: PLATE }}>
      <style>{`
        @keyframes ov-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ov-reveal { from { clip-path: inset(0 100% 0 0); opacity: 0.4; } to { clip-path: inset(0 0 0 0); opacity: 1; } }
        .ov-rise { animation: ov-rise 700ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .ov-reveal { animation: ov-reveal 1300ms cubic-bezier(0.45, 0, 0.15, 1) 250ms both; }
        @media (prefers-reduced-motion: reduce) { .ov-rise, .ov-reveal { animation: none; } }
      `}</style>
      {/* Показатели и график */}
      <div className="flex min-h-[480px] min-w-0 flex-col lg:col-span-8 lg:min-h-0">
        <div className="grid grid-cols-2 border-b sm:grid-cols-3 lg:grid-cols-[27fr_20fr_22fr_18fr_22fr]" style={{ borderColor: HAIR }}>
          <Kpi order={0} hero label="Оборот" color={AI_COLOR} value={analytics ? formatRub(analytics.revenueTotal) : "—"} delta={<DeltaChip change={revenueDelta} />} sub={days > 0 ? `за ${days} дн.` : undefined} onClick={() => onNavigate("analytics")} />
          <Kpi order={1} label="Заказы" color={chartColors.teal} value={analytics ? `${formatInt(analytics.ordersTotal)} шт` : "—"} delta={<DeltaChip change={ordersDelta} />} onClick={() => onNavigate("orders")} />
          <Kpi order={2} label="Средний чек" color={chartColors.amber} value={analytics?.avgOrderValue != null ? formatRub(analytics.avgOrderValue) : "—"} delta={<DeltaChip change={checkDelta} good="neutral" />} onClick={() => onNavigate("analytics")} />
          <Kpi order={3} label="Выкуп" color={chartColors.violet} value={buyoutStat ? `${buyoutStat.percent}%` : "—"} sub={buyoutStat ? `${buyoutStat.buyouts} из ${buyoutStat.completed}` : "нужна воронка"} onClick={() => onNavigate("analytics")} />
          <Kpi order={4} label="На счёте" color={chartColors.green} value={financeKnown ? formatRub(snapshot!.finance!.balance!) : "—"} sub={financeKnown ? undefined : "нет в выгрузке"} last onClick={() => onNavigate("analytics")} />
        </div>

        <div className="flex min-h-[260px] flex-1 flex-col px-6 pb-5 pt-5 xl:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[20px] font-semibold tracking-[-0.02em]" style={{ color: hub.text }}>
              {metric === "revenue" ? "Оборот по дням" : "Заказы по дням"}
            </h3>
            <div className="flex items-center gap-4">
              <Segmented<ChartMetric> size="sm" layoutId="overview-metric" label="Что показывать на графике" value={metric} onChange={setMetric} options={[{ id: "revenue", label: "Рубли" }, { id: "orders", label: "Штуки" }]} />
              <button type="button" onClick={() => onNavigate("analytics")} className="group inline-flex items-center gap-1.5 text-[14px] font-semibold outline-none focus-visible:underline" style={{ color: hub.text }}>
                Аналитика
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </button>
            </div>
          </div>
          <div className="relative mt-3 min-h-0 flex-1">
            <div ref={chartBoxRef} className="absolute inset-0">
              {points.length === 0 ? (
                <p className="flex h-full items-center justify-center text-[14px]" style={{ color: hub.textSubtle }}>
                  Нет дневного ряда в выгрузке.
                </p>
              ) : boxH > 0 ? (
                <div key={metric} className="ov-reveal">
                  <CompareChart points={points} height={chartH} color={metric === "revenue" ? chartColors.blue : chartColors.teal} label={metric === "revenue" ? "Оборот" : "Заказы"} fmt={metric === "revenue" ? formatRub : (n) => `${formatInt(n)} шт.`} yFormat={metric === "revenue" ? (n) => (n >= 1000 ? `${Math.round(n / 1000)} тыс` : `${n}`) : undefined} />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Что важно сейчас */}
      <aside className="flex min-h-[380px] min-w-0 flex-col border-t lg:col-span-4 lg:min-h-0 lg:border-l lg:border-t-0" style={{ borderColor: HAIR, background: `linear-gradient(180deg, ${chartColors.lime}26 0%, ${chartColors.lime}0A 28%, transparent 50%)` }}>
        <div className="px-6 pb-4 pt-6 xl:px-8">
          <p className={CAPTION} style={{ color: hub.text, opacity: 0.78 }}>
            Что важно сейчас
          </p>
          <div className="mt-3 flex items-end gap-3">
            <BigNumber value={tasks == null ? "…" : formatInt(actionable.length)} size={52} />
            <span className="pb-1 text-[15px]" style={{ color: hub.textMuted }}>
              {tasks == null ? "читаю задачи" : "задач в работе"}
            </span>
          </div>
          {tasks != null && actionable.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {(["critical", "important", "opportunity"] as const).map((s) =>
                sevCount(s) > 0 ? (
                  <span key={s} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13.5px] font-semibold tabular-nums" style={{ backgroundColor: `${SEV_DOT[s]}1F`, color: SEV_DOT[s] === "#D29922" ? "#8A6410" : SEV_DOT[s] }}>
                    {sevCount(s)} {s === "critical" ? "срочных" : s === "important" ? "важных" : "возможностей"}
                  </span>
                ) : null,
              )}
            </div>
          ) : null}
        </div>
        <div className="relative min-h-0 flex-1 border-t" style={{ borderColor: HAIR }}>
          <div ref={listRef} className="absolute inset-0 overflow-hidden">
            {actionable.slice(0, rows).map((t, idx) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTaskFocus({ category: t.category, id: t.id, type: t.type, nmId: t.nmId });
                  onNavigate("tasks");
                }}
                className={`ov-rise group relative flex w-full items-center gap-3 border-b pl-6 pr-5 text-left xl:pl-8 xl:pr-6 ${CELL_HOVER}`}
                style={{ height: ROW_H, borderColor: HAIR, animationDelay: `${300 + idx * 80}ms` }}
              >
                <span className="absolute bottom-3 left-0 top-3 w-[4px] rounded-r-full" style={{ backgroundColor: SEV_DOT[t.severity] }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15.5px] font-semibold leading-tight" style={{ color: hub.text }}>
                    {taskDisplayTitle(t)}
                  </span>
                  <span className="mt-1 block truncate text-[13.5px]" style={{ color: hub.textMuted }}>
                    {t.productTitle ?? TASK_CATEGORY_LABEL[t.category]}
                  </span>
                </span>
                <HubBadge tone={SEV_TONE[t.severity]}>{SEV_LABEL[t.severity]}</HubBadge>
              </button>
            ))}
            {tasks != null && actionable.length === 0 ? (
              <p className="flex h-full items-center justify-center px-7 text-center text-[14.5px]" style={{ color: hub.textSubtle }}>
                Очередь чистая: задач, требующих действий, нет.
              </p>
            ) : null}
          </div>
        </div>
        <button type="button" onClick={() => onNavigate("tasks")} className={`group flex h-14 shrink-0 items-center justify-between px-6 text-[15px] font-semibold xl:px-8 ${CELL_HOVER}`} style={{ color: hub.text }}>
          Все задачи
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </button>
      </aside>

      {/* Умная часть: агент, лента его работы, события, направления */}
      <div className="grid grid-cols-1 border-t sm:grid-cols-2 lg:col-span-12 lg:grid-cols-4" style={{ borderColor: HAIR }}>
        <Block title="Агент" color={AI_COLOR} onClick={() => onNavigate("agents")}>
          <div className="flex gap-7">
            <Big value={agent ? formatInt(activeOrders.length) : "—"} label="поручений" />
            <Big value={plansRunning != null ? formatInt(plansRunning) : "—"} label="планов в работе" />
            <Big value={agent ? formatInt(agent.proposals) : "—"} label="ждёт решения" accent={Boolean(agent && agent.proposals > 0)} />
          </div>
          <p className="mt-4 border-t pt-3 text-[14px]" style={{ color: hub.textMuted, borderColor: HAIR }}>
            {nextOrder ? (
              <>
                Следующий запуск · <strong style={{ color: hub.text }}>{fmtMsk(nextOrder.nextRunAt as string)}</strong>
              </>
            ) : agent ? (
              "Запусков по расписанию нет"
            ) : (
              "…"
            )}
          </p>
        </Block>

        <Block title="Что делал агент" color={AI_COLOR} onClick={() => onNavigate("agents")}>
          {feed == null ? (
            <p className="text-[14px]" style={{ color: hub.textMuted }}>
              Читаю журнал…
            </p>
          ) : feed.length === 0 ? (
            <p className="text-[14px] leading-[1.5]" style={{ color: hub.textMuted }}>
              Пока тихо: когда агент что-то проверит или сделает, это появится здесь.
            </p>
          ) : (
            <ul>
              {feed.map((f, k) => (
                <li key={f.id} className="ov-rise flex items-baseline gap-3 py-[6px]" style={{ borderTop: k === 0 ? undefined : `1px solid ${HAIR}`, animationDelay: `${700 + k * 110}ms` }}>
                  <span className="w-[92px] shrink-0 self-start">
                    <span className="block whitespace-nowrap text-[13px] tabular-nums" style={{ color: hub.textSubtle }}>
                      {ago(f.at, now)}
                    </span>
                    <span className="mt-0.5 block whitespace-nowrap text-[12px] font-semibold" style={{ color: f.failed ? hub.danger : hub.textMuted }}>
                      {f.kind}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15.5px] font-semibold leading-tight" style={{ color: f.failed ? hub.danger : hub.text }}>
                      {f.title}
                    </span>
                    <span className="mt-1 block truncate text-[14px]" style={{ color: hub.textMuted }}>
                      {f.note}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block title="События" color={chartColors.amber} onClick={() => onNavigate("events")}>
          {news.length === 0 ? (
            <p className="text-[14px] leading-[1.5]" style={{ color: hub.textMuted }}>
              Новых событий нет: изменения в магазине и новости WB появятся здесь.
            </p>
          ) : (
            <ul>
              {news.map((e, k) => (
                <li key={e.id} className="ov-rise relative flex items-baseline gap-3 py-[6px]" style={{ borderTop: k === 0 ? undefined : `1px solid ${HAIR}`, animationDelay: `${800 + k * 110}ms` }}>
                  <span className="w-[92px] shrink-0 self-start">
                    <span className="block whitespace-nowrap text-[13px] tabular-nums" style={{ color: hub.textSubtle }}>
                      {ago(e.createdAt, now)}
                    </span>
                    <span className="mt-0.5 block whitespace-nowrap text-[12px] font-semibold" style={{ color: e.severity === "critical" ? "#B91C1C" : e.severity === "important" ? "#9A5B05" : hub.textMuted }}>
                      {e.kind.startsWith("news") ? "Новость" : e.severity === "critical" ? "Срочно" : e.severity === "important" ? "Важно" : "Событие"}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15.5px] font-semibold leading-tight" style={{ color: hub.text }}>
                      {e.title}
                    </span>
                    <span className="mt-1 block truncate text-[14px]" style={{ color: hub.textMuted }}>
                      {e.productTitle ?? e.detail}
                    </span>
                  </span>
                  {e.severity !== "info" ? <span className="absolute -left-6 bottom-2 top-2 w-[3px] rounded-r-full xl:-left-7" style={{ backgroundColor: e.severity === "critical" ? "#D33A3C" : "#D29922" }} aria-hidden /> : null}
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Panel title="По направлениям" color={chartColors.blue} last>
          <Row label="Заказы" onClick={() => onNavigate("orders")} value={orders ? `${formatInt(orders.newCount)} новых · ${formatInt(orders.inDelivery)} в пути` : "—"} accent={Boolean(orders && orders.newCount > 0)} />
          <Row label="Отзывы и вопросы" onClick={onOpenReviews} value={feedbacks != null && questions != null ? (feedbacks + questions === 0 ? "всё отвечено" : `${formatInt(feedbacks)} и ${formatInt(questions)} ждут`) : "—"} accent={Boolean(feedbacks || questions)} />
          <Row label="Реклама" onClick={() => onNavigate("ads")} value={snapshot?.ads ? (exhaustedAds > 0 ? `${formatInt(exhaustedAds)} без бюджета` : `${formatInt(snapshot.ads.activeCount)} работает`) : "—"} accent={exhaustedAds > 0} />
          <Row label="Поставки" onClick={() => onNavigate("deliveries")} value={snapshot?.supplies ? `${formatInt(snapshot.supplies.openCount)} открыто` : "—"} />
        </Panel>
      </div>
    </div>
  );
}

/** Строка сводки по направлению: название слева, число справа; нажимается и ведёт в раздел. */
function Row({ label, value, accent, onClick }: { label: string; value: string; accent?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`group flex h-[38px] w-full items-center justify-between gap-3 rounded-[10px] px-2 text-left text-[15px] outline-none focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)] ${CELL_HOVER}`}>
      <span style={{ color: hub.textMuted }}>{label}</span>
      <span className="flex items-center gap-1.5 font-semibold tabular-nums" style={{ color: accent ? "#B45309" : hub.text }}>
        {value}
        <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60" aria-hidden />
      </span>
    </button>
  );
}

/** Блок нижней полосы без общего клика: внутри свои нажимаемые строки. */
function Panel({ title, color, children, last }: { title: string; color: string; children: ReactNode; last?: boolean }) {
  return (
    <div className={`flex min-h-[188px] min-w-0 flex-col border-b px-6 py-5 sm:odd:border-r lg:border-b-0 lg:border-r xl:px-7 ${last ? "lg:border-r-0" : ""}`} style={{ borderColor: HAIR }}>
      <span className={`${CAPTION} mb-2.5 block`} style={{ color: hub.text, opacity: 0.8 }}>
        {title}
      </span>
      <div className="-mx-2">{children}</div>
    </div>
  );
}

/** Относительное время: «только что», «5 мин назад», «2 ч назад», «вчера», «3 дн. назад». */
function ago(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const min = Math.max(0, Math.round((nowMs - t) / 60_000));
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.round(h / 24);
  return d === 1 ? "вчера" : `${d} дн. назад`;
}

/** Число с плавным набором от нуля при появлении (идея number-ticker из Magic UI). Не анимируется при «меньше движения». */
function Count({ value, size, color }: { value: string; size: number; color?: string }) {
  const m = value.match(/^([\d\s  ]+)(.*)$/);
  const target = m ? Number(m[1].replace(/\D/g, "")) : NaN;
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!Number.isFinite(target)) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 1300);
      setShown(Math.round(target * (1 - Math.pow(1 - k, 4))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  if (!m || !Number.isFinite(target)) return <BigNumber value={value} size={size} color={color} />;
  return <BigNumber value={`${formatInt(shown ?? target)}${m[2]}`} size={size} color={color} />;
}

/** Ячейка ряда показателей: цветная подложка показателя, цветная точка и подпись, крупное число, изменение. Главная ячейка залита цветом. */
function Kpi({ label, color, value, delta, sub, hero, last, onClick, order = 0 }: { order?: number; label: string; color: string; value: string; delta?: ReactNode; sub?: string; hero?: boolean; last?: boolean; onClick: () => void }) {
  const fg = hero ? "#FFFFFF" : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ov-rise group relative flex min-w-0 flex-col px-5 py-6 text-left outline-none transition-[filter] hover:brightness-[0.97] focus-visible:brightness-[0.97] xl:px-7 ${last ? "" : "lg:border-r"}`}
      style={{ animationDelay: `${order * 90}ms`, borderColor: HAIR, background: hero ? INK_GRADIENT : `linear-gradient(170deg, ${color}16 0%, ${color}06 100%)` }}
    >
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: hero ? chartColors.lime : color }} aria-hidden />
      <span className={CAPTION} style={{ color: fg ?? hub.text, opacity: hero ? 0.88 : 0.8 }}>
        {label}
      </span>
      <span className="mt-3.5 block whitespace-nowrap">
        <Count value={value} size={hero ? 42 : 29} color={fg} />
      </span>
      <span className="mt-3 flex min-h-[24px] flex-wrap items-center gap-x-2.5 gap-y-1">
        {delta}
        {sub ? (
          <span className="text-[13px]" style={{ color: hero ? "rgba(255,255,255,0.85)" : hub.textMuted }}>
            {sub}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** Рабочий блок нижней полосы: цветная подложка сверху, цветная точка и название, содержимое; вся область нажимается. */
function Block({ title, color, onClick, children, last }: { title: string; color: string; onClick: () => void; children: ReactNode; last?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`group flex min-h-[188px] min-w-0 flex-col border-b px-6 py-5 text-left outline-none transition-colors hover:bg-[rgba(1,20,8,0.03)] focus-visible:bg-[rgba(1,20,8,0.03)] sm:odd:border-r lg:border-b-0 lg:border-r xl:px-7 ${last ? "lg:border-r-0" : ""}`} style={{ borderColor: HAIR }}>
      <span className="mb-3.5 flex items-center justify-between gap-2">
        <span className={CAPTION} style={{ color: hub.text, opacity: 0.8 }}>
          {title}
        </span>
        <ArrowRight className="h-4 w-4 opacity-40 transition-all group-hover:translate-x-0.5 group-hover:opacity-90" style={{ color: hub.text }} aria-hidden />
      </span>
      {children}
    </button>
  );
}

function Big({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <Count value={value} size={32} color={accent ? "#C2410C" : undefined} />
      <p className="mt-1.5 text-[13px] leading-tight" style={{ color: hub.textMuted }}>
        {label}
      </p>
    </div>
  );
}

function dayChange(points: SellerDailySalesPoint[], key: "orders" | "revenue"): number | null {
  if (points.length < 2) return null;
  const prev = points[points.length - 2]?.[key] ?? 0;
  const last = points[points.length - 1]?.[key] ?? 0;
  if (prev <= 0) return null;
  return Math.round(((last - prev) / prev) * 100);
}

function rateChange(points: SellerDailySalesPoint[]): number | null {
  if (points.length < 2) return null;
  const prev = points[points.length - 2];
  const last = points[points.length - 1];
  if (!prev || !last || prev.orders <= 0 || last.orders <= 0) return null;
  const prevRate = prev.revenue / prev.orders;
  const lastRate = last.revenue / last.orders;
  if (prevRate <= 0) return null;
  return Math.round(((lastRate - prevRate) / prevRate) * 100);
}

/** Ближайший запуск поручения по Москве: «сегодня 15:00», «завтра 09:30» или «23.11 09:30». */
function fmtMsk(iso: string): string {
  const MSK = 3 * 3_600_000;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + MSK);
  const day = (ms: number) => new Date(ms + MSK).toISOString().slice(0, 10);
  const time = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  const nowMs = Date.now();
  if (day(t) === day(nowMs)) return `сегодня ${time}`;
  if (day(t) === day(nowMs + 86_400_000)) return `завтра ${time}`;
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")} ${time}`;
}
