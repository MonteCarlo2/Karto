import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildReturnsWhatIf } from "./returns-whatif";
import type { SellerRealizationDelivery90, SellerRealizationSnapshot } from "./types";

const d90 = (D: number, R: number): SellerRealizationDelivery90 => ({
  D,
  deliveryCost: D * 100,
  R,
  returnCost: R * 100,
  otherL: 0,
  S: (D - R) * 1000,
  Pay: (D - R) * 700,
  RA: (D - R) * 1000,
  A: 0,
  StRealization: 0,
  netSalesQty: D - R,
});

const snap = (delivery90: Record<string, SellerRealizationDelivery90>): SellerRealizationSnapshot => ({
  loadedAt: "",
  dateFrom: "",
  dateTo: "",
  accountRetail: 0,
  accountNet: 0,
  byNm: {},
  delivery90,
  shopDelivery90: { D: 100, R: 20, returnCost: 2000, bShop: 0.8, rShop: 100 },
});

const items = [{ externalId: "1", title: "Ведро", costPrice: 300, discountedPrice: 1000, stockFbo: 0 }];

describe("что если вдвое меньше возвратов", () => {
  it("даёт положительную экономию и прибыль в гипотезе выше текущей", () => {
    const r = buildReturnsWhatIf({ realization: snap({ "1": d90(40, 16) }), paidStorage: null, items });
    assert.equal(r.length, 1);
    assert.ok(r[0]!.profitWhatIf > r[0]!.profitNow);
    assert.ok(r[0]!.gainPerMonth > 0);
    assert.equal(r[0]!.returns90, 16);
    assert.equal(r[0]!.salesPerMonth, 8);
  });

  it("пропускает товары с малым числом доставок или возвратов, без цены или себестоимости", () => {
    assert.equal(buildReturnsWhatIf({ realization: snap({ "1": d90(10, 5) }), paidStorage: null, items }).length, 0);
    assert.equal(buildReturnsWhatIf({ realization: snap({ "1": d90(40, 2) }), paidStorage: null, items }).length, 0);
    assert.equal(buildReturnsWhatIf({ realization: snap({ "1": d90(40, 16) }), paidStorage: null, items: [{ ...items[0]!, costPrice: null }] }).length, 0);
  });

  it("без отчёта реализации — пусто", () => {
    assert.deepEqual(buildReturnsWhatIf({ realization: null, paidStorage: null, items }), []);
  });
});
