import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reconcileRowsAgainstBank } from "./realization-margin";

describe("reconcileRowsAgainstBank multi-report week", () => {
  it("sums all reportIds for the same week dates", () => {
    const rows = [
      {
        reportId: 1,
        dateFrom: "2026-10-05",
        dateTo: "2026-10-11",
        nmId: 10,
        quantity: 1,
        retailAmount: "100",
        forPay: "80",
        deliveryService: "5",
        paidStorage: "0",
        paidAcceptance: "0",
        penalty: "0",
        sellerOperName: "Продажа",
      },
      {
        reportId: 2,
        dateFrom: "2026-10-05",
        dateTo: "2026-10-11",
        nmId: 10,
        quantity: 1,
        retailAmount: "50",
        forPay: "40",
        deliveryService: "2",
        paidStorage: "0",
        paidAcceptance: "0",
        penalty: "0",
        sellerOperName: "Продажа",
      },
      {
        reportId: 9,
        dateFrom: "2026-09-28",
        dateTo: "2026-10-04",
        nmId: 10,
        quantity: 1,
        forPay: "999",
        deliveryService: "0",
        sellerOperName: "Продажа",
      },
    ];
    const out = reconcileRowsAgainstBank(rows, 2, "2026-10-05", "2026-10-11", 113, [1, 2]);
    assert.deepEqual(out.reportIds, [1, 2]);
    assert.equal(out.computed, 80 - 5 + 40 - 2);
    assert.equal(out.bankPaymentSum, 113);
    assert.equal(out.ok, true);
  });
});
