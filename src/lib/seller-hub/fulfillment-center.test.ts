import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFulfillmentProposals, type FulfillmentInput } from "./fulfillment-center";
import type { SellerOrderRow } from "./types";

const NOW = Date.parse("2026-10-17T12:00:00Z");
const order = (id: number, nmId: number, supplierStatus: string, createdAt: string, wbStatus = "waiting"): SellerOrderRow => ({ id: String(id), externalId: id, nmId, supplierStatus, wbStatus, createdAt });

const base = (over: Partial<FulfillmentInput> = {}): FulfillmentInput => ({
  orders: [],
  supplies: [],
  items: [{ externalId: "1", title: "Ведро", stockFbs: 50 }],
  nowMs: NOW,
  remindHours: 12,
  coverDays: 7,
  shipSpeed: null,
  ...over,
});

describe("центр логистики: предложения", () => {
  it("новые заказы старше порога — действие с исполняемой сборкой поставки", () => {
    const r = buildFulfillmentProposals(base({ orders: [order(1, 1, "new", "2026-10-16T20:00:00Z"), order(2, 1, "new", "2026-10-17T10:00:00Z"), order(3, 1, "confirm", "2026-10-17T09:00:00Z")] }));
    const p = r.find((x) => x.id === "ship_waiting")!;
    assert.equal(p.level, "action");
    assert.deepEqual(p.buildSupply!.orderIds, [1, 2]);
    assert.match(p.detail, /16 ч/);
  });

  it("вечером (после заданного часа) даже свежие заказы становятся действием", () => {
    const orders = [order(1, 1, "new", "2026-10-17T14:00:00Z")]; // 17:00 МСК, now = 15:00 МСК
    assert.equal(buildFulfillmentProposals(base({ orders, eveningHour: 18 })).find((x) => x.id === "ship_waiting")!.level, "info");
    const evening = buildFulfillmentProposals(base({ orders, eveningHour: 14 })).find((x) => x.id === "ship_waiting")!;
    assert.equal(evening.level, "action");
    assert.match(evening.detail, /вечерней отправки/);
    assert.equal(buildFulfillmentProposals(base({ orders, eveningHour: 24 })).find((x) => x.id === "ship_waiting")!.level, "info");
  });

  it("в поставку берутся только задания со статусом new, неизвестный статус не попадает в пачку", () => {
    const orders = [order(1, 1, "new", "2026-10-17T10:00:00Z"), order(2, 1, "", "2026-10-17T10:00:00Z")];
    const p = buildFulfillmentProposals(base({ orders })).find((x) => x.id === "ship_waiting")!;
    assert.deepEqual(p.buildSupply!.orderIds, [1]);
  });

  it("спрос считается на весь охваченный срок, даже если заказы старше недели", () => {
    // 6 заказов за 30 суток при остатке 10: 0,2 в день, хватит на 50 суток, тревоги нет (порог 7)
    const orders = Array.from({ length: 6 }, (_, i) => order(300 + i, 1, "complete", `2026-09-${17 + i}T12:00:00Z`, "sold"));
    const r = buildFulfillmentProposals(base({ orders, items: [{ externalId: "1", title: "Ведро", stockFbs: 10 }] }));
    assert.equal(r.some((x) => x.id === "stock_cover"), false);
  });

  it("дни без отправок, в которые заказы ждут заметно дольше обычного, дают совет", () => {
    const weekdays = Array.from({ length: 7 }, (_, index) => ({ index, suppliesClosed: index === 5 || index === 6 ? 0 : 2, ordersCreated: 5, medianWait: index === 4 ? 60 : index === 5 ? 40 : 10 }));
    const speed = { orders: 40, supplies: 10, avgHours: 15, medianHours: 12, p90Hours: 40, buckets: [], over24Share: 0.1, perSupply: [], trend: null, weekdays };
    const p = buildFulfillmentProposals(base({ shipSpeed: speed })).find((x) => x.id === "no_ship_days")!;
    assert.match(p.title, /Сб/);
    assert.doesNotMatch(p.title, /Пт|Вс/);
    assert.match(p.detail, /40 ч/);
    const none = { ...speed, weekdays: weekdays.map((d) => ({ ...d, suppliesClosed: 1 })) };
    assert.equal(buildFulfillmentProposals(base({ shipSpeed: none })).some((x) => x.id === "no_ship_days"), false);
  });

  it("свежие заказы — только информация, без тревоги", () => {
    const r = buildFulfillmentProposals(base({ orders: [order(1, 1, "new", "2026-10-17T10:00:00Z")] }));
    assert.equal(r.find((x) => x.id === "ship_waiting")!.level, "info");
  });

  it("давно открытая поставка требует действия, свежая — нет", () => {
    const supplies = [
      { id: "WB-1", done: false, type: "fbs" as const, createdAt: "2026-10-13T00:00:00Z" },
      { id: "WB-2", done: false, type: "fbs" as const, createdAt: "2026-10-17T00:00:00Z" },
      { id: "WB-3", done: true, type: "fbs" as const, createdAt: "2026-10-01T00:00:00Z" },
    ];
    const p = buildFulfillmentProposals(base({ supplies })).find((x) => x.id === "supplies_open")!;
    assert.equal(p.level, "action");
    assert.match(p.title, /2/);
  });

  it("запас на своём складе считается по спросу; нулевой остаток — действие, нет спроса — молчим", () => {
    const orders = [order(1, 1, "complete", "2026-10-11T12:00:00Z", "sold"), order(2, 1, "complete", "2026-10-12T12:00:00Z", "sold"), order(3, 1, "complete", "2026-10-14T12:00:00Z", "sold")];
    const out = buildFulfillmentProposals(base({ orders, items: [{ externalId: "1", title: "Ведро", stockFbs: 0 }, { externalId: "2", title: "Таз", stockFbs: 0 }] }));
    const p = out.find((x) => x.id === "stock_cover")!;
    assert.equal(p.level, "action");
    assert.match(p.detail, /Ведро — нет на складе/);
    assert.doesNotMatch(p.detail, /Таз/);
    assert.equal(buildFulfillmentProposals(base({ orders, items: [{ externalId: "1", title: "Ведро", stockFbs: 500 }] })).some((x) => x.id === "stock_cover"), false);
  });

  it("медленная отгрузка — рекомендация только при достаточном числе заказов", () => {
    const speed = { orders: 40, supplies: 5, avgHours: 30, medianHours: 26, p90Hours: 60, buckets: [], over24Share: 0.6, perSupply: [], trend: null, weekdays: [] };
    assert.equal(buildFulfillmentProposals(base({ shipSpeed: speed })).some((x) => x.id === "slow_shipping"), true);
    assert.equal(buildFulfillmentProposals(base({ shipSpeed: { ...speed, orders: 4 } })).some((x) => x.id === "slow_shipping"), false);
    assert.equal(buildFulfillmentProposals(base({ shipSpeed: { ...speed, over24Share: 0.05, medianHours: 4 } })).some((x) => x.id === "slow_shipping"), false);
  });

  it("совет про вторую отправку, если много заказов приходит после обычного часа закрытия поставок", () => {
    const supplies = Array.from({ length: 6 }, (_, i) => ({ id: `S${i}`, done: true, type: "fbs" as const, closedAt: `2026-10-1${i}T11:00:00Z`, createdAt: `2026-10-1${i}T08:00:00Z` }));
    // закрытие в 14:00 МСК; заказы: 6 вечером (после 14), 4 утром
    const orders = [
      ...Array.from({ length: 6 }, (_, i) => order(100 + i, 1, "complete", "2026-10-16T17:00:00Z", "sold")),
      ...Array.from({ length: 4 }, (_, i) => order(200 + i, 1, "complete", "2026-10-16T06:00:00Z", "sold")),
    ];
    const p = buildFulfillmentProposals(base({ orders, supplies })).find((x) => x.id === "late_orders")!;
    assert.match(p.title, /60%/);
    assert.match(p.detail, /14:00/);
    assert.equal(buildFulfillmentProposals(base({ orders: orders.slice(6), supplies })).some((x) => x.id === "late_orders"), false);
  });

  it("возвраты и рост доставки берутся из отчёта реализации", () => {
    const costs = {
      logisticsTotal: 1000,
      revenue: 5000,
      shareOfRevenue: 0.2,
      returnCost: 300,
      storage: 0,
      acceptance: 0,
      overpay: 400,
      grewCount: 1,
      shopReturnRate: 0.1,
      highReturnCount: 1,
      products: [{ nmId: "1", title: "Ведро", deliveries: 20, perDelivery: 100, priorPerDelivery: 80, changePercent: 25, returns: 8, returnRate: 0.4, returnCost: 300, logisticsTotal: 1000, revenue: 5000, shareOfRevenue: 0.2, storage: 0, acceptance: 0, overpay: 400, highReturn: true }],
    };
    const r = buildFulfillmentProposals(base({ costs }));
    assert.match(r.find((x) => x.id === "returns_high")!.detail, /Ведро \(8 из 20, 40%\)/);
    assert.match(r.find((x) => x.id === "cost_growth")!.detail, /400/);
    assert.equal(buildFulfillmentProposals(base()).some((x) => x.id === "returns_high"), false);
  });

  it("действия идут раньше наблюдений и информации", () => {
    const orders = [order(1, 1, "new", "2026-10-17T10:00:00Z")];
    const supplies = [{ id: "W", done: false, type: "fbs" as const, createdAt: "2026-10-10T00:00:00Z" }];
    const levels = buildFulfillmentProposals(base({ orders, supplies })).map((x) => x.level);
    assert.deepEqual(levels, [...levels].sort((a, b) => ["action", "watch", "info"].indexOf(a) - ["action", "watch", "info"].indexOf(b)));
  });
});
