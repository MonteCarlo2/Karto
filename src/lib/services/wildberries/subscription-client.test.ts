import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseJamSubscription } from "./subscription-client";

const NOW = Date.parse("2026-10-27T12:00:00Z");

describe("подписка Джем: разбор ответа WB", () => {
  it("пустой ответ: подписку никогда не подключали", () => {
    assert.deepEqual(parseJamSubscription(null, NOW), { active: false, since: null, till: null, state: "never" });
    assert.equal(parseJamSubscription({}, NOW).state, "never");
  });
  it("оплаченный период ещё идёт: подписка активна", () => {
    const r = parseJamSubscription({ since: "2026-08-01T00:00:00Z", till: "2026-11-01T00:00:00Z" }, NOW);
    assert.equal(r.active, true);
    assert.equal(r.state, "active");
  });
  it("оплаченный период закончился: подписка неактивна, но даты сохранены", () => {
    const r = parseJamSubscription({ since: "2026-01-01T00:00:00Z", till: "2026-09-01T00:00:00Z" }, NOW);
    assert.equal(r.active, false);
    assert.equal(r.state, "inactive");
    assert.equal(r.since, "2026-01-01T00:00:00Z");
  });
  it("мусор вместо дат не даёт ложной активности", () => {
    assert.equal(parseJamSubscription({ since: "вчера", till: 5 }, NOW).state, "never");
  });
});
