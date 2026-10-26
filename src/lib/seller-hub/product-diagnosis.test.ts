import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diagnoseProducts } from "./product-diagnosis";
import type { SellerFunnelPeriod, SellerFunnelSnapshot } from "./types";

const period = (open: number, cart: number, order: number, orderSum = order * 1000): SellerFunnelPeriod => ({
  openCount: open,
  cartCount: cart,
  orderCount: order,
  orderSum,
  buyoutCount: 0,
  cancelCount: null,
  avgOrdersCountPerDay: null,
  avgPrice: null,
  addToCartPercent: null,
  cartToOrderPercent: null,
  buyoutPercent: null,
});

function funnel(rows: Record<string, SellerFunnelPeriod>, ordersPerDay: Record<string, number> = {}): SellerFunnelSnapshot {
  const byNm: SellerFunnelSnapshot["byNm"] = {};
  for (const [nm, selected] of Object.entries(rows)) {
    byNm[nm] = { orders: selected.orderCount ?? 0, priorOrders: null, feedbackRating: null, ordersPerDay: ordersPerDay[nm] ?? 0, selected, past: null };
  }
  return { loadedAt: "2026-10-16T00:00:00Z", version: 2, dateFrom: "2026-09-19", dateTo: "2026-10-16", status: "ok", byNm };
}

// Магазин: 15% в корзину, 25% из корзины в заказ. Товар "bad" — 5% в корзину.
const base = {
  a: period(2000, 300, 75),
  b: period(2000, 300, 75),
  c: period(2000, 300, 75),
  bad: period(2000, 100, 25),
};

describe("diagnoseProducts", () => {
  it("находит товар, у которого конверсия в корзину значимо ниже остального магазина, и считает потенциал", () => {
    const result = diagnoseProducts({ funnel: funnel(base), products: [{ nmId: "bad", marginPercent: 20, stock: 500 }] });
    assert.equal(result.length, 1);
    const d = result[0]!;
    assert.equal(d.nmId, "bad");
    assert.equal(d.stage, "openToCart");
    assert.equal(d.mine, 5);
    assert.equal(d.benchmark, 15);
    // 2000 × (0.15 − 0.05) × 25% из корзины в заказ = 50 заказов
    assert.equal(d.extraOrders, 50);
    assert.equal(d.extraRevenue, 50000);
    assert.equal(d.verdict, "fix_card");
    assert.deepEqual(d.blockers, []);
  });

  it("не придирается к шуму: близкие конверсии и малая база дают пустой результат", () => {
    const noisy = funnel({ a: period(2000, 300, 75), b: period(2000, 310, 75), c: period(2000, 290, 75), d: period(2000, 296, 75), tiny: period(40, 1, 0) });
    assert.deepEqual(diagnoseProducts({ funnel: noisy, products: [] }), []);
  });

  it("убыточный товар: сначала экономика, а не трафик; малый запас: сначала поставка; низкий рейтинг отмечается", () => {
    const loss = diagnoseProducts({ funnel: funnel(base), products: [{ nmId: "bad", marginPercent: -4, stock: 500 }] })[0]!;
    assert.equal(loss.verdict, "fix_economics_first");
    assert.equal(loss.blockers[0]?.kind, "loss");

    const stock = diagnoseProducts({ funnel: funnel(base, { bad: 10 }), products: [{ nmId: "bad", marginPercent: 20, stock: 30 }] })[0]!;
    assert.equal(stock.verdict, "restock_first");
    assert.deepEqual(stock.blockers, [{ kind: "stock", days: 3 }]);

    const ratings = new Map([
      ["a", { rating: 4.9, reviews: 50 }],
      ["b", { rating: 4.9, reviews: 50 }],
      ["bad", { rating: 4.3, reviews: 10 }],
    ]);
    const rating = diagnoseProducts({ funnel: funnel(base), products: [{ nmId: "bad", marginPercent: 20, stock: 500 }], ratings })[0]!;
    assert.equal(rating.blockers[0]?.kind, "rating");
    assert.equal(rating.verdict, "fix_card");
  });

  it("нет воронки, Джем или меньше трёх товаров — пусто", () => {
    assert.deepEqual(diagnoseProducts({ funnel: null, products: [] }), []);
    assert.deepEqual(diagnoseProducts({ funnel: { ...funnel(base), status: "jam_required" }, products: [] }), []);
    assert.deepEqual(diagnoseProducts({ funnel: funnel({ a: base.a, bad: base.bad }), products: [] }), []);
  });
});
