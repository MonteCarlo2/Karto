import type { AiFeedItem } from "@/lib/seller-hub/client-api";
import type { Strategy, StrategyState, StrategyStep } from "@/lib/seller-hub/agent/strategy";
import type { Order } from "./types";

/**
 * Примеры для кнопки «Посмотреть пример»: так страница «Поручения» выглядит, когда принято несколько планов и создано несколько поручений.
 * Данные выдуманные и помечаются «Пример», в базу они не попадают.
 */

const DAY = 24 * 3_600_000;

const step = (text: string, by: "human" | "program", day: number, when: string, action?: StrategyStep["action"]): StrategyStep => ({ step: text, by, day, when, action: action ?? null });
const raise: StrategyStep["action"] = { type: "price", direction: "raise", stepPercent: 1, reason: "пример" };
const bid: StrategyStep["action"] = { type: "ads_bid", campaignId: "1", direction: "lower", stepPercent: 10, reason: "пример" };

const strategy = (): Strategy => ({
  goal: "Поднять маржу до 20% и не потерять заказы",
  steps: [
    step("Проверить себестоимость и комиссию в отчёте", "human", 0, "Сразу"),
    step("Повысить цену на 1%", "program", 0, "Сразу", raise),
    step("Повысить цену ещё на 1%, если заказы не упали", "program", 3, "Через 3 дня", raise),
    step("Если маржа не выросла, снизить ставку рекламы на 10%", "program", 6, "Через 6 дней", bid),
    step("Подвести итог и решить, что дальше", "human", 9, "Через 9 дней"),
  ],
  checks: [
    { day: 3, label: "Первая проверка: заказы не упали", look: [{ metric: "orders_28d", expect: "hold" }, { metric: "margin_pct", expect: "up" }] },
    { day: 6, label: "Вторая проверка: маржа растёт", look: [{ metric: "margin_pct", expect: "up" }] },
  ],
  success: [
    { metric: "margin_pct", op: ">=", value: 20 },
    { metric: "orders_28d", op: ">=", value: 12 },
  ],
  guards: [{ metric: "orders_28d", op: ">=", value: 8 }],
  reviewAfterDays: 9,
  failNote: "Если заказы упали ниже 8 за 28 дней, план останавливается: цена поднялась слишком сильно.",
  fallback: "Вернуть прежнюю цену и пересмотреть себестоимость: возможно, дело не в цене, а в комиссии или логистике.",
});

/** Примеры планов в том же виде, в каком их отдаёт лента задач: карточка и окно плана выглядят как в разделе «Задачи». */
export function sampleFeed(nowMs: number, nmIds: string[] = []): AiFeedItem[] {
  const iso = (d: number) => new Date(nowMs - d * DAY).toISOString();
  let n = 0;
  const item = (id: string, title: string, state: StrategyState, evidence: Array<{ key: string; value: number }>, kind: "money" | "orders_drop" | "ads" = "money"): AiFeedItem => {
    const nm = nmIds.length > 0 ? nmIds[n++ % nmIds.length]! : null;
    return {
    key: `finding:sample-${id}`,
    nmId: nm,
    source: "ai",
    title,
    severity: "important",
    taskIds: [],
    taskTitles: [],
    kindLabel: null,
    finding: {
      id: `sample-${id}`,
      nmId: nm,
      kind,
      severity: "important",
      title,
      what: "Товар продаётся с низкой маржой: план шаг за шагом поднимает цену и проверяет, что заказы не падают.",
      whyNow: "Это пример: данные выдуманные.",
      humanAdvice: "",
      evidence,
      second: "agree",
      secondReason: "",
      action: null,
      origin: "chat",
      ownerAccepted: true,
      strategy: strategy(),
      strategyState: state,
    },
  };
  };
  return [
    item("run", "Поднять маржу до 20%", { status: "running", acceptedAt: iso(4), baseline: { margin_pct: -16.5, orders_28d: 12 }, current: { margin_pct: -14.1, orders_28d: 12 }, doneSteps: [1], humanSteps: { "0": { status: "done", at: iso(4) } } }, [{ key: "margin_pct", value: -14.1 }, { key: "orders_28d", value: 12 }]),
    item("worse", "Подстегнуть продажи", { status: "running", acceptedAt: iso(2), baseline: { margin_pct: 27, orders_28d: 38 }, current: { margin_pct: 26, orders_28d: 35 }, doneSteps: [], humanSteps: {} }, [{ key: "margin_pct", value: 26 }, { key: "orders_28d", value: 35 }], "orders_drop"),
    item("worked", "Вывести товар в плюс", { status: "worked", acceptedAt: iso(11), resolvedAt: iso(1), baseline: { margin_pct: -6.1, orders_28d: 14 }, finalMetrics: { margin_pct: 21.3, orders_28d: 16 }, doneSteps: [1, 2], humanSteps: { "0": { status: "done", at: iso(11) }, "4": { status: "done", at: iso(2) } } }, [{ key: "margin_pct", value: 21.3 }, { key: "orders_28d", value: 16 }]),
    item("failed", "Сократить убыток", { status: "not_worked", reason: "срок вышел, маржа выросла только до 9%", acceptedAt: iso(12), resolvedAt: iso(2), baseline: { margin_pct: -3, orders_28d: 31 }, finalMetrics: { margin_pct: 9, orders_28d: 22 }, doneSteps: [1, 2, 3], humanSteps: { "0": { status: "done", at: iso(12) }, "4": { status: "done", at: iso(3) } } }, [{ key: "margin_pct", value: 9 }, { key: "orders_28d", value: 22 }]),
  ];
}

export function sampleOrders(nowMs: number): Order[] {
  const at = (h: number) => new Date(nowMs + h * 3_600_000).toISOString();
  const base = { createdFrom: "chat" as const, createdAt: new Date(nowMs - 3 * DAY).toISOString(), lastRunAt: null, lastStatus: null, lastSummary: null };
  return [
    { ...base, id: "sample-o1", title: "Итоги недели", kind: "remind", params: { text: "Посмотреть сводку: продажи, реклама, остатки" }, schedule: { type: "weekly", time: "09:30", weekdays: [1] }, limits: {}, mode: "ask", status: "active", nextRunAt: at(60), runsCount: 2, lastRunAt: new Date(nowMs - 3 * DAY).toISOString(), lastStatus: "reminder" },
    { ...base, id: "sample-o2", title: "Пополнять рекламу «Ведро 10 л»", kind: "ads_deposit", params: { campaignId: "1", belowRub: 500, topUpRub: 2000 }, schedule: { type: "check", everyMinutes: 60 }, limits: { maxPerDayRub: 6000 }, mode: "act", status: "active", nextRunAt: null, runsCount: 5, lastRunAt: new Date(nowMs - 20 * 3_600_000).toISOString(), lastStatus: "done" },
    { ...base, id: "sample-o3", title: "Снижать цену по шагам", kind: "price_step", params: { nmIds: ["1", "2"], pct: 2, direction: "down" }, schedule: { type: "daily", time: "10:00", maxRuns: 7 }, limits: { minBuyerPriceRub: 1400 }, mode: "act", status: "paused", nextRunAt: null, runsCount: 3 },
    { ...base, id: "sample-o4", title: "Мало заказов", kind: "when_orders", params: { belowOrders: 20, days: 3, then: "notify", text: "Заказов меньше 20 в сутки уже 3 дня подряд" }, schedule: { type: "check", everyMinutes: 180 }, limits: {}, mode: "ask", status: "active", nextRunAt: null, runsCount: 0 },
  ];
}
