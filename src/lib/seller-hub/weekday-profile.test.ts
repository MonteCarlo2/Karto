import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildWeekdayProfile } from "./weekday-profile";

describe("заказы по дням недели", () => {
  it("считает среднее на один день недели, а не сумму", () => {
    // понедельников было 5, остальных по 4: суммы 50 и 40 дают одинаковые 10 в день
    const p = buildWeekdayProfile([50, 40, 40, 40, 40, 20, 20], [5, 4, 4, 4, 4, 4, 4])!;
    assert.equal(p.days[0]!.avgPerDay, 10);
    assert.equal(p.days[1]!.avgPerDay, 10);
    assert.equal(p.days[5]!.avgPerDay, 5);
    assert.equal(p.quietest, 5);
    assert.equal(p.ratio, 2);
    assert.equal(Math.round(p.days.reduce((s, d) => s + d.share, 0) * 100), 100);
  });

  it("при малом числе заказов или дат, а также без данных — null", () => {
    assert.equal(buildWeekdayProfile([1, 1, 1, 1, 1, 1, 1], [4, 4, 4, 4, 4, 4, 4]), null);
    assert.equal(buildWeekdayProfile([50, 40, 40, 40, 40, 20, 20], [5, 4, 4, 4, 2, 4, 4]), null);
    assert.equal(buildWeekdayProfile(undefined, undefined), null);
  });

  it("день без заказов — отношение не считаем", () => {
    const p = buildWeekdayProfile([40, 40, 40, 40, 40, 0, 0], [4, 4, 4, 4, 4, 4, 4])!;
    assert.equal(p.ratio, null);
  });
});
