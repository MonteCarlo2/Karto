import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMoneyAnalytics } from "./money-analytics";
import type { SellerCatalogItem, SellerRealizationNm, SellerRealizationSnapshot, SellerRealizationWindow } from "./types";

const win = (o: Partial<SellerRealizationWindow>): SellerRealizationWindow => ({ N: 0, S: 0, RA: 0, Pay: 0, L: 0, A: 0, Pen: 0, rebill: 0, StRealization: 0, ...o });
const nm = (current: SellerRealizationWindow, prior?: SellerRealizationWindow): SellerRealizationNm => ({ retail: 0, net: 0, qty: 0, current, prior });
const snap = (byNm: Record<string, SellerRealizationNm>, extra: Partial<SellerRealizationSnapshot> = {}): SellerRealizationSnapshot => ({ loadedAt: "", dateFrom: "2026-09-22", dateTo: "2026-10-19", accountRetail: 0, accountNet: 0, byNm, ...extra });
const item = (externalId: string, costPrice: number | null): SellerCatalogItem => ({ id: externalId, marketplaceId: "wildberries", externalId, vendorCode: `V${externalId}`, title: `Товар ${externalId}`, costPrice });

describe("деньги магазина по отчёту реализации", () => {
  it("раскладывает выручку: удержания WB, логистика, хранение, приёмка, остаток до себестоимости", () => {
    const r = buildMoneyAnalytics(snap({ "1": nm(win({ N: 10, S: 10_000, Pay: 7_000, L: 1_000, StRealization: 200, A: 100 })) }), [item("1", 300)])!;
    const c = r.current;
    assert.equal(c.revenue, 10_000);
    assert.equal(c.wbHold, 3_000);
    assert.equal(c.beforeCost, 5_700);
    assert.equal(c.cost, 3_000);
    assert.equal(c.profit, 2_700);
    assert.equal(c.margin, 0.27);
    assert.equal(c.costCoverage, 1);
  });

  it("прибыль считается только по товарам с себестоимостью, охват показан; штрафы отдельно и в маржу не входят", () => {
    const r = buildMoneyAnalytics(
      snap({ "1": nm(win({ N: 10, S: 10_000, Pay: 7_000, L: 1_000 })), "2": nm(win({ N: 5, S: 5_000, Pay: 3_500, L: 500, Pen: 150 })) }),
      [item("1", 400), item("2", null)],
    )!;
    assert.equal(r.current.costCoverage, 10_000 / 15_000);
    assert.equal(r.current.profit, 6_000 - 4_000);
    assert.equal(r.current.penalties, 150);
    assert.equal(r.products.find((p) => p.nmId === "2")!.profit, null);
  });

  it("строки без артикула входят в итоги магазина, но не в таблицу товаров; прошлое окно даёт сравнение", () => {
    const r = buildMoneyAnalytics(
      snap({ "1": nm(win({ N: 10, S: 10_000, Pay: 7_000, L: 1_000 }), win({ N: 8, S: 8_000, Pay: 5_600, L: 700 })) }, { noNmCurrent: win({ L: 300, Pen: 50 }), noNmPrior: win({ L: 100 }) }),
      [item("1", null)],
    )!;
    assert.equal(r.current.logistics, 1_300);
    assert.equal(r.past!.logistics, 800);
    assert.equal(r.products.length, 1);
    assert.equal(r.current.profit, null);
  });

  it("товар без продаж за период: суммы видны, а проценты не считаются (копейки выручки дают абсурдные 4 000%)", () => {
    const r = buildMoneyAnalytics(snap({ "1": nm(win({ N: 0, S: 9, Pay: 6, L: 371 })) }), [item("1", 100)])!;
    const p = r.products[0]!;
    assert.equal(p.logistics, 371);
    assert.equal(p.profit, 6 - 371);
    assert.equal(p.margin, null);
    assert.equal(p.serviceShare, null);
  });

  it("без отчёта или с ошибкой — null", () => {
    assert.equal(buildMoneyAnalytics(null, []), null);
    assert.equal(buildMoneyAnalytics(snap({}, { error: "нет доступа" }), []), null);
    assert.equal(buildMoneyAnalytics(snap({}), []), null);
  });
});
