import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { storeBuyoutFromFunnel } from "./buyout";
import type { SellerFunnelPeriod, SellerFunnelSnapshot } from "./types";

function period(buyoutCount: number | null, cancelCount: number | null): SellerFunnelPeriod {
  return {
    openCount: null,
    cartCount: null,
    orderCount: null,
    orderSum: null,
    buyoutCount,
    cancelCount,
    avgOrdersCountPerDay: null,
    avgPrice: null,
    addToCartPercent: null,
    cartToOrderPercent: null,
    buyoutPercent: null,
  };
}

function funnel(rows: Array<[number | null, number | null]>, patch: Partial<SellerFunnelSnapshot> = {}): SellerFunnelSnapshot {
  const byNm: SellerFunnelSnapshot["byNm"] = {};
  rows.forEach(([b, c], index) => {
    byNm[String(index + 1)] = {
      orders: 0,
      priorOrders: null,
      feedbackRating: null,
      ordersPerDay: 0,
      selected: period(b, c),
      past: null,
    };
  });
  return {
    loadedAt: "2026-10-16T07:00:00Z",
    version: 2,
    dateFrom: "2026-09-19",
    dateTo: "2026-10-16",
    status: "ok",
    byNm,
    ...patch,
  } as SellerFunnelSnapshot;
}

describe("storeBuyoutFromFunnel", () => {
  it("считает выкуп по завершённым заказам", () => {
    const result = storeBuyoutFromFunnel(funnel([[8, 2], [1, 0]]));
    assert.ok(result);
    assert.equal(result.buyouts, 9);
    assert.equal(result.cancels, 2);
    assert.equal(result.completed, 11);
    assert.equal(result.percent, 81.8);
  });

  it("нет завершённых заказов — null, а не 0%", () => {
    assert.equal(storeBuyoutFromFunnel(funnel([[0, 0]])), null);
  });

  it("поле отсутствует у любого артикула — null", () => {
    assert.equal(storeBuyoutFromFunnel(funnel([[3, 1], [null, 1]])), null);
  });

  it("воронка с ошибкой или неполная — null", () => {
    assert.equal(storeBuyoutFromFunnel(funnel([[3, 1]], { status: "error" })), null);
    assert.equal(storeBuyoutFromFunnel(null), null);
    const partial = { ...funnel([[3, 1]]), truncated: true };
    assert.equal(storeBuyoutFromFunnel(partial), null);
  });
});
