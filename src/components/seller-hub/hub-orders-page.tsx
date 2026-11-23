"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, ArrowUp, ChevronDown, MessageSquare, Pencil, Plus, Trash2, X } from "lucide-react";
import { deleteSellerHubOrder, loadSellerHubOrders, patchSellerHubOrder, readSellerHubOrderRuns, type AiFeedItem, type OrdersView } from "@/lib/seller-hub/client-api";
import { orderDetails } from "@/lib/seller-hub/orders/preview";
import { sampleFeed, sampleOrders } from "@/lib/seller-hub/orders/sample";
import { AiFindingCard, useAiFindings, type AiFindingsCtx } from "./hub-ai-findings";
import { ScheduleBadge } from "./hub-schedule-badge";
import type { Order, OrderRun } from "@/lib/seller-hub/orders/types";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { hub, hubNumeric, hubSans } from "./hub-ui";
import { AgentSwitch } from "./hub-agents-ui";
import { BASE_FORM, defaultOnce, formFromOrder, type OrderForm } from "@/lib/seller-hub/orders/form";
import { SORTED_TEMPLATES, templateSchedule, type Topic } from "@/lib/seller-hub/orders/templates";
import { OrderEditor } from "./hub-order-editor";
import { useUserSetting } from "./use-user-setting";
import { HubVoiceButton } from "./hub-voice-button";

/**
 * Страница «Поручения» на всю правую часть, до краёв. Сверху фраза («опишите своими словами» → чат), ниже два режима:
 * «Поручения» (мои поручения, все шаблоны, справа лента последних запусков) и «Планы» (принятые планы: цель, этапы, «до → после», итог).
 */

const MSK = 3 * 3_600_000;
const pad = (n: number) => String(n).padStart(2, "0");
const fmtMsk = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(Date.parse(iso) + MSK);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)} в ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
const DAY = 24 * 3_600_000;

const RUN_LABEL: Record<OrderRun["status"], { text: string; color: string }> = {
  done: { text: "Выполнено", color: "#2E8B3E" },
  simulated: { text: "Тест", color: "#B7791F" },
  reminder: { text: "Напоминание", color: "#2E5A43" },
  skipped: { text: "Пропущено", color: "#7A857E" },
  failed: { text: "Ошибка", color: "#C2410C" },
};

const EXAMPLES = ["Каждое утро в 9 напоминай про отзывы", "Снижай цену на 5% каждый день, не ниже 800 ₽", "Пополняй рекламу на 2000 ₽, когда остаток меньше 500"];

