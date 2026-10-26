import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDailyTrend } from "./daily-trend";

const d = (date: string, orders: number, cancelled: number, sum: number) => ({ date, orders, cancelled, sum });
const key = (i: number) => `2026-10-${String(i).padStart(2, "0")}`;

describe("динамика заказов по дням", () => {
  const days = Array.from({ length: 20 }, (_, i) => d(key(i + 1), 10, 1, i < 10 ? 9_000 : 18_000));

  it("итоги по законченным дням: без отмен, средний чек, доля отмен; сегодняшний день не считается", () => {
    const t = buildDailyTrend([...days, d("2026-10-21", 3, 0, 5_000)], "2026-10-21")!;
    assert.equal(t.completeDays, 20);
    assert.equal(t.totals.orders, 200);
    assert.equal(t.totals.cancelled, 20);
    assert.equal(t.totals.net, 180);
    assert.equal(t.totals.sum, 270_000);
    assert.equal(t.totals.avgCheck, 1500);
    assert.equal(t.totals.cancelShare, 0.1);
    assert.equal(t.days.at(-1)!.partial, true);
  });

  it("половины периода: вторая против первой; лучший и худший день по сумме", () => {
    const t = buildDailyTrend(days, "2026-10-21")!;
    assert.equal(t.halves!.sumChange, 100);
    assert.equal(t.halves!.netChange, 0);
    assert.equal(t.best!.sum, 18_000);
    assert.equal(t.worst!.sum, 9_000);
  });

  it("дни без заказов дополняются нулями: среднее считается на календарные дни, худший день — день без продаж", () => {
    const sparse = [d(key(1), 4, 0, 4_000), d(key(5), 6, 0, 6_000), d(key(10), 2, 0, 2_000)];
    const t = buildDailyTrend(sparse, key(11), key(1))!;
    assert.equal(t.completeDays, 10);
    assert.equal(t.totals.net, 12);
    assert.equal(t.totals.avgPerDay, 1.2);
    assert.equal(t.worst!.sum, 0);
    // соседние даты на графике идут подряд
    assert.deepEqual(t.days.slice(0, 3).map((x) => x.date), [key(1), key(2), key(3)]);
  });

  it("дополнение начинается с первого дня запрошенного периода, даже если заказов в нём не было", () => {
    const t = buildDailyTrend([d(key(5), 2, 0, 1_000)], key(11), key(1))!;
    assert.equal(t.days[0]!.date, key(1));
    assert.equal(t.completeDays, 10);
  });

  it("нечётное число дней: половины равной длины, плоские продажи не дают ложного роста", () => {
    const flat = Array.from({ length: 29 }, (_, i) => d(key(i + 1), 10, 0, 10_000));
    const t = buildDailyTrend(flat, "2026-10-30", key(1))!;
    assert.equal(t.completeDays, 29);
    assert.equal(t.halves!.days, 14);
    assert.equal(t.halves!.sumChange, 0);
    assert.equal(t.halves!.netChange, 0);
  });

  it("мало дней — половины не сравниваем; нет данных — null", () => {
    assert.equal(buildDailyTrend(days.slice(0, 8), "2026-10-09")!.halves, null);
    assert.equal(buildDailyTrend(undefined, "2026-10-25"), null);
    assert.equal(buildDailyTrend([d("2026-10-25", 1, 0, 100)], "2026-10-25"), null);
  });
});
