import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCarts,
  formatOpens,
  formatOrders,
  ruPlural,
} from "./ru-plural";

describe("ruPlural", () => {
  it("etalon 1, 2, 5, 11, 21, 22, 25, 111", () => {
    const cases: Array<[number, string]> = [
      [1, "переход"],
      [2, "перехода"],
      [5, "переходов"],
      [11, "переходов"],
      [21, "переход"],
      [22, "перехода"],
      [25, "переходов"],
      [111, "переходов"],
    ];
    for (const [n, word] of cases) {
      assert.equal(ruPlural(n, "переход", "перехода", "переходов"), word, String(n));
    }
  });

  it("opens / carts / orders phrases", () => {
    assert.equal(formatOpens(1), "1 переход");
    assert.equal(formatOpens(93), "93 перехода");
    assert.equal(formatCarts(0), "0 корзин");
    assert.equal(formatCarts(2), "2 корзины");
    assert.equal(formatOrders(5), "5 заказов");
    assert.equal(formatOrders(21), "21 заказ");
  });
});
