import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collapseBursts, dayLabel, feedCounts, groupEventsByDay, matchesFilter, matchesQuery, needsAttention } from "./events-feed";
import type { SellerProductEvent } from "./event-engine/types";

// 21 октября 2026, 12:00 по Москве.
const NOW = Date.parse("2026-10-21T09:00:00Z");
const ev = (id: string, createdAt: string, over: Partial<SellerProductEvent> = {}): SellerProductEvent => ({
  id, createdAt, kind: "price_changed", group: "price", severity: "info", title: id, detail: "", productTitle: null, vendorCode: null, nmId: null, itemId: null, ...over,
});

describe("лента событий по дням", () => {
  it("подписи: сегодня, вчера, дальше дата с днём недели", () => {
    assert.equal(dayLabel("2026-10-21", NOW), "Сегодня");
    assert.equal(dayLabel("2026-10-20", NOW), "Вчера");
    assert.equal(dayLabel("2026-10-18", NOW), "18 октября, воскресенье");
  });

  it("группирует по дням по Москве, новые дни и новые события сверху", () => {
    const days = groupEventsByDay([ev("a", "2026-10-20T08:00:00Z"), ev("b", "2026-10-21T08:30:00Z"), ev("c", "2026-10-20T15:00:00Z"), ev("late", "2026-10-20T21:30:00Z")], NOW);
    // 21:30 UTC 20 октября — это уже 00:30 21 октября по Москве: событие попадает в «Сегодня».
    assert.deepEqual(days.map((d) => d.date), ["2026-10-21", "2026-10-20"]);
    assert.deepEqual(days[0]!.events.map((e) => e.id), ["b", "late"]);
    const d20 = days.find((d) => d.date === "2026-10-20")!;
    assert.deepEqual(d20.events.map((e) => e.id), ["c", "a"]);
    assert.equal(days.find((d) => d.date === "2026-10-21")!.label, "Сегодня");
  });

  it("итог дня только у законченных дней, у сегодняшнего его нет", () => {
    const digests = new Map([["2026-10-20", { orders: 6, orderSum: 11688 }], ["2026-10-21", { orders: 2, orderSum: 3202 }]]);
    const days = groupEventsByDay([ev("a", "2026-10-20T08:00:00Z"), ev("b", "2026-10-21T08:30:00Z")], NOW, digests);
    assert.deepEqual(days.find((d) => d.date === "2026-10-20")!.digest, { orders: 6, orderSum: 11688 });
    assert.equal(days.find((d) => d.date === "2026-10-21")!.digest, null);
  });

  it("внимание — всё, кроме «к сведению»; фильтры по направлению и поиск", () => {
    const info = ev("i", "2026-10-21T08:00:00Z");
    const imp = ev("x", "2026-10-21T08:00:00Z", { severity: "important", group: "stock", title: "Остаток закончился", productTitle: "Ведро 10л" });
    assert.equal(needsAttention(info), false);
    assert.equal(needsAttention(imp), true);
    assert.equal(matchesFilter(imp, "attention"), true);
    assert.equal(matchesFilter(info, "attention"), false);
    assert.equal(matchesFilter(imp, "stock"), true);
    assert.equal(matchesFilter(imp, "price"), false);
    assert.equal(matchesQuery(imp, "ведро"), true);
    assert.equal(matchesQuery(imp, "кашпо"), false);
    assert.deepEqual(feedCounts([info, imp]).attention, 1);
    assert.equal(feedCounts([info, imp]).byGroup.get("stock"), 1);
  });

  it("серия однотипных событий по товарам в одну минуту схлопывается в одно уведомление", () => {
    const mk = (id: string, t: string, nm: string, kind: SellerProductEvent["kind"] = "discount_changed") => ev(id, t, { kind, nmId: nm, title: "Изменилась скидка", productTitle: `Товар ${nm}` });
    const list = [mk("1", "2026-10-19T16:31:30Z", "1"), mk("2", "2026-10-19T16:31:20Z", "2"), mk("3", "2026-10-19T16:31:10Z", "3"), mk("4", "2026-10-19T10:00:00Z", "4")];
    const items = collapseBursts(list);
    assert.equal(items.length, 2);
    assert.equal(items[0]!.type, "burst");
    assert.equal((items[0] as { title: string }).title, "Изменилась скидка: у 3 товаров");
    assert.equal(items[1]!.type, "single");
  });

  it("серия находится, даже когда виды чередуются (скидка, цена, скидка, цена…)", () => {
    const mk = (id: string, nm: string, kind: SellerProductEvent["kind"]) => ev(id, "2026-10-19T16:31:00Z", { kind, nmId: nm, title: kind === "discount_changed" ? "Изменилась скидка" : "Изменилась цена со скидкой" });
    const list = [mk("d1", "1", "discount_changed"), mk("p1", "1", "promo_price_changed"), mk("d2", "2", "discount_changed"), mk("p2", "2", "promo_price_changed"), mk("d3", "3", "discount_changed"), mk("p3", "3", "promo_price_changed")];
    const items = collapseBursts(list);
    assert.equal(items.length, 2);
    assert.deepEqual(items.map((i) => (i.type === "burst" ? i.events.length : 1)), [3, 3]);
  });

  it("две однотипные записи, события без товара и записи разных минут серией не считаются", () => {
    const mk = (id: string, nm: string | null, kind: SellerProductEvent["kind"], t = "2026-10-19T16:31:00Z") => ev(id, t, { kind, nmId: nm, title: "Т" });
    assert.equal(collapseBursts([mk("1", "1", "price_changed"), mk("2", "2", "price_changed")]).every((i) => i.type === "single"), true);
    assert.equal(collapseBursts([mk("1", null, "penalties_up"), mk("2", null, "penalties_up"), mk("3", null, "penalties_up")]).every((i) => i.type === "single"), true);
    assert.equal(collapseBursts([mk("1", "1", "price_changed"), mk("2", "2", "price_changed", "2026-10-19T10:00:00Z"), mk("3", "3", "price_changed", "2026-10-18T10:00:00Z")]).every((i) => i.type === "single"), true);
  });
});
