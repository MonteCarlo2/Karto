import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMonthReconcile } from "./diagnostics";
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
    cost: null,
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

describe("buildMonthReconcile", () => {
  it("sums September lines and lists missing cost", () => {
    const rawRows = [
      {
        nmId: 10,
        quantity: 2,
        retailPriceWithDisc: "100",
        retailAmount: "180",
        forPay: "150",
        deliveryService: "10",
        paidStorage: "1",
        paidAcceptance: "2",
        penalty: "3",
        rebillLogisticCost: "5",
        sellerOperName: "Продажа",
        rrDate: "2026-09-15",
      },
      {
        nmId: 20,
        quantity: 1,
        retailPriceWithDisc: "50",
        retailAmount: "40",
        forPay: "30",
        deliveryService: "4",
        paidStorage: "0",
        paidAcceptance: "0",
        penalty: "0",
        rebillLogisticCost: "0",
        sellerOperName: "Продажа",
        rrDate: "2026-09-20",
      },
      {
        nmId: 10,
        quantity: 1,
        forPay: "0",
        deliveryService: "7",
        sellerOperName: "Логистика",
        rrDate: "2026-10-01",
      },
    ];
    const out = buildMonthReconcile({
      rawRows,
      facts: [
        fact({ nmId: "10", title: "A", cost: 40 }),
        fact({ nmId: "20", title: "B", cost: null }),
      ],
      monthFrom: "2026-09-01",
      monthTo: "2026-09-30",
      bankPaymentSum: 160,
      bankReports: [
        {
          reportId: 1,
          dateFrom: "2026-09-01",
          dateTo: "2026-09-07",
          bankPaymentSum: 160,
        },
      ],
      bankError: null,
    });
    assert.equal(out.rowCount, 2);
    assert.equal(out.sumPay, 180);
    assert.equal(out.sumL, 14);
    assert.equal(out.sumSt, 1);
    assert.equal(out.sumA, 2);
    assert.equal(out.sumPen, 3);
    assert.equal(out.sumRebill, 5);
    assert.equal(out.computed, 180 - 14 - 1 - 2 - 3);
    assert.equal(out.bankPaymentSum, 160);
    assert.equal(out.costSum, 2 * 40);
    // nm10: P = 150 − 10 − 1 − 2 − 80 = 57; nm20 без cost: P = 30 − 4 = 26; sumP = 83
    assert.equal(out.sumP, 57 + 26);
    assert.equal(out.identityLeft, out.sumP - out.sumPen);
    assert.equal(out.identityRight, 160 - 80);
    assert.equal(out.identityOk, true);
    assert.equal(out.products.length, 2);
    assert.equal(out.products.find((p) => p.nmId === "10")?.P, 57);
    assert.ok(out.penBreakdown.some((r) => r.pen === 3));
    assert.deepEqual(out.missingCost, [{ nmId: "20", N: 1, title: "B", vendorCode: "v" }]);
  });
});
