import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasRecentNegative, ordersTrend, playbookSignals, turnoverFromDossier } from "./signals";

const TODAY = "2026-10-26";
const NOW = Date.parse("2026-10-26T12:00:00Z");
const shift = (date: string, delta: number) => new Date(Date.parse(`${date}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
/** Ряд заказов за 40 дней до вчерашнего: values[0] — самый старый. */
function series(values: number[]): Map<string, number> {
  const m = new Map<string, number>();
  values.forEach((v, i) => m.set(shift(TODAY, -(values.length - i)), v));
  return m;
}

describe("тренд заказов товара", () => {
  const steady = Array.from({ length: 30 }, (_, i) => 20 + (i % 3)); // 20..22 в день

  it("ровные продажи: падения и роста нет, тренд известен", () => {
    const t = ordersTrend(series(steady), TODAY);
    assert.deepEqual(t, { declineDays: 0, riseDays: 0, known: true });
  });

  it("три дня резко ниже обычного подряд дают серию падения нужной длины", () => {
    const t = ordersTrend(series([...steady, 10, 9, 8]), TODAY);
    assert.equal(t.known, true);
    assert.equal(t.declineDays, 3);
    assert.equal(t.riseDays, 0);
  });

  it("серия считается только до вчерашнего дня и обрывается днём без падения", () => {
    const t = ordersTrend(series([...steady, 9, 8, 21, 10, 9]), TODAY);
    assert.equal(t.declineDays, 2);
  });

  it("рост заказов считается отдельно", () => {
    const t = ordersTrend(series([...steady, 34, 36, 35, 37]), TODAY);
    assert.ok(t.riseDays >= 3, `riseDays=${t.riseDays}`);
    assert.equal(t.declineDays, 0);
  });

  it("мало истории — тренд неизвестен, серия не засчитывается", () => {
    const t = ordersTrend(series([5, 4, 3, 2, 1]), TODAY);
    assert.deepEqual(t, { declineDays: 0, riseDays: 0, known: false });
  });

  it("малозаметное отклонение (меньше 15% от ожидаемого в сумме) серией не считается", () => {
    const flat = Array.from({ length: 30 }, () => 100);
    const t = ordersTrend(series([...flat, 94, 94, 94]), TODAY);
    assert.equal(t.declineDays, 0);
  });
});

describe("оборачиваемость из досье", () => {
  it("берётся дни запаса из досье, без второй формулы", () => {
    assert.equal(turnoverFromDossier(50, 100, false), 50);
    assert.equal(turnoverFromDossier(50.04, 100, false), 50);
  });
  it("остаток есть, заказов нет ни в одном окне — 365 дней; остатка нет — null", () => {
    assert.equal(turnoverFromDossier(null, 10, true), 365);
    assert.equal(turnoverFromDossier(null, 0, true), null);
    assert.equal(turnoverFromDossier(null, null, true), null);
  });
  it("данных нет и товар не мёртвый — null, не гадаем; очень большой запас ограничивается 365", () => {
    assert.equal(turnoverFromDossier(null, 10, false), null);
    assert.equal(turnoverFromDossier(900, 10, false), 365);
  });
});

describe("негатив в последних 10 отзывах", () => {
  const f = (rating: number, day: number, countsOnCard = true) => ({ rating, createdAt: `2026-10-${String(day).padStart(2, "0")}T10:00:00Z`, countsOnCard });
  it("низкая оценка внутри десяти последних — негатив", () => {
    const list = [f(5, 25), f(5, 24), f(2, 23), ...Array.from({ length: 6 }, (_, i) => f(5, 20 - i))];
    assert.equal(hasRecentNegative(list, NOW), true);
  });
  it("низкая оценка старше десятого отзыва уже не в окне", () => {
    const list = [...Array.from({ length: 10 }, (_, i) => f(5, 25 - i)), f(1, 3)];
    assert.equal(hasRecentNegative(list, NOW), false);
  });
  it("низкая оценка старше 30 дней не держит цену сниженной, даже если она в окне из 10 отзывов", () => {
    const old = { rating: 1, createdAt: "2026-08-01T10:00:00Z", countsOnCard: true };
    assert.equal(hasRecentNegative([f(5, 20), old], NOW), false);
    const fresh = { rating: 2, createdAt: "2026-10-10T10:00:00Z", countsOnCard: true };
    assert.equal(hasRecentNegative([f(5, 20), fresh], NOW), true);
  });
  it("отзывы, не попадающие на карточку, не считаются; отзывов нет — не негатив", () => {
    assert.equal(hasRecentNegative([f(1, 25, false), f(5, 24)], NOW), false);
    assert.equal(hasRecentNegative([], NOW), false);
  });
});

describe("сбор сигналов товара", () => {
  const steady = Array.from({ length: 30 }, () => 20);
  it("без цены сигналов нет; отзывы не читались — recentNegative null", () => {
    const base = { nmId: "1", discountedPrice: 1000, stock: 400, coverDays: 20, deadStock: false, cartPercent: 4, openCount: 900, ordersByDate: series(steady), feedbacks: null };
    assert.equal(playbookSignals({ ...base, discountedPrice: null }, TODAY), null);
    const s = playbookSignals(base, TODAY)!;
    assert.equal(s.recentNegative, null);
    assert.equal(s.turnoverDays, 20);
    assert.equal(s.oosDays, 20);
    assert.equal(s.trendKnown, true);
  });
});
