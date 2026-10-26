import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCalcVerification, buildSourceStatuses, verifyWeekFormula } from "./calc-verification";
import type { SellerCatalogSnapshot } from "./types";

describe("calc-verification", () => {
  it("week formula matches bank when Pay−L−St−A−Pen equals bank", () => {
    const r = verifyWeekFormula({
      byNm: [{ Pay: 100, L: 10, St: 1, A: 2, Pen: 3 }],
      noNm: { Pay: 50, L: 5, St: 0, A: 0, Pen: 4 },
      bankPaymentSum: 100 - 10 - 1 - 2 - 3 + 50 - 5 - 4,
    });
    assert.equal(r.ok, true);
    assert.equal(r.delta, 0);
  });

  it("sources without snapshot are not_loaded", () => {
    const sources = buildSourceStatuses(null);
    assert.ok(sources.every((s) => s.status === "not_loaded"));
  });

  it("buildCalcVerification returns 10 checks", () => {
    const snapshot: SellerCatalogSnapshot = {
      marketplaceId: "wildberries",
      items: [],
      syncedAt: new Date().toISOString(),
      totalCount: 0,
    };
    const report = buildCalcVerification({ snapshot, tasks: [] });
    assert.equal(report.checks.length, 10);
    assert.ok(report.sources.length >= 6);
  });
});
