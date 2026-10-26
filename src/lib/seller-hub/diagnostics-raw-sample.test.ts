import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRawRealizationSample } from "./diagnostics";
import { EMPTY_STOCKS_REPORT_FIELDS } from "./task-engine/types";
import type { TaskFact } from "./task-engine/types";

function fact(patch: Partial<TaskFact>): TaskFact {
  return {
    nmId: "1",
    itemId: "i",
    title: "t",
    vendorCode: "v",
    stock: 0,
    price: 100,
    promoPrice: 100,
    cost: 50,
    salesQty: 0,
    salesKnown: true,
    priorSalesQty: 0,
    recentSalesQty: 0,
    coverDays: null,
    paceWindow: null,
    dailyPace: null,
    sittingRub: null,
    marginPercent: null,
    marginRub: null,
    marginSource: null,
    contentScore: null,
    contentGap: null,
    photoCount: null,
    createdAt: null,
    paceSource: null,
    funnelStatus: "not_loaded",
    orders: null,
    priorOrders: null,
    ordersPerDay: null,
    priorOrdersPerDay: null,
    openCount: null,
    priorOpenCount: null,
    cartCount: null,
    priorCartCount: null,
    addToCartPercent: null,
    priorAddToCartPercent: null,
    cartToOrderPercent: null,
    priorCartToOrderPercent: null,
    avgOrderPrice: null,
    orderSum: null,
    priorOrderSum: null,
    funnelDateFrom: null,
    funnelDateTo: null,
    funnelPastDateFrom: null,
    funnelPastDateTo: null,
    ...EMPTY_STOCKS_REPORT_FIELDS,
    ...patch,
  };
}

describe("buildRawRealizationSample", () => {
  it("picks top sold, returns, wb stock and strips srid", () => {
    const dateTo = "2026-10-13";
    const facts = [
      fact({ nmId: "10", salesQty: 50, sellerRevenueS: 50_000, stockFbo: 0 }),
      fact({ nmId: "20", salesQty: 5, sellerRevenueS: 5_000, stockFbo: 12 }),
      fact({ nmId: "30", salesQty: 2, sellerRevenueS: 2_000, stockFbo: 0 }),
    ];
    const rawRows = [
      {
        nmId: 10,
        quantity: 1,
        forPay: "100",
        sellerOperName: "Продажа",
        rrDate: "2026-10-10",
        srid: "SECRET",
        stickerId: "x",
      },
      {
        nmId: 30,
        quantity: 1,
        forPay: "50",
        sellerOperName: "Возврат",
        rrDate: "2026-09-01",
        srid: "SECRET2",
      },
      {
        nmId: 20,
        quantity: 0,
        deliveryService: "10",
        sellerOperName: "Доставка",
        rrDate: "2026-10-01",
      },
      {
        nmId: 99,
        quantity: 1,
        sellerOperName: "Продажа",
        rrDate: "2026-10-05",
      },
    ];
    const sample = buildRawRealizationSample({ rawRows, facts, dateTo });
    assert.ok(sample);
    assert.deepEqual(
      sample.picked.map((p) => p.role),
      ["top_sold", "with_returns", "wb_stock"],
    );
    assert.deepEqual(
      sample.picked.map((p) => p.nmId).sort(),
      ["10", "20", "30"],
    );
    assert.ok(sample.rows.every((r) => !("srid" in r) && !("stickerId" in r)));
    assert.ok(sample.rows.some((r) => r.window === "current"));
    assert.ok(sample.rows.some((r) => r.window === "prior"));
    assert.equal(sample.windows.currentFrom, "2026-09-16");
    assert.equal(sample.windows.priorFrom, "2026-08-19");
    assert.ok(sample.rows.every((r) => r.nmId === 10 || r.nmId === 20 || r.nmId === 30));
  });
});
