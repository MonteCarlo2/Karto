"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HubDateTimePicker } from "./hub-datetime-picker";
import { Bot, Check, ClipboardCheck, Clock, Pause, Play, Trash2, Eye, EyeOff, Flag, GitBranch, LifeBuoy, Lightbulb, ListChecks, Megaphone, Minus, PenLine, Percent, Route, ShieldAlert, ShieldCheck, Target, TrendingDown, TrendingUp, Trophy, User, X, Zap, type LucideIcon } from "lucide-react";
import { acceptSellerHubAiFinding, pauseSellerHubPlan, runSellerHubPlanStepNow, dismissSellerHubAiFinding, loadSellerHubAiFeed, markSellerHubPlanStep, setSellerHubPlanAutopilot, type AiFeedItem } from "@/lib/seller-hub/client-api";
import { PlanResult } from "./hub-plan-progress";
import { AgentSwitch } from "./hub-agents-ui";
import { planBrief, describeCondition, describePlanAction, effectReport, evidenceLabel, stepProgress } from "@/lib/seller-hub/agent/strategy";
import { writeHubCardSeed } from "@/lib/seller-hub/card-seed";
import { ArticleChip, HubBadge, HubButton, HubPhoto, RubleGlyph, hub, hubNumeric, hubSans, hubSerif } from "./hub-ui";

/**
 * Решения ИИ в «Задачах»: по каждому товару одна стратегия на все сигналы алгоритмов (цель, шаги по срокам, программа цены, проверки, запасной план).
 * Принятая стратегия ведётся автоматически: программа сверяет цифры по контрольным точкам и предлагает очередной шаг цены, когда подойдёт срок.
 * Цены в кабинете меняются только после кнопки «Выполнить» в разделе «Агенты».
 */

const SECOND_LABEL: Record<string, { text: string; tone: "ok" | "warn" | "muted" }> = {
  agree: { text: "второй ИИ согласен", tone: "ok" },
  dispute: { text: "второй ИИ сомневается", tone: "warn" },
  not_checked: { text: "второй ИИ не проверял", tone: "muted" },
};

const SEVERITY_TONE = { critical: "danger", important: "warn", watch: "muted" } as const;
const SEVERITY_TEXT = { critical: "Критично", important: "Важно", watch: "Присмотреться" } as const;

const METRIC_LABEL: Record<string, string> = {
  orders_28d: "заказы за 28 дней",
  cart_pct: "конверсия в корзину, %",
  cart_to_order_pct: "конверсия корзина→заказ, %",
  turnover_days: "оборачиваемость, дней",
  margin_pct: "маржа, %",
  stock: "остаток, шт.",
  opens_28d: "просмотры за 28 дней",
  rating: "рейтинг",
  oos_days: "дней до нулевого остатка",
  price_buyer: "цена для покупателя, ₽",
};

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "");

/** Задачи ИИ: спокойная синяя рамка и короткая метка «ИИ». Синий не занят ни брендом, ни важностью задач. */
export const AI_BLUE = "#6C93E8";
const AI_BLUE_INK = "#1F4DB3";
const AI_BLUE_SOFT = "#E9F0FE";

/** Стратегия: многошаговая задача. Фирменный лайм, чуть заметнее обычных меток. */
function StrategyMark({ steps, days }: { steps: number; days: number | null }) {
  return (
    <span
      className="inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium"
      style={{ ...hubSans, backgroundColor: hub.lime, borderColor: hub.limeEdge, color: hub.onLime }}
    >
      <Route className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
      Стратегия · {steps} {steps === 1 ? "шаг" : steps < 5 ? "шага" : "шагов"}
      {days ? `, ${days} дн.` : ""}
    </span>
  );
}

/** Служебные имена полей в тексте ИИ («break_even») заменяем человеческими словами. */
const RAW_KEYS: Record<string, string> = {
  break_even: "безубыточная цена",
  break_even_price: "безубыточная цена",
  margin_pct: "маржа",
  margin_rub: "маржа в рублях",
  price_buyer: "цена для покупателя",
  turnover_days: "оборачиваемость",
  cart_pct: "конверсия в корзину",
  cart_to_order_pct: "конверсия из корзины в заказ",
  orders_28d: "заказы за 28 дней",
  opens_28d: "просмотры за 28 дней",
  oos_days: "дней до нулевого остатка",
  nmId: "артикул WB",
};
const RAW_KEYS_RE = new RegExp(`(?<![\\p{L}_])(${Object.keys(RAW_KEYS).join("|")})(?![\\p{L}_])`, "gu");
export const plainKeys = (text: string) => text.replace(RAW_KEYS_RE, (key) => RAW_KEYS[key] ?? key);

