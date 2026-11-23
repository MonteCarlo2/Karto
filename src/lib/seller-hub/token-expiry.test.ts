import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tokenDaysLeft, tokenDaysText, tokenExpiryEvent, tokenExpiryLevel } from "./token-expiry";

const NOW = Date.parse("2026-11-20T12:00:00Z");
const inDays = (d: number) => new Date(NOW + d * 86_400_000).toISOString();

describe("срок токена Wildberries", () => {
  it("считает дни до истечения и уровень", () => {
    assert.equal(tokenDaysLeft(inDays(30), NOW), 30);
    assert.equal(tokenDaysLeft(inDays(0.2), NOW), 1);
    assert.equal(tokenDaysLeft(inDays(-1.5), NOW), -1);
    assert.equal(tokenDaysLeft(null, NOW), null);
    assert.equal(tokenDaysLeft("не дата", NOW), null);
    assert.equal(tokenExpiryLevel(40), "ok");
    assert.equal(tokenExpiryLevel(14), "soon");
    assert.equal(tokenExpiryLevel(3), "urgent");
    assert.equal(tokenExpiryLevel(0), "expired");
    assert.equal(tokenExpiryLevel(null), "ok");
  });

  it("склоняет дни", () => {
    assert.equal(tokenDaysText(1), "1 день");
    assert.equal(tokenDaysText(2), "2 дня");
    assert.equal(tokenDaysText(5), "5 дней");
    assert.equal(tokenDaysText(11), "11 дней");
    assert.equal(tokenDaysText(21), "21 день");
    assert.equal(tokenDaysText(0), "истёк");
  });

  it("уведомление: нет за месяц, важное за две недели, срочное за три дня и после истечения", () => {
    assert.equal(tokenExpiryEvent(inDays(40), NOW), null);
    assert.equal(tokenExpiryEvent(null, NOW), null);
    const soon = tokenExpiryEvent(inDays(10), NOW)!;
    assert.equal(soon.severity, "important");
    assert.match(soon.title, /через 10 дней/);
    const urgent = tokenExpiryEvent(inDays(2), NOW)!;
    assert.equal(urgent.severity, "critical");
    assert.notEqual(urgent.id, soon.id);
    const gone = tokenExpiryEvent(inDays(-1), NOW)!;
    assert.equal(gone.severity, "critical");
    assert.match(gone.title, /истёк/);
    assert.equal(gone.group, "system");
  });
});
