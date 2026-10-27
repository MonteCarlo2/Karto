import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_PLAN_PRODUCTS, chatGroups, chatPayload, chatTitle, parseChatTurn, parsePlanForProduct, planProductPayload, type ChatProduct } from "./chat";

const products: ChatProduct[] = [
  { nmId: "1", title: "Ведро", facts: { orders_28d: 15, margin_pct: -3, cart_pct: 4 }, tasks: ["Убыточная цена"] },
  { nmId: "2", title: "Лопата", facts: { orders_28d: 5, margin_pct: 20 }, tasks: [] },
];
const profile = { sku_total: 2, orders_28d_total: 20 };
const facts = new Map(products.map((p) => [p.nmId, p.facts]));
const groups = chatGroups(products, "c1", "Увеличить продажи, не меняя карточки");
const turn = (mode: string, extra: Record<string, unknown> = {}) => "```json\n" + JSON.stringify({ mode, reply: "ответ", questions: [], selected: [], ...extra }) + "\n```";
const planRaw = (nmId: string, over: Record<string, unknown> = {}) =>
  JSON.stringify({
    solutions: [
      {
        nmId,
        verdict: "problem",
        kind: "conversion",
        title: `План ${nmId}`,
        diagnosis: "d",
        evidence: [{ key: "orders_28d", value: facts.get(nmId)?.orders_28d ?? 5 }],
        goal: "Поднять заказы",
        steps: [{ day: 0, when: "сразу", by: "human", step: "Проверить рекламу", action: null }],
        checks: [],
        success: [{ metric: "orders_28d", op: ">=", value: 20 }],
        guards: [],
        reviewAfterDays: 14,
        failNote: "",
        fallback: "другой подход",
        ...over,
      },
    ],
  });

describe("чат «поставить задачу»: шаг 1, вопросы или выбор товаров", () => {
  it("вопросы принимаются, пока раунды не исчерпаны", () => {
    const t = parseChatTurn(turn("ask", { questions: ["Можно менять цену?", "Какая минимальная маржа?"] }), products, 0);
    assert.equal(t.mode, "ask");
    assert.equal(t.questions.length, 2);
  });
  it("после двух раундов вопросов ИИ обязан выбрать товары: вопросы без выбора превращаются в честное сообщение", () => {
    const t = parseChatTurn(turn("ask", { questions: ["Ещё вопрос?"], reply: "" }), products, 2);
    assert.equal(t.mode, "ask");
    assert.equal(t.questions.length, 0);
    assert.match(t.reply, /Не удалось подобрать товары/);
  });
  it("выбор товаров: чужие и повторные товары отбрасываются", () => {
    const t = parseChatTurn(turn("plan", { selected: [{ nmId: "1", why: "падают заказы" }, { nmId: "999", why: "?" }, { nmId: "1", why: "повтор" }, { nmId: 2, why: "числом" }] }), products, 1);
    assert.equal(t.mode, "plan");
    assert.deepEqual(t.selected.map((s) => s.nmId), ["1", "2"]);
    assert.equal(t.dropped, 2);
  });
  it("не больше заданного числа товаров", () => {
    const many: ChatProduct[] = Array.from({ length: 10 }, (_, i) => ({ nmId: `n${i}`, title: `Т${i}`, facts: { orders_28d: 5 }, tasks: [] }));
    const t = parseChatTurn(turn("plan", { selected: many.map((p) => ({ nmId: p.nmId, why: "w" })) }), many, 1);
    assert.equal(t.selected.length, MAX_PLAN_PRODUCTS);
  });
  it("мусор вместо JSON даёт понятное сообщение", () => {
    assert.equal(parseChatTurn("не json", products, 0).selected.length, 0);
  });
});

describe("чат «поставить задачу»: шаг 2, план по одному товару", () => {
  it("план с верными цифрами принимается", () => {
    const r = parsePlanForProduct(planRaw("1"), groups[0]!, facts, profile);
    assert.equal(r.plan?.nmId, "1");
    assert.equal(r.plan?.strategy?.steps.length, 1);
  });
  it("неверная цифра отклоняет план, план без шагов не принимается", () => {
    assert.equal(parsePlanForProduct(planRaw("1", { evidence: [{ key: "orders_28d", value: 999 }] }), groups[0]!, facts, profile).plan, null);
    assert.equal(parsePlanForProduct(planRaw("1", { steps: [] }), groups[0]!, facts, profile).plan, null);
  });
});

describe("чат «поставить задачу»: запросы к ИИ", () => {
  it("на первом шаге в запрос уходят все товары с фактами, диалог и сколько раундов вопросов осталось", () => {
    const payload = JSON.parse(chatPayload({ profile, products, messages: [{ role: "user", text: "Увеличить продажи", at: "t" }], roundsUsed: 1, nowIso: "2026-10-28T10:00:00Z" }));
    assert.equal(payload.products.length, 2);
    assert.equal(payload.products[0].open_algorithm_signals[0], "Убыточная цена");
    assert.equal(payload.question_rounds_left, 1);
    assert.equal(payload.dialog[0].text, "Увеличить продажи");
  });
  it("на втором шаге контекст сфокусирован на одном товаре: он, профиль магазина, причина выбора и весь диалог", () => {
    const payload = JSON.parse(planProductPayload({ profile, product: products[0]!, why: "падают заказы", messages: [{ role: "user", text: "маржа не ниже 15%", at: "t" }], nowIso: "x" }));
    assert.equal(payload.product.nmId, "1");
    assert.equal(payload.products, undefined);
    assert.equal(payload.why_selected, "падают заказы");
    assert.equal(payload.dialog[0].text, "маржа не ниже 15%");
  });
  it("заголовок диалога: первая реплика без лишних пробелов", () => {
    assert.equal(chatTitle("  Увеличить   продажи \n сегодня "), "Увеличить продажи сегодня");
  });
});