/** Описание от ИИ по предложениям: первое — факт, остальные — причина. Без обрезки и многоточий. */
function whatParts(text: string): string[] {
  return plainKeys(text)
    .replace(/\s+/gu, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z«"])/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Выделяет в тексте главное: числа с единицами («+3%», «1 177 ₽», «30 дней»). Остальное текст как есть. */
const KEY_NUMBER = /([+\-−]?\d[\d\u00a0 ]*(?:[.,]\d+)?\s?(?:%|₽|п\.п\.|дн\.|дней|дня|день|час\p{L}*|шт\.?|заказ\p{L}*|просмотр\p{L}*))/gu;

/** Значок срока шага по смыслу: «сразу», «через сутки», промежуточный итог, контроль, итог. */
function whenIcon(day: number, when: string): { Icon: LucideIcon; tone: "now" | "wait" | "review" | "final" } {
  const w = when.toLowerCase();
  if (/итог плана|^итог|итог$/u.test(w) && !/промежуточ/u.test(w)) return { Icon: Trophy, tone: "final" };
  if (/промежуточ/u.test(w)) return { Icon: ListChecks, tone: "review" };
  if (/контрол/u.test(w)) return { Icon: Eye, tone: "review" };
  if (day === 0 || /^сразу/u.test(w)) return { Icon: Zap, tone: "now" };
  return { Icon: Clock, tone: "wait" };
}

/** Значок действия программы по его категории: цена, реклама, акции, карточка. */
function planActionIcon(type: string): LucideIcon | ((props: { className?: string }) => React.ReactElement) {
  if (type === "price" || type === "club_discount") return RubleGlyph;
  if (type.startsWith("ads_")) return Megaphone;
  if (type.startsWith("promo_")) return Percent;
  if (type === "content_edit" || type === "characteristics_edit") return PenLine;
  return Bot;
}

const capFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function Hi({ text }: { text: string }) {
  const chunks = text.split(KEY_NUMBER);
  return (
    <>
      {chunks.map((chunk, index) =>
        index % 2 === 1 ? (
          <b key={index} className="whitespace-nowrap rounded-[6px] px-1 font-bold" style={{ ...hubNumeric, backgroundColor: hub.limeSoft, color: hub.text }}>
            {chunk}
          </b>
        ) : (
          <span key={index}>{chunk}</span>
        ),
      )}
    </>
  );
}

/** Цель стратегии: главная мысль крупно, дополнительные условия списком. */
function goalParts(goal: string): string[] {
  return plainKeys(goal)
    .split(/,\s+(?=не |и |а )|\s+и одновременно\s+/u)
    .map((part) => part.trim().replace(/^и\s+/u, ""))
    .filter(Boolean);
}

/** Кнопка «удерживайте»: заполняется за секунду; работает и с клавиатуры (Пробел или Enter). */
function HoldToConfirm({ label, busy, onDone }: { label: string; busy: boolean; onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  const frame = useRef(0);
  const startedAt = useRef(0);
  const finished = useRef(false);

  function begin() {
    if (busy || finished.current) return;
    startedAt.current = performance.now();
    const tick = (now: number) => {
      const value = Math.min(1, (now - startedAt.current) / 900);
      setProgress(value);
      if (value >= 1) {
        finished.current = true;
        onDone();
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }
  function cancel() {
    cancelAnimationFrame(frame.current);
    if (!finished.current) setProgress(0);
  }
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return (
    <button
      type="button"
      disabled={busy}
      onPointerDown={begin}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(event) => {
        if ((event.key === " " || event.key === "Enter") && !event.repeat) {
          event.preventDefault();
          begin();
        }
      }}
      onKeyUp={cancel}
      className="relative inline-flex h-12 min-w-[260px] select-none items-center justify-center overflow-hidden rounded-full border px-7 text-[15px] font-bold outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_var(--hub-lime-ring)] disabled:opacity-60"
      style={{ ...hubSans, borderColor: hub.limeEdge, backgroundColor: hub.limeSoft, color: hub.onLime, touchAction: "none" }}
    >
      <span className="absolute inset-y-0 left-0" style={{ width: `${progress * 100}%`, backgroundColor: hub.lime }} aria-hidden />
      <span className="relative z-10 flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
        {busy ? "Принимаем…" : label}
      </span>
    </button>
  );
}

/** Окно «Принять стратегию?»: короткий конспект и подтверждение удержанием. */
function StrategyConfirm({ item, titleByNm, startAt, busy, onConfirm, onClose }: { item: AiFeedItem; titleByNm?: Map<string, string>; startAt?: string; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  const f = item.finding!;
  const st = f.strategy ?? null;
  const brief = st ? planBrief(st) : null;
  const program = st ? st.steps.filter((step) => step.action) : [];
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={(event) => event.stopPropagation()}>
      <button type="button" aria-label="Закрыть" className="hub-fade-in absolute inset-0 bg-[rgba(1,20,8,0.5)] backdrop-blur-[2px]" onClick={() => (busy ? undefined : onClose())} />
      <div role="dialog" aria-modal="true" aria-label="Принять стратегию" className="hub-pop relative w-full max-w-[520px] rounded-[28px] bg-white p-8 shadow-[0_40px_100px_-30px_rgba(1,20,8,0.55)]">
        <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: hub.lime, color: hub.onLime }}>
          <ClipboardCheck className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </span>
        <h2 className="mt-4 text-[26px] font-semibold leading-[1.2] tracking-[-0.02em]" style={{ ...hubSerif, color: hub.text }}>
          {st ? "Принять стратегию?" : "Принять к выполнению?"}
        </h2>
        {f.nmId ? <p className="mt-1.5 text-[14px] leading-[1.4] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.textSubtle }}>{titleByNm?.get(f.nmId) ?? `Товар ${f.nmId}`}</p> : null}

        {st ? (
          <>
            <p className="mt-5 text-pretty text-[16px] font-semibold leading-[1.45] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
              <Hi text={st.goal} />
            </p>
            <dl className="mt-5 grid grid-cols-3 gap-2.5">
              {[
                { label: "шагов", value: String(st.steps.length) },
                { label: "дней", value: brief?.horizonDays ? String(brief.horizonDays) : "—" },
                { label: "сделает программа", value: String(program.length) },
              ].map((tile) => (
                <div key={tile.label} className="rounded-[14px] px-4 py-3" style={{ backgroundColor: hub.surfaceMuted }}>
                  <dd className="text-[24px] font-bold leading-7 tracking-[-0.02em]" style={{ ...hubNumeric, color: hub.text }}>{tile.value}</dd>
                  <dt className="mt-0.5 text-[12px] leading-4" style={{ ...hubSans, color: hub.textSubtle }}>{tile.label}</dt>
                </div>
              ))}
            </dl>
            {program.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {program.slice(0, 3).map((step, index) => {
                  const Icon = planActionIcon(step.action!.type);
                  return (
                    <span key={index} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-semibold" style={{ ...hubSans, backgroundColor: hub.limeWash, borderColor: "rgba(165, 232, 58, 0.6)", color: hub.text }}>
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      {describePlanAction(step.action!)}
                    </span>
                  );
                })}
                {program.length > 3 ? <span className="px-1 py-1 text-[13px]" style={{ ...hubSans, color: hub.textSubtle }}>и ещё {program.length - 3}</span> : null}
              </div>
            ) : null}
          </>
        ) : (
          <p className="mt-5 text-pretty text-[15px] leading-[1.5]" style={{ ...hubSans, color: hub.text }}>{f.action?.reason ?? f.title}</p>
        )}

        <p className="mt-5 flex items-start gap-2.5 rounded-[14px] px-4 py-3 text-[13.5px] leading-[1.5]" style={{ ...hubSans, backgroundColor: hub.canvas, color: hub.textMuted, boxShadow: `inset 0 0 0 1px ${hub.borderSoft}` }}>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} style={{ color: hub.limeRing }} aria-hidden />
          <span>
            В кабинет ничего не уйдёт без вашего «Выполнить». Остановить можно в любой момент.
            {startAt ? ` Старт: ${new Date(startAt).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.` : " Старт сразу после принятия."}
          </span>
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <HubButton variant="ghost" disabled={busy} onClick={onClose}>Не сейчас</HubButton>
          <HoldToConfirm label="Удерживайте, чтобы принять" busy={busy} onDone={onConfirm} />
        </div>
      </div>
    </div>
  );
}

type AiFindingsParams = {
  /** Только для страницы предпросмотра. */
  previewItems?: AiFeedItem[];
  titleByNm?: Map<string, string>;
  /** Данные карточек для кнопок «Открыть в Потоке». */
  cardByNm?: Map<string, { title: string; vendorCode: string; description: string; imageUrl?: string }>;
  /** Показать только планы одного диалога «поставить задачу». */
  chatId?: string;
  /** Меняется, когда нужно перечитать ленту (например, после нового ответа ИИ). */
  reloadKey?: number;
};

/** Состояние и действия находок ИИ. Нужны и отдельному блоку (чат), и общему списку задач. */
export function useAiFindings({ titleByNm, cardByNm, chatId, reloadKey, previewItems }: AiFindingsParams) {
  const [items, setItems] = useState<AiFeedItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const [allSteps, setAllSteps] = useState<Record<string, boolean>>({});
  const [startAtById, setStartAtById] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (previewItems) {
      setItems(previewItems);
      return;
    }
    try {
      const res = await loadSellerHubAiFeed();
      if (res.ok) setItems(res.items.filter((item) => item.finding && (!chatId || item.finding.taskKey?.startsWith(`chat:${chatId}:`))));
    } catch {
      // Сервер не ответил вовремя: остаётся прежний список, при следующем обновлении попробуем снова.
    }
  }, [chatId, previewItems]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function markStep(id: string, stepIndex: number, status: "done" | "skipped" | "reset") {
    setBusy(id);
    const res = await markSellerHubPlanStep(id, stepIndex, status);
    if (res.ok) await load();
    setBusy(null);
  }

  return { items, setItems, busy, setBusy, openIds, setOpenIds, allSteps, setAllSteps, startAtById, setStartAtById, load, markStep, titleByNm, cardByNm };
}

