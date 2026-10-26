import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { takeAiBudget } from "./ai-budget";

describe("takeAiBudget", () => {
  it("пускает до лимита и закрывает после; пользователи и виды считаются отдельно", () => {
    const now = Date.parse("2026-10-17T10:00:00Z");
    assert.equal(takeAiBudget("u1", "review", 2, now).ok, true);
    assert.equal(takeAiBudget("u1", "review", 2, now).ok, true);
    const third = takeAiBudget("u1", "review", 2, now);
    assert.equal(third.ok, false);
    assert.equal(takeAiBudget("u2", "review", 2, now).ok, true);
    assert.equal(takeAiBudget("u1", "advice", 2, now).ok, true);
  });
  it("на следующий день лимит обнуляется", () => {
    const day1 = Date.parse("2026-10-17T10:00:00Z");
    const day2 = Date.parse("2026-10-18T10:00:00Z");
    assert.equal(takeAiBudget("u3", "review", 1, day1).ok, true);
    assert.equal(takeAiBudget("u3", "review", 1, day1).ok, false);
    assert.equal(takeAiBudget("u3", "review", 1, day2).ok, true);
  });
});
