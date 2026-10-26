import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOrdersByProduct } from "./orders-by-product";
import type { SellerOrderRow } from "./types";

const NOW = Date.parse("2026-10-17T12:00:00Z");
const o = (id: number, nmId: number, supplierStatus: string, wbStatus: string, createdAt: string, price = 1000): SellerOrderRow => ({ id: String(id), externalId: id, nmId, supplierStatus, wbStatus, createdAt, price });

describe("заказы по товарам", () => {
  const orders = [
    o(1, 1, "new", "waiting", "2026-10-16T10:00:00Z"),
    o(2, 1, "confirm", "waiting", "2026-10-15T10:00:00Z"),
    o(3, 1, "complete", "sold", "2026-10-12T12:00:00Z"),
    o(4, 1, "cancel", "canceled", "2026-10-13T10:00:00Z"),
    o(5, 2, "complete", "sorted", "2026-10-14T10:00:00Z", 500),
  ];
  const items = [
    { externalId: "1", title: "Ведро", vendorCode: "V-1", stockFbs: 10 },
    { externalId: "2", title: "Таз", stockFbs: null },
  ];

  it("раскладывает заказы по состояниям и суммирует выручку без отмен", () => {
    const r = buildOrdersByProduct(orders, items, NOW);
    const bucket = r.find((x) => x.nmId === "1")!;
    assert.deepEqual([bucket.orders, bucket.canceled, bucket.waiting, bucket.inDelivery, bucket.sold], [4, 1, 2, 0, 1]);
    assert.equal(bucket.revenue, 3000);
    assert.equal(bucket.title, "Ведро");
    assert.equal(bucket.article, "V-1");
    assert.equal(r[0]!.nmId, "1");
  });

  it("спрос и запас считаются по охваченным дням; без остатка запас неизвестен", () => {
    const r = buildOrdersByProduct(orders, items, NOW);
    const a = r.find((x) => x.nmId === "1")!;
    assert.equal(a.dailyDemand, 0.6);
    assert.equal(a.coverDays, 16.7);
    assert.equal(r.find((x) => x.nmId === "2")!.coverDays, null);
    assert.equal(r.find((x) => x.nmId === "2")!.inDelivery, 1);
  });

  it("пустой список заказов даёт пустой результат", () => {
    assert.deepEqual(buildOrdersByProduct([], items, NOW), []);
  });
});