function Section({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <header className="mb-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[20px] font-semibold tracking-[-0.015em]" style={{ ...hubSans, color: hub.text }}>
            {title}
          </h2>
          {hint ? (
            <p className="mt-0.5 text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
              {hint}
            </p>
          ) : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** План в том же виде, что в «Задачах» (карточка и окно с шагами), и под ним промежуточный итог. */
function PlanEntry({ item, ctx, demo, demoActions }: { item: AiFeedItem; ctx: AiFindingsCtx; demo?: boolean; demoActions?: { pause: (id: string, paused: boolean) => void; remove: (id: string) => void } }) {
  const f = item.finding;
  if (!f?.strategy || !f.strategyState) return null;
  return (
    <div>
      {demo ? (
        <span className="mb-2 inline-flex h-[22px] items-center rounded-full px-2.5 text-[12px] font-semibold" style={{ ...hubSans, backgroundColor: "rgba(245,183,59,0.25)", color: "#7A5200" }}>
          Пример
        </span>
      ) : null}
      <ul>
        <AiFindingCard item={item} ctx={ctx} demoActions={demo ? demoActions : undefined} />
      </ul>
    </div>
  );
}

/** Поручение полноразмерной карточкой, в том же стиле, что и план: статус, что делает, когда, рамки, следующий и последний запуск. */
function OrderCard({ o, ctx, onToggle, onEdit, onDelete, onChat, demo, highlight }: { o: Order; ctx: { campaignName: (id: string) => string | undefined; productTitle: (id: string) => string | undefined }; onToggle: () => void; onEdit: () => void; onDelete: () => void; onChat?: () => void; demo?: boolean; highlight?: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const acts = o.kind !== "remind" && o.mode === "act" && !(o.kind === "when_orders" && (o.params as { then?: string }).then === "notify");
  const status = o.status === "active" ? { text: "Идёт", color: "#2E8B3E" } : o.status === "paused" ? { text: "На паузе", color: "#B7791F" } : { text: "Завершено", color: "#7A857E" };
  const rows = orderDetails({ title: o.title, kind: o.kind, params: o.params, schedule: o.schedule, limits: o.limits, mode: o.mode }, ctx);
  return (
    <article id={`order-${o.id}`} className="flex h-full scroll-mt-6 flex-col rounded-[22px] p-6 transition-[box-shadow] duration-500" style={{ boxShadow: highlight ? "inset 0 0 0 2.5px #6FC21D, 0 0 0 6px rgba(185,255,75,0.35)" : "inset 0 0 0 1px rgba(1, 20, 8, 0.11)", opacity: o.status === "active" ? 1 : 0.82 }}>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ ...hubSans, color: status.color }}>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: status.color }} aria-hidden />
          {status.text}
        </span>
        <span className="flex items-center gap-1.5">
          {demo ? <span className="inline-flex h-[22px] items-center rounded-full px-2.5 text-[12px] font-semibold" style={{ ...hubSans, backgroundColor: "rgba(245,183,59,0.25)", color: "#7A5200" }}>Пример</span> : null}
          <span className="inline-flex h-[22px] items-center rounded-full px-2.5 text-[12px] font-medium" style={{ ...hubSans, backgroundColor: acts ? "rgba(185,255,75,0.35)" : "rgba(1,20,8,0.06)", color: hub.text }}>
            {acts ? "Делает сам" : "Напомнит"}
          </span>
        </span>
      </div>
      <h3 className="mt-3 text-[18px] font-semibold leading-[1.3] tracking-[-0.012em] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
        {o.title}
      </h3>
      <dl className="mt-4 flex-1 space-y-3">
        {rows.map((r) => (
          <div key={r.label}>
            <dt className="text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
              {r.label}
            </dt>
            <dd className="mt-1 text-[14.5px] leading-[1.5] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
              {r.label === "Когда" ? <ScheduleBadge schedule={o.schedule} showNext={o.status === "active"} size="lg" /> : r.text}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "rgba(1,20,8,0.09)" }}>
        <p className="text-[13px] leading-[1.45]" style={{ ...hubSans, color: hub.textSubtle }}>
          {o.status === "active" && o.nextRunAt ? `Следующий запуск ${fmtMsk(o.nextRunAt)}` : o.status === "active" ? "Работает по условию" : o.status === "paused" ? "Запуски приостановлены" : "Все запуски выполнены"}
          {o.lastRunAt && o.lastStatus ? ` · последний ${fmtMsk(o.lastRunAt)}: ${RUN_LABEL[o.lastStatus as OrderRun["status"]]?.text.toLowerCase() ?? ""}` : ""}
        </p>
        <div className="flex items-center gap-1">
          {confirm ? (
            <>
              <button type="button" onClick={() => { setConfirm(false); onDelete(); }} className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-medium outline-none hover:bg-[rgba(1,20,8,0.06)]" style={{ ...hubSans, color: hub.danger }}>
                <Trash2 className="h-3.5 w-3.5" /> Удалить
              </button>
              <button type="button" aria-label="Не удалять" onClick={() => setConfirm(false)} className="flex h-8 w-8 items-center justify-center rounded-full outline-none hover:bg-[rgba(1,20,8,0.06)]" style={{ color: hub.textSubtle }}>
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              {onChat && !demo ? (
                <button type="button" onClick={onChat} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium outline-none transition-colors hover:bg-[rgba(1,20,8,0.06)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, color: hub.textMuted }}>
                  <MessageSquare className="h-3.5 w-3.5" />
                  Изменить в чате
                </button>
              ) : null}
              {!demo ? (
                <>
                  <button type="button" aria-label="Изменить вручную" title="Изменить вручную" onClick={onEdit} className="flex h-8 w-8 items-center justify-center rounded-full outline-none transition-colors hover:bg-[rgba(1,20,8,0.06)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ color: hub.textSubtle }}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label="Удалить" onClick={() => setConfirm(true)} className="flex h-8 w-8 items-center justify-center rounded-full outline-none transition-colors hover:bg-[rgba(1,20,8,0.06)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ color: hub.textSubtle }}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              ) : null}
              <span className="ml-2">
                <AgentSwitch label={`Поручение «${o.title}»`} checked={o.status === "active"} disabled={o.status === "done"} onChange={onToggle} />
              </span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function dayLabel(iso: string, nowMs: number): string {
  const key = (ms: number) => new Date(ms + MSK).toISOString().slice(0, 10);
  const k = key(Date.parse(iso));
  if (k === key(nowMs)) return "Сегодня";
  if (k === key(nowMs - DAY)) return "Вчера";
  return `${k.slice(8, 10)}.${k.slice(5, 7)}`;
}

/** Делит текст записи на смысл и ряд «заказы по дням», чтобы ряд показать аккуратными ячейками, а не строкой через запятую. */
function parseRun(summary: string, titles?: Map<string, string>): { text: string; series: Array<{ date: string; n: number }> } {
  const named = summary.replace(/(?<!\d)(\d{6,12})(?=:)/g, (id) => titles?.get(id) ?? id);
  const m = named.match(/[\s(]*[Зз]аказов по дням:\s*([^)]*?)\)?\.?\s*$/);
  if (!m || m.index == null) return { text: named, series: [] };
  const series = [...m[1]!.matchAll(/(\d{2}\.\d{2}):\s*(\d+)/g)].map((x) => ({ date: x[1]!, n: Number(x[2]) }));
  if (series.length === 0) return { text: named, series: [] };
  const text = named.slice(0, m.index).replace(/[\s,:;(]+$/, "");
  return { text: /[.!?»]$/.test(text) ? text : `${text}.`, series };
}

/** Одна запись ленты: название поручения, что произошло, цифры аккуратной строкой, время. Как уведомление: коротко и без украшений. */
function RunRow({ r, now, clamp, withDay, titles, large }: { r: OrderRun; now: number; clamp?: boolean; withDay?: boolean; titles?: Map<string, string>; large?: boolean }) {
  const st = RUN_LABEL[r.status];
  const d = new Date(Date.parse(r.at) + MSK);
  const { text, series } = parseRun(r.summary, titles);
  return (
    <li className={`border-t first:border-t-0 first:pt-0 last:pb-0 ${large ? "py-6" : "py-3.5"}`} style={{ borderColor: "rgba(1,20,8,0.1)" }}>
      <div className="flex items-baseline justify-between gap-3">
        <p className={`min-w-0 font-semibold leading-[1.35] ${large ? "text-[20px] [overflow-wrap:anywhere]" : "truncate text-[16px]"}`} style={{ ...hubSans, color: hub.text }}>
          {r.orderTitle ?? "Поручение"}
        </p>
        <span className={`shrink-0 tabular-nums ${large ? "text-[15px]" : "text-[13.5px]"}`} style={{ ...hubSans, ...hubNumeric, color: hub.textSubtle }}>
          {withDay ? `${dayLabel(r.at, now)}, ` : ""}
          {pad(d.getUTCHours())}:{pad(d.getUTCMinutes())}
        </span>
      </div>
      <p className={`mt-1.5 leading-[1.5] [overflow-wrap:anywhere] ${large ? "text-[18px]" : "text-[15px]"} ${clamp ? "line-clamp-2" : ""}`} style={{ ...hubSans, color: hub.textMuted, fontWeight: r.read ? 400 : 500 }}>
        {text}
      </p>
      {series.length > 0 ? (
        <p className={`flex flex-wrap gap-x-4 gap-y-1 tabular-nums ${large ? "mt-3 text-[17px]" : "mt-2 text-[14px]"}`} style={{ ...hubSans, ...hubNumeric, color: hub.textSubtle }} aria-label="Заказов по дням">
          {series.map((x) => (
            <span key={x.date}>
              {x.date} <strong style={{ color: hub.text, fontWeight: 600 }}>{x.n}</strong>
            </span>
          ))}
        </p>
      ) : null}
      {r.status !== "reminder" ? (
        <span className={`inline-flex items-center gap-1.5 font-medium ${large ? "mt-3 text-[16px]" : "mt-2 text-[14px]"}`} style={{ ...hubSans, color: st.color }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: st.color }} aria-hidden />
          {st.text}
        </span>
      ) : null}
    </li>
  );
}

/** Недавняя активность: коротко (последние 4 записи), всё остальное открывается панелью справа. */
function RunsFeed({ runs, loading, now, titles, className = "" }: { runs: OrderRun[]; loading: boolean; now: number; titles?: Map<string, string>; className?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const LIMIT = 4;
  const groups: Array<{ label: string; rows: OrderRun[] }> = [];
  for (const r of runs) {
    const label = dayLabel(r.at, now);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.rows.push(r);
    else groups.push({ label, rows: [r] });
  }
  return (
    <aside aria-label="Недавняя активность" className={`flex flex-col rounded-[22px] p-5 ${className}`} style={{ boxShadow: "inset 0 0 0 1.5px rgba(1, 20, 8, 0.78)" }}>
      <h2 className="text-[19px] font-semibold tracking-[-0.01em]" style={{ ...hubSans, color: hub.text }}>
        Недавняя активность
      </h2>
      <p className="mt-0.5 text-[14px] leading-[1.45]" style={{ ...hubSans, color: hub.textMuted }}>
        Что агент сделал или напомнил.
      </p>
      {loading ? (
        <div className="mt-5 h-24 animate-pulse rounded-[14px]" style={{ backgroundColor: "rgba(1,20,8,0.04)" }} />
      ) : runs.length === 0 ? (
        <p className="mt-5 text-[14px] leading-[1.55]" style={{ ...hubSans, color: hub.textSubtle }}>
          Пока тихо. Когда сработает первое поручение, здесь появится результат: напоминание, выполненное действие или ошибка.
        </p>
      ) : (
        <>
          <ul className="mt-4">
            {runs.slice(0, LIMIT).map((r) => (
              <RunRow key={r.id} r={r} now={now} clamp withDay titles={titles} />
            ))}
          </ul>
          <button type="button" onClick={() => setOpen(true)} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-[15px] font-medium outline-none transition-colors hover:bg-[rgba(1,20,8,0.09)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, backgroundColor: "rgba(1,20,8,0.05)", color: hub.text }}>
            {runs.length > LIMIT ? `Смотреть всё · ${runs.length}` : "Открыть подробно"}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </>
      )}
      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Вся активность">
          <button type="button" aria-label="Закрыть" onClick={() => setOpen(false)} className="absolute inset-0 cursor-default" style={{ backgroundColor: "rgba(1,20,8,0.32)" }} />
          <div className="relative flex h-full w-full max-w-[560px] flex-col" style={{ backgroundColor: "#F7F7F3", boxShadow: "-24px 0 60px -30px rgba(1,20,8,0.5)" }}>
            <div className="flex items-center justify-between gap-4 px-7 pb-3 pt-6">
              <h2 className="text-[26px] font-semibold tracking-[-0.02em]" style={{ ...hubSans, color: hub.text }}>
                Вся активность · {runs.length}
              </h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть" className="flex h-9 w-9 items-center justify-center rounded-full outline-none transition-colors hover:bg-[rgba(1,20,8,0.08)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-7 pb-10 pt-2">
              {groups.map((g) => (
                <div key={g.label}>
                  <p className="mb-4 text-[13px] font-semibold uppercase tracking-[0.08em]" style={{ ...hubSans, color: hub.textSubtle }}>
                    {g.label}
                  </p>
                  <ul>
                    {g.rows.map((r) => (
                      <RunRow key={r.id} r={r} now={now} titles={titles} large />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

const TOPIC_TONE: Record<Topic, { bg: string; chip: string; fg: string }> = {
  Сценарии: { bg: "rgba(185,255,75,0.26)", chip: "rgba(185,255,75,0.55)", fg: "#1F4A1A" },
  Реклама: { bg: "rgba(46,90,67,0.12)", chip: "rgba(46,90,67,0.14)", fg: "#2E5A43" },
  Цены: { bg: "rgba(245,183,59,0.17)", chip: "rgba(245,183,59,0.28)", fg: "#7A5200" },
  "Склад и поставки": { bg: "rgba(74,125,173,0.13)", chip: "rgba(74,125,173,0.18)", fg: "#2B5278" },
  Отчёты: { bg: "rgba(130,104,170,0.13)", chip: "rgba(130,104,170,0.18)", fg: "#5A4488" },
  "Отзывы и вопросы": { bg: "rgba(204,92,120,0.12)", chip: "rgba(204,92,120,0.18)", fg: "#8A3050" },
  Деньги: { bg: "rgba(27,138,125,0.13)", chip: "rgba(27,138,125,0.18)", fg: "#17655A" },
};

export function HubOrdersPage({ snapshot, focusOrderId, titleByNm, cardByNm, onDescribe, onFill, onOpenRules }: { snapshot?: SellerCatalogSnapshot; /** Поручение, к которому нужно прокрутить и которое подсветить (переход из журнала). */ focusOrderId?: string | null; titleByNm?: Map<string, string>; cardByNm?: Map<string, { title: string; vendorCode: string; description: string; imageUrl?: string }>; onDescribe: (text: string) => void; /** Положить текст в поле чата (для «Изменить в чате»). */ onFill: (text: string) => void; onOpenRules: () => void }) {
  const [view, setView] = useState<OrdersView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<OrderForm | null>(null);
  const [draft, setDraft] = useState("");
  const [limit, setLimit] = useState(6);
  const [showDone, setShowDone] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  // Поручение из журнала уже завершено: список завершённых раскрывается сам.
  const focusIsDone = Boolean(focusOrderId) && (view?.orders ?? []).some((o) => o.id === focusOrderId && o.status === "done");
  const [demo, setDemo] = useState(false);
  const [sandbox] = useUserSetting<boolean>("agent.sandbox", true);
  const [now] = useState(() => Date.now());

  // Планы берём из той же ленты, что раздел «Задачи»: тот же вид карточки и окна. Для примера отдельная лента из образцов.
  const real = useAiFindings({ titleByNm, cardByNm });
  const sampleNms = useMemo(() => (snapshot?.items ?? []).slice(0, 4).map((i) => String(i.externalId)), [snapshot?.items]);
  const sampleItems = useMemo(() => (demo ? sampleFeed(now, sampleNms) : []), [demo, now, sampleNms]);
  const demoBase = useAiFindings({ titleByNm, cardByNm, previewItems: sampleItems });
  // В примере отметки шагов («сделал», «пропустил») меняются только на экране и никуда не отправляются.
  const demoCtx: AiFindingsCtx = {
    ...demoBase,
    markStep: async (id, stepIndex, status) => {
      demoBase.setItems((prev) =>
        prev.map((it) => {
          const f = it.finding;
          if (!f || f.id !== id || !f.strategyState) return it;
          const humanSteps = { ...(f.strategyState.humanSteps ?? {}) };
          if (status === "reset") delete humanSteps[String(stepIndex)];
          else humanSteps[String(stepIndex)] = { status, at: new Date().toISOString() };
          return { ...it, finding: { ...f, strategyState: { ...f.strategyState, humanSteps } } };
        }),
      );
    },
  };

  const reload = useCallback(async () => {
    const o = await loadSellerHubOrders();
    if (o.ok && o.data) setView(o.data);
    else setError(o.error ?? "Поручения не открылись");
  }, []);

  useEffect(() => {
    let off = false;
    void loadSellerHubOrders().then((o) => {
      if (off) return;
      if (o.ok && o.data) {
        setView(o.data);
        if (o.data.runs.some((r) => !r.read)) window.setTimeout(() => void readSellerHubOrderRuns(), 3000);
      } else setError(o.error ?? "Поручения не открылись");
    });
    return () => {
      off = true;
    };
  }, []);

  const items = useMemo(() => new Map((snapshot?.items ?? []).map((i) => [String(i.externalId), i.title])), [snapshot?.items]);
  const campaigns = snapshot?.ads?.campaigns ?? [];
  const demoOrders = demo ? sampleOrders(now) : [];

  function openEditor(f: Partial<OrderForm>) {
    setEditor({ ...BASE_FORM, onceAt: defaultOnce(), campaignId: String(campaigns[0]?.id ?? ""), ...f });
  }

  const isPlan = (x: AiFeedItem) => Boolean(x.finding?.ownerAccepted && x.finding.strategy && x.finding.strategyState);
  const isFinished = (x: AiFeedItem) => ["worked", "not_worked", "observed"].includes(x.finding?.strategyState?.status ?? "");
  const demoActions = {
    pause: (id: string, paused: boolean) =>
      demoBase.setItems((prev) => prev.map((it) => (it.finding?.id === id && it.finding.strategyState ? { ...it, finding: { ...it.finding, strategyState: { ...it.finding.strategyState, pausedAt: paused ? new Date().toISOString() : undefined } } } : it))),
    remove: (id: string) => demoBase.setItems((prev) => prev.filter((it) => it.finding?.id !== id)),
  };
  const planEntries = [...demoCtx.items.filter(isPlan).map((item) => ({ item, ctx: demoCtx, demo: true })), ...real.items.filter(isPlan).map((item) => ({ item, ctx: real, demo: false }))];
  const activePlans = planEntries.filter((x) => !isFinished(x.item));
  const finishedPlans = planEntries.filter((x) => isFinished(x.item));
  const orders = view?.orders ?? [];
  const doneOrders = orders.filter((o) => o.status === "done");
  // Планы и поручения вместе: сначала идущие, потом на паузе.
  const liveOrders = orders.filter((o) => o.status !== "done");
  const mineOrders: Array<{ order: Order; demo?: boolean }> = [
    ...demoOrders.map((order) => ({ order, demo: true })),
    ...liveOrders.filter((o) => o.status === "active").map((order) => ({ order })),
    ...liveOrders.filter((o) => o.status === "paused").map((order) => ({ order })),
  ];
  const plansShown = activePlans;
  const ordersShown = mineOrders;
  const total = activePlans.length + mineOrders.length;
  // Переход из журнала к конкретному поручению: раскрываем завершённые, если нужно, прокручиваем и ненадолго подсвечиваем карточку.
  useEffect(() => {
    if (!focusOrderId || !view) return;
    const target = view.orders.find((o) => o.id === focusOrderId);
    if (!target) return;
    let t2: number | undefined;
    const t1 = window.setTimeout(() => {
      setFlash(focusOrderId);
      document.getElementById(`order-${focusOrderId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      t2 = window.setTimeout(() => setFlash(null), 2600);
    }, 250);
    return () => {
      window.clearTimeout(t1);
      if (t2) window.clearTimeout(t2);
    };
  }, [focusOrderId, view]);
  // Переключатель и удаление срабатывают сразу: сначала меняем экран, потом сервер; при ошибке возвращаем как было.
  function toggleOrder(o: Order) {
    const next = o.status === "active" ? "paused" : "active";
    setView((v) => (v ? { ...v, orders: v.orders.map((x) => (x.id === o.id ? { ...x, status: next } : x)) } : v));
    void patchSellerHubOrder(o.id, { status: next }).then((r) => void reload().then(() => r.ok || undefined));
  }
  function removeOrder(id: string) {
    setView((v) => (v ? { ...v, orders: v.orders.filter((x) => x.id !== id) } : v));
    void deleteSellerHubOrder(id).then(reload);
  }
  const ctx = {
    campaignName: (id: string) => campaigns.find((c) => String(c.id) === id)?.name,
    productTitle: (id: string) => items.get(id),
  };
  const runs = (view?.runs ?? []).filter((r) => r.status !== "skipped");
  const loading = !view && !error;

  function submit() {
    const t = draft.trim();
    if (!t) return;
    onDescribe(t);
    setDraft("");
  }

  return (
    <div className="hub-fade-in min-h-0 flex-1 overflow-y-auto">
      <div className="w-full px-5 pb-20 pt-7 sm:px-8 lg:px-14 lg:pt-8">
        {/* Заголовок и главное поле: опишите словами → чат */}
        <header className="mx-auto max-w-[860px] text-center">
          <h1 className="text-[34px] font-normal leading-[1.08] tracking-[-0.025em] sm:text-[44px]" style={{ fontFamily: "var(--font-serif, Georgia, serif)", color: hub.text }}>
            Поручения
          </h1>
          <p className="mx-auto mt-2 max-w-[60ch] text-[15.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
            Скажите агенту, что и когда делать, и следите за результатом: планы, регулярные действия и напоминания собраны здесь.
          </p>
          <div className="mt-6 flex items-end gap-2 rounded-[26px] p-2.5 pl-6 text-left" style={{ boxShadow: "inset 0 0 0 1px rgba(1,20,8,0.18), 0 18px 50px -28px rgba(1,20,8,0.35)", backgroundColor: "rgba(255,255,255,0.75)" }}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={2}
              placeholder="Опишите поручение своими словами"
              aria-label="Опишите поручение своими словами"
              className="max-h-40 min-h-[60px] flex-1 resize-none bg-transparent py-3.5 text-[17px] leading-[1.45] outline-none"
              style={{ ...hubSans, color: hub.text }}
            />
            <HubVoiceButton value={draft} onChange={setDraft} size={44} className="shrink-0 self-center" />
            <button type="button" onClick={submit} disabled={!draft.trim()} aria-label="Создать поручение" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full outline-none transition-[transform,opacity] duration-150 hover:opacity-90 focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)] active:scale-95 disabled:opacity-40" style={{ backgroundColor: hub.lime, color: hub.onLime }}>
              <ArrowUp className="h-5 w-5" strokeWidth={2.6} />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            {EXAMPLES.map((e) => (
              <button key={e} type="button" onClick={() => setDraft(e)} className="rounded-full px-4 py-2 text-left text-[13.5px] leading-[1.35] outline-none transition-colors hover:bg-[rgba(1,20,8,0.08)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, backgroundColor: "rgba(1,20,8,0.05)", color: hub.textMuted }}>
                {e}
              </button>
            ))}
          </div>
        </header>

        {error ? (
          <p className="mx-auto mt-8 max-w-[860px] rounded-[14px] px-4 py-3 text-[14px]" style={{ ...hubSans, backgroundColor: hub.dangerSoft, color: hub.text }} role="alert">
            Поручения сейчас не открылись. Попробуйте обновить страницу.
          </p>
        ) : null}

        <div className="mt-12 space-y-14">
          {/* Мои поручения: планы и поручения одним списком, одинаково крупными карточками */}
          <div>
            <Section
              title={total > 0 ? `Мои поручения · ${total}` : "Мои поручения"}
              hint="Планы, которые вы приняли, и действия, которые агент делает по расписанию или условию."
              action={
                <span className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => setDemo((v) => !v)} aria-pressed={demo} className="inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-[14px] font-medium outline-none transition-colors hover:bg-[rgba(1,20,8,0.08)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, backgroundColor: demo ? "rgba(245,183,59,0.25)" : "rgba(1,20,8,0.05)", color: hub.text }}>
                    {demo ? "Скрыть пример" : "Посмотреть пример"}
                  </button>
                <button type="button" onClick={() => openEditor({ kind: "remind" })} className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[14px] font-semibold outline-none transition-opacity hover:opacity-90 focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, backgroundColor: hub.ink, color: "#fff" }}>
                  <Plus className="h-4 w-4" strokeWidth={2.4} />
                  Своё поручение
                </button>
                </span>
              }
            >
              {demo ? (
                <p className="mb-4 rounded-[14px] px-4 py-3 text-[14px] leading-[1.5]" style={{ ...hubSans, backgroundColor: "rgba(245,183,59,0.16)", color: hub.text }}>
                  Так страница выглядит, когда у вас есть планы и поручения. Это пример: данные выдуманные и никуда не сохраняются.
                </p>
              ) : null}
              {loading ? (
                <div className="h-32 animate-pulse rounded-[22px]" style={{ backgroundColor: "rgba(1,20,8,0.04)" }} />
              ) : total === 0 ? (
                <div className="rounded-[22px] px-6 py-7" style={{ boxShadow: "inset 0 0 0 1px rgba(1,20,8,0.1)" }}>
                  <p className="text-[16px] font-medium" style={{ ...hubSans, color: hub.text }}>
                    Пока нет поручений
                  </p>
                  <p className="mt-1 max-w-[70ch] text-[14.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
                    Опишите поручение словами в поле выше, выберите шаблон внизу страницы или попросите агента составить план, например «ускорь продажи ведра 10 литров». Принятый план тоже появится здесь: цель, этапы, что изменилось и что это дало.
                  </p>
                </div>
              ) : (
                <div className="space-y-8">
                  {plansShown.length > 0 ? (
                    <div className="space-y-8">
                      {plansShown.map((x) => (
                        <PlanEntry key={x.item.key} item={x.item} ctx={x.ctx} demo={x.demo} demoActions={demoActions} />
                      ))}
                    </div>
                  ) : null}
                  {/* Поручения в три колонки; недавняя активность стоит справа сверху, а ниже карточки растягиваются на всю ширину */}
                  <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3 [grid-auto-flow:dense]">
                    {ordersShown.slice(0, limit).map((x) => (
                      <OrderCard
                        key={x.order.id}
                        o={x.order}
                        ctx={ctx}
                        demo={x.demo}
                        highlight={flash === x.order.id}
                        onToggle={() => (x.demo ? undefined : toggleOrder(x.order))}
                        onEdit={() => setEditor(formFromOrder(x.order))}
                        onDelete={() => removeOrder(x.order.id)}
                        onChat={() => onFill(`Измени поручение «${x.order.title}»: `)}
                      />
                    ))}
                    <RunsFeed runs={runs} loading={loading} now={now} titles={items} className="self-start lg:col-start-2 lg:row-start-1 2xl:col-start-3" />
                  </div>
                </div>
              )}
              {ordersShown.length > limit ? (
                <button type="button" onClick={() => setLimit((n) => n + 6)} className="mt-5 inline-flex h-10 items-center rounded-full px-5 text-[14px] font-medium outline-none transition-colors hover:bg-[rgba(1,20,8,0.07)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, backgroundColor: "rgba(1,20,8,0.05)", color: hub.text }}>
                  Показать ещё {Math.min(6, ordersShown.length - limit)} из {ordersShown.length - limit}
                </button>
              ) : null}
            </Section>
          </div>

          {finishedPlans.length > 0 || doneOrders.length > 0 ? (
            <Section
              title={`Завершённые · ${finishedPlans.length + doneOrders.length}`}
              hint="Что помогло, а что нет."
              action={
                <button type="button" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone} className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-medium outline-none transition-colors hover:bg-[rgba(1,20,8,0.07)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, backgroundColor: "rgba(1,20,8,0.05)", color: hub.text }}>
                  {showDone ? "Свернуть" : "Показать"}
                  <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200" style={{ transform: showDone ? "rotate(180deg)" : "none" }} aria-hidden />
                </button>
              }
            >
              {showDone || focusIsDone ? (
                <div className="space-y-8">
                  {finishedPlans.map((x) => (
                    <PlanEntry key={x.item.key} item={x.item} ctx={x.ctx} demo={x.demo} demoActions={demoActions} />
                  ))}
                  {doneOrders.length > 0 ? (
                    <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
                      {doneOrders.map((o) => (
                        <OrderCard key={o.id} o={o} ctx={ctx} highlight={flash === o.id} onToggle={() => void 0} onEdit={() => setEditor(formFromOrder(o))} onDelete={() => removeOrder(o.id)} onChat={() => onFill(`Измени поручение «${o.title}»: `)} />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Section>
          ) : null}

          {/* Шаблоны: в самом низу, одной сплошной сеткой слева направо */}
          <Section title="Шаблоны" hint="Готовые поручения: выберите, поправьте время и числа и включите. Время везде московское.">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {SORTED_TEMPLATES.map((t) => {
                const acts = t.form.kind !== "remind" && !(t.form.kind === "when_orders" && t.form.then === "notify");
                const tone = TOPIC_TONE[t.topic];
                return (
                  <button key={t.id} type="button" onClick={() => openEditor(t.form)} className="group relative flex min-h-[188px] flex-col items-start overflow-hidden rounded-[22px] p-5 text-left outline-none transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_-22px_rgba(1,20,8,0.45)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ boxShadow: "inset 0 0 0 1px rgba(1, 20, 8, 0.1)", backgroundImage: `linear-gradient(160deg, ${tone.bg} 0%, rgba(255,255,255,0) 58%)` }}>
                    <span className="inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-semibold uppercase tracking-[0.07em]" style={{ ...hubSans, backgroundColor: tone.chip, color: tone.fg }}>
                      {t.topic}
                    </span>
                    <span className="mt-3.5 text-[17px] font-semibold leading-[1.3] tracking-[-0.008em]" style={{ ...hubSans, color: hub.text }}>
                      {t.title}
                    </span>
                    <span className="mt-1.5 flex-1 text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
                      {t.hint}
                    </span>
                    <span className="mt-4 flex w-full items-center justify-between gap-2">
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                        <span className="font-semibold" style={{ color: acts ? "#2E5A43" : hub.textMuted }}>
                          {acts ? "Делает сам" : "Напомнит"}
                        </span>
                        <span>{templateSchedule(t.form)}</span>
                      </span>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:opacity-100 -translate-x-1" style={{ backgroundColor: hub.ink, color: "#fff" }} aria-hidden>
                        <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>
        </div>

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t pt-6 text-[13.5px]" style={{ ...hubSans, color: hub.textSubtle, borderColor: "rgba(1,20,8,0.1)" }}>
          <span>{sandbox ? "Сейчас включён тестовый режим: в Wildberries ничего не отправляется. " : ""}Что и когда сделал агент, видно в «Журнале».</span>
          <button type="button" onClick={onOpenRules} className="underline-offset-4 outline-none hover:underline focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]">
            Прежние настройки автопилота и рекламы
          </button>
        </footer>
      </div>

      {editor ? (
        <OrderEditor
          initial={editor}
          snapshot={snapshot}
          sandbox={sandbox}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            void reload();
          }}
        />
      ) : null}
    </div>
  );
}
