import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { abcSummary, buildInsights, buildProductRows, buildStoreKpis, pctChange, topMovers } from "./analytics-core";
import type { SellerCatalogItem, SellerFunnelNm, SellerFunnelPeriod, SellerFunnelSnapshot, SellerStocksReportNm, SellerStocksReportSnapshot } from "./types";

const period = (o: Partial<SellerFunnelPeriod>): SellerFunnelPeriod => ({
  openCount: 0,
  cartCount: 0,
  orderCount: 0,
  orderSum: 0,
  buyoutCount: 0,
  cancelCount: 0,
  avgOrdersCountPerDay: null,
  avgPrice: null,
  addToCartPercent: null,
  cartToOrderPercent: null,
  buyoutPercent: null,
  ...o,
});
const nm = (selected: Partial<SellerFunnelPeriod>, past: Partial<SellerFunnelPeriod> | null, rating = 4.5): SellerFunnelNm => ({
  orders: selected.orderCount ?? 0,
  priorOrders: past?.orderCount ?? null,
  feedbackRating: rating,
  ordersPerDay: 0,
  selected: period(selected),
  past: past ? period(past) : null,
});
const funnel = (byNm: Record<string, SellerFunnelNm>): SellerFunnelSnapshot => ({ loadedAt: "", version: 2, dateFrom: "2026-09-22", dateTo: "2026-10-19", pastDateFrom: "2026-08-25", pastDateTo: "2026-09-21", status: "ok", byNm });
const item = (externalId: string, title: string): SellerCatalogItem => ({ id: externalId, marketplaceId: "wildberries", externalId, vendorCode: `V${externalId}`, title });
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
  ordersCount: null,
  saleRateDays: null,
  saleRateSpecial: null,
  avgStockTurnoverDays: null,
  avgStockTurnoverSpecial: null,
  ...o,
});

describe("аналитика: показатели магазина", () => {
  const f = funnel({
    "1": nm({ openCount: 1000, cartCount: 100, orderCount: 50, orderSum: 100_000, buyoutCount: 30, cancelCount: 10 }, { openCount: 800, cartCount: 80, orderCount: 40, orderSum: 80_000 }),
    "2": nm({ openCount: 500, cartCount: 100, orderCount: 50, orderSum: 25_000, buyoutCount: 20, cancelCount: 10 }, { openCount: 500, cartCount: 50, orderCount: 30, orderSum: 30_000 }),
    "3": nm({ openCount: 200, cartCount: 5, orderCount: 0, orderSum: 0 }, { openCount: 100, cartCount: 5, orderCount: 0 }),
  });

  it("суммирует воронку, считает конверсии, средний чек и выкуп по завершённым заказам", () => {
    const k = buildStoreKpis(f, null, 3)!;
    assert.equal(k.current.orders, 100);
    assert.equal(k.current.orderSum, 125_000);
    assert.equal(k.current.avgCheck, 1250);
    assert.equal(k.current.cartRate, 205 / 1700);
    assert.equal(k.current.buyoutRate, 50 / 70);
    assert.equal(k.current.activeProducts, 2);
    assert.equal(k.past!.orderSum, 110_000);
    assert.equal(Math.round(pctChange(k.current.orderSum, k.past!.orderSum)! * 10) / 10, 13.6);
    assert.equal(k.lost, null);
  });

  it("упущенное берётся из отчёта WB; нет отчёта или ошибка — нет и блока", () => {
    const rep: SellerStocksReportSnapshot = { loadedAt: "", version: 1, dateFrom: "", dateTo: "", status: "ok", byNm: { "1": sr({ lostOrdersCount: 4, lostOrdersSum: 8000 }), "2": sr({ lostOrdersCount: 1, lostOrdersSum: 500 }) } };
    const k = buildStoreKpis(f, rep, 3)!;
    assert.deepEqual(k.lost, { orders: 5, sum: 8500, buyouts: 0, buyoutsSum: 0, products: 2 });
    assert.equal(buildStoreKpis(f, { ...rep, status: "jam_required" }, 3)!.lost, null);
  });

  it("без воронки или с ошибкой — null; без прошлого периода сравнения нет", () => {
    assert.equal(buildStoreKpis(null, null, 0), null);
    assert.equal(buildStoreKpis({ ...f, error: "нет доступа" }, null, 0), null);
    assert.equal(buildStoreKpis(funnel({ "1": nm({ openCount: 10, orderCount: 1, orderSum: 100 }, null) }), null, 1)!.past, null);
  });
});

