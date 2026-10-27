import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupSignals, parseSolver, selectGroups, signalFingerprint, solverPayload, type SignalTask } from "./ai-solver";

const task = (taskId: string, over: Partial<SignalTask & { score: number }> = {}): SignalTask & { score: number } => ({
  taskId,
  nmId: "1",
  type: "TASK_LOSS",
  title: "Убыточная цена",
  severity: "important",
  description: "d",
  reason: "r",
  recommendation: "rec",
  evidence: { margin_pct: -15.3, orders: 15 },
  score: 50,
  ...over,
});
const facts = new Map([["1", { orders_28d: 15, margin_pct: -15.3, price_buyer: 996, break_even: 1214, cart_pct: 4 }]]);
const profile = { sku_total: 44, orders_28d_total: 300 };
const strategy = {
  goal: "Выйти из убытка и сохранить заказы не ниже 10",
  steps: [
    { day: 0, when: "сразу", by: "human", step: "Проверить себестоимость", action: null },
    { day: 0, when: "сразу", by: "program", step: "Поднять цену на ступень", action: { type: "price", direction: "raise", stepPercent: 2, reason: "цена ниже безубыточной" } },
    { day: 3, when: "через 3 дня", by: "program", step: "Ещё ступень", action: { type: "price", direction: "raise", stepPercent: 2, reason: "цена ниже безубыточной" } },
  ],
  checks: [{ day: 7, label: "эффект цены", look: [{ metric: "margin_pct", expect: "up" }, { metric: "orders_28d", expect: "hold" }] }],
  success: [{ metric: "margin_pct", op: ">=", value: 0 }, { metric: "orders_28d", op: ">=", value: 10 }],
  guards: [{ metric: "orders_28d", op: ">=", value: 8 }],
  reviewAfterDays: 14,
  failNote: "заказы упали",
  fallback: "Если заказы упали, вернуть цену и искать другой источник маржи",
};
const sol = (over: Record<string, unknown> = {}) => ({
  nmId: "1",
  verdict: "problem",
  kind: "money",
  title: "Продаёте в минус",
  diagnosis: "d",
  evidence: [{ key: "margin_pct", value: -15.3 }],
  problems: [{ taskId: "t1", verdict: "problem", note: "убыток" }, { taskId: "t2", verdict: "problem", note: "излишек запаса" }],
  ...strategy,
  ...over,
});
const reply = (solutions: unknown[]) => "```json\n" + JSON.stringify({ solutions }) + "\n```";
const groups = (...t: Array<SignalTask & { score: number }>) => groupSignals(t);

