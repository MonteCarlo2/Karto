import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildScenarioProposals, type ScenarioProduct, type ScenarioRow } from "./scenario-run";
import type { PlaybookSignals } from "./playbooks";

const NOW = Date.parse("2026-10-26T12:00:00Z");

const signals = (over: Partial<PlaybookSignals> = {}): PlaybookSignals => ({
  nmId: "1",
  buyerPrice: 1000,
  oosDays: 40,
  turnoverDays: 40,
  cartPercent: 4.5,
  cartSample: 1000,
  declineDays: 0,
  riseDays: 0,
  recentNegative: false,
  trendKnown: true,
  ...over,
});

const product = (over: Partial<ScenarioProduct> = {}): ScenarioProduct => ({
  nmId: "1",
  title: "Ведро 10л",
  vendorCode: "V1",
  base: 1250,
  discount: 20,
  breakEvenPrice: 700,
  stock: 50,
  signals: signals(),
  ...over,
});

const scenario = (over: Partial<ScenarioRow> = {}): ScenarioRow => ({ id: "s1", playbook: "grow_no_price_war", name: "Без войны", scope: { all: true }, enabled: true, ...over });

const run = (products: ScenarioProduct[], scenarios: ScenarioRow[] = [scenario()], lastChangeAt = new Map<string, string>()) =>
  buildScenarioProposals({ scenarios, products, states: new Map(), lastChangeAt, nowMs: NOW });

describe("пачка предложений", () => {
  it("цену меняем не больше чем у 15% товаров, первыми идут самые важные, остальные отложены с причиной", () => {
    const products = Array.from({ length: 20 }, (_, i) =>
      product({ nmId: String(i + 1), vendorCode: `V${i + 1}`, signals: signals({ nmId: String(i + 1), declineDays: 3, oosDays: i === 17 ? 5 : 40 }) }),
    );
    const res = run(products);
    assert.equal(res.proposals.length, 3); // 15% от 20 = 3
    assert.equal(res.proposals[0]!.id, "price-s1-18"); // защита наличия идёт первой
    assert.equal(res.skipped.filter((s) => /Отложено/.test(s.reason)).length, 17);
  });
  it("в маленьком магазине пачка не меньше трёх", () => {
    const products = Array.from({ length: 5 }, (_, i) => product({ nmId: String(i + 1), signals: signals({ nmId: String(i + 1), declineDays: 3 }) }));
    assert.equal(run(products).proposals.length, 3);
  });
});

describe("предложения по ценам из сценариев", () => {
  it("падение заказов превращается в предложение снизить цену с причиной, пределом и состоянием сценария", () => {
    const res = run([product({ signals: signals({ declineDays: 3 }) })]);
    assert.equal(res.proposals.length, 1);
    const p = res.proposals[0]!;
    assert.equal(p.rule, "playbook");
    assert.equal(p.risk, "high");
    assert.equal(p.action.type, "price");
    if (p.action.type === "price") {
      assert.ok(p.action.targetRub < 1000);
      assert.equal(p.action.currentBaseRub, 1250);
      assert.equal(p.action.discount, 20);
    }
    assert.match(p.facts.join(" | "), /Заказы ниже обычного 3 дн/);
    assert.match(p.facts.join(" | "), /Пол цены/);
    assert.equal((p.meta as { playbook: string }).playbook, "grow_no_price_war");
    assert.ok((p.meta as { nextState: { anchorBuyer: number } }).nextState.anchorBuyer === 1000);
  });

  it("без изменений в сценарии предложений нет", () => {
    assert.equal(run([product()]).proposals.length, 0);
  });

  it("выключенный сценарий и товар вне охвата ничего не предлагают", () => {
    const sig = signals({ declineDays: 3 });
    assert.equal(run([product({ signals: sig })], [scenario({ enabled: false })]).proposals.length, 0);
    assert.equal(run([product({ signals: sig })], [scenario({ scope: { nmIds: ["999"] } })]).proposals.length, 0);
    assert.equal(run([product({ signals: sig })], [scenario({ scope: { nmIds: ["1"] } })]).proposals.length, 1);
  });

  it("если снизить цену нельзя (нет безубыточной цены), предложения нет, причина записана", () => {
    const res = run([product({ breakEvenPrice: null, signals: signals({ declineDays: 3 }) })]);
    assert.equal(res.proposals.length, 0);
    assert.match(res.skipped[0]!.reason, /Не хватает данных о себестоимости/);
  });

  it("защита наличия поднимает цену и без безубыточной цены", () => {
    const res = run([product({ breakEvenPrice: null, signals: signals({ oosDays: 5 }) })]);
    assert.equal(res.proposals.length, 1);
    const action = res.proposals[0]!.action;
    assert.ok(action.type === "price" && action.targetRub > 1000);
  });

  it("недавно менявшаяся цена блокирует предложение на 24 часа", () => {
    const sig = signals({ declineDays: 3 });
    const fresh = new Map([["1", new Date(NOW - 3 * 3_600_000).toISOString()]]);
    const res = run([product({ signals: sig })], [scenario()], fresh);
    assert.equal(res.proposals.length, 0);
    assert.match(res.skipped[0]!.reason, /меняли меньше 24 ч назад/);
  });

  it("слишком большой шаг сценария ограничивается 5% и это видно в причинах", () => {
    const res = run([product({ signals: signals({ declineDays: 9, recentNegative: true }) })]);
    const p = res.proposals[0]!;
    assert.match(p.facts.join(" | "), /ограничено 5%/);
    if (p.action.type === "price") assert.ok(p.action.targetRub >= 950 - 1);
  });

  it("один товар получает предложение только от первого подходящего сценария", () => {
    const sig = signals({ declineDays: 3 });
    const res = run([product({ signals: sig })], [scenario({ id: "a", name: "Первый" }), scenario({ id: "b", name: "Второй", playbook: "clear_overstock" })]);
    assert.equal(res.proposals.length, 1);
    assert.equal(res.proposals[0]!.id, "price-a-1");
  });

  it("нет цены или сигналов — товар пропускается с причиной", () => {
    const res = run([product({ base: null }), product({ nmId: "2", signals: null })]);
    assert.equal(res.proposals.length, 0);
    assert.equal(res.skipped.length, 2);
  });
});
