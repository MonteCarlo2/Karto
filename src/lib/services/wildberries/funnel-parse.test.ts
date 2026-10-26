import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SELLER_FUNNEL_SNAPSHOT_VERSION } from "@/lib/seller-hub/types";
import {
  funnelNmFromProduct,
  funnelNumber,
  funnelStatusFromHttp,
  funnelNeedsReload,
  isFunnelReadyForDemandTasks,
  mergeFunnelKeepPrevious,
  parseFunnelPeriod,
} from "./funnel-parse";

describe("funnel parser", () => {
  it("maps missing field to null and real zero to 0", () => {
    assert.equal(funnelNumber(undefined), null);
    assert.equal(funnelNumber(null), null);
    assert.equal(funnelNumber(0), 0);
    assert.equal(funnelNumber(12), 12);
    const period = parseFunnelPeriod({
      openCount: 0,
      orderCount: 5,
      conversions: { addToCartPercent: 0, cartToOrderPercent: 10 },
    });
    assert.ok(period);
    assert.equal(period.openCount, 0);
    assert.equal(period.cartCount, null);
    assert.equal(period.orderCount, 5);
    assert.equal(period.addToCartPercent, 0);
    assert.equal(period.cartToOrderPercent, 10);
    assert.equal(period.buyoutPercent, null);
  });

  it("keeps legacy orders defaults and past null when past object is absent", () => {
    const row = funnelNmFromProduct({
      product: { nmId: 42, feedbackRating: 4.5 },
      statistic: { selected: { orderCount: 8, avgOrdersCountPerDay: 0.3 } },
    });
    assert.ok(row);
    assert.equal(row.orders, 8);
    assert.equal(row.ordersPerDay, 0.3);
    assert.equal(row.priorOrders, null);
    assert.equal(row.past, null);
    assert.equal(row.selected.orderCount, 8);
  });

  it("maps HTTP statuses to load status", () => {
    assert.equal(funnelStatusFromHttp(402), "jam_required");
    assert.equal(funnelStatusFromHttp(429), "rate_limited");
    assert.equal(funnelStatusFromHttp(401), "forbidden");
    assert.equal(funnelStatusFromHttp(403), "forbidden");
    assert.equal(funnelStatusFromHttp(500), "error");
  });

  it("keeps previous byNm when a new load fails", () => {
    const previous = {
      loadedAt: "2026-10-12T00:00:00.000Z",
      version: SELLER_FUNNEL_SNAPSHOT_VERSION,
      dateFrom: "a",
      dateTo: "b",
      byNm: {
        "1": funnelNmFromProduct({
          product: { nmId: 1 },
          statistic: { selected: { orderCount: 3 }, past: { orderCount: 4 } },
        })!,
      },
      status: "ok" as const,
    };
    const merged = mergeFunnelKeepPrevious(previous, {
      loadedAt: "2026-10-13T00:00:00.000Z",
      version: SELLER_FUNNEL_SNAPSHOT_VERSION,
      dateFrom: "a",
      dateTo: "b",
      status: "rate_limited",
      byNm: {},
      error: "WB отдаёт воронку редко.",
    });
    assert.equal(merged.error, "WB отдаёт воронку редко.");
    assert.equal(merged.status, "rate_limited");
    assert.equal(merged.byNm["1"]?.orders, 3);
  });

  it("reloads funnel when catalog syncedAt is newer than funnel.loadedAt", () => {
    const funnel = {
      loadedAt: "2026-10-12T10:00:00.000Z",
      version: SELLER_FUNNEL_SNAPSHOT_VERSION,
      byNm: {
        "1": funnelNmFromProduct({
          product: { nmId: 1 },
          statistic: { selected: { orderCount: 3, openCount: 10 }, past: { orderCount: 4 } },
        })!,
      },
    };
    assert.equal(funnelNeedsReload(funnel, "2026-10-12T09:00:00.000Z"), false);
    assert.equal(funnelNeedsReload(funnel, "2026-10-12T11:00:00.000Z"), true);
  });

  it("treats version 1 funnel without selected as not ready for demand tasks", () => {
    assert.equal(
      isFunnelReadyForDemandTasks({
        loadedAt: "2026-10-12T00:00:00.000Z",
        version: 1,
        byNm: { "1": { orders: 1, priorOrders: 2, feedbackRating: null, ordersPerDay: 0.1, selected: emptySelected(), past: null } },
      }),
      false,
    );
    assert.equal(
      isFunnelReadyForDemandTasks({
        loadedAt: "2026-10-12T00:00:00.000Z",
        version: SELLER_FUNNEL_SNAPSHOT_VERSION,
        byNm: {
          "1": funnelNmFromProduct({
            product: { nmId: 1 },
            statistic: { selected: { orderCount: 3, openCount: 10 }, past: { orderCount: 4 } },
          })!,
        },
      }),
      true,
    );
  });
});

function emptySelected() {
  return {
    openCount: null,
    cartCount: null,
    orderCount: null,
    orderSum: null,
    buyoutCount: null,
    cancelCount: null,
    avgOrdersCountPerDay: null,
    avgPrice: null,
    addToCartPercent: null,
    cartToOrderPercent: null,
    buyoutPercent: null,
  };
}
