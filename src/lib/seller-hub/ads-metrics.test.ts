import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adsByProduct, changePercent, dailyAdsSeries, summarizeAds } from "./ads-metrics";

const row = (patch: Partial<Parameters<typeof summarizeAds>[0][number]>) => ({
  views: 0,
  clicks: 0,
  spend: 0,
  orders: 0,
  orderSum: 0,
  addToCart: 0,
  ...patch,
});

describe("summarizeAds", () => {
  it("считает CTR, ДРР, CPO и ROMI по сумме кампаний", () => {
    const s = summarizeAds([
      row({ views: 1373, clicks: 139, spend: 661.25, orders: 0, orderSum: 0 }),
      row({ views: 510, clicks: 9, spend: 323.47, orders: 1, orderSum: 500 }),
    ]);
    assert.equal(s.views, 1883);
    assert.equal(s.clicks, 148);
    assert.equal(s.spend, 984.72);
    assert.equal(s.ctr, 7.86);
    assert.equal(s.drr, 196.9);
    assert.equal(s.cpo, 984.72);
    assert.equal(s.romi, -49.2);
  });

  it("без заказов ДРР и CPO — null, а не 0 или бесконечность", () => {
    const s = summarizeAds([row({ views: 100, clicks: 5, spend: 50 })]);
    assert.equal(s.drr, null);
    assert.equal(s.cpo, null);
    assert.equal(s.ctr, 5);
  });

  it("без показов и расхода всё null", () => {
    const s = summarizeAds([]);
    assert.equal(s.ctr, null);
    assert.equal(s.romi, null);
    assert.equal(s.spend, 0);
  });
});

describe("dailyAdsSeries / adsByProduct / changePercent", () => {
  const day = (date: string, spend: number, orderSum: number) => ({ date, views: 10, clicks: 1, spend, orders: 1, orderSum });
  const nm = (spend: number, orderSum: number) => ({ views: 10, clicks: 1, spend, orders: 1, orderSum });

  it("ряд по дням суммирует кампании и сортирует даты", () => {
    const series = dailyAdsSeries([
      { days: [day("2026-10-02", 10, 100), day("2026-10-01", 5, 50)] },
      { days: [day("2026-10-01", 5, 50)] },
    ]);
    assert.deepEqual(series.map((d) => [d.date, d.spend, d.orderSum]), [
      ["2026-10-01", 10, 100],
      ["2026-10-02", 10, 100],
    ]);
  });

  it("по артикулам суммирует кампании и сортирует по расходу", () => {
    const rows = adsByProduct([{ byNm: { "1": nm(10, 100), "2": nm(50, 100) } }, { byNm: { "1": nm(20, 100) } }]);
    assert.deepEqual(rows.map((r) => [r.nmId, r.spend, r.summary.drr]), [
      ["2", 50, 50],
      ["1", 30, 15],
    ]);
  });

  it("изменение к прошлому периоду: без базы — null", () => {
    assert.equal(changePercent(150, 100), 50);
    assert.equal(changePercent(50, 100), -50);
    assert.equal(changePercent(10, 0), null);
    assert.equal(changePercent(null, 5), null);
  });
});
