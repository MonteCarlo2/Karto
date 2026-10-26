import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashPayload } from "./store";

describe("хэш снимка", () => {
  it("время чтения не считается изменением данных, на любой глубине", () => {
    const a = { syncedAt: "2026-10-22T10:00:00Z", items: [{ id: 1, price: 100 }], ads: { loadedAt: "x", campaigns: [{ id: "1", budget: 50 }] } };
    const b = { syncedAt: "2026-10-22T10:15:00Z", items: [{ id: 1, price: 100 }], ads: { loadedAt: "y", campaigns: [{ id: "1", budget: 50 }] } };
    assert.equal(hashPayload(a), hashPayload(b));
  });

  it("любое реальное изменение меняет хэш: цена, бюджет, состав", () => {
    const base = { syncedAt: "t", items: [{ id: 1, price: 100 }], budget: 50 };
    assert.notEqual(hashPayload(base), hashPayload({ ...base, items: [{ id: 1, price: 101 }] }));
    assert.notEqual(hashPayload(base), hashPayload({ ...base, budget: 0 }));
    assert.notEqual(hashPayload(base), hashPayload({ ...base, items: [] }));
  });
});
