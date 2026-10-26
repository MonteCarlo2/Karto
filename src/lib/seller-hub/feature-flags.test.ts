import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ACCEPTANCE_SLOTS_ENABLED, SUPPLY_WRITE_ENABLED } from "./feature-flags";

describe("выключатели функций", () => {
  it("запись по поставкам и слоты приёмки выключены решением владельца; включение — только осознанная правка флага", () => {
    assert.equal(SUPPLY_WRITE_ENABLED, false);
    assert.equal(ACCEPTANCE_SLOTS_ENABLED, false);
  });
});
