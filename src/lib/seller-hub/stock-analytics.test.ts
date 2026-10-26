import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildStockAnalytics } from "./stock-analytics";
import type { SellerCatalogItem, SellerStocksReportNm, SellerStocksReportSnapshot } from "./types";

const sr = (o: Partial<SellerStocksReportNm>): SellerStocksReportNm => ({
  stockCount: 10,
  toClientCount: 0,
  fromClientCount: 0,
  lostOrdersCount: 0,
  lostOrdersSum: 0,
  lostBuyoutsCount: 0,
  lostBuyoutsSum: 0,
  officeMissingTimeDays: 0,
  officeMissingTimeSpecial: null,
  availability: null,
  buyoutPercent: null,
  avgOrders: null,
  ordersCount: 5,
  saleRateDays: 40,
  saleRateSpecial: null,
  avgStockTurnoverDays: null,
  avgStockTurnoverSpecial: null,
  ...o,
});
const item = (externalId: string, totalStock: number, costPrice: number | null): SellerCatalogItem => ({ id: externalId, marketplaceId: "wildberries", externalId, vendorCode: `V${externalId}`, title: `Товар ${externalId}`, totalStock, costPrice });
const report = (byNm: Record<string, SellerStocksReportNm>, status: SellerStocksReportSnapshot["status"] = "ok"): SellerStocksReportSnapshot => ({ loadedAt: "", version: 1, dateFrom: "", dateTo: "", status, byNm });

describe("остатки и оборачиваемость", () => {
  const rep = report({
    "1": sr({ stockCount: 0, ordersCount: 6, lostOrdersCount: 3, lostOrdersSum: 4500, saleRateDays: 0 }),
    "2": sr({ stockCount: 20, saleRateDays: 9 }),
    "3": sr({ stockCount: 100, saleRateDays: 200 }),
    "4": sr({ stockCount: 50, saleRateDays: null, saleRateSpecial: "infinite", ordersCount: 0 }),
    "5": sr({ stockCount: 30, saleRateDays: 45 }),
  });
  const items = [item("1", 0, 100), item("2", 20, 100), item("3", 100, 50), item("4", 50, null), item("5", 30, 10)];

  it("определяет статусы: закончился, мало, залёживается, нормально", () => {
    const { rows } = buildStockAnalytics(rep, items)!;
    const st = Object.fromEntries(rows.map((r) => [r.nmId, r.status]));
    assert.deepEqual(st, { "1": "out", "2": "low", "3": "over", "4": "over", "5": "ok" });
    assert.equal(rows[0]!.nmId, "1");
  });

  it("считает упущенное по данным WB и замороженные деньги только по себестоимости, остальное помечает", () => {
    const { summary } = buildStockAnalytics(rep, items)!;
    assert.equal(summary.lostSum, 4500);
    assert.equal(summary.lostOrders, 3);
    assert.equal(summary.frozenValue, 5000);
    assert.equal(summary.frozenWithoutCost, 1);
    assert.deepEqual([summary.out, summary.low, summary.over, summary.ok], [1, 1, 2, 1]);
  });

  it("пороги задаёт продавец: при большем пороге залёживания товар переходит в норму", () => {
    const a = buildStockAnalytics(rep, items, { lowDays: 14, overDays: 250 })!;
    assert.equal(a.rows.find((r) => r.nmId === "3")!.status, "ok");
    assert.equal(a.rows.find((r) => r.nmId === "4")!.status, "over"); // без продаж остаётся залежавшимся при любом пороге
    const b = buildStockAnalytics(rep, items, { lowDays: 60, overDays: 90 })!;
    assert.equal(b.rows.find((r) => r.nmId === "5")!.status, "low");
  });

  it("без отчёта, с ошибкой или без доступа — null", () => {
    assert.equal(buildStockAnalytics(null, items), null);
    assert.equal(buildStockAnalytics(report({}, "jam_required"), items), null);
    assert.equal(buildStockAnalytics({ ...rep, error: "x" }, items), null);
  });
});
