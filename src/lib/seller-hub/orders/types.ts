/**
 * Поручения агенту: что делать, когда, в каких рамках и как действовать (самому или только напомнить).
 * Один и тот же вид у поручения из чата, из шаблона и из формы. Исполняются фоном (executor.ts), без открытого кабинета.
 */

import { WB_ADS_MIN_DEPOSIT_RUB } from "@/lib/seller-hub/wb-rules";

export const ORDER_KINDS = ["remind", "ads_deposit", "price_step", "when_orders"] as const;
export type OrderKind = (typeof ORDER_KINDS)[number];
export const isOrderKind = (v: unknown): v is OrderKind => typeof v === "string" && (ORDER_KINDS as readonly string[]).includes(v);

export type OrderSchedule =
  | { type: "once"; at: string }
  | { type: "every"; everyHours: number; startAt?: string; until?: string; maxRuns?: number }
  | { type: "daily"; time: string; until?: string; maxRuns?: number }
  | { type: "weekly"; time: string; weekdays: number[]; until?: string; maxRuns?: number }
  /** Условие: проверять каждые N минут, действовать, когда оно наступило (например, остаток бюджета ниже порога). */
  | { type: "check"; everyMinutes: number; until?: string };

export type RemindParams = { text: string };
export type AdsDepositParams = { campaignId: string; belowRub: number; topUpRub: number };
export type PriceStepParams = { nmIds: string[]; pct: number; direction: "down" | "up" };
/** Сценарий: если заказов за сутки меньше N несколько дней подряд, сообщить владельцу или пополнить рекламу. */
export type WhenOrdersParams = { belowOrders: number; days: number; then: "notify" | "deposit"; text?: string; campaignId?: string; topUpRub?: number };

export type OrderLimits = {
  /** Пополнение: не больше за сутки по всем кампаниям поручения, ₽. */
  maxPerDayRub?: number;
  /** Цена: пол цены для покупателя, ₽. Ниже агент не опустит. Обязателен для снижения. */
  minBuyerPriceRub?: number;
  /** Цена: потолок цены для покупателя, ₽ (для повышения). */
  maxBuyerPriceRub?: number;
};

export type OrderMode = "act" | "ask";
export type OrderStatus = "active" | "paused" | "done";

export type Order = {
  id: string;
  title: string;
  kind: OrderKind;
  params: RemindParams | AdsDepositParams | PriceStepParams | WhenOrdersParams;
  schedule: OrderSchedule;
  limits: OrderLimits;
  mode: OrderMode;
  status: OrderStatus;
  createdFrom: "chat" | "form" | "template";
  nextRunAt: string | null;
  lastRunAt: string | null;
  runsCount: number;
  lastStatus: string | null;
  lastSummary: string | null;
  createdAt: string;
};

export type OrderRun = { id: string; orderId: string; orderTitle?: string; at: string; status: "done" | "simulated" | "skipped" | "failed" | "reminder"; summary: string; read: boolean };

export type OrderInput = { title: string; kind: OrderKind; params: Order["params"]; schedule: OrderSchedule; limits: OrderLimits; mode: OrderMode; createdFrom?: Order["createdFrom"] };

export const KIND_LABEL: Record<OrderKind, string> = {
  remind: "Напомнить",
  ads_deposit: "Пополнять рекламу",
  price_step: "Менять цену по шагам",
  when_orders: "Сценарий по заказам",
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MSK_MS = 3 * 3_600_000;
const isIso = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
const int = (v: unknown, lo: number, hi: number): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : null;
};

export const WEEKDAY_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

