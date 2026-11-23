import type { AdsDepositParams, Order, OrderKind, PriceStepParams, RemindParams, WhenOrdersParams } from "./types";

/**
 * Форма поручения без интерфейса: значения по умолчанию, перевод поручения в форму и формы в данные для сохранения.
 * Здесь же живут шаблоны (templates.ts), поэтому их можно проверять тестами: каждый шаблон обязан превращаться в допустимое поручение.
 */

export type SchedType = "once" | "daily" | "weekly" | "every";

export type OrderForm = {
  id?: string;
  title: string;
  kind: OrderKind;
  text: string;
  campaignId: string;
  belowRub: number;
  topUpRub: number;
  maxPerDayRub: number;
  checkMinutes: number;
  nmIds: string[];
  pct: number;
  direction: "down" | "up";
  boundRub: number;
  schedType: SchedType;
  onceAt: string;
  time: string;
  weekdays: number[];
  everyHours: number;
  maxRuns: number;
  mode: "act" | "ask";
  belowOrders: number;
  orderDays: number;
  then: "notify" | "deposit";
  thenText: string;
  /** Для проверок по условию (реклама, заказы): сколько дней работать; 0 — пока владелец не остановит. */
  workDays: number;
  /** Сценарий по заказам: проверять в выбранное время каждый день или несколько раз в день. */
  checkAt: "time" | "interval";
};

export const MSK = 3 * 3_600_000;
export const pad = (n: number) => String(n).padStart(2, "0");
const toLocalMsk = (iso: string) => new Date(Date.parse(iso) + MSK).toISOString().slice(0, 16);
const fromLocalMsk = (v: string) => new Date(`${v}:00+03:00`).toISOString();
export const inMsk = (offsetMs: number, time?: string) => {
  const d = new Date(Date.now() + MSK + offsetMs);
  const day = d.toISOString().slice(0, 10);
  return `${day}T${time ?? `${pad(d.getUTCHours())}:${pad(Math.ceil(d.getUTCMinutes() / 5) * 5 % 60)}`}`;
};
export const defaultOnce = () => inMsk(24 * 3_600_000, "10:00");

export const BASE_FORM: OrderForm = { title: "", kind: "remind", text: "", campaignId: "", belowRub: 500, topUpRub: 2000, maxPerDayRub: 6000, checkMinutes: 60, nmIds: [], pct: 5, direction: "down", boundRub: 0, schedType: "daily", onceAt: "", time: "10:00", weekdays: [1], everyHours: 24, maxRuns: 0, mode: "act", belowOrders: 20, orderDays: 3, then: "notify", thenText: "", workDays: 0, checkAt: "time" };

export function formFromOrder(o: Order): OrderForm {
  const f: OrderForm = { ...BASE_FORM, id: o.id, title: o.title, kind: o.kind, mode: o.mode, onceAt: defaultOnce() };
  if (o.kind === "remind") f.text = (o.params as RemindParams).text;
  if (o.kind === "ads_deposit") {
    const p = o.params as AdsDepositParams;
    Object.assign(f, { campaignId: p.campaignId, belowRub: p.belowRub, topUpRub: p.topUpRub, maxPerDayRub: o.limits.maxPerDayRub ?? 6000 });
  }
  if (o.kind === "when_orders") {
    const w = o.params as WhenOrdersParams;
    Object.assign(f, { belowOrders: w.belowOrders, orderDays: w.days, then: w.then, thenText: w.text ?? "", campaignId: w.campaignId ?? "", topUpRub: w.topUpRub ?? 2000, maxPerDayRub: o.limits.maxPerDayRub ?? 6000 });
  }
  if (o.kind === "price_step") {
    const p = o.params as PriceStepParams;
    Object.assign(f, { nmIds: p.nmIds, pct: p.pct, direction: p.direction, boundRub: (p.direction === "down" ? o.limits.minBuyerPriceRub : o.limits.maxBuyerPriceRub) ?? 0 });
  }
  const s = o.schedule;
  if ("until" in s && s.until) {
    const left = Math.max(1, Math.ceil((Date.parse(s.until) - Date.now()) / 86_400_000));
    f.workDays = left <= 7 ? 7 : left <= 14 ? 14 : 30;
  }
  if (s.type === "check") {
    f.checkMinutes = s.everyMinutes;
    f.checkAt = "interval";
  } else if (o.kind === "when_orders" && s.type === "daily") {
    f.checkAt = "time";
    f.time = s.time;
  } else {
    f.schedType = s.type;
    if (s.type === "once") f.onceAt = toLocalMsk(s.at);
    if (s.type === "daily" || s.type === "weekly") f.time = s.time;
    if (s.type === "weekly") f.weekdays = s.weekdays;
    if (s.type === "every") f.everyHours = s.everyHours;
    if ("maxRuns" in s && s.maxRuns) f.maxRuns = s.maxRuns;
  }
  return f;
}

export function scheduleFromForm(f: OrderForm): Record<string, unknown> {
  const duration = f.workDays > 0 ? { durationDays: f.workDays } : {};
  if (f.kind === "when_orders" && f.checkAt === "time") return { type: "daily", time: f.time, ...duration };
  if (f.kind === "ads_deposit" || f.kind === "when_orders") return { type: "check", everyMinutes: f.checkMinutes, ...duration };
  if (f.schedType === "once") return { type: "once", at: f.onceAt ? fromLocalMsk(f.onceAt) : "" };
  if (f.schedType === "daily") return { type: "daily", time: f.time, ...(f.maxRuns ? { maxRuns: f.maxRuns } : {}) };
  if (f.schedType === "weekly") return { type: "weekly", time: f.time, weekdays: f.weekdays, ...(f.maxRuns ? { maxRuns: f.maxRuns } : {}) };
  return { type: "every", everyHours: f.everyHours, ...(f.maxRuns ? { maxRuns: f.maxRuns } : {}) };
}

export function inputFromForm(f: OrderForm): unknown {
  const base = { title: f.title, kind: f.kind, schedule: scheduleFromForm(f), mode: f.mode, createdFrom: f.id ? "form" : "template" };
  if (f.kind === "remind") return { ...base, params: { text: f.text }, limits: {} };
  if (f.kind === "ads_deposit") return { ...base, params: { campaignId: f.campaignId, belowRub: f.belowRub, topUpRub: f.topUpRub }, limits: { maxPerDayRub: f.maxPerDayRub } };
  if (f.kind === "when_orders") return { ...base, params: { belowOrders: f.belowOrders, days: f.orderDays, then: f.then, text: f.thenText || undefined, campaignId: f.then === "deposit" ? f.campaignId : undefined, topUpRub: f.then === "deposit" ? f.topUpRub : undefined }, limits: f.then === "deposit" ? { maxPerDayRub: f.maxPerDayRub } : {} };
  return { ...base, params: { nmIds: f.nmIds, pct: f.pct, direction: f.direction }, limits: f.direction === "down" ? { minBuyerPriceRub: f.boundRub || undefined } : { maxBuyerPriceRub: f.boundRub || undefined } };
}

