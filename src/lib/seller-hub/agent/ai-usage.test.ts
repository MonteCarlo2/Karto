import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { remainingBudget } from "./ai-usage";

const AT = Date.parse("2026-10-27T12:00:00Z");

describe("месячный потолок на ИИ", () => {
  it("в начале месяца остаток почти весь, на день выдаётся двойная доля, а не всё сразу", () => {
    const r = remainingBudget(0, 3, Date.parse("2026-10-01T09:00:00Z"));
    assert.equal(r.monthLeft, 3);
    assert.ok(r.todayLeft > 0.15 && r.todayLeft < 0.25);
  });
  it("потолок исчерпан — на сегодня ничего", () => {
    assert.equal(remainingBudget(3.2, 3, AT).todayLeft, 0);
  });
  it("в конце месяца остаток можно тратить свободнее, но не больше самого остатка", () => {
    const r = remainingBudget(2.9, 3, Date.parse("2026-10-31T09:00:00Z"));
    assert.ok(Math.abs(r.todayLeft - 0.1) < 1e-9);
  });
});
