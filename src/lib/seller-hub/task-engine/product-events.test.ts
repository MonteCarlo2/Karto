import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recentProductEvents } from "./product-events";
import type { SellerProductEvent } from "@/lib/seller-hub/event-engine/types";

const ev = (id: string, nmId: string | null, createdAt: string, kind: SellerProductEvent["kind"] = "price_changed"): SellerProductEvent =>
  ({ id, nmId, createdAt, kind, group: "price", severity: "info", title: id, detail: "", productTitle: null, vendorCode: null, itemId: null });

describe("события по товару для карточки задачи", () => {
  it("только этого товара, новые первыми, без шума и состояний, не больше лимита", () => {
    const list = [ev("a", "1", "2026-10-10T10:00:00Z"), ev("b", "1", "2026-10-12T10:00:00Z"), ev("c", "2", "2026-10-13T10:00:00Z"), ev("d", "1", "2026-10-14T10:00:00Z", "sales_new"), ev("e", "1", "2026-10-15T10:00:00Z", "low_stock"), ev("f", "1", "2026-10-11T10:00:00Z")];
    assert.deepEqual(recentProductEvents(list, "1").map((e) => e.id), ["b", "f", "a"]);
    assert.deepEqual(recentProductEvents(list, "1", 2).map((e) => e.id), ["b", "f"]);
    assert.deepEqual(recentProductEvents(list, null), []);
  });
});
