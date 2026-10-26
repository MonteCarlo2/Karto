import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ACTION_LABEL, resultMessage, sanitizeRequest } from "./action-log";

describe("sanitizeRequest", () => {
  it("убирает секреты на любой глубине и режет длинные строки", () => {
    const out = sanitizeRequest({
      campaignId: 1,
      token: "secret-value",
      nested: { Authorization: "Bearer abc", sum: 500, apiKey: "k" },
      note: "x".repeat(300),
    }) as Record<string, unknown>;
    assert.equal(out.campaignId, 1);
    assert.equal("token" in out, false);
    assert.deepEqual(out.nested, { sum: 500 });
    assert.equal(String(out.note).length, 201);
  });
  it("ограничивает размер массивов и глубину", () => {
    const out = sanitizeRequest({ ids: Array.from({ length: 80 }, (_, i) => i) }) as { ids: number[] };
    assert.equal(out.ids.length, 50);
    const deep = sanitizeRequest({ a: { b: { c: { d: { e: 1 } } } } }) as Record<string, unknown>;
    assert.equal(JSON.stringify(deep).includes('"e"'), false);
  });
});

describe("resultMessage и названия", () => {
  it("достаёт текст ошибки", () => {
    assert.equal(resultMessage({ ok: false, error: "лимит" }), "лимит");
    assert.equal(resultMessage({ ok: true }), null);
    assert.equal(resultMessage(null), null);
  });
  it("у всех действий журнала есть человеческое название", () => {
    for (const key of ["ad_deposit", "ad_pause", "ad_start", "ad_minus", "ad_bid", "ad_create", "ad_remove_nm", "price_update"]) {
      assert.ok(ACTION_LABEL[key]);
    }
  });
});
