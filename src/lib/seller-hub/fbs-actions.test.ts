import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canCancelFbsOrder, isNewFbsOrder, openFbsSupplies, waitingHours } from "./fbs-actions";
import type { SellerOrderRow, SellerSupplyRow } from "./types";

const order = (supplierStatus?: string, wbStatus?: string, createdAt?: string): SellerOrderRow => ({
  id: "1",
  externalId: 1,
  supplierStatus,
  wbStatus,
  createdAt,
});

describe("действия над заданиями FBS", () => {
  it("новое задание можно добавить в поставку, остальные нельзя", () => {
    assert.equal(isNewFbsOrder(order("new", "waiting")), true);
    assert.equal(isNewFbsOrder(order(undefined, undefined)), true);
    assert.equal(isNewFbsOrder(order("confirm", "waiting")), false);
    assert.equal(isNewFbsOrder(order("complete", "sorted")), false);
    assert.equal(isNewFbsOrder(order("cancel", "canceled")), false);
  });

  it("отменить можно новое и на сборке, но не после отправки, выкупа или отмены", () => {
    assert.equal(canCancelFbsOrder(order("new", "waiting")), true);
    assert.equal(canCancelFbsOrder(order("confirm", "waiting")), true);
    assert.equal(canCancelFbsOrder(order("complete", "sorted")), false);
    assert.equal(canCancelFbsOrder(order("confirm", "sold")), false);
    assert.equal(canCancelFbsOrder(order("cancel", "canceled")), false);
    assert.equal(canCancelFbsOrder(order("confirm", "canceled_by_client")), false);
  });

  it("возраст считается только у заданий, которые ждут отгрузки", () => {
    const now = Date.parse("2026-10-17T12:00:00Z");
    assert.equal(waitingHours(order("new", "waiting", "2026-10-17T09:30:00Z"), now), 2.5);
    assert.equal(waitingHours(order("complete", "sorted", "2026-10-17T09:30:00Z"), now), null);
    assert.equal(waitingHours(order("new", "waiting"), now), null);
    assert.equal(waitingHours(order("new", "waiting", "2026-10-17T13:00:00Z"), now), 0);
  });

  it("в списке для добавления только открытые FBS-поставки, свежие первыми", () => {
    const s = (id: string, type: "fbs" | "fbw", done: boolean, createdAt: string): SellerSupplyRow => ({ id, type, done, createdAt });
    const rows = [s("a", "fbs", false, "2026-10-10"), s("b", "fbs", true, "2026-10-16"), s("c", "fbw", false, "2026-10-16"), s("d", "fbs", false, "2026-10-15")];
    assert.deepEqual(openFbsSupplies(rows).map((r) => r.id), ["d", "a"]);
    assert.deepEqual(openFbsSupplies(undefined), []);
  });
});
