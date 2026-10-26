import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeClusters } from "./ads-clusters";
import type { SellerAdClusterStat } from "./types";

const row = (query: string, views: number, clicks: number, orders: number): SellerAdClusterStat => ({
  advertId: "1",
  nmId: "10",
  query,
  views,
  clicks,
  orders,
  addToCart: 0,
  avgPos: null,
});

describe("analyzeClusters", () => {
  it("порог пустых кликов = вдвое больше средних кликов на заказ", () => {
    // 100 кликов и 5 заказов: 20 кликов на заказ, порог 40.
    const result = analyzeClusters([row("ведро", 2000, 40, 5), row("ведро 10 л", 900, 40, 0), row("кашпо", 500, 20, 0)]);
    assert.equal(result.storeCr, 5);
    assert.equal(result.wasteClicks, 40);
    assert.deepEqual(result.wasted.map((r) => r.query), ["ведро 10 л"]);
    assert.deepEqual(result.working.map((r) => r.query), ["ведро"]);
  });

  it("порог берётся из всей рекламы магазина, если она передана", () => {
    // По строкам 2 заказа на 122 клика, а по всей рекламе 19 на 287: 15 кликов на заказ, порог 30.
    const result = analyzeClusters([row("ведро", 200, 40, 1), row("кашпо", 300, 32, 0), row("крышка", 300, 20, 0)], {
      clicks: 287,
      orders: 19,
    });
    assert.equal(result.wasteClicks, 31);
    assert.deepEqual(result.wasted.map((r) => r.query), ["кашпо"]);
  });

  it("если заказов в рекламе не было — порога нет и «пустых» запросов нет", () => {
    const result = analyzeClusters([row("ведро", 1000, 500, 0)]);
    assert.equal(result.wasteClicks, null);
    assert.deepEqual(result.wasted, []);
  });

  it("CTR считается и не ломается без показов", () => {
    const result = analyzeClusters([row("a", 200, 10, 1), row("b", 0, 0, 0)]);
    assert.equal(result.rows[0]!.ctr, 5);
    assert.equal(result.rows[1]!.ctr, null);
  });

  it("пустой ввод", () => {
    const result = analyzeClusters([]);
    assert.equal(result.storeCr, null);
    assert.deepEqual(result.rows, []);
  });
});
