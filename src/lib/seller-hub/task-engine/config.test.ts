import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_TASK_THRESHOLDS, resolveStagnantCapitalRub } from "./config";

describe("stagnant capital threshold", () => {
  it("uses 5000 when the settings row is missing or the column is empty", () => {
    assert.equal(DEFAULT_TASK_THRESHOLDS.stagnantCapitalRub, 5000);
    assert.equal(resolveStagnantCapitalRub(null), 5000);
  });

  it("does not treat an uninitialized zero as a chosen threshold", () => {
    assert.equal(resolveStagnantCapitalRub(0), 5000);
  });

  it("keeps an explicit positive setting", () => {
    assert.equal(resolveStagnantCapitalRub(8000), 8000);
    assert.equal(resolveStagnantCapitalRub(5000), 5000);
  });
});
