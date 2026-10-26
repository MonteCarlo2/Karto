import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dueSources, isAuthFailure, LEASE_MS, nextDueAfterFailure, nextDueAfterSuccess, type SyncStateRow } from "./schedule";
import { SYNC_SOURCES, syncSource } from "./sources";

const NOW = 1_000_000_000_000;
const row = (source: SyncStateRow["source"], patch: Partial<SyncStateRow> = {}): SyncStateRow => ({
  source,
  nextDueAt: NOW + 60_000,
  failCount: 0,
  leaseUntil: null,
  leaseOwner: null,
  ...patch,
});

describe("расписание сбора", () => {
  it("новый кабинет: без состояния читаются все источники, сначала самые важные", () => {
    const due = dueSources([], NOW);
    assert.equal(due.length, SYNC_SOURCES.length);
    assert.equal(due[0]!.id, "base");
    const priorities = due.map((s) => s.priority);
    assert.deepEqual(priorities, [...priorities].sort((a, b) => a - b));
  });

  it("читается только то, чей срок наступил; будущий срок пропускается", () => {
    const rows = SYNC_SOURCES.map((s) => row(s.id, { nextDueAt: NOW + 1000 }));
    rows.find((r) => r.source === "funnel")!.nextDueAt = NOW - 5000;
    assert.deepEqual(dueSources(rows, NOW).map((s) => s.id), ["funnel"]);
  });

  it("источник с занятой арендой не берётся второй раз, с истёкшей берётся", () => {
    const rows = SYNC_SOURCES.map((s) => row(s.id, { nextDueAt: NOW - 1 }));
    rows.find((r) => r.source === "feedbacks")!.leaseUntil = NOW + 1000;
    rows.find((r) => r.source === "blocked")!.leaseUntil = NOW - 1;
    const ids = dueSources(rows, NOW).map((s) => s.id);
    assert.equal(ids.includes("feedbacks"), false);
    assert.equal(ids.includes("blocked"), true);
  });

  it("внутри одного уровня первым идёт просроченный дольше всех", () => {
    const rows = SYNC_SOURCES.map((s) => row(s.id, { nextDueAt: NOW + 1000 }));
    rows.find((r) => r.source === "ads_stats")!.nextDueAt = NOW - 1000;
    rows.find((r) => r.source === "feedbacks")!.nextDueAt = NOW - 90_000;
    const ids = dueSources(rows, NOW).map((s) => s.id);
    assert.deepEqual(ids, ["feedbacks", "ads_stats"]);
  });

  it("после успеха следующее чтение через период плюс небольшой разброс до 10%", () => {
    const s = syncSource("base");
    for (const seed of [0, 1, 7, 99]) {
      const next = nextDueAfterSuccess(s, NOW, seed);
      assert.ok(next >= NOW + s.everyMs && next <= NOW + s.everyMs * 1.1, `seed ${seed}`);
    }
  });

  it("после ошибки пауза растёт вдвое, но не больше обычного периода", () => {
    const s = syncSource("base");
    assert.equal(nextDueAfterFailure(s, 1, NOW), NOW + 60_000);
    assert.equal(nextDueAfterFailure(s, 2, NOW), NOW + 120_000);
    assert.equal(nextDueAfterFailure(s, 3, NOW), NOW + 240_000);
    assert.equal(nextDueAfterFailure(s, 30, NOW), NOW + s.everyMs);
  });

  it("если WB назвал паузу (Retry-After), ждём не меньше неё", () => {
    const s = syncSource("feedbacks");
    assert.equal(nextDueAfterFailure(s, 1, NOW, 5 * 60_000), NOW + 5 * 60_000);
  });

  it("ошибка авторизации останавливает сбор; обычные ошибки нет", () => {
    assert.equal(isAuthFailure(401), true);
    assert.equal(isAuthFailure(403), true);
    assert.equal(isAuthFailure(429), false);
    assert.equal(isAuthFailure(500), false);
    assert.equal(isAuthFailure(null), false);
  });

  it("аренда дольше самого долгого прогона с паузами лимита", () => {
    // Реклама на кабинете с тысячами товаров может читаться несколько минут из-за лимита 3 запроса в минуту.
    assert.ok(LEASE_MS >= 5 * 60_000);
  });
});
