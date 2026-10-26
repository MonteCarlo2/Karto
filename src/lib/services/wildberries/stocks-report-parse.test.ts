import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SELLER_STOCKS_REPORT_SNAPSHOT_VERSION } from "@/lib/seller-hub/types";
import {
  mergeStocksReportKeepPrevious,
  readStocksReportItems,
  stocksDurationDays,
  stocksLostMetric,
  stocksNmFromItem,
  stocksNumber,
  stocksReportNeedsReload,
} from "./stocks-report-parse";

describe("stocks-report-parse numbers", () => {
  it("missing → null, zero → 0", () => {
    assert.equal(stocksNumber(undefined), null);
    assert.equal(stocksNumber(null), null);
    assert.equal(stocksNumber(0), 0);
    assert.equal(stocksNumber(12), 12);
  });

  it("lost metrics: -2 → 0, other negatives → null", () => {
    assert.equal(stocksLostMetric(-2), 0);
    assert.equal(stocksLostMetric(-1), null);
    assert.equal(stocksLostMetric(-3), null);
    assert.equal(stocksLostMetric(0), 0);
    assert.equal(stocksLostMetric(15.5), 15.5);
    assert.equal(stocksLostMetric(undefined), null);
  });

  it("duration special cases", () => {
    assert.equal(stocksDurationDays({ days: 5, hours: 0 }).days, 5);
    assert.equal(stocksDurationDays({ days: 0, hours: -1 }).special, "infinite");
    assert.equal(stocksDurationDays({ days: 0, hours: -2 }).days, 0);
    assert.equal(stocksDurationDays({ days: 0, hours: -3 }).special, "uncalculated");
    assert.equal(stocksDurationDays({ days: 0, hours: -4 }).special, "entire_period");
  });
});

describe("stocksNmFromItem", () => {
  it("parses metrics and keeps absent fields null", () => {
    const row = stocksNmFromItem({
      nmID: 100,
      metrics: {
        stockCount: 10,
        toClientCount: 2,
        fromClientCount: 1,
        lostOrdersCount: -2,
        lostOrdersSum: 500,
        availability: "balanced",
        buyoutPercent: 80,
      },
    });
    assert.ok(row);
    assert.equal(row!.stockCount, 10);
    assert.equal(row!.toClientCount, 2);
    assert.equal(row!.fromClientCount, 1);
    assert.equal(row!.lostOrdersCount, 0);
    assert.equal(row!.lostOrdersSum, 500);
    assert.equal(row!.lostBuyoutsCount, null);
    assert.equal(row!.availability, "balanced");
    assert.equal(row!.buyoutPercent, 80);
  });
});

describe("readStocksReportItems", () => {
  it("recognizes data.items", () => {
    const parsed = readStocksReportItems(JSON.stringify({ data: { items: [{ nmID: 1, metrics: {} }], currency: "RUB" } }));
    assert.equal(parsed.recognized, true);
    assert.equal(parsed.items.length, 1);
  });

  it("empty body is recognized", () => {
    assert.equal(readStocksReportItems("").recognized, true);
  });

  it("garbage is not recognized", () => {
    assert.equal(readStocksReportItems("not-json").recognized, false);
  });
});

describe("merge and reload", () => {
  it("keeps previous byNm on error", () => {
    const previous = {
      loadedAt: "2026-10-01T00:00:00.000Z",
      version: SELLER_STOCKS_REPORT_SNAPSHOT_VERSION,
      dateFrom: "2026-09-01",
      dateTo: "2026-09-28",
      status: "ok" as const,
      byNm: {
        "1": {
          stockCount: 5,
          toClientCount: 0,
          fromClientCount: 0,
          lostOrdersCount: null,
          lostOrdersSum: null,
          lostBuyoutsCount: null,
          lostBuyoutsSum: null,
          officeMissingTimeDays: null,
          officeMissingTimeSpecial: null,
          availability: "actual",
          buyoutPercent: 50,
          avgOrders: 1,
          ordersCount: 28,
          saleRateDays: 10,
          saleRateSpecial: null,
          avgStockTurnoverDays: 12,
          avgStockTurnoverSpecial: null,
        },
      },
    };
    const incoming = {
      loadedAt: "2026-10-13T00:00:00.000Z",
      version: SELLER_STOCKS_REPORT_SNAPSHOT_VERSION,
      dateFrom: "2026-09-15",
      dateTo: "2026-10-12",
      status: "error" as const,
      byNm: {},
      error: "429",
    };
    const merged = mergeStocksReportKeepPrevious(previous, incoming);
    assert.equal(merged.byNm["1"]?.stockCount, 5);
    assert.equal(merged.error, "429");
    assert.equal(merged.status, "error");
  });

  it("needs reload after newer catalog sync", () => {
    assert.equal(stocksReportNeedsReload(null, "2026-10-13T00:00:00.000Z"), true);
    assert.equal(
      stocksReportNeedsReload(
        {
          loadedAt: "2026-10-12T00:00:00.000Z",
          version: SELLER_STOCKS_REPORT_SNAPSHOT_VERSION,
          byNm: { "1": {} as never },
          status: "ok",
          error: undefined,
        },
        "2026-10-13T00:00:00.000Z",
      ),
      true,
    );
    assert.equal(
      stocksReportNeedsReload(
        {
          loadedAt: "2026-10-13T12:00:00.000Z",
          version: SELLER_STOCKS_REPORT_SNAPSHOT_VERSION,
          byNm: { "1": {} as never },
          status: "ok",
          error: undefined,
        },
        "2026-10-13T00:00:00.000Z",
      ),
      false,
    );
  });
});
