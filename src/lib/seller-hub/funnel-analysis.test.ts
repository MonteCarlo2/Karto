import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { orderSources, productFunnels, storeFunnel } from "./funnel-analysis";
import type { SellerFunnelPeriod, SellerFunnelSnapshot } from "./types";

const period = (open: number, cart: number, order: number, buyout: number): SellerFunnelPeriod => ({
  openCount: open,
  cartCount: cart,
  orderCount: order,
  orderSum: null,
  buyoutCount: buyout,
  cancelCount: null,
  avgOrdersCountPerDay: null,
  avgPrice: null,
  addToCartPercent: null,
  cartToOrderPercent: null,
  buyoutPercent: null,
});

function funnel(rows: Record<string, [SellerFunnelPeriod, SellerFunnelPeriod | null]>, patch: Partial<SellerFunnelSnapshot> = {}): SellerFunnelSnapshot {
  const byNm: SellerFunnelSnapshot["byNm"] = {};
  for (const [nm, [selected, past]] of Object.entries(rows)) {
    byNm[nm] = { orders: 0, priorOrders: null, feedbackRating: null, ordersPerDay: 0, selected, past };
  }
  return { loadedAt: "2026-10-16T00:00:00Z", version: 2, dateFrom: "2026-09-19", dateTo: "2026-10-16", status: "ok", byNm, ...patch } as SellerFunnelSnapshot;
}

describe("storeFunnel", () => {
  it("суммирует по артикулам, считает конверсии шагов и сравнивает с прошлым периодом", () => {
    const result = storeFunnel(funnel({ a: [period(1000, 100, 20, 15), period(800, 80, 10, 8)], b: [period(1000, 100, 30, 25), period(800, 80, 14, 10)] }));
    assert.ok(result);
    const [open, cart, order, buyout] = result.steps;
    assert.equal(open!.count, 2000);
    assert.equal(cart!.conversion, 10);
    assert.equal(order!.conversion, 25);
    assert.equal(buyout!.conversion, 80);
    assert.equal(open!.pastCount, 1600);
    assert.equal(cart!.pastConversion, 10);
    assert.equal(order!.pastConversion, 15);
  });

  it("нет воронки, ошибка, Джем или пустые переходы — null", () => {
    assert.equal(storeFunnel(null), null);
    assert.equal(storeFunnel(funnel({ a: [period(100, 10, 1, 1), null] }, { status: "jam_required" })), null);
    assert.equal(storeFunnel(funnel({ a: [period(0, 0, 0, 0), null] })), null);
  });
});

describe("productFunnels", () => {
  it("находит самый слабый шаг относительно среднего по магазину при достаточной базе", () => {
    const rows = productFunnels(
      funnel({
        good: [period(1000, 100, 30, 24), null],
        weakCart: [period(1000, 20, 6, 5), null],
        tiny: [period(10, 0, 0, 0), null],
      }),
    );
    const weak = rows.find((r) => r.nmId === "weakCart");
    assert.equal(weak?.weakest?.step, "openToCart");
    assert.ok((weak?.weakest?.gapPoints ?? 0) > 0);
    // у товара с малым числом переходов шаг не оценивается
    assert.equal(rows.find((r) => r.nmId === "tiny")?.weakest, null);
  });

  it("строки по убыванию переходов", () => {
    const rows = productFunnels(funnel({ a: [period(100, 10, 2, 1), null], b: [period(500, 50, 5, 4), null] }));
    assert.deepEqual(rows.map((r) => r.nmId), ["b", "a"]);
  });
});

describe("orderSources", () => {
  it("делит заказы за общие дни на рекламу прямую, ассоциированную и остальное", () => {
    const result = orderSources({
      adDaily: [
        { date: "2026-10-10", orders: 4 },
        { date: "2026-10-11", orders: 6 },
        { date: "2026-10-20", orders: 9 },
      ],
      adDirectOrders: 8,
      adAssociatedOrders: 2,
      storeDaily: [
        { date: "2026-10-10", orders: 10 },
        { date: "2026-10-11", orders: 10 },
      ],
    });
    assert.deepEqual(result, { days: 2, total: 20, adDirect: 8, adAssociated: 2, organic: 10 });
  });

  it("нет общих дней или нет заказов — null; реклама не больше всех заказов", () => {
    assert.equal(orderSources({ adDaily: [{ date: "2026-10-01", orders: 1 }], adDirectOrders: 1, adAssociatedOrders: 0, storeDaily: [] }), null);
    const capped = orderSources({
      adDaily: [{ date: "2026-10-10", orders: 50 }],
      adDirectOrders: 50,
      adAssociatedOrders: 0,
      storeDaily: [{ date: "2026-10-10", orders: 10 }],
    });
    assert.equal(capped?.organic, 0);
    assert.equal(capped?.adDirect, 10);
  });
});
