import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildShipSpeed, type SupplyOrdersInput } from "./ship-speed";

const NOW = Date.parse("2026-10-17T12:00:00Z");
const supply = (supplyId: string, closedAt: string, createdList: Array<string | undefined>): SupplyOrdersInput => ({
  supplyId,
  closedAt,
  orders: createdList.map((createdAt, i) => ({ id: i + 1, createdAt })),
});

describe("скорость отгрузки FBS", () => {
  it("считает часы от заказа до закрытия поставки", () => {
    const r = buildShipSpeed([supply("A", "2026-10-16T12:00:00Z", ["2026-10-16T06:00:00Z", "2026-10-15T12:00:00Z", "2026-10-16T09:00:00Z"])], NOW)!;
    assert.equal(r.orders, 3);
    assert.equal(r.medianHours, 6);
    assert.equal(r.avgHours, 11);
    assert.equal(r.perSupply[0]!.maxHours, 24);
    assert.equal(r.buckets.find((b) => b.id === "h6")!.count, 2);
    assert.equal(r.buckets.find((b) => b.id === "h24")!.count, 1);
    assert.equal(Math.round(r.over24Share * 100), 0);
  });

  it("пропускает задания без даты и созданные позже закрытия, поставки без заказов не считает", () => {
    const r = buildShipSpeed(
      [supply("A", "2026-10-16T12:00:00Z", [undefined, "2026-10-17T00:00:00Z", "2026-10-16T10:00:00Z"]), supply("B", "2026-10-16T12:00:00Z", []), supply("C", "bad", ["2026-10-16T10:00:00Z"])],
      NOW,
    )!;
    assert.equal(r.orders, 1);
    assert.equal(r.supplies, 1);
    assert.equal(buildShipSpeed([supply("B", "2026-10-16T12:00:00Z", [])], NOW), null);
  });

  it("ритм по дням недели: в какие дни закрывают поставки и сколько ждут заказы этого дня", () => {
    // 2026-10-16 — пятница. Заказы пятницы вечером, поставка закрыта в понедельник 2026-10-19 утром.
    const friday = (h: number) => `2026-10-16T${String(h).padStart(2, "0")}:00:00Z`;
    const r = buildShipSpeed(
      [
        supply("MON", "2026-10-19T07:00:00Z", [friday(15), friday(16), friday(17), friday(18)]),
        supply("TUE", "2026-10-20T07:00:00Z", ["2026-10-19T09:00:00Z"]),
      ],
      Date.parse("2026-10-21T12:00:00Z"),
    )!;
    const fri = r.weekdays[4]!;
    assert.equal(fri.ordersCreated, 4);
    assert.ok(fri.medianWait! > 60 && fri.medianWait! < 70);
    assert.equal(r.weekdays[0]!.suppliesClosed, 1);
    assert.equal(r.weekdays[1]!.suppliesClosed, 1);
    assert.equal(r.weekdays[5]!.suppliesClosed, 0);
    assert.equal(r.weekdays[0]!.medianWait, null);
    assert.equal(r.weekdays.length, 7);
  });

  it("доля дольше суток и динамика по неделям", () => {
    const recent = supply("R", "2026-10-15T12:00:00Z", Array.from({ length: 5 }, () => "2026-10-15T00:00:00Z"));
    const old = supply("O", "2026-10-07T12:00:00Z", Array.from({ length: 5 }, () => "2026-10-06T00:00:00Z"));
    const r = buildShipSpeed([recent, old], NOW)!;
    assert.equal(r.trend!.recentMedian, 12);
    assert.equal(r.trend!.previousMedian, 36);
    assert.equal(r.over24Share, 0.5);
    assert.equal(buildShipSpeed([recent], NOW)!.trend, null);
  });
});
