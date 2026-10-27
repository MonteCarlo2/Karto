import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NO_RULES, applyOwnerRules, priceGuardFromSettings, relaxStartedGuards, isValidForbidString, ownerRulesPrompt, parseForbid, withOwnerRules } from "./owner-rules";
import { parseStrategy } from "./strategy";

const plan = () =>
  parseStrategy(
    {
      goal: "Вернуть заказы",
      steps: [
        { day: 0, when: "сразу", by: "program", step: "Снизить цену", action: { type: "price", direction: "lower", stepPercent: 1, reason: "r" } },
        { day: 1, when: "", by: "program", step: "Пауза кампании", action: { type: "ads_pause", campaignId: "10", reason: "r" } },
        { day: 2, when: "", by: "human", step: "Проверить фото", action: null },
      ],
      checks: [{ day: 7, label: "проверка", look: [{ metric: "orders_28d", expect: "up" }] }],
      success: [{ metric: "orders_28d", op: ">=", value: 5 }],
      guards: [{ metric: "margin_pct", op: ">=", value: 10 }],
    },
    { campaignIds: new Set(["10"]) },
  )!;

describe("постоянные правила владельца для ИИ", () => {
  it("без правил план не меняется", () => {
    const p = plan();
    assert.deepEqual(applyOwnerRules(p, NO_RULES), p);
  });
  it("запрещённая область вычёркивается из плана, остальное остаётся", () => {
    const out = applyOwnerRules(plan(), { forbid: ["prices"], minMarginPct: 0 })!;
    assert.deepEqual(out.steps.map((s) => s.action?.type ?? "human"), ["ads_pause", "human"]);
  });
  it("если запрещено всё, чем план управляет, плана нет", () => {
    const p = parseStrategy({ goal: "g", steps: [{ day: 0, when: "", by: "program", step: "цена", action: { type: "price", direction: "lower", stepPercent: 1, reason: "r" } }], checks: [], success: [{ metric: "orders_28d", op: ">=", value: 1 }], guards: [] })!;
    assert.equal(applyOwnerRules(p, { forbid: ["prices"], minMarginPct: 0 }), null);
  });
  it("нижняя маржа поднимает собственный ограничитель плана и добавляет его, если не было", () => {
    const raised = applyOwnerRules(plan(), { forbid: [], minMarginPct: 15 })!;
    assert.equal(raised.guards.find((g) => g.metric === "margin_pct")!.value, 15);
    const lowerKept = applyOwnerRules(plan(), { forbid: [], minMarginPct: 5 })!;
    assert.equal(lowerKept.guards.find((g) => g.metric === "margin_pct")!.value, 10, "план строже владельца остаётся как есть");
    const p = plan();
    const added = applyOwnerRules({ ...p, guards: [] }, { forbid: [], minMarginPct: 12 })!;
    assert.deepEqual(added.guards, [{ metric: "margin_pct", op: ">=", value: 12 }]);
  });
  it("нижняя маржа не ставится выше текущей: план не должен остановиться в первый день", () => {
    const out = applyOwnerRules(plan(), { forbid: [], minMarginPct: 20 }, { margin_pct: 13.8 })!;
    assert.equal(out.guards.find((g) => g.metric === "margin_pct")!.value, 13.8);
  });
  it("ограничитель, уже нарушенный на старте, опускается до текущего значения; в другую сторону для «не больше»", () => {
    const p = plan();
    const strict = { ...p, guards: [{ metric: "margin_pct", op: ">=", value: 30 }, { metric: "turnover_days", op: "<=", value: 60 }] } as typeof p;
    const out = relaxStartedGuards(strict, { margin_pct: 25.55, turnover_days: 84 });
    assert.deepEqual(out.guards, [{ metric: "margin_pct", op: ">=", value: 25.5 }, { metric: "turnover_days", op: "<=", value: 84 }]);
    assert.deepEqual(relaxStartedGuards(strict, {}).guards, strict.guards, "без данных ничего не меняем");
  });
  it("настройка запретов читается с проверкой", () => {
    assert.deepEqual(parseForbid("prices, ads,bad,ads"), ["prices", "ads"]);
    assert.equal(isValidForbidString("prices,ads"), true);
    assert.equal(isValidForbidString("prices,hack"), false);
    assert.equal(isValidForbidString(""), true);
  });
  it("подсказка для ИИ называет правила, нагрузка получает поле", () => {
    assert.equal(ownerRulesPrompt(NO_RULES), "");
    const text = ownerRulesPrompt({ forbid: ["ads"], minMarginPct: 15 });
    assert.match(text, /реклама/i);
    assert.match(text, /15%/);
    assert.equal(withOwnerRules('{"a":1}', NO_RULES), '{"a":1}');
    assert.ok(JSON.parse(withOwnerRules('{"a":1}', { forbid: ["ads"], minMarginPct: 0 })).owner_standing_rules);
  });
  it("ограничители цены владельца: стандартные при пустых или недопустимых значениях, иначе его строже", () => {
    const def = priceGuardFromSettings({});
    assert.deepEqual([def.breakEvenCushion, def.maxStep, def.cooldownHours], [0.05, 0.05, 24]);
    const own = priceGuardFromSettings({ cushionPct: 12, stepPct: 2, cooldownHours: 72 });
    assert.deepEqual([own.breakEvenCushion, own.maxStep, own.cooldownHours], [0.12, 0.02, 72]);
    const bad = priceGuardFromSettings({ cushionPct: 1, stepPct: 9, cooldownHours: 1 });
    assert.deepEqual([bad.breakEvenCushion, bad.maxStep, bad.cooldownHours], [0.05, 0.05, 24], "мягче стандартных нельзя");
  });
});
