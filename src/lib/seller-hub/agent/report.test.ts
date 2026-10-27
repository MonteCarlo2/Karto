import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildWeeklyReport, lastFullWeek } from "./report";

describe("недельный отчёт агентов", () => {
  it("последняя полная неделя: понедельник–воскресенье по Москве", () => {
    // Четверг 29.10.2026 → неделя 19–25 октября
    assert.deepEqual(lastFullWeek(Date.parse("2026-10-29T10:00:00+03:00")), { start: "2026-10-19", end: "2026-10-25" });
    // В понедельник 26.10 прошлая неделя только что закончилась
    assert.deepEqual(lastFullWeek(Date.parse("2026-10-26T00:30:00+03:00")), { start: "2026-10-19", end: "2026-10-25" });
    // В воскресенье неделя ещё идёт
    assert.deepEqual(lastFullWeek(Date.parse("2026-10-25T20:00:00+03:00")), { start: "2026-10-12", end: "2026-10-18" });
  });
  it("считает действия, планы и открытые предложения", () => {
    const r = buildWeeklyReport({
      period: { start: "2026-10-19", end: "2026-10-25" },
      actions: [
        { action: "ad_pause", result: "ok", initiator: "user" },
        { action: "autopilot_minus", result: "ok", initiator: "agent" },
        { action: "autopilot_minus", result: "ok", initiator: "agent" },
        { action: "ad_deposit", result: "error", initiator: "user" },
        { action: "ad_pause", result: "suggested", initiator: "agent" },
      ],
      plans: [
        { title: "Ведро", state: { status: "worked", acceptedAt: "2026-10-10T10:00:00Z", resolvedAt: "2026-10-22T10:00:00Z", reason: "заказы выросли" } },
        { title: "Кашпо", state: { status: "not_worked", acceptedAt: "2026-10-20T10:00:00Z", resolvedAt: "2026-10-30T10:00:00Z" } },
        { title: "Основа", state: { status: "running", acceptedAt: "2026-10-21T10:00:00Z" } },
      ],
      openProposals: 3,
    });
    assert.deepEqual([r.actions.total, r.actions.byUser, r.actions.byAgent, r.actions.errors], [3, 1, 2, 1]);
    assert.equal(r.actions.list[0]!.count, 2);
    assert.deepEqual(r.plans, { accepted: 2, worked: 1, notWorked: 0, observed: 0, running: 1 });
    assert.equal(r.finished.length, 1, "план, закончившийся вне недели, не попадает");
    assert.equal(r.openProposals, 3);
  });
});