/** Расписание: приводит к допустимому виду или возвращает понятную причину. */
export function parseSchedule(raw: unknown): { ok: true; value: OrderSchedule } | { ok: false; error: string } {
  const s = (raw ?? {}) as Record<string, unknown>;
  // «Работает N дней»: конец срока считается от текущего момента (конец N-х московских суток).
  const days = s.durationDays == null ? null : int(s.durationDays, 1, 365);
  const until = days != null ? new Date(Math.floor((Date.now() + MSK_MS) / 86_400_000) * 86_400_000 + days * 86_400_000 - MSK_MS).toISOString() : isIso(s.until) ? s.until : undefined;
  const maxRuns = s.maxRuns == null ? undefined : int(s.maxRuns, 1, 365) ?? undefined;
  switch (s.type) {
    case "once":
      return isIso(s.at) ? { ok: true, value: { type: "once", at: s.at } } : { ok: false, error: "Укажите дату и время запуска" };
    case "every": {
      const h = int(s.everyHours, 1, 24 * 30);
      if (h == null) return { ok: false, error: "Интервал: от 1 часа до 30 дней" };
      return { ok: true, value: { type: "every", everyHours: h, ...(isIso(s.startAt) ? { startAt: s.startAt } : {}), ...(until ? { until } : {}), ...(maxRuns ? { maxRuns } : {}) } };
    }
    case "daily":
      return typeof s.time === "string" && TIME_RE.test(s.time) ? { ok: true, value: { type: "daily", time: s.time, ...(until ? { until } : {}), ...(maxRuns ? { maxRuns } : {}) } } : { ok: false, error: "Время запуска в формате ЧЧ:ММ" };
    case "weekly": {
      const days = Array.isArray(s.weekdays) ? [...new Set((s.weekdays as unknown[]).map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort() : [];
      if (days.length === 0) return { ok: false, error: "Выберите хотя бы один день недели" };
      if (typeof s.time !== "string" || !TIME_RE.test(s.time)) return { ok: false, error: "Время запуска в формате ЧЧ:ММ" };
      return { ok: true, value: { type: "weekly", time: s.time, weekdays: days, ...(until ? { until } : {}), ...(maxRuns ? { maxRuns } : {}) } };
    }
    case "check": {
      const m = int(s.everyMinutes, 15, 24 * 60);
      return m == null ? { ok: false, error: "Проверять можно раз в 15 минут и реже, но не реже раза в сутки" } : { ok: true, value: { type: "check", everyMinutes: m, ...(until ? { until } : {}) } };
    }
    default:
      return { ok: false, error: "Выберите, когда выполнять поручение" };
  }
}

/** Полная проверка поручения. Деньги и цены требуют рамок: без них поручение не создаётся. */
export function validateOrderInput(raw: unknown): { ok: true; value: OrderInput } | { ok: false; error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title.trim().slice(0, 160) : "";
  if (!title) return { ok: false, error: "Назовите поручение" };
  if (!isOrderKind(r.kind)) return { ok: false, error: "Неизвестный вид поручения" };
  const mode: OrderMode = r.mode === "act" ? "act" : "ask";
  const sched = parseSchedule(r.schedule);
  if (!sched.ok) return sched;
  const p = (r.params ?? {}) as Record<string, unknown>;
  const l = (r.limits ?? {}) as Record<string, unknown>;
  const createdFrom = r.createdFrom === "chat" || r.createdFrom === "template" ? r.createdFrom : "form";

  if (r.kind === "remind") {
    const text = typeof p.text === "string" ? p.text.trim().slice(0, 400) : "";
    if (!text) return { ok: false, error: "Напишите, о чём напомнить" };
    if (sched.value.type === "check") return { ok: false, error: "Напоминание идёт по времени, а не по условию" };
    return { ok: true, value: { title, kind: "remind", params: { text }, schedule: sched.value, limits: {}, mode: "ask", createdFrom } };
  }

  if (r.kind === "ads_deposit") {
    const campaignId = typeof p.campaignId === "string" || typeof p.campaignId === "number" ? String(p.campaignId).trim() : "";
    const below = int(p.belowRub, 100, 100000);
    const topUp = int(p.topUpRub, WB_ADS_MIN_DEPOSIT_RUB, 100000);
    if (!campaignId) return { ok: false, error: "Выберите кампанию" };
    if (below == null || topUp == null) return { ok: false, error: `Порог остатка: от 100 ₽, сумма пополнения: от ${WB_ADS_MIN_DEPOSIT_RUB.toLocaleString("ru-RU")} до 100 000 ₽ (минимум пополнения у Wildberries)` };
    const cap = int(l.maxPerDayRub, 100, 200000);
    if (cap == null) return { ok: false, error: "Укажите, сколько можно пополнить за сутки: деньги без лимита не двигаем" };
    if (cap < topUp) return { ok: false, error: "Лимит за сутки меньше одного пополнения" };
    if (sched.value.type !== "check" && sched.value.type !== "every") return { ok: false, error: "Пополнение проверяется регулярно: выберите «проверять каждые…»" };
    return { ok: true, value: { title, kind: "ads_deposit", params: { campaignId, belowRub: below, topUpRub: topUp }, schedule: sched.value, limits: { maxPerDayRub: cap }, mode, createdFrom } };
  }

  if (r.kind === "when_orders") {
    const below = int(p.belowOrders, 1, 10000);
    const days = int(p.days, 1, 14);
    if (below == null) return { ok: false, error: "Укажите, меньше скольки заказов в сутки считать мало" };
    if (days == null) return { ok: false, error: "Сколько дней подряд: от 1 до 14" };
    if (sched.value.type !== "check" && sched.value.type !== "daily") return { ok: false, error: "Сценарий проверяется регулярно: каждый день в выбранное время или каждые несколько часов" };
    if (p.then === "deposit") {
      const campaignId = typeof p.campaignId === "string" || typeof p.campaignId === "number" ? String(p.campaignId).trim() : "";
      const topUp = int(p.topUpRub, WB_ADS_MIN_DEPOSIT_RUB, 100000);
      const cap = int(l.maxPerDayRub, 100, 200000);
      if (!campaignId) return { ok: false, error: "Выберите кампанию для пополнения" };
      if (topUp == null) return { ok: false, error: `Сумма пополнения: от ${WB_ADS_MIN_DEPOSIT_RUB.toLocaleString("ru-RU")} до 100 000 ₽ (минимум пополнения у Wildberries)` };
      if (cap == null) return { ok: false, error: "Укажите, сколько можно пополнить за сутки: деньги без лимита не двигаем" };
      if (cap < topUp) return { ok: false, error: "Лимит за сутки меньше одного пополнения" };
      return { ok: true, value: { title, kind: "when_orders", params: { belowOrders: below, days, then: "deposit", campaignId, topUpRub: topUp }, schedule: sched.value, limits: { maxPerDayRub: cap }, mode, createdFrom } };
    }
    const text = typeof p.text === "string" && p.text.trim() ? p.text.trim().slice(0, 400) : `Заказов меньше ${below} в сутки уже ${days} дн. подряд`;
    return { ok: true, value: { title, kind: "when_orders", params: { belowOrders: below, days, then: "notify", text }, schedule: sched.value, limits: {}, mode: "ask", createdFrom } };
  }

  // price_step
  const nmIds = Array.isArray(p.nmIds) ? [...new Set((p.nmIds as unknown[]).map((x) => String(x).trim()).filter((x) => /^\d{4,12}$/.test(x)))].slice(0, 50) : [];
  if (nmIds.length === 0) return { ok: false, error: "Выберите хотя бы один товар" };
  const pct = int(p.pct, 1, 20);
  if (pct == null) return { ok: false, error: "Шаг цены: от 1 до 20%" };
  const direction = p.direction === "up" ? "up" : "down";
  const floor = l.minBuyerPriceRub == null ? null : int(l.minBuyerPriceRub, 1, 10_000_000);
  const ceil = l.maxBuyerPriceRub == null ? null : int(l.maxBuyerPriceRub, 1, 10_000_000);
  if (direction === "down" && floor == null) return { ok: false, error: "Для снижения цены укажите нижнюю границу: ниже неё агент цену не опустит" };
  if (direction === "up" && ceil == null) return { ok: false, error: "Для повышения цены укажите верхнюю границу" };
  if (sched.value.type === "check") return { ok: false, error: "Цена меняется по расписанию: ежедневно, по дням недели или через интервал" };
  return { ok: true, value: { title, kind: "price_step", params: { nmIds, pct, direction }, schedule: sched.value, limits: { ...(floor != null ? { minBuyerPriceRub: floor } : {}), ...(ceil != null ? { maxBuyerPriceRub: ceil } : {}) }, mode, createdFrom } };
}

const MSK = 3 * 3_600_000;
const pad = (n: number) => String(n).padStart(2, "0");

/** «ежедневно в 10:00», «по пн, ср в 09:30», «каждые 6 ч»: короткая фраза для списка. */
export function scheduleText(s: OrderSchedule): string {
  const end = "until" in s && s.until ? `, до ${new Date(Date.parse(s.until) - 1 + MSK).toISOString().slice(0, 10).split("-").reverse().join(".")}` : "";
  const cnt = "maxRuns" in s && s.maxRuns ? `, ${s.maxRuns} раз` : "";
  switch (s.type) {
    case "once": {
      const d = new Date(Date.parse(s.at) + MSK);
      return `один раз ${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)} в ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    }
    case "every":
      return `${s.everyHours >= 24 && s.everyHours % 24 === 0 ? (s.everyHours === 24 ? "каждый день" : `каждые ${s.everyHours / 24} дн.`) : `каждые ${s.everyHours} ч`}${cnt}${end}`;
    case "daily":
      return `ежедневно в ${s.time}${cnt}${end}`;
    case "weekly":
      return `по ${s.weekdays.map((d) => WEEKDAY_SHORT[d - 1]).join(", ")} в ${s.time}${cnt}${end}`;
    case "check":
      return `проверка каждые ${s.everyMinutes >= 60 ? `${Math.round(s.everyMinutes / 60)} ч` : `${s.everyMinutes} мин`}${end}`;
  }
}

/** Что именно сделает поручение, простыми словами. */
export function orderSummary(o: Pick<Order, "kind" | "params" | "limits" | "mode">): string {
  if (o.kind === "remind") return `Напомнить: «${(o.params as RemindParams).text}»`;
  if (o.kind === "ads_deposit") {
    const p = o.params as AdsDepositParams;
    return `Когда остаток рекламы ниже ${p.belowRub} ₽, пополнить на ${p.topUpRub} ₽${o.limits.maxPerDayRub ? `, не больше ${o.limits.maxPerDayRub} ₽ за сутки` : ""}${o.mode === "ask" ? " (только напомнить)" : ""}`;
  }
  if (o.kind === "when_orders") {
    const w = o.params as WhenOrdersParams;
    const cond = `Если заказов меньше ${w.belowOrders} в сутки ${w.days} ${w.days === 1 ? "день" : w.days < 5 ? "дня" : "дней"} подряд`;
    return w.then === "deposit" ? `${cond}, ${o.mode === "act" ? "пополнить" : "напомнить пополнить"} рекламу на ${w.topUpRub} ₽${o.limits.maxPerDayRub ? `, не больше ${o.limits.maxPerDayRub} ₽ за сутки` : ""}` : `${cond}, сообщить мне`;
  }
  const p = o.params as PriceStepParams;
  const bound = p.direction === "down" ? `не ниже ${o.limits.minBuyerPriceRub} ₽` : `не выше ${o.limits.maxBuyerPriceRub} ₽`;
  return `${p.direction === "down" ? "Снижать" : "Повышать"} цену на ${p.pct}% за раз у ${p.nmIds.length} ${p.nmIds.length === 1 ? "товара" : "товаров"}, ${bound}${o.mode === "ask" ? " (только напомнить)" : ""}`;
}
