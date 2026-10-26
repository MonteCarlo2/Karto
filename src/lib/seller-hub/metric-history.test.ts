import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { metricValue, missingDays, rowsFromFunnelDay, STORE_NM_ID, storeSeries, stockByNm } from "./metric-history";
import type { SellerFunnelNm, SellerFunnelSnapshot, SellerStocksReportSnapshot } from "./types";

const period = (orders: number, opens: number) => ({
  openCount: opens, cartCount: 1, orderCount: orders, orderSum: orders * 100, buyoutCount: 0, cancelCount: 0,
  avgOrdersCountPerDay: null, avgPrice: null, addToCartPercent: null, cartToOrderPercent: null, buyoutPercent: null,
});
const nm = (orders: number, opens: number): SellerFunnelNm => ({ orders, priorOrders: null, feedbackRating: null, ordersPerDay: orders, selected: period(orders, opens), past: null });
const funnel = (extra: Partial<SellerFunnelSnapshot> = {}): SellerFunnelSnapshot =>
  ({ loadedAt: "", version: 2, dateFrom: "2026-10-20", dateTo: "2026-10-20", status: "ok", byNm: { "1": nm(2, 10), "2": nm(3, 20) }, ...extra }) as SellerFunnelSnapshot;

describe("история показателей", () => {
  it("докачивает только законченные дни, самые свежие первыми", () => {
    assert.deepEqual(missingDays(["2026-10-20"], "2026-10-21", 90, 3), ["2026-10-19", "2026-10-18", "2026-10-17"]);
    assert.deepEqual(missingDays([], "2026-10-21", 90, 2), ["2026-10-20", "2026-10-19"]);
    assert.deepEqual(missingDays(["2026-10-20", "2026-10-19"], "2026-10-21", 2, 3), []);
  });

  it("строка магазина — сумма по артикулам; пропуски в данных не превращаются в нули", () => {
    const rows = rowsFromFunnelDay(funnel(), "2026-10-20");
    const store = rows.find((r) => r.nmId === STORE_NM_ID)!;
    assert.equal(rows.length, 3);
    assert.equal(store.metrics.orders, 5);
    assert.equal(store.metrics.opens, 30);
  });

  it("не пишет итог магазина, если WB отдал не все карточки, и ничего не пишет при ошибке", () => {
    assert.equal(rowsFromFunnelDay(funnel({ truncated: true }), "2026-10-20").some((r) => r.nmId === STORE_NM_ID), false);
    assert.deepEqual(rowsFromFunnelDay(funnel({ status: "rate_limited", error: "429" }), "2026-10-20"), []);
  });

  it("конверсии считаются из чисел дня, без базы — пусто, а не ноль", () => {
    const day = { date: "2026-10-20", opens: 200, carts: 20, orders: 5, orderSum: 500, buyouts: 0, cancels: 0 };
    assert.equal(metricValue(day, "cartConv"), 10);
    assert.equal(metricValue(day, "orderConv"), 25);
    assert.equal(metricValue({ ...day, opens: 0 }, "cartConv"), null);
    assert.equal(metricValue({ ...day, carts: null }, "orderConv"), null);
    assert.equal(metricValue(day, "orderSum"), 500);
  });

  it("остатки читаются только из удачного отчёта; ряд магазина отсортирован", () => {
    const report = { status: "ok", byNm: { "1": { stockCount: 7 }, "2": { stockCount: null } } } as unknown as SellerStocksReportSnapshot;
    assert.deepEqual([...stockByNm(report)], [["1", 7]]);
    assert.equal(stockByNm({ ...report, status: "error", error: "x" } as SellerStocksReportSnapshot).size, 0);
    const series = storeSeries([
      { metric_date: "2026-10-20", nm_id: "", metrics: { orders: 2 } as never },
      { metric_date: "2026-10-19", nm_id: "", metrics: { orders: 1 } as never },
      { metric_date: "2026-10-19", nm_id: "5", metrics: { orders: 9 } as never },
    ]);
    assert.deepEqual(series.map((p) => p.date), ["2026-10-19", "2026-10-20"]);
  });
});
