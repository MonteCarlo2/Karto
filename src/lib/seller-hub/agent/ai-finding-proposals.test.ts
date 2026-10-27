import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findingProposals, type ActionableFinding } from "./ai-finding-proposals";
import type { PlaybookSignals } from "./playbooks";
import type { ScenarioProduct, ScenarioRow } from "./scenario-run";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const signals = (nmId: string): PlaybookSignals => ({ nmId, buyerPrice: 1000, oosDays: 40, turnoverDays: 40, cartPercent: 3, cartSample: 1000, declineDays: 0, riseDays: 0, recentNegative: false, trendKnown: true });
const product = (nmId: string, over: Partial<ScenarioProduct> = {}): ScenarioProduct => ({ nmId, title: `Товар ${nmId}`, vendorCode: `V${nmId}`, base: 1250, discount: 20, breakEvenPrice: 700, stock: 50, signals: signals(nmId), ai: { facts: {}, snippets: [] }, ...over });
const scenario: ScenarioRow = { id: "s1", playbook: "grow_no_price_war", name: "Сценарий", scope: { all: true }, enabled: true };
const finding = (over: Partial<ActionableFinding> = {}): ActionableFinding => ({ nmId: "1", title: "Продажи в убыток", humanAdvice: "Проверьте себестоимость", action: { type: "price", direction: "raise", stepPercent: 2, reason: "цена ниже безубыточной" }, ownerAccepted: false, ...over });

const run = (over: Partial<Parameters<typeof findingProposals>[0]> = {}) =>
  findingProposals({ findings: [finding()], scenarios: [scenario], products: [product("1")], taken: new Set(), states: new Map(), lastChangeAt: new Map(), nowMs: NOW, existingCount: 0, ...over });

describe("находки ИИ с действием как предложения агента", () => {
  it("повышение цены на ступень превращается в предложение с ценой, посчитанной программой, и пометкой ИИ", () => {
    const res = run();
    assert.equal(res.proposals.length, 1);
    const p = res.proposals[0]!;
    assert.equal(p.action.type, "price");
    if (p.action.type === "price") assert.ok(p.action.targetRub > 1000 && p.action.targetRub < 1030);
    assert.match(p.facts.join(" "), /По мнению ИИ/);
  });
  it("без включённого сценария предложения нет: ИИ не действует сам по себе", () => {
    assert.equal(run({ scenarios: [{ ...scenario, enabled: false }] }).proposals.length, 0);
  });
  it("действие, принятое владельцем, работает и без включённого сценария", () => {
    const res = run({ scenarios: [], findings: [finding({ ownerAccepted: true })] });
    assert.equal(res.proposals.length, 1);
  });
  it("ограничители главнее ИИ: снижение без безубыточной цены запрещено", () => {
    const res = run({ findings: [finding({ action: { type: "price", direction: "lower", stepPercent: 2, reason: "много просмотров" } })], products: [product("1", { breakEvenPrice: null })] });
    assert.equal(res.proposals.length, 0);
    assert.equal(res.skipped.length, 1);
  });
  it("товар, по которому предложение уже есть, не дублируется", () => {
    assert.equal(run({ taken: new Set(["1"]) }).proposals.length, 0);
  });
  it("мест в общей пачке нет — ничего не добавляется", () => {
    assert.equal(run({ existingCount: 100 }).proposals.length, 0);
  });
});