describe("ИИ-решатель: решение на товар", () => {
  it("несколько сигналов одного товара собираются в одно решение со стратегией", () => {
    const g = groups(task("t1"), task("t2", { type: "TASK_EXCESS_STOCK", title: "Излишек запаса" }));
    assert.equal(g.length, 1);
    const r = parseSolver(reply([sol()]), g, facts, profile);
    assert.equal(r.items.length, 1);
    const s = r.items[0]!;
    assert.deepEqual(s.taskIds, ["t1", "t2"]);
    assert.equal(s.problems.length, 2);
    assert.equal(s.strategy?.steps.filter((p) => p.action).length, 2);
    assert.equal(s.strategy?.success.length, 2);
    assert.equal(s.strategy?.guards.length, 1);
    assert.equal(s.strategy?.checks[0]?.day, 7);
  });
  it("числа сверяются с фактами товара, числами алгоритмов и профилем магазина (с приставкой store_ тоже)", () => {
    const g = groups(task("t1"));
    assert.equal(parseSolver(reply([sol({ evidence: [{ key: "orders", value: 15 }] })]), g, facts, profile).items.length, 1);
    assert.equal(parseSolver(reply([sol({ evidence: [{ key: "store.sku_total", value: 44 }] })]), g, facts, profile).items.length, 1);
    const bad = parseSolver(reply([sol({ evidence: [{ key: "margin_pct", value: -3 }] })]), g, facts, profile);
    assert.equal(bad.items.length, 0);
    assert.equal(bad.dropped, 1);
  });
  it("число с неизвестным названием убирается, а не губит весь разбор; неверное значение известного показателя губит", () => {
    const g = groups(task("t1"));
    const ok = parseSolver(reply([sol({ evidence: [{ key: "margin_pct", value: -15.3 }, { key: "content_low_threshold", value: 70 }] })]), g, facts, profile);
    assert.equal(ok.items.length, 1);
    assert.equal(ok.items[0]!.evidence.length, 1);
    assert.equal(parseSolver(reply([sol({ evidence: [{ key: "content_low_threshold", value: 70 }] })]), g, facts, profile).items.length, 0); // проблема без единого проверенного числа
  });
  it("вердикт «проблема» без чисел не принимается, «не проблема» принимается и без стратегии", () => {
    const g = groups(task("t1"));
    assert.equal(parseSolver(reply([sol({ evidence: [] })]), g, facts, profile).items.length, 0);
    const np = parseSolver(reply([sol({ evidence: [], verdict: "not_a_problem" })]), g, facts, profile).items[0]!;
    assert.equal(np.verdict, "not_a_problem");
    assert.equal(np.strategy, null);
  });
  it("чужой товар и повтор отбрасываются", () => {
    const r = parseSolver(reply([sol({ nmId: "999" }), sol(), sol()]), groups(task("t1")), facts, profile);
    assert.equal(r.items.length, 1);
    assert.equal(r.dropped, 2);
  });
  it("решение без критериев успеха и проверок допустимо: простое действие или наблюдение", () => {
    const simple = parseSolver(reply([sol({ steps: [{ day: 0, when: "сразу", by: "human", step: "Переписать описание", action: null }], checks: [], success: [], guards: [], reviewAfterDays: null })]), groups(task("t1")), facts, profile);
    assert.equal(simple.items[0]!.strategy?.steps.length, 1);
    assert.equal(simple.items[0]!.strategy?.reviewAfterDays, null);
  });
  it("без шагов решение остаётся диагнозом без плана", () => {
    const r = parseSolver(reply([sol({ steps: [] })]), groups(task("t1")), facts, profile);
    assert.equal(r.items.length, 1);
    assert.equal(r.items[0]!.strategy, null);
  });
  it("общий предел изменения цены 10%: лишние шаги цены остаются для человека", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ day: i * 2, when: `день ${i * 2}`, by: "program", step: "цена", action: { type: "price", direction: "lower", stepPercent: 3, reason: "r" } }));
    const st = parseSolver(reply([sol({ steps: many })]), groups(task("t1")), facts, profile).items[0]!.strategy!;
    assert.equal(st.steps.filter((p) => p.action).length, 3);
  });
  it("для сигнала без товара программа цены не создаётся", () => {
    const g = groups(task("t9", { nmId: null }));
    const r = parseSolver(reply([sol({ nmId: "t9", evidence: [{ key: "sku_total", value: 44 }] })]), g, facts, profile);
    assert.equal(r.items[0]!.strategy?.steps.every((p) => p.action == null), true);
  });
  it("мусор вместо JSON ничего не создаёт", () => {
    assert.equal(parseSolver("не json", groups(task("t1")), facts, profile).items.length, 0);
  });
});

describe("ИИ-решатель: какие товары отдавать", () => {
  it("пока сигналы товара не изменились, повторный разбор не нужен; заметное изменение или новый сигнал пересматривают решение", () => {
    const a = groups(task("t1"));
    const solved = new Map([[a[0]!.key, a[0]!.fingerprint]]);
    assert.equal(selectGroups([task("t1")], solved, 10).toSolve.length, 0);
    assert.equal(selectGroups([task("t1", { evidence: { margin_pct: -15.4, orders: 15 } })], solved, 10).toSolve.length, 0);
    assert.equal(selectGroups([task("t1", { evidence: { margin_pct: -30, orders: 15 } })], solved, 10).toSolve.length, 1);
    assert.equal(selectGroups([task("t1"), task("t2", { type: "TASK_EXCESS_STOCK" })], solved, 10).toSolve.length, 1);
  });
  it("важные товары раньше, потом по оценке, не больше лимита", () => {
    const list = [
      task("a", { nmId: "10", severity: "opportunity", score: 99 }),
      task("b", { nmId: "11", severity: "important", score: 10 }),
      task("c", { nmId: "12", severity: "critical", score: 1 }),
      task("d", { nmId: "13", severity: "important", score: 70 }),
    ];
    assert.deepEqual(selectGroups(list, new Map(), 3).toSolve.map((g) => g.key), ["12", "13", "11"]);
  });
  it("в запрос уходят сигналы товара, числа алгоритмов, факты и прошлые неудачные попытки", () => {
    const g = groups(task("t1"));
    const payload = JSON.parse(solverPayload({ profile, groups: g, facts, titles: new Map([["1", "Кашпо"]]), attempts: new Map([["1", [{ title: "t", goal: "g", program: "p", result: "не сработало" }]]]), nowIso: "2026-10-28T10:00:00Z" }));
    assert.equal(payload.products[0].signals[0].algorithm_evidence.margin_pct, -15.3);
    assert.equal(payload.products[0].facts.price_buyer, 996);
    assert.equal(payload.products[0].previous_attempts[0].result, "не сработало");
    assert.equal(payload.store.sku_total, 44);
  });
  it("отпечаток сигнала не меняется от мелкого дрейфа цифр", () => {
    assert.equal(signalFingerprint(task("t1")), signalFingerprint(task("t1", { evidence: { margin_pct: -15.4, orders: 15 } })));
  });
});
