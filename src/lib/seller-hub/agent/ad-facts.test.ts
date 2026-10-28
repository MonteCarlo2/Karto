import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adFactsFor } from "./scenario-inputs";

const stats = (byNm: Record<string, { views: number; clicks: number; spend: number; orders: number; orderSum: number }>) => ({ loadedAt: "", dateFrom: "2026-10-01", dateTo: "2026-10-28", campaigns: [{ advertId: "1", views: 0, clicks: 0, spend: 0, orders: 0, orderSum: 0, addToCart: 0, days: [], byNm }, { advertId: "2", views: 0, clicks: 0, spend: 0, orders: 0, orderSum: 0, addToCart: 0, days: [], byNm: { "7": { views: 1000, clicks: 20, spend: 100, orders: 1, orderSum: 500 } } }] });

describe("рекламные показатели товара для агента", () => {
  it("суммирует по кампаниям товара: ДРР, стоимость заказа, CTR", () => {
    const f = adFactsFor(stats({ "7": { views: 1000, clicks: 30, spend: 300, orders: 2, orderSum: 1500 } }), "7");
    assert.deepEqual(f, { ads_spend_rub: 400, ads_orders: 3, ads_drr: 20, ads_cpo: 133, ads_ctr_pct: 2.5 });
  });
  it("нет рекламы или нет заказов: пусто, а не ноль и не деление на ноль", () => {
    assert.equal(adFactsFor(undefined, "7").ads_drr, null);
    assert.equal(adFactsFor(stats({}), "99").ads_spend_rub, null);
    const noOrders = adFactsFor(stats({ "5": { views: 100, clicks: 5, spend: 50, orders: 0, orderSum: 0 } }), "5");
    assert.equal(noOrders.ads_drr, null);
    assert.equal(noOrders.ads_cpo, null);
    assert.equal(noOrders.ads_spend_rub, 50);
  });
});
