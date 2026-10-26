import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOrdersInsights, isCanceledOrder } from "./orders-insights";
import type { SellerOrderRow } from "./types";

const NOW = Date.parse("2026-10-16T12:00:00Z"); // 15:00 по Москве

const order = (id: number, patch: Partial<SellerOrderRow>): SellerOrderRow => ({
  id: String(id),
  externalId: id,
  nmId: 111,
  createdAt: "2026-10-15T09:00:00Z",
  price: 1000,
  supplierStatus: "complete",
  wbStatus: "sorted",
  ...patch,
});

describe("isCanceledOrder", () => {
  it("статусы отмены", () => {
    assert.equal(isCanceledOrder({ supplierStatus: "cancel", wbStatus: "" }), true);
    assert.equal(isCanceledOrder({ supplierStatus: "complete", wbStatus: "canceled_by_client" }), true);
    assert.equal(isCanceledOrder({ supplierStatus: "complete", wbStatus: "declined_by_client" }), true);
    assert.equal(isCanceledOrder({ supplierStatus: "complete", wbStatus: "sorted" }), false);
  });
});

describe("buildOrdersInsights", () => {
  it("пусто — null", () => {
    assert.equal(buildOrdersInsights([], NOW), null);
  });

  it("ждущие отгрузки и возраст самого старого заказа", () => {
    const rows = [
      order(1, { supplierStatus: "new", wbStatus: "waiting", createdAt: "2026-10-16T06:00:00Z" }), // 6 ч назад
      order(2, { supplierStatus: "confirm", wbStatus: "waiting", createdAt: "2026-10-16T10:00:00Z" }),
      order(3, {}),
    ];
    const r = buildOrdersInsights(rows, NOW)!;
    assert.equal(r.waiting.count, 2);
    assert.equal(r.waiting.newCount, 1);
    assert.equal(r.waiting.assemblyCount, 1);
    assert.equal(r.waiting.oldestHours, 6);
  });

  it("отмены: доля и артикулы с повторяющимися отменами выше средней", () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => order(10 + i, { nmId: 1 })),
      order(20, { nmId: 2, wbStatus: "canceled_by_client" }),
      order(21, { nmId: 2, wbStatus: "canceled_by_client" }),
      order(22, { nmId: 2 }),
      order(23, { nmId: 3 }),
    ];
    const r = buildOrdersInsights(rows, NOW)!;
    assert.equal(r.canceled, 2);
    assert.equal(r.cancelShare, 0.2);
    assert.deepEqual(r.cancelHot.map((p) => p.nmId), ["2"]);
  });

  it("по дням: сегодняшний день помечен неполным, средний чек без отменённых", () => {
    const rows = [
      order(1, { createdAt: "2026-10-15T09:00:00Z", price: 1000 }),
      order(2, { createdAt: "2026-10-15T10:00:00Z", price: 2000 }),
      order(3, { createdAt: "2026-10-16T08:00:00Z", price: 3000 }),
      order(4, { createdAt: "2026-10-16T08:30:00Z", price: 9999, wbStatus: "canceled_by_client" }),
    ];
    const r = buildOrdersInsights(rows, NOW)!;
    assert.deepEqual(r.daily.map((d) => [d.date, d.count, d.partial]), [
      ["2026-10-15", 2, false],
      ["2026-10-16", 2, true],
    ]);
    assert.equal(r.avgCheck, 2000);
  });

  it("часы пиков по Москве показываем только при достаточном числе заказов", () => {
    const few = buildOrdersInsights([order(1, {}), order(2, {})], NOW)!;
    assert.deepEqual(few.peakHours, []);
    const many = Array.from({ length: 30 }, (_, i) => order(i + 1, { createdAt: i < 18 ? "2026-10-15T07:10:00Z" : "2026-10-15T15:10:00Z" }));
    const r = buildOrdersInsights(many, NOW)!;
    assert.equal(r.peakHours[0]!.hour, 10); // 07:10 UTC = 10:10 МСК
    assert.equal(r.peakHours[0]!.count, 18);
  });

  it("концентрация: сколько артикулов дают 80% заказов", () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => order(i + 1, { nmId: 1 })),
      order(20, { nmId: 2 }),
      order(21, { nmId: 3 }),
      order(22, { nmId: 4 }),
    ];
    const r = buildOrdersInsights(rows, NOW)!;
    assert.deepEqual(r.concentration, { products: 2, of: 4 });
  });
});
