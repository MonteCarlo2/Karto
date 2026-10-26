import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stockCoverDays, stockPace } from "./product-signal";
import { assessOosRisk, assessOosRiskFromRealization } from "./stock-risk";
import { DEFAULT_TASK_THRESHOLDS } from "./task-engine/config";
import { taskFactsFromSnapshot } from "./task-engine/facts";
import type { SellerCatalogSnapshot } from "./types";

describe("days of stock and OOS risk", () => {
  const lowStockDays = DEFAULT_TASK_THRESHOLDS.lowStockDays;

  it("uses recent 7d pace when recentQty > 0", () => {
    const pace = stockPace(14, { retail: 0, net: 0, qty: 40, recentQty: 7 });
    assert.equal(pace.window, "recent");
    assert.equal(pace.daily, 1);
    assert.equal(pace.days, 14);
    assert.equal(stockCoverDays(14, { retail: 0, net: 0, qty: 40, recentQty: 7 }), 14);
  });

  it("falls back to 28d span when recent week has zero sales", () => {
    const pace = stockPace(28, { retail: 0, net: 0, qty: 28, recentQty: 0 });
    assert.equal(pace.window, "span");
    assert.equal(pace.daily, 1);
    assert.equal(pace.days, 28);
  });

  it("returns null cover and unknown risk when there are no sales", () => {
    assert.equal(stockCoverDays(10, { retail: 0, net: 0, qty: 0, recentQty: 0 }), null);
    assert.equal(stockCoverDays(10, undefined), null);
    const risk = assessOosRiskFromRealization(10, { retail: 0, net: 0, qty: 0 }, lowStockDays);
    assert.equal(risk.risk, "unknown");
    assert.equal(risk.coverDays, null);
  });

  it("treats zero stock as out_of_stock without inventing a date", () => {
    const risk = assessOosRisk({ stock: 0, coverDays: null, lowStockDays });
    assert.equal(risk.risk, "out_of_stock");
    assert.equal(risk.coverDays, null);
  });

  it("marks at_risk only below the configured lowStockDays threshold", () => {
    assert.equal(
      assessOosRisk({ stock: 3, coverDays: 3, paceWindow: "recent", lowStockDays }).risk,
      "at_risk",
    );
    assert.equal(
      assessOosRisk({ stock: 3, coverDays: 7, paceWindow: "recent", lowStockDays }).risk,
      "ok",
    );
    assert.equal(
      assessOosRisk({ stock: 3, coverDays: 6, paceWindow: "span", lowStockDays: 5 }).risk,
      "ok",
    );
  });

  it("does not claim risk when cover days are missing", () => {
    assert.equal(
      assessOosRisk({ stock: 5, coverDays: null, lowStockDays }).risk,
      "unknown",
    );
  });

  it("task facts leave coverDays null without realization and fill them with report", () => {
    const base: SellerCatalogSnapshot = {
      marketplaceId: "wildberries",
      syncedAt: new Date().toISOString(),
      totalCount: 1,
      items: [
        {
          id: "i1",
          marketplaceId: "wildberries",
          externalId: "100",
          vendorCode: "A",
          title: "Товар",
          totalStock: 6,
          price: 500,
          discountedPrice: 500,
        },
      ],
    };
    const without = taskFactsFromSnapshot(base);
    assert.equal(without.products[0]?.coverDays, null);
    assert.equal(without.products[0]?.paceWindow, null);
    assert.equal(without.products[0]?.dailyPace, null);

    const withReport = taskFactsFromSnapshot({
      ...base,
      realization: {
        loadedAt: new Date().toISOString(),
        version: 3,
        dateFrom: "2026-01-01",
        dateTo: "2026-01-28",
        accountRetail: 1000,
        accountNet: 500,
        byNm: {
          "100": { retail: 1000, net: 500, qty: 28, recentQty: 7 },
        },
      },
    });
    assert.equal(withReport.products[0]?.coverDays, 6);
    assert.equal(withReport.products[0]?.paceWindow, "recent");
    assert.equal(withReport.products[0]?.dailyPace, 1);
    assert.equal(
      assessOosRisk({
        stock: withReport.products[0]!.stock,
        coverDays: withReport.products[0]!.coverDays,
        paceWindow: withReport.products[0]!.paceWindow,
        lowStockDays,
      }).risk,
      "at_risk",
    );
  });
});
