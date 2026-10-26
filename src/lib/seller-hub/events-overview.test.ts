import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCoverage, buildWeekCompare, type DayRow } from "./events-overview";
import type { SellerCatalogSnapshot } from "./types";

const snap = (over: Partial<SellerCatalogSnapshot> = {}): SellerCatalogSnapshot =>
  ({ marketplaceId: "wildberries", items: [{ id: "1", externalId: "1", price: 100, totalStock: 5 }], syncedAt: "", totalCount: 1, scopes: { prices: true, advert: false }, ...over }) as unknown as SellerCatalogSnapshot;

describe("что отслеживаем", () => {
  it("называет причину, если направление не отслеживается", () => {
    const rows = buildCoverage(snap(), 3);
    const by = (g: string) => rows.find((r) => r.group === g)!;
    assert.equal(by("stock").tracked, true);
    assert.equal(by("ads").tracked, false);
    assert.match(by("ads").note, /нет доступа к категории «Реклама»/);
    assert.equal(by("sales").tracked, false);
    assert.match(by("sales").note, /3 дн\./);
    assert.equal(by("agents").tracked, true);
  });

  it("история заказов считается накопленной с 8 дней; без снимка не падает", () => {
    assert.equal(buildCoverage(snap(), 8).find((r) => r.group === "sales")!.tracked, true);
    assert.doesNotThrow(() => buildCoverage(undefined, 0));
    assert.equal(buildCoverage(undefined, 0).find((r) => r.group === "orders")!.tracked, false);
  });

  it("отзывы: нет доступа и «ещё не загружены» различаются", () => {
    const forbidden = buildCoverage(snap({ feedbacks: { status: "forbidden" } as never }), 0).find((r) => r.group === "reviews")!;
    assert.match(forbidden.note, /нет доступа/);
    assert.equal(buildCoverage(snap({ feedbacks: { status: "ok" } as never }), 0).find((r) => r.group === "reviews")!.tracked, true);
  });
});

const days = (from: string, orders: number[], sum = 100): DayRow[] => orders.map((o, i) => ({ date: new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10), orders: o, orderSum: o * sum }));

describe("итоги недели", () => {
  // Сегодня 21 октября: текущая неделя 14–20, прошлая 7–13.
  it("сравнивает 7 законченных дней с предыдущими 7", () => {
    const w = buildWeekCompare(days("2026-10-07", [5, 5, 5, 5, 5, 5, 5, 10, 10, 10, 10, 10, 10, 10]), "2026-10-21")!;
    assert.equal(w.prevOrders, 35);
    assert.equal(w.orders, 70);
    assert.equal(w.ordersChange, 100);
    assert.equal(w.sumChange, 100);
    assert.equal(w.from, "2026-10-14");
    assert.equal(w.to, "2026-10-20");
  });

  it("если в истории есть дыры, сравнения нет (не выдаём пропуск за падение)", () => {
    const rows = days("2026-10-07", [5, 5, 5, 5, 5, 5, 5, 10, 10, 10, 10, 10, 10, 10]).filter((d) => d.date !== "2026-10-10");
    assert.equal(buildWeekCompare(rows, "2026-10-21"), null);
    assert.equal(buildWeekCompare(days("2026-10-14", [1, 1, 1, 1, 1, 1, 1]), "2026-10-21"), null);
  });

  it("сегодняшний неполный день в расчёт не входит", () => {
    const rows = [...days("2026-10-07", Array(14).fill(4)), { date: "2026-10-21", orders: 99, orderSum: 99 }];
    assert.equal(buildWeekCompare(rows, "2026-10-21")!.orders, 28);
  });
});
