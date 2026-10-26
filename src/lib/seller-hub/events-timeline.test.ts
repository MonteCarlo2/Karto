import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildEventTimeline, CAUSE_WINDOW_DAYS } from "./events-timeline";
import type { SellerProductEvent } from "./event-engine/types";

const NOW = Date.parse("2026-10-17T12:00:00Z");

const day = (date: string, orders: number) => ({ date, orders, revenue: orders * 1000, buyouts: 0 });
const event = (id: string, kind: SellerProductEvent["kind"], createdAt: string): SellerProductEvent => ({
  id,
  createdAt,
  kind,
  group: "other",
  severity: "info",
  title: kind,
  detail: "",
  productTitle: "Ведро",
  vendorCode: null,
  nmId: "1",
  itemId: "i1",
});

describe("buildEventTimeline", () => {
  const daily = [day("2026-10-11", 10), day("2026-10-12", 11), day("2026-10-13", 9), day("2026-10-14", 10), day("2026-10-15", 3), day("2026-10-16", 10), day("2026-10-17", 1)];

  it("помечает неполный сегодняшний день и раскладывает события по дням", () => {
    const { days } = buildEventTimeline({ daily, events: [event("a", "price_changed", "2026-10-14T08:00:00Z")], nowMs: NOW });
    assert.equal(days.at(-1)!.partial, true);
    assert.equal(days.find((d) => d.date === "2026-10-14")!.events.length, 1);
  });

  it("находит просадку и называет возможные причины из окна перед ней, самые вероятные первыми", () => {
    const events = [
      event("price", "price_changed", "2026-10-14T08:00:00Z"),
      event("stock", "stock_out", "2026-10-14T20:00:00Z"),
      event("old", "price_changed", "2026-10-01T08:00:00Z"),
      event("content", "photos_changed", "2026-10-15T07:00:00Z"),
      event("sync", "sync_completed", "2026-10-15T07:00:00Z"),
    ];
    const { drops } = buildEventTimeline({ daily, events, nowMs: NOW });
    assert.equal(drops.length, 1);
    assert.equal(drops[0]!.date, "2026-10-15");
    assert.equal(drops[0]!.dropPercent, 70);
    assert.deepEqual(drops[0]!.causes.map((c) => c.event.id), ["stock", "price", "content"]);
  });

  it("малые числа и сегодняшний неполный день просадкой не считаются", () => {
    const small = [day("2026-10-11", 1), day("2026-10-12", 1), day("2026-10-13", 2), day("2026-10-14", 1), day("2026-10-15", 0)];
    assert.equal(buildEventTimeline({ daily: small, events: [], nowMs: NOW }).drops.length, 0);
    const onlyToday = [...daily.slice(0, 6), day("2026-10-17", 0)];
    assert.equal(buildEventTimeline({ daily: onlyToday, events: [], nowMs: NOW }).drops.some((d) => d.date === "2026-10-17"), false);
  });

  it("окно причин ограничено", () => {
    assert.equal(CAUSE_WINDOW_DAYS, 3);
  });
});
