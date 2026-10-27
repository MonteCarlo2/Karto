import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { measureOutcome, observeUntil } from "./outcomes";

const CHANGE = "2026-10-10";
const shift = (date: string, delta: number) => new Date(Date.parse(`${date}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);

/** 28 дней до изменения по `before` заказов в день и `afterDays` дней после по `after`. */
function series(before: number, after: number, afterDays: number, beforeDays = 28): Map<string, number> {
  const m = new Map<string, number>();
  for (let back = 1; back <= beforeDays; back += 1) m.set(shift(CHANGE, -back), before);
  for (let ahead = 1; ahead <= afterDays; ahead += 1) m.set(shift(CHANGE, ahead), after);
  return m;
}
const today = (afterDays: number) => shift(CHANGE, afterDays + 1);

describe("результат действия: до и после", () => {
  it("заказов после стало заметно больше: улучшение", () => {
    const res = measureOutcome({ changeDate: CHANGE, todayKey: today(8), ordersByDate: series(10, 14, 8) });
    assert.equal(res.verdict, "improved");
    assert.ok(res.z! > 2);
    assert.ok(Math.abs(res.ordersChange! - 0.4) < 0.001);
  });

  it("заказов стало заметно меньше: ухудшение", () => {
    const res = measureOutcome({ changeDate: CHANGE, todayKey: today(8), ordersByDate: series(10, 6, 8) });
    assert.equal(res.verdict, "worse");
    assert.ok(res.z! < -2);
  });

  it("небольшое колебание в пределах случайности: заметного эффекта нет", () => {
    const res = measureOutcome({ changeDate: CHANGE, todayKey: today(8), ordersByDate: series(10, 10.5, 8) });
    assert.equal(res.verdict, "no_visible_effect");
  });

  it("слишком рано: меньше 7 законченных дней после изменения", () => {
    const res = measureOutcome({ changeDate: CHANGE, todayKey: today(5), ordersByDate: series(10, 20, 5) });
    assert.equal(res.verdict, "too_early");
    assert.equal(res.daysAfter, 5);
  });

  it("сегодняшний неполный день и день самого изменения в сравнение не входят", () => {
    const m = series(10, 10, 7);
    m.set(CHANGE, 0); // день изменения
    m.set(shift(CHANGE, 8), 100); // «сегодня» с неполными данными
    const res = measureOutcome({ changeDate: CHANGE, todayKey: shift(CHANGE, 8), ordersByDate: m });
    assert.equal(res.daysAfter, 7);
    assert.equal(res.verdict, "no_visible_effect");
  });

  it("у товара почти нет заказов: судить нельзя, а не «эффекта нет»", () => {
    const res = measureOutcome({ changeDate: CHANGE, todayKey: today(8), ordersByDate: series(0.2, 0.1, 8) });
    assert.equal(res.verdict, "unknown");
    assert.match(res.note, /слишком мало/);
  });

  it("мало истории до изменения: сравнивать не с чем", () => {
    const res = measureOutcome({ changeDate: CHANGE, todayKey: today(8), ordersByDate: series(10, 20, 8, 6) });
    assert.equal(res.verdict, "unknown");
  });

  it("при смене цены заказы и выручка могут расходиться, это видно в итоге", () => {
    const revenue = new Map<string, number>();
    for (let back = 1; back <= 28; back += 1) revenue.set(shift(CHANGE, -back), 10000);
    for (let ahead = 1; ahead <= 8; ahead += 1) revenue.set(shift(CHANGE, ahead), 9000);
    const res = measureOutcome({ changeDate: CHANGE, todayKey: today(8), ordersByDate: series(10, 14, 8), revenueByDate: revenue });
    assert.equal(res.verdict, "improved");
    assert.ok(Math.abs(res.revenueChange! + 0.1) < 0.001);
    assert.match(res.note, /Выручка в день: −?-?10%/);
  });

  it("в примечании всегда сказано, что это не доказательство причины", () => {
    const res = measureOutcome({ changeDate: CHANGE, todayKey: today(8), ordersByDate: series(10, 14, 8) });
    assert.match(res.note, /не доказательство причины/);
  });

  it("окно наблюдения заканчивается через 9 суток после выполнения", () => {
    assert.equal(observeUntil(Date.parse("2026-10-10T12:00:00Z")), "2026-10-19T12:00:00.000Z");
  });
});