describe("аналитика: выводы словами", () => {
  const f = funnel({
    "1": nm({ openCount: 1000, cartCount: 100, orderCount: 50, orderSum: 100_000, buyoutCount: 30, cancelCount: 10 }, { orderSum: 80_000, orderCount: 40 }),
    "2": nm({ openCount: 500, cartCount: 100, orderCount: 50, orderSum: 15_000 }, { orderSum: 30_000, orderCount: 30 }),
    "3": nm({ openCount: 600, cartCount: 12, orderCount: 4, orderSum: 5_000 }, { orderSum: 1_000, orderCount: 1 }),
  });
  const items = [item("1", "Ведро"), item("2", "Таз"), item("3", "Лейка")];
  const rep: SellerStocksReportSnapshot = { loadedAt: "", version: 1, dateFrom: "", dateTo: "", status: "ok", byNm: { "2": sr({ lostOrdersCount: 3, lostOrdersSum: 4500 }) } };

  it("выводы строятся по числам: изменение суммы, лидеры роста и падения, утечка, упущенное, ABC", () => {
    const rows = buildProductRows({ funnel: f, stocksReport: rep, items });
    const ins = buildInsights(buildStoreKpis(f, rep, 3), rows);
    const byId = Object.fromEntries(ins.map((i) => [i.id, i]));
    assert.match(byId.sum!.text, /120\s000\s₽/); // ru-RU форматирует тысячи неразрывным пробелом
    assert.equal(byId.sum!.tone, "good");
    assert.match(byId.grow!.text, /Ведро/);
    assert.match(byId.fall!.text, /Таз/);
    assert.match(byId.leak!.text, /Лейка/);
    assert.match(byId.lost!.text, /4\s500\s₽/);
    assert.ok(byId.abc);
  });

  it("без воронки выводов нет", () => {
    assert.deepEqual(buildInsights(null, []), []);
  });
});

describe("аналитика: товары", () => {
  const f = funnel({
    "1": nm({ openCount: 1000, cartCount: 100, orderCount: 50, orderSum: 100_000, buyoutCount: 30, cancelCount: 10 }, { orderSum: 80_000, orderCount: 40 }),
    "2": nm({ openCount: 500, cartCount: 100, orderCount: 50, orderSum: 15_000, buyoutCount: 20, cancelCount: 10 }, { orderSum: 30_000, orderCount: 30 }),
    "3": nm({ openCount: 600, cartCount: 12, orderCount: 4, orderSum: 5_000 }, { orderSum: 1_000, orderCount: 1 }),
    "4": nm({ openCount: 50, cartCount: 0, orderCount: 0, orderSum: 0 }, null),
  });
  const items = [item("1", "Ведро"), item("2", "Таз"), item("3", "Лейка"), item("4", "Совок")];

  it("ABC по накопленной доле: первый артикул A, граница по порогам 80/95", () => {
    const rows = buildProductRows({ funnel: f, stocksReport: null, items });
    const abc = Object.fromEntries(rows.map((r) => [r.nmId, r.abc]));
    // доли: 100k/120k=83% → A (накоплено до него 0), 15k → до него 83% ≥ 80 → B, 5k → до него 95,8% → C
    assert.deepEqual(abc, { "1": "A", "2": "B", "3": "C", "4": "none" });
    const s = abcSummary(rows);
    assert.deepEqual(s.map((x) => x.products), [1, 1, 1]);
    assert.equal(Math.round(s[0]!.share * 100), 83);
  });

  it("вклад в изменение, растущие и падающие, отсутствие прошлого периода", () => {
    const rows = buildProductRows({ funnel: f, stocksReport: null, items });
    const r1 = rows.find((r) => r.nmId === "1")!;
    assert.equal(r1.sumDelta, 20_000);
    assert.equal(r1.sumChange, 25);
    assert.equal(rows.find((r) => r.nmId === "4")!.sumDelta, null);
    const m = topMovers(rows);
    assert.deepEqual(m.growing.map((r) => r.nmId), ["1", "3"]);
    assert.deepEqual(m.falling.map((r) => r.nmId), ["2"]);
  });

  it("утечка воронки: много просмотров и заметно ниже магазинной конверсии в корзину", () => {
    const rows = buildProductRows({ funnel: f, stocksReport: null, items });
    assert.equal(rows.find((r) => r.nmId === "3")!.leak, "cart");
    assert.equal(rows.find((r) => r.nmId === "1")!.leak, null);
    assert.equal(rows.find((r) => r.nmId === "4")!.leak, null);
  });

  it("упущенные заказы и маржа подтягиваются из отчёта WB и утверждённого расчёта", () => {
    const rep: SellerStocksReportSnapshot = { loadedAt: "", version: 1, dateFrom: "", dateTo: "", status: "ok", byNm: { "2": sr({ lostOrdersCount: 3, lostOrdersSum: 4500, saleRateDays: 12, officeMissingTimeDays: 6 }) } };
    const extras = new Map([["2", { marginRub: 120.5, marginPercent: 18.2 }]]);
    const r = buildProductRows({ funnel: f, stocksReport: rep, items, extras }).find((x) => x.nmId === "2")!;
    assert.deepEqual([r.lostOrders, r.lostSum, r.saleRateDays, r.missingDays, r.marginRub, r.marginPercent], [3, 4500, 12, 6, 120.5, 18.2]);
  });
});
