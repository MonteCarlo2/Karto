import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregatePaidStorageByNm,
  parsePaidStorageRows,
  paidStorageStatusFromHttp,
} from "./paid-storage-parse";
import { storagePerUnitDayFromPaidRows } from "@/lib/seller-hub/task-engine/stock-math";

describe("paid-storage-parse", () => {
  it("etalon: 12.6/42 + 13.2/44 → 0.3 ₽/шт./день", () => {
    const rate = storagePerUnitDayFromPaidRows([
      { warehousePrice: 12.6, barcodesCount: 42 },
      { warehousePrice: 13.2, barcodesCount: 44 },
    ]);
    assert.equal(rate, 0.3);
    const byNm = aggregatePaidStorageByNm(
      parsePaidStorageRows([
        { date: "2026-10-01", nmId: 11, warehousePrice: 12.6, barcodesCount: 42 },
        { date: "2026-10-02", nmId: 11, warehousePrice: 13.2, barcodesCount: 44 },
      ]),
    );
    assert.equal(byNm["11"]?.storagePerUnitDay, 0.3);
  });

  it("Σ barcodesCount = 0 → null", () => {
    assert.equal(
      storagePerUnitDayFromPaidRows([
        { warehousePrice: 5, barcodesCount: 0 },
        { warehousePrice: 3, barcodesCount: 0 },
      ]),
      null,
    );
  });

  it("maps 402 to payment_required", () => {
    assert.equal(paidStorageStatusFromHttp(402), "payment_required");
  });
});
