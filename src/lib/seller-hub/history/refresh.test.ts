import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickSnapshotFields } from "./refresh";

describe("история по дням: поля снимка", () => {
  it("остаток, цена и скидка сохраняются при дозаписи воронки, воронка не переносится", () => {
    const kept = pickSnapshotFields({ opens: 10, carts: 2, orders: 1, orderSum: 900, buyouts: 0, cancels: 0, stock: 40, price: 996, discount: 5 });
    assert.deepEqual(kept, { stock: 40, price: 996, discount: 5 });
  });

  it("пустые значения не переносятся, скидка ноль сохраняется", () => {
    assert.deepEqual(pickSnapshotFields({ stock: null, price: 500, discount: 0 }), { price: 500, discount: 0 });
    assert.deepEqual(pickSnapshotFields(null), {});
  });
});
