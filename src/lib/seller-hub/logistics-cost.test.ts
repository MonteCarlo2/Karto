import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLogisticsCost } from "./logistics-cost";
import type { SellerRealizationDelivery90, SellerRealizationNm, SellerRealizationSnapshot } from "./types";

const del = (D: number, deliveryCost: number, R = 0, returnCost = 0, otherL = 0): SellerRealizationDelivery90 => ({ D, deliveryCost, R, returnCost, otherL, S: 0, Pay: 0, RA: 0, A: 0, StRealization: 0, netSalesQty: D - R });
const nm = (delivery: SellerRealizationDelivery90, priorDelivery: SellerRealizationDelivery90 | undefined, S = 0, St = 0): SellerRealizationNm =>
  ({
    retail: 0,
    net: 0,
    qty: 0,
    delivery,
    priorDelivery,
    current: { N: S > 0 ? 1 : 0, S, RA: 0, Pay: 0, L: 0, A: 0, Pen: 0, rebill: 0, StRealization: St },
  }) as SellerRealizationNm;

const snap = (byNm: Record<string, SellerRealizationNm>): SellerRealizationSnapshot => ({ loadedAt: "", dateFrom: "", dateTo: "", accountRetail: 0, accountNet: 0, byNm });

describe("стоимость логистики", () => {
  it("считает цену доставки, рост и переплату от роста", () => {
    const r = buildLogisticsCost(snap({ "1": nm(del(20, 2400, 2, 200), del(25, 2500)) }), () => "Ведро")!;
    const p = r.products[0]!;
    assert.equal(p.perDelivery, 120);
    assert.equal(p.priorPerDelivery, 100);
    assert.equal(p.changePercent, 20);
    assert.equal(p.overpay, 400);
    assert.equal(p.logisticsTotal, 2600);
    assert.equal(p.returnRate, 0.1);
    assert.equal(r.grewCount, 1);
  });

  it("при малом числе доставок цену одной доставки и рост не считает", () => {
    const p = buildLogisticsCost(snap({ "1": nm(del(5, 600), del(30, 3000)) }), () => "x")!.products[0]!;
    assert.equal(p.perDelivery, null);
    assert.equal(p.changePercent, null);
    assert.equal(p.overpay, 0);
    assert.equal(p.logisticsTotal, 600);
  });

  it("доля логистики в выручке и сортировка по сумме; итог по магазину", () => {
    const r = buildLogisticsCost(snap({ "1": nm(del(10, 1000), del(10, 1000), 10000), "2": nm(del(10, 3000), del(10, 3000), 6000, 50) }), (id) => id)!;
    assert.deepEqual(r.products.map((x) => x.nmId), ["2", "1"]);
    assert.equal(r.products[0]!.shareOfRevenue, 0.5);
    assert.equal(r.logisticsTotal, 4000);
    assert.equal(r.revenue, 16000);
    assert.equal(r.storage, 50);
  });

  it("товар без продаж в окне: доля логистики не считается", () => {
    const base = nm(del(10, 1000), undefined, 9);
    const noSales = { ...base, current: { ...base.current!, N: 0 } } as SellerRealizationNm;
    assert.equal(buildLogisticsCost(snap({ "1": noSales }), (id) => id)!.products[0]!.shareOfRevenue, null);
  });

  it("отмечает товары с высоким процентом возвратов относительно магазина", () => {
    const r = buildLogisticsCost(
      snap({ "1": nm(del(20, 2000, 8, 800), undefined, 1000), "2": nm(del(40, 4000, 2, 200), undefined, 1000), "3": nm(del(30, 3000, 1, 100), undefined, 1000), "4": nm(del(3, 300, 3, 300), undefined, 100) }),
      (id) => id,
    )!;
    const flag = (id: string) => r.products.find((p) => p.nmId === id)!.highReturn;
    assert.equal(flag("1"), true);
    assert.equal(flag("2"), false);
    assert.equal(flag("4"), false);
    assert.equal(r.highReturnCount, 1);
    assert.ok(r.shopReturnRate! > 0.1 && r.shopReturnRate! < 0.2);
  });

  it("товар без доставок, но с хранением, остаётся в расчёте", () => {
    const r = buildLogisticsCost(snap({ "1": nm(del(0, 0), undefined, 0, 5000) }), () => "Склад")!;
    assert.equal(r.products.length, 1);
    assert.equal(r.storage, 5000);
  });

  it("без отчёта или с ошибкой — null", () => {
    assert.equal(buildLogisticsCost(null, () => ""), null);
    assert.equal(buildLogisticsCost({ ...snap({}), error: "нет доступа" }, () => ""), null);
    assert.equal(buildLogisticsCost(snap({}), () => ""), null);
  });
});
