import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buyerPrice, checkEvidence, checkPriceChange, DEFAULT_PRICE_GUARD, type PriceChangeInput } from "./guardrails";

const NOW = Date.parse("2026-10-26T12:00:00Z");
const base = (over: Partial<PriceChangeInput> = {}): PriceChangeInput => ({
  currentBase: 1250,
  currentDiscount: 20,
  proposedBase: 1188,
  proposedDiscount: 20,
  breakEvenBuyerPrice: 700,
  stock: 50,
  lastChangeAt: null,
  nowMs: NOW,
  ...over,
});

describe("цена: проверки перед показом человеку", () => {
  it("небольшое снижение выше пола проходит как есть", () => {
    const res = checkPriceChange(base());
    assert.equal(res.ok, true);
    assert.equal(res.issues.length, 0);
    assert.ok(res.final && res.final.buyerPrice < buyerPrice(1250, 20));
    assert.equal(res.final!.discount, 20);
  });

  it("слишком большой шаг ограничивается 5%, нейросеть не может обойти это", () => {
    const res = checkPriceChange(base({ proposedBase: 900 })); // −28%
    assert.equal(res.ok, true);
    assert.ok(res.issues.some((i) => i.code === "step_too_big"));
    const current = buyerPrice(1250, 20);
    assert.ok(res.final!.buyerPrice >= current * 0.95 - 1, `цена ${res.final!.buyerPrice}`);
  });

  it("цена не уходит ниже безубыточности с запасом", () => {
    const res = checkPriceChange(base({ breakEvenBuyerPrice: 980, proposedBase: 1100 })); // пол 1029, сейчас 1000: ниже пола
    assert.equal(res.ok, false);
    assert.ok(res.issues.some((i) => i.code === "below_floor" && i.blocking));
  });

  it("снижение ограничивается полом, если до пола есть место", () => {
    const res = checkPriceChange(base({ breakEvenBuyerPrice: 900, proposedBase: 1100 }), { ...DEFAULT_PRICE_GUARD, maxStep: 0.5 });
    assert.equal(res.ok, true);
    assert.ok(res.final!.buyerPrice >= 900 * 1.05 - 0.01);
  });

  it("без безубыточной цены снижать нельзя, повышать можно", () => {
    assert.equal(checkPriceChange(base({ breakEvenBuyerPrice: null })).ok, false);
    assert.equal(checkPriceChange(base({ breakEvenBuyerPrice: null, proposedBase: 1300 })).ok, true);
  });

  it("минимальная цена человека может только поднять пол", () => {
    const res = checkPriceChange(base({ proposedBase: 1188 }), { ...DEFAULT_PRICE_GUARD, userMinPrice: 990 });
    assert.equal(res.floorBuyerPrice, 990);
    const lower = checkPriceChange(base(), { ...DEFAULT_PRICE_GUARD, userMinPrice: 100 });
    assert.equal(lower.floorBuyerPrice, 735); // безубыточность 700 × 1,05, а не 100
  });

  it("повторное изменение в пределах суток блокируется", () => {
    const res = checkPriceChange(base({ lastChangeAt: new Date(NOW - 3 * 3_600_000).toISOString() }));
    assert.equal(res.ok, false);
    assert.equal(res.issues[0]!.code, "cooldown");
    assert.equal(checkPriceChange(base({ lastChangeAt: new Date(NOW - 30 * 3_600_000).toISOString() })).ok, true);
  });

  it("при нулевом остатке цену не снижаем", () => {
    const res = checkPriceChange(base({ stock: 0 }));
    assert.equal(res.ok, false);
    assert.equal(res.issues[0]!.code, "no_stock");
  });

  it("мусорные числа и отсутствие изменений отклоняются", () => {
    assert.equal(checkPriceChange(base({ proposedBase: Number.NaN })).ok, false);
    assert.equal(checkPriceChange(base({ proposedDiscount: 99 })).ok, false);
    assert.equal(checkPriceChange(base({ proposedBase: 1250 })).issues[0]!.code, "no_change");
  });
});

describe("проверка утверждений по фактам", () => {
  const facts = { cartPercent: 2.1, stock: 40, negativeReviews: 3 };
  it("совпадающие цифры проходят", () => {
    assert.equal(checkEvidence([{ key: "cartPercent", value: 2.1 }, { key: "stock", value: 40 }], facts).ok, true);
  });
  it("выдуманное или перепутанное число отклоняется", () => {
    const res = checkEvidence([{ key: "cartPercent", value: 5 }, { key: "unknown", value: 1 }], facts);
    assert.equal(res.ok, false);
    assert.equal(res.wrong.length, 2);
    assert.equal(res.wrong[1]!.actual, null);
  });
});
