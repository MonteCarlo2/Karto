import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { suggestPriceFix } from "./fix";
import type { TaskEvidence } from "./types";

const ev = (patch: Record<string, unknown>): TaskEvidence => patch as TaskEvidence;

describe("suggestPriceFix", () => {
  it("безубыточность 1 349 ₽, скидка 10%: база считается при прежней скидке и округляется вверх", () => {
    const fix = suggestPriceFix("TASK_NEGATIVE_MARGIN", ev({ break_even_price: 1349 }), {
      price: 1073,
      discountPercent: 10,
      discountedPrice: 966,
    });
    assert.ok(fix);
    assert.equal(fix.targetRub, 1349);
    assert.equal(fix.discount, 10);
    assert.equal(fix.baseRub, 1499);
    // после скидки 10% цена не ниже безубыточной
    assert.ok(fix.baseRub * (1 - 10 / 100) >= 1349);
    assert.equal(fix.currentRub, 966);
  });

  it("без скидки база равна цели", () => {
    const fix = suggestPriceFix("TASK_MARGIN_NEAR_ZERO", ev({ break_even_price: 1000.2 }), {
      price: 900,
      discountPercent: 0,
      discountedPrice: 900,
    });
    assert.equal(fix?.targetRub, 1001);
    assert.equal(fix?.baseRub, 1001);
  });

  it("кнопки нет: другой тип задачи, нет безубыточности, цена уже достаточна, нет товара", () => {
    const item = { price: 1000, discountPercent: 0, discountedPrice: 1000 };
    assert.equal(suggestPriceFix("TASK_EXCESS_STOCK", ev({ break_even_price: 1500 }), item), null);
    assert.equal(suggestPriceFix("TASK_NEGATIVE_MARGIN", ev({}), item), null);
    assert.equal(suggestPriceFix("TASK_NEGATIVE_MARGIN", ev({ break_even_price: 900 }), item), null);
    assert.equal(suggestPriceFix("TASK_NEGATIVE_MARGIN", ev({ break_even_price: 1500 }), null), null);
  });

  it("скачок больше чем втрое — только вручную", () => {
    const item = { price: 400, discountPercent: 0, discountedPrice: 400 };
    assert.equal(suggestPriceFix("TASK_NEGATIVE_MARGIN", ev({ break_even_price: 1300 }), item), null);
    assert.ok(suggestPriceFix("TASK_NEGATIVE_MARGIN", ev({ break_even_price: 1200 }), item));
  });

  it("странная скидка не принимается", () => {
    const item = { price: 1000, discountPercent: 99, discountedPrice: 10 };
    assert.equal(suggestPriceFix("TASK_NEGATIVE_MARGIN", ev({ break_even_price: 20 }), item), null);
  });
});
