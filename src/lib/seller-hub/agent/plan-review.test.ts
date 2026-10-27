import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyPlanReview, parsePlanReviews, planForReview } from "./plan-review";
import type { Solution } from "./ai-solver";
import { parseStrategy } from "./strategy";

const step = (day: number, action: Record<string, unknown> | null, by = "program") => ({ day, when: "сразу", by, step: `шаг ${day}`, action });
const strategy = () =>
  parseStrategy(
    { goal: "g", steps: [step(0, { type: "price", direction: "raise", stepPercent: 2, reason: "r" }), step(1, null, "human"), step(3, { type: "content_edit", field: "title", text: "Ведро строительное оцинкованное 12 л", reason: "r" })], success: [{ metric: "orders_28d", op: ">=", value: 5 }] },
    { campaignIds: new Set() },
  )!;
const solution = (): Solution => ({ key: "1", nmId: "1", taskIds: [], verdict: "problem", problems: [], kind: "conversion", title: "t", diagnosis: "d", evidence: [{ key: "orders_28d", value: 3 }], strategy: strategy() });
const actions = (s: Solution) => s.strategy!.steps.map((p) => p.action?.type ?? null);

describe("проверка плана вторым ИИ: что остаётся у программы", () => {
  it("согласен: все действия программы остаются", () => {
    const r = applyPlanReview(solution(), { verdict: "agree", reason: "ok", blockedSteps: [] }, true);
    assert.deepEqual(actions(r.solution), ["price", null, "content_edit"]);
    assert.equal(r.second, "agree");
    assert.equal(r.severity, "important");
  });
  it("замечание к одному шагу останавливает только его: остальные действия остаются", () => {
    const r = applyPlanReview(solution(), { verdict: "dispute", reason: "текст нельзя", blockedSteps: [2] }, true);
    assert.deepEqual(actions(r.solution), ["price", null, null]);
    assert.equal(r.solution.strategy!.steps[2]!.by, "human");
    assert.equal(r.second, "dispute");
    assert.equal(r.kept, true);
  });
  it("замечание без названных шагов остановит все действия (осторожно); пустой список шагов оставит все", () => {
    assert.deepEqual(actions(applyPlanReview(solution(), { verdict: "dispute", reason: "r", blockedSteps: null }, true).solution), [null, null, null]);
    assert.deepEqual(actions(applyPlanReview(solution(), { verdict: "dispute", reason: "общее замечание", blockedSteps: [] }, true).solution), ["price", null, "content_edit"]);
  });
  it("отвергнут: план не показывается; проверка не состоялась: действия не включаются", () => {
    assert.equal(applyPlanReview(solution(), { verdict: "reject", reason: "вредит", blockedSteps: null }, true).kept, false);
    const none = applyPlanReview(solution(), null, true);
    assert.deepEqual(actions(none.solution), [null, null, null]);
    assert.equal(none.second, "not_checked");
  });
});

describe("проверка плана вторым ИИ: запрос и разбор", () => {
  it("проверяющий видит шаги с номерами и полный текст правки карточки", () => {
    const p = planForReview(solution());
    assert.equal(p.steps[2]!.i, 2);
    assert.match(JSON.stringify(p.steps[2]!.action), /Ведро строительное оцинкованное 12 л/);
  });
  it("разбор ответа: неизвестный вердикт даёт замечание, пропуск даёт null", () => {
    const r = parsePlanReviews(JSON.stringify({ review: [{ index: 0, verdict: "???", reason: "x", blockedSteps: [1, "2", -3, 1.5] }] }), 2);
    assert.equal(r[0]!.verdict, "dispute");
    assert.deepEqual(r[0]!.blockedSteps, [1, 2]);
    assert.equal(r[1], null);
  });
});
