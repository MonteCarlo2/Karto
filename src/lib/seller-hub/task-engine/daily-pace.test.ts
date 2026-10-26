import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evidenceRows } from "../../../components/seller-hub/hub-task-present";
import { stockCoverDays } from "../product-signal";
import { parseTaskReconcileBody } from "./parse";

describe("daily pace precision", () => {
  it("keeps 1 sale per 28 days and leaves cover days as 2772", () => {
    const body = parseTaskReconcileBody({
      marketplaceId: "wildberries",
      products: [
        {
          nmId: "999504767",
          stock: 99,
          coverDays: 2772,
          dailyPace: 1 / 28,
          marginPercent: 12.34,
        },
      ],
      store: {},
    });
    assert.ok(body);
    const fact = body.products[0];
    assert.equal(fact?.dailyPace, 0.035714);
    assert.equal(fact?.coverDays, 2772);
    assert.equal(fact?.marginPercent, 12.3);
    assert.equal(stockCoverDays(99, { retail: 0, net: 0, qty: 1, recentQty: 0 }), 2772);
  });

  it("shows a small pace instead of zero", () => {
    assert.equal(evidenceRows({ daily_pace: 1 / 28 })[0]?.value, "0,04 шт./день");
    assert.equal(evidenceRows({ daily_pace: 1.26 })[0]?.value, "1,3 шт./день");
    assert.equal(evidenceRows({ daily_pace: 0.14 })[0]?.value, "0,1 шт./день");
    assert.equal(evidenceRows({ daily_pace: 0 })[0]?.value, "0 шт./день");
  });
});