export type AiFindingsCtx = ReturnType<typeof useAiFindings>;

/** compact: узкое место (чат): колонки карточки складываются в одну. */
export function AiFindingCard({ item, ctx, compact = false, demoActions }: { item: AiFeedItem; ctx: AiFindingsCtx; compact?: boolean; /** Пример: кнопки работают только на экране и ничего не отправляют на сервер. */ demoActions?: { pause: (id: string, paused: boolean) => void; remove: (id: string) => void } }) {
  const [confirming, setConfirming] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const isOpen = Boolean(ctx.openIds[item.finding!.id]);
  const closeId = item.finding!.id;
  const closeDialog = ctx.setOpenIds;
  useEffect(() => {
    if (!isOpen) return;
    dialogRef.current?.focus();
    if (confirming) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDialog((prev) => ({ ...prev, [closeId]: false }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, confirming, closeId, closeDialog]);
  const { busy, setBusy, setItems, load, markStep, openIds, setOpenIds, startAtById, setStartAtById, titleByNm, cardByNm } = ctx;
          const f = item.finding!;
          const st = f.strategy ?? null;
          const state = f.strategyState ?? null;
          const running = f.ownerAccepted && state?.status === "running";
          const open = Boolean(openIds[f.id]);
          const brief = st ? planBrief(st) : null;
          const statusText =
            f.ownerAccepted && state
              ? state.status === "scheduled"
                ? "Запланирован"
                : state.status === "worked"
                  ? "Сработало"
                  : state.status === "not_worked"
                    ? "Не сработало"
                    : state.status === "observed"
                      ? "Наблюдение завершено"
                      : null
              : null;
          const numbers = f.evidence.slice(0, 2);
          async function doAccept() {
            setBusy(f.id);
            const res = await acceptSellerHubAiFinding(f.id, !f.ownerAccepted, !f.ownerAccepted && startAtById[f.id] ? new Date(startAtById[f.id]!).toISOString() : undefined);
            // Сервер уже пересчитал предложения: перечитываем ленту, чтобы увидеть ход стратегии.
            if (res.ok) await load();
            setBusy(null);
            setConfirming(false);
          }
          const paused = Boolean(state?.pausedAt);
          const planOn = running && Boolean(st);
          async function removePlan() {
            if (demoActions) {
              demoActions.remove(f.id);
              return;
            }
            setBusy(f.id);
            const res = await dismissSellerHubAiFinding(f.id);
            setBusy(null);
            if (res.ok) setItems((prev) => prev.filter((x) => x.finding?.id !== f.id));
          }
          const actionBlock = (
                  <div className="flex w-[220px] max-w-full flex-col gap-2">
                    {planOn ? (
                      <>
                        <HubButton
                          className="w-full"
                          variant={paused ? "primary" : "secondary"}
                          disabled={busy === f.id}
                          onClick={async () => {
                            if (demoActions) {
                              demoActions.pause(f.id, !paused);
                              return;
                            }
                            setBusy(f.id);
                            const res = await pauseSellerHubPlan(f.id, !paused);
                            if (res.ok) await load();
                            setBusy(null);
                          }}
                        >
                          {paused ? <Play className="h-4 w-4" strokeWidth={1.75} /> : <Pause className="h-4 w-4" strokeWidth={1.75} />}
                          {paused ? "Продолжить план" : "Приостановить"}
                        </HubButton>
                        <HubButton className="w-full" size="sm" variant="secondary" onClick={() => setOpenIds((prev) => ({ ...prev, [f.id]: true }))}>
                          <ListChecks className="h-3.5 w-3.5" strokeWidth={1.75} />
                          Шаги и ход плана
                        </HubButton>
                        {paused ? (
                          <HubButton
                            className="w-full"
                            size="sm"
                            variant="secondary"
                            disabled={busy === f.id}
                            onClick={() => {
                              if (!confirmRemove) {
                                setConfirmRemove(true);
                                window.setTimeout(() => setConfirmRemove(false), 4000);
                                return;
                              }
                              void removePlan();
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                            {confirmRemove ? "Точно удалить?" : "Удалить план"}
                          </HubButton>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {(st || (f.action && f.second === "agree")) && state?.status !== "worked" && !f.ownerAccepted ? (
                          <HubButton className="w-full" variant="primary" disabled={busy === f.id} onClick={() => setConfirming(true)}>
                            <ClipboardCheck className="h-4 w-4" strokeWidth={1.75} />
                            {st ? (startAtById[f.id] ? "Принять и запустить позже" : "Принять стратегию") : "Принять к выполнению"}
                          </HubButton>
                        ) : null}
                        {f.ownerAccepted && state?.status === "scheduled" ? (
                          <HubButton className="w-full" variant="secondary" disabled={busy === f.id} onClick={() => void doAccept()}>
                            Отменить запуск
                          </HubButton>
                        ) : null}
                        <HubButton className="w-full" size="sm" variant="secondary" disabled={busy === f.id} onClick={() => void removePlan()}>
                          {f.ownerAccepted ? <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} /> : <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} />}
                          {f.ownerAccepted ? "Убрать из списка" : "Скрыть"}
                        </HubButton>
                      </>
                    )}
                  </div>
          );
          return (
            <li
              key={item.key}
              role="button"
              tabIndex={0}
              onClick={() => setOpenIds((prev) => ({ ...prev, [f.id]: true }))}
              onKeyDown={(event) => {
                if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  setOpenIds((prev) => ({ ...prev, [f.id]: true }));
                }
              }}
              className="cursor-pointer rounded-[18px] border-[1.5px] bg-white p-5 outline-none transition-[box-shadow,transform] duration-200 hover:-translate-y-px focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_var(--hub-lime-ring)] shadow-[0_1px_2px_rgba(31,77,179,0.06),0_14px_32px_-22px_rgba(31,77,179,0.55)]"
              style={{ borderColor: AI_BLUE }}
            >
              <div className={compact ? "grid items-start gap-y-5" : "grid items-start gap-x-10 gap-y-4 lg:grid-cols-[minmax(0,1fr)_auto_220px]"}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    {f.origin === "chat" ? <HubBadge tone="accent">{(st?.steps.length ?? 0) <= 2 && !st?.reviewAfterDays ? "Задача агента" : "План агента"}</HubBadge> : null}
                    {st ? <StrategyMark steps={st.steps.length} days={brief?.horizonDays ?? null} /> : null}
                    <HubBadge tone={SEVERITY_TONE[item.severity]}>{SEVERITY_TEXT[item.severity]}</HubBadge>
                    {statusText ? <HubBadge tone={state?.status === "worked" ? "ok" : state?.status === "not_worked" ? "danger" : "accent"}>{statusText}</HubBadge> : null}
                  </div>
                  <p className="mt-3 text-balance text-[21px] font-bold leading-[1.25] tracking-[-0.02em] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                    {plainKeys(f.title)}
                  </p>
                  {whatParts(f.what ?? "")[0] && whatParts(f.what ?? "")[0]!.length <= 150 ? (
                    <p className="mt-2 max-w-[64ch] text-pretty text-[15px] font-normal leading-[1.5] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.textMuted }}>
                      {whatParts(f.what ?? "")[0]}
                    </p>
                  ) : null}
                  {f.nmId ? (
                    <div className="mt-3.5 flex w-full max-w-[460px] items-center gap-3.5 rounded-[14px] border p-2.5 pr-4" style={{ borderColor: hub.border, backgroundColor: hub.canvas }}>
                      <HubPhoto contain src={cardByNm?.get(f.nmId)?.imageUrl} className="h-[84px] w-[64px] shrink-0 rounded-[6px]" iconClassName="h-5 w-5" />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-[16px] font-semibold leading-[1.35] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                          {titleByNm?.get(f.nmId) ?? `Товар ${f.nmId}`}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px]" style={{ ...hubSans, ...hubNumeric, color: hub.textSubtle }}>
                          {cardByNm?.get(f.nmId)?.vendorCode ? (
                            <ArticleChip value={cardByNm.get(f.nmId)!.vendorCode} />
                          ) : null}
                          <span>nm {f.nmId}</span>
                        </span>
                      </span>
                    </div>
                  ) : null}
                  {st?.goal || f.humanAdvice ? (
                    <p className="mt-3.5 flex max-w-[64ch] items-start gap-2.5 text-pretty text-[16px] font-semibold leading-[1.45] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                      {st ? (
                        <Flag className="mt-1 h-[18px] w-[18px] shrink-0" strokeWidth={1.75} style={{ color: AI_BLUE_INK }} aria-hidden />
                      ) : (
                        <Lightbulb className="mt-1 h-[18px] w-[18px] shrink-0" strokeWidth={1.75} style={{ color: hub.textSubtle }} aria-hidden />
                      )}
                      <span>{plainKeys(st ? st.goal : (f.humanAdvice ?? ""))}</span>
                    </p>
                  ) : null}
                </div>

                {numbers.length > 0 ? (
                  <dl className="flex h-fit gap-x-8 lg:pt-1 lg:text-right">
                    {numbers.map((e) => (
                      <div key={e.key}>
                        <dt className="whitespace-nowrap text-[13px] leading-4 first-letter:uppercase" style={{ ...hubSans, color: hub.textSubtle }}>{evidenceLabel(e.key)}</dt>
                        <dd className="mt-1 whitespace-nowrap text-[24px] font-bold leading-7 tracking-[-0.02em]" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
                          {e.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <div className="hidden lg:block" />
                )}

                <div className="flex items-start gap-2 lg:pt-1" onClick={(event) => event.stopPropagation()}>
                  {actionBlock}
                </div>
              </div>
              {f.ownerAccepted && st && state ? <PlanResult strategy={st} state={state} className="mt-5" /> : null}

              {open ? createPortal(
                <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4" onClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    aria-label="Закрыть"
                    className="hub-fade-in absolute inset-0 bg-[rgba(1,20,8,0.5)] backdrop-blur-[2px]"
                    onClick={() => setOpenIds((prev) => ({ ...prev, [f.id]: false }))}
                  />
                  <div
                    ref={dialogRef}
                    tabIndex={-1}
                    role="dialog"
                    aria-modal="true"
                    aria-label={f.title}
                    className="hub-pop relative flex outline-none max-h-full h-[min(1040px,100%)] w-full max-w-[1480px] flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_40px_100px_-30px_rgba(1,20,8,0.55)] sm:rounded-[28px]"
                  >
                    <div className="flex items-start justify-between gap-6 px-6 sm:px-12 pb-5 pt-7">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                          {st ? <StrategyMark steps={st.steps.length} days={brief?.horizonDays ?? null} /> : null}
                          <HubBadge tone={SEVERITY_TONE[item.severity]}>{SEVERITY_TEXT[item.severity]}</HubBadge>
                          {statusText ? <HubBadge tone={state?.status === "worked" ? "ok" : state?.status === "not_worked" ? "danger" : "accent"}>{statusText}</HubBadge> : null}
                        </div>
                        <h2 className="mt-2.5 max-w-[70ch] text-balance text-[26px] font-semibold leading-[1.2] tracking-[-0.02em] [overflow-wrap:anywhere]" style={{ ...hubSerif, color: hub.text }}>
                          {plainKeys(f.title)}
                        </h2>
                      </div>
                      <button
                        type="button"
                        aria-label="Закрыть"
                        onClick={() => setOpenIds((prev) => ({ ...prev, [f.id]: false }))}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full outline-none transition-colors hover:bg-[var(--hub-surface-muted)] focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_var(--hub-lime-ring)]"
                        style={{ color: hub.textMuted }}
                      >
                        <X className="h-5 w-5" strokeWidth={1.75} />
                      </button>
                    </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t pb-32" style={{ borderColor: hub.border }}>
                  <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                    <div className="px-6 sm:px-12 py-10 lg:border-r" style={{ backgroundColor: hub.canvas, borderColor: hub.border }}>
                      <div className="space-y-8 lg:sticky lg:top-10">
                      {f.nmId ? (
                        <div className="flex min-w-0 items-center gap-4">
                          <HubPhoto contain src={cardByNm?.get(f.nmId)?.imageUrl} className="h-[104px] w-[78px] shrink-0 rounded-[6px]" iconClassName="h-6 w-6" />
                          <span className="min-w-0">
                            <span className="line-clamp-3 block text-[18px] font-semibold leading-[1.3] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                              {titleByNm?.get(f.nmId) ?? `Товар ${f.nmId}`}
                            </span>
                            <span className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[13px]" style={{ ...hubSans, ...hubNumeric, color: hub.textSubtle }}>
                              {cardByNm?.get(f.nmId)?.vendorCode ? (
                                <ArticleChip value={cardByNm.get(f.nmId)!.vendorCode} />
                              ) : null}
                              <span>nm {f.nmId}</span>
                            </span>
                          </span>
                        </div>
                      ) : null}

                      {st?.goal ? (
                        <div className="rounded-[20px] border px-7 py-6" style={{ backgroundColor: hub.limeWash, borderColor: "rgba(165, 232, 58, 0.55)" }}>
                          <p className="flex items-center gap-2 text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                            <Flag className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                            Цель стратегии
                          </p>
                          <p className="mt-3 text-pretty text-[21px] font-bold leading-[1.4] tracking-[-0.01em]" style={{ ...hubSans, color: hub.text }}>
                            <Hi text={goalParts(st.goal)[0] ?? st.goal} />
                          </p>
                          {goalParts(st.goal).length > 1 ? (
                            <ul className="mt-4 space-y-2.5 border-t pt-4" style={{ borderColor: "rgba(165, 232, 58, 0.55)" }}>
                              {goalParts(st.goal).slice(1).map((part, i) => (
                                <li key={i} className="flex items-start gap-3 text-pretty text-[16px] leading-[1.45]" style={{ ...hubSans, color: hub.text }}>
                                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white"><Check className="h-3 w-3" strokeWidth={3} style={{ color: hub.greenDark }} aria-hidden /></span>
                                  <span><Hi text={part.charAt(0).toUpperCase() + part.slice(1)} /></span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}

                      {whatParts(f.what ?? "").length > 0 ? (
                        <section>
                          <h3 className="text-[18px] font-bold tracking-[-0.01em]" style={{ ...hubSans, color: hub.text }}>Почему мы это предлагаем</h3>
                          <ol className="mt-3 overflow-hidden rounded-[16px] border bg-white" style={{ borderColor: hub.border }}>
                            {whatParts(f.what ?? "").map((part, index) => (
                              <li key={index} className="flex gap-3.5 border-t px-4 py-3.5 first:border-t-0" style={{ borderColor: hub.borderSoft }}>
                                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold" style={{ ...hubNumeric, backgroundColor: AI_BLUE_SOFT, color: AI_BLUE_INK }}>{index + 1}</span>
                                <p className="min-w-0 text-pretty text-[15px] leading-[1.55] [overflow-wrap:anywhere]" style={{ ...hubSans, color: index === 0 ? hub.text : hub.textMuted, fontWeight: index === 0 ? 500 : 400 }}>
                                  <Hi text={part} />
                                </p>
                              </li>
                            ))}
                          </ol>
                        </section>
                      ) : null}

                      {f.evidence.length > 0 ? (
                        <dl className="grid grid-cols-2 gap-2.5">
                          {f.evidence.map((e) => (
                            <div key={e.key} className="rounded-[14px] px-4 py-3" style={{ backgroundColor: hub.surfaceMuted }}>
                              <dt className="text-[12px] leading-4 first-letter:uppercase" style={{ ...hubSans, color: hub.textSubtle }}>{evidenceLabel(e.key)}</dt>
                              <dd className="mt-1 text-[20px] font-bold leading-6 tracking-[-0.02em]" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>{e.value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}

                  {!st && f.action ? (
                    <div className="rounded-[14px] px-4 py-3.5" style={{ backgroundColor: hub.surfaceMuted }}>
                      <p className="text-[14px] leading-6" style={{ ...hubSans, color: hub.text }}>
                        Действие, которое может выполнить программа: цену {f.action.direction === "raise" ? "повысить" : "снизить"} на ступень {f.action.stepPercent}%. {f.action.reason}
                      </p>
                    </div>
                  ) : null}



                      </div>
                    </div>

                    <div className="space-y-8 px-6 sm:px-12 py-10">
                      {st ? (
                        <>
                      <div>
                        <p className="text-[20px] font-bold tracking-[-0.02em]" style={{ ...hubSans, color: hub.text }}>
                          {st.steps.length === 1 ? "Что сделать" : "План по срокам"}
                          <span className="ml-2 text-[13px] font-medium" style={{ color: hub.textSubtle }}>{st.steps.length} {st.steps.length === 1 ? "шаг" : st.steps.length < 5 ? "шага" : "шагов"}</span>
                        </p>
                        <p className="mt-1 max-w-[70ch] text-[13px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
                          Шаги с зелёной плашкой действия (например «цена +3%») считает и проверяет программа, а запускаете их вы кнопкой в разделе «Агенты»: сама в кабинет она ничего не меняет.
                        </p>
                        <ol className="mt-4">
                          {st.steps.map((p, i, list) => {
                            const prog = f.ownerAccepted && state ? stepProgress(st, state, Date.now())[i] : null;
                            const human = !p.action;
                            const done = prog?.status === "done";
                            const skipped = prog?.status === "skipped";
                            const timing = whenIcon(p.day, p.when ?? "");
                            return (
                              <li key={i} className="relative grid grid-cols-[32px_minmax(0,1fr)] gap-x-4 pb-5 last:pb-0">
                                {i < list.length - 1 ? <span className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px" style={{ backgroundColor: hub.borderCard }} aria-hidden /> : null}
                                <span
                                  className="z-10 flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold"
                                  style={{ ...hubNumeric, backgroundColor: done ? hub.greenSoft : "#fff", color: done ? hub.greenDark : hub.text, border: `1.5px solid ${done ? "#14874E" : hub.borderStrong}` }}
                                >
                                  {done ? <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden /> : i + 1}
                                </span>
                                <div className="min-w-0 rounded-[16px] border bg-white px-6 py-5" style={timing.tone === "final" ? { borderColor: AI_BLUE, boxShadow: `0 0 0 3px ${AI_BLUE_SOFT}` } : { borderColor: hub.border }}>
                                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                                    <p className="flex items-center gap-2.5 text-[15px] font-bold" style={{ ...hubSans, color: hub.text }}>
                                      <span
                                        className="flex h-8 w-8 items-center justify-center rounded-full"
                                        style={{ backgroundColor: timing.tone === "now" ? hub.lime : timing.tone === "final" ? hub.greenSoft : timing.tone === "review" ? AI_BLUE_SOFT : hub.surfaceMuted, color: timing.tone === "now" ? hub.onLime : timing.tone === "final" ? hub.greenDark : timing.tone === "review" ? AI_BLUE_INK : hub.text }}
                                      >
                                        <timing.Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                                      </span>
                                      {capFirst(p.day === 0 ? "сразу" : p.when || `день ${p.day}`)}
                                      {p.when && !/^день\s*\d+/iu.test(p.when) ? (
                                        <span className="rounded-full px-2.5 py-0.5 text-[12px] font-medium" style={{ ...hubSans, backgroundColor: hub.surfaceMuted, color: hub.textSubtle }}>
                                          день {p.day === 0 ? 1 : p.day}
                                        </span>
                                      ) : null}
                                    </p>
                                    <div className="flex items-center gap-1.5">
                                      {prog?.status === "due" ? <HubBadge tone="warn">пора сделать</HubBadge> : null}
                                      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium" style={{ ...hubSans, backgroundColor: p.action ? hub.plumSoft : hub.surfaceMuted, color: p.action ? hub.plum : hub.textMuted }}>
                                        {p.action ? <Bot className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> : <User className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
                                        {p.action ? "Программа" : "Вы"}
                                      </span>
                                    </div>
                                  </div>
                                  {p.onlyIf ? (
                                    <div className="mt-3 flex items-start gap-2.5 rounded-[12px] px-3.5 py-2.5 text-[14px] leading-[1.4]" style={{ ...hubSans, backgroundColor: hub.warnSoft, color: hub.text }}>
                                      <GitBranch className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} style={{ color: hub.warn }} aria-hidden />
                                      <span>
                                        <b className="font-bold" style={{ color: hub.warn }}>Только если: </b>
                                        <span className="font-semibold">{describeCondition(p.onlyIf)}</span>
                                      </span>
                                    </div>
                                  ) : null}
                                  <div style={{ textDecoration: skipped ? "line-through" : undefined, opacity: skipped ? 0.55 : 1 }}>
                                    <p className="mt-2 text-pretty text-[17px] leading-[1.35] tracking-[-0.01em] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text, fontWeight: 550 }}>
                                      <Hi text={whatParts(p.step)[0] ?? p.step} />
                                    </p>
                                    {whatParts(p.step).length > 1 ? (
                                      <p className="mt-1 text-pretty text-[14px] leading-[1.55] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.textMuted }}>
                                        {whatParts(p.step).slice(1).join(" ")}
                                      </p>
                                    ) : null}
                                  </div>
                                  {p.action ? (
                                    <p className="mt-3">
                                      <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[14px] font-semibold" style={{ ...hubSans, backgroundColor: hub.limeWash, borderColor: "rgba(165, 232, 58, 0.6)", color: hub.text }}>
                                        {(() => {
                                          const ActionIcon = planActionIcon(p.action.type);
                                          return <ActionIcon className="h-4 w-4 shrink-0" />;
                                        })()}
                                        {describePlanAction(p.action)}{done ? " · выполнено" : ""}
                                      </span>
                                    </p>
                                  ) : done || skipped ? (
                                    <p className="mt-2 text-[13px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>{done ? "Вы отметили: сделано" : "Пропущено"}</p>
                                  ) : null}
                                  <div className="mt-2 flex flex-wrap items-center gap-2 empty:hidden">
                                    {p.action && running && prog && prog.status !== "done" ? (
                                      <HubButton
                                        size="sm"
                                        variant="secondary"
                                        disabled={busy === f.id}
                                        title="Не ждать срока и условия: шаг сразу появится в «Предложениях» с кнопкой «Выполнить»"
                                        onClick={async () => {
                                          setBusy(f.id);
                                          const res = await runSellerHubPlanStepNow(f.id, i);
                                          if (res.ok) await load();
                                          setBusy(null);
                                        }}
                                      >
                                        Предложить сейчас
                                      </HubButton>
                                    ) : null}
                                    {p.flow && f.nmId ? (
                                      <a
                                        className="inline-flex h-9 items-center rounded-full border px-4 text-[13px] font-semibold outline-none transition-colors hover:bg-[var(--hub-surface-muted)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]"
                                        style={{ borderColor: hub.ink, color: hub.ink }}
                                        href={p.flow === "visual" ? "/studio/visual" : p.flow === "description" ? "/studio/description" : "/studio/auto-replies/workspace"}
                                        onClick={() => {
                                          const card = cardByNm?.get(f.nmId!);
                                          if (card && p.flow !== "auto_replies") writeHubCardSeed({ title: card.title, vendorCode: card.vendorCode, externalId: f.nmId!, description: card.description });
                                        }}
                                      >
                                        {p.flow === "visual" ? "Открыть в Потоке" : p.flow === "description" ? "Открыть SEO-описания" : "Открыть ответы на отзывы"}
                                      </a>
                                    ) : null}
                                    {prog && human ? (
                                      <>
                                        {prog.status !== "done" ? (
                                          <HubButton size="sm" variant="secondary" disabled={busy === f.id} onClick={() => void markStep(f.id, i, "done")}>
                                            <Check className="h-3.5 w-3.5" strokeWidth={2} />
                                            Сделал
                                          </HubButton>
                                        ) : null}
                                        {prog.status === "upcoming" || prog.status === "due" ? (
                                          <HubButton size="sm" variant="ghost" disabled={busy === f.id} onClick={() => void markStep(f.id, i, "skipped")}>
                                            Пропустить
                                          </HubButton>
                                        ) : null}
                                        {prog.status === "done" || prog.status === "skipped" ? (
                                          <button type="button" className="text-[13px] font-medium underline underline-offset-2" style={{ color: hub.textSubtle }} disabled={busy === f.id} onClick={() => void markStep(f.id, i, "reset")}>
                                            отменить отметку
                                          </button>
                                        ) : null}
                                      </>
                                    ) : null}
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      </div>

                      <div className="border-t" style={{ borderColor: hub.border }} />
                      {st.checks.length > 0 ? (
                        <div>
                          <p className="text-[20px] font-bold tracking-[-0.02em]" style={{ ...hubSans, color: hub.text }}>Контрольные точки</p>
                          <p className="mt-1 text-[13px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>В эти дни программа сверит цифры и скажет, идёт ли план по задуманному.</p>
                          <ul className="mt-5 space-y-4">
                            {st.checks.map((c, i) => (
                              <li key={i} className="grid grid-cols-[72px_minmax(0,1fr)] items-start gap-x-4 rounded-[16px] border bg-white px-5 py-4" style={/^итог/iu.test(c.label) ? { borderColor: AI_BLUE, boxShadow: `0 0 0 3px ${AI_BLUE_SOFT}` } : { borderColor: hub.border }}>
                                <span className="inline-flex h-8 items-center justify-center rounded-full text-[13px] font-bold" style={{ ...hubSans, backgroundColor: hub.surfaceMuted, color: hub.text }}>день {c.day}</span>
                                <div className="min-w-0">
                                  <p className="text-pretty text-[16px] font-semibold leading-[1.4] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}><Hi text={whatParts(c.label)[0] ?? c.label} /></p>
                                  {whatParts(c.label).length > 1 ? <p className="mt-1 text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>{whatParts(c.label).slice(1).join(" ")}</p> : null}
                                  {c.look.length > 0 ? (
                                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                                      {c.look.map((l, li) => (
                                        <span key={li} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium" style={{ ...hubSans, backgroundColor: l.expect === "up" ? hub.greenSoft : l.expect === "down" ? hub.warnSoft : hub.surfaceMuted, color: l.expect === "up" ? hub.greenDark : l.expect === "down" ? hub.warn : hub.textMuted }}>
                                          {l.expect === "up" ? <TrendingUp className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> : l.expect === "down" ? <TrendingDown className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> : <Minus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
                                          {METRIC_LABEL[l.metric] ?? l.metric} {l.expect === "up" ? "растёт" : l.expect === "down" ? "снижается" : "держится"}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {f.ownerAccepted && state ? (
                        <div className="rounded-[16px] border px-5 py-4" style={{ borderColor: hub.borderCard }}>
                          <PlanResult strategy={st} state={state} className="mb-3" />
                          <p className="text-[15px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                            {state.status === "scheduled" ? `Запланирован на ${state.scheduledStartAt ? fmtDate(state.scheduledStartAt) : "позже"}` : "План принят"}
                            {state.acceptedAt ? <span className="font-normal" style={{ color: hub.textSubtle }}> {state.status === "scheduled" ? "· " : ""}{fmtDate(state.acceptedAt)}</span> : null}
                          </p>
                          {f.ownerAccepted && state.status === "running" && !demoActions ? (
                            <div className="mt-3 flex items-start justify-between gap-5 rounded-[14px] px-4 py-3.5" style={{ backgroundColor: "rgba(1,20,8,0.04)" }}>
                              <div className="min-w-0">
                                <p className="text-[15px] font-semibold" style={{ ...hubSans, color: hub.text }}>Агент делает шаги сам</p>
                                <p className="mt-0.5 text-[13.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
                                  {f.autopilot ? "Безопасные шаги плана (пауза, убрать из кампании, минус-фразы, пополнение в лимите) агент выполнит без вашей кнопки, если это разрешено в общих правилах. Остальные шаги вы подтверждаете сами." : "Сейчас каждый шаг программы вы подтверждаете кнопкой. Включите, чтобы безопасные шаги агент делал сам, в рамках общих правил."}
                                </p>
                              </div>
                              <AgentSwitch label="Агент делает шаги плана сам" checked={f.autopilot === true} disabled={busy === f.id} onChange={async (on) => {
                                setBusy(f.id);
                                const res = await setSellerHubPlanAutopilot(f.id, on);
                                if (res.ok) await load();
                                setBusy(null);
                              }} />
                            </div>
                          ) : null}
                          {state.reason ? <p className="text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>{state.reason}</p> : null}
                          {effectReport(st, state, state.current ?? {}).length > 0 ? (
                            (state.checkpoints ?? []).length === 0 && state.status === "running" ? (
                              <div className="mt-3">
                                <p className="text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>Исходные показатели на момент принятия плана. Сравнение «было → стало» появится после первой контрольной точки.</p>
                                <table className="mt-2 w-full text-[14px]" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
                                  <tbody>
                                    {effectReport(st, state, state.current ?? {}).map((r) => (
                                      <tr key={r.metric} className="border-t" style={{ borderColor: hub.borderSoft }}>
                                        <td className="py-2">{r.label}</td>
                                        <td className="py-2 text-right font-semibold">{r.before ?? "—"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <table className="mt-3 w-full text-[14px]" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
                                <thead>
                                  <tr style={{ color: hub.textSubtle }}>
                                    <th className="pb-2 text-left text-[12px] font-medium">Показатель</th>
                                    <th className="pb-2 text-right text-[12px] font-medium">Было</th>
                                    <th className="pb-2 text-right text-[12px] font-medium">Стало</th>
                                    <th className="pb-2 text-right text-[12px] font-medium">Изменение</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {effectReport(st, state, state.current ?? {}).map((r) => (
                                    <tr key={r.metric} className="border-t" style={{ borderColor: hub.borderSoft }}>
                                      <td className="py-2">{r.label}</td>
                                      <td className="py-2 text-right">{r.before ?? "—"}</td>
                                      <td className="py-2 text-right font-semibold">{r.after ?? "—"}</td>
                                      <td className="py-2 text-right font-semibold" style={{ color: r.better == null ? hub.textMuted : r.better ? hub.greenDark : hub.danger }}>
                                        {r.change == null ? "—" : `${r.change > 0 ? "+" : ""}${r.change}${r.changePct != null ? ` (${r.changePct > 0 ? "+" : ""}${r.changePct}%)` : ""}`}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )
                          ) : null}
                          {(state.checkpoints ?? []).map((c) => (
                            <p key={`${c.day}-${c.label}`} className="mt-1.5 text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                              День {c.day}, {c.label}: {c.guardBroken ? "нарушено ограничение" : c.looksMet === true ? "ожидания оправдались" : c.looksMet === false ? "ожидания пока не оправдались" : c.successMet ? "цель достигнута" : "данных для вывода мало"}
                            </p>
                          ))}
                          {f.actionNote ? <p className="mt-2 text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>Очередной шаг цены пока нельзя: {f.actionNote.replace(/^Предложение ИИ: /, "")}. Предложение появится само, когда ограничитель разрешит.</p> : null}
                        </div>
                      ) : null}
                        </>
                      ) : null}
                  {st && !f.ownerAccepted ? (
                    <div className="flex flex-wrap items-center justify-between gap-4 rounded-[16px] border bg-white px-5 py-4" style={{ borderColor: hub.border }}>
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold" style={{ ...hubSans, color: hub.text }}>Запустить позже</p>
                        <p className="mt-0.5 text-[13px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>Если дату не выбрать, стратегия стартует сразу после принятия.</p>
                      </div>
                      <HubDateTimePicker
                        value={startAtById[f.id] ?? ""}
                        min={new Date(Date.now() + 5 * 60_000)}
                        onChange={(next) => setStartAtById((prev) => ({ ...prev, [f.id]: next }))}
                      />
                    </div>
                  ) : null}
                    </div>
                  </div>
                  {st && (st.success.length > 0 || st.guards.length > 0 || st.fallback) ? (
                    <div className="border-t px-6 sm:px-12 py-10" style={{ borderColor: hub.border, backgroundColor: hub.canvas }}>
                      <div className="grid gap-5 md:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
                        {st.success.length > 0 ? (
                          <section className="rounded-[20px] px-6 py-5" style={{ backgroundColor: hub.greenSoft }}>
                            <h3 className="flex items-center gap-2.5 text-[16px] font-bold" style={{ ...hubSans, color: hub.greenDark }}>
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white"><Target className="h-4 w-4" strokeWidth={2} aria-hidden /></span>
                              Как поймём, что помогло
                            </h3>
                            <ul className="mt-3">
                              {st.success.map((c, i) => (
                                <li key={i} className="flex items-baseline justify-between gap-3 border-t py-2.5 text-[14px] first:border-t-0" style={{ ...hubSans, borderColor: "rgba(20, 135, 78, 0.18)", color: hub.text }}>
                                  <span style={{ color: hub.textMuted }}>{METRIC_LABEL[c.metric] ?? c.metric}</span>
                                  <span className="shrink-0 font-bold" style={hubNumeric}>{c.op === ">=" ? "не ниже" : "не выше"} {c.value}</span>
                                </li>
                              ))}
                            </ul>
                            {st.reviewAfterDays ? <p className="mt-2 text-[13px]" style={{ ...hubSans, color: hub.greenDark }}>Итог подведём через {st.reviewAfterDays} дн.</p> : null}
                          </section>
                        ) : null}
                        {st.guards.length > 0 ? (
                          <section className="rounded-[20px] px-6 py-5" style={{ backgroundColor: hub.warnSoft }}>
                            <h3 className="flex items-center gap-2.5 text-[16px] font-bold" style={{ ...hubSans, color: hub.warn }}>
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white"><ShieldAlert className="h-4 w-4" strokeWidth={2} aria-hidden /></span>
                              Не должно ухудшиться
                            </h3>
                            <ul className="mt-3">
                              {st.guards.map((c, i) => (
                                <li key={i} className="flex items-baseline justify-between gap-3 border-t py-2.5 text-[14px] first:border-t-0" style={{ ...hubSans, borderColor: "rgba(160, 110, 10, 0.2)", color: hub.text }}>
                                  <span style={{ color: hub.textMuted }}>{METRIC_LABEL[c.metric] ?? c.metric}</span>
                                  <span className="shrink-0 font-bold" style={hubNumeric}>{c.op === ">=" ? "не ниже" : "не выше"} {c.value}</span>
                                </li>
                              ))}
                            </ul>
                            <p className="mt-2 text-[13px]" style={{ ...hubSans, color: hub.warn }}>Если нарушится, план остановится.</p>
                          </section>
                        ) : null}
                        {st.fallback ? (
                          <section className="rounded-[20px] border bg-white px-6 py-5" style={{ borderColor: hub.borderCard }}>
                            <h3 className="flex items-center gap-2.5 text-[16px] font-bold" style={{ ...hubSans, color: hub.text }}>
                              <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: hub.surfaceMuted }}><LifeBuoy className="h-4 w-4" strokeWidth={2} aria-hidden /></span>
                              Если не поможет
                            </h3>
                            <ul className="mt-3 space-y-2.5">
                              {whatParts(st.fallback).map((part, i) => (
                                <li key={i} className="flex gap-3 text-pretty text-[14px] leading-[1.55] [overflow-wrap:anywhere]" style={{ ...hubSans, color: i === 0 ? hub.text : hub.textMuted, fontWeight: i === 0 ? 600 : 400 }}>
                                  <span className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: hub.textSubtle }} aria-hidden />
                                  {part}
                                </li>
                              ))}
                            </ul>
                          </section>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
                    {actionBlock ? (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end px-10 pb-6">
                      <div className="pointer-events-auto flex items-center gap-2 rounded-[22px] bg-white p-2.5 shadow-[0_22px_56px_-14px_rgba(1,20,8,0.4),0_0_0_1px_rgba(1,20,8,0.06)] [&>div]:!flex [&>div]:!w-auto [&>div]:!flex-row [&>div]:items-center [&_.grid]:!flex [&_button]:!w-auto">
                        {actionBlock}
                      </div>
                    </div>
                    ) : null}
                  </div>
                </div>,
                document.body,
              ) : null}
              {confirming
                ? createPortal(
                    <StrategyConfirm item={item} titleByNm={titleByNm} startAt={startAtById[f.id]} busy={busy === f.id} onConfirm={() => void doAccept()} onClose={() => setConfirming(false)} />,
                    document.body,
                  )
                : null}
            </li>
          );
}

export function HubAiFindings(params: AiFindingsParams) {
  const ctx = useAiFindings(params);
  const { items } = ctx;
  const { chatId } = params;
  const [showAll, setShowAll] = useState(false);
  if (items.length === 0) return null;
  const planned = items.filter((i) => i.finding?.strategy);
  const programActions = planned.reduce((n, i) => n + planBrief(i.finding!.strategy!).program.length, 0);
  const humanActions = planned.reduce((n, i) => n + planBrief(i.finding!.strategy!).humanSteps, 0);
  const shown = showAll || chatId ? items : items.slice(0, 3);

  return (
    <section>
      <div className="mb-1 flex items-center gap-2.5">
        <HubBadge tone="accent">ИИ</HubBadge>
        <h2 className="text-[18px] font-semibold tracking-[-0.01em]" style={{ ...hubSans, color: hub.text }}>
          {chatId ? "Планы по вашей задаче" : "Что заметил ИИ"}
        </h2>
        <span className="text-[14px] font-medium" style={{ ...hubSans, ...hubNumeric, color: hub.textSubtle }}>{items.length}</span>
      </div>
      <p className="max-w-[68ch] text-[13px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
        {chatId && planned.length > 0
          ? `Решение подготовлено для товаров: ${planned.length} (один план на один товар). Всего действий программы по вашей кнопке: ${programActions}, ваших шагов: ${humanActions}. Ничего не выполнится, пока вы не примете план и не нажмёте «Выполнить».`
          : ""}
      </p>
      <ul className="mt-4 space-y-3">
        {shown.map((item) => (
          <AiFindingCard key={item.key} item={item} ctx={ctx} />
        ))}
      </ul>
      {!chatId && items.length > 3 ? (
        <div className="mt-3">
          <HubButton size="sm" variant="secondary" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Свернуть" : `Показать все (${items.length})`}
          </HubButton>
        </div>
      ) : null}
    </section>
  );
}
