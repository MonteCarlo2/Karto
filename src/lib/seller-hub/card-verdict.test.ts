import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCardVerdicts } from "./card-verdict";
import type { Diagnosis } from "./product-diagnosis";
import type { TaskFact } from "./task-engine/types";

function fact(nmId: string, patch: Partial<TaskFact>): TaskFact {
  return {
    nmId,
    title: `Товар ${nmId}`,
    stockFbo: 100,
    stockFbs: 0,
    openCount: 1000,
    cartCount: 150,
    orders: 40,
    pastOrderCount: 40,
    pastBuyoutCount: 30,
    contentScore: 80,
    contentGaps: null,
    reviewRatingAvg: 4.9,
    reviewCount180: 30,
    marginPercent: 20,
    ...patch,
  } as TaskFact;
}

const shop = (extra: TaskFact[]): TaskFact[] => [fact("a", {}), fact("b", {}), fact("c", {}), fact("d", {}), ...extra];
const byNm = (list: ReturnType<typeof buildCardVerdicts>, nm: string) => list.find((v) => v.nmId === nm)!;

describe("buildCardVerdicts", () => {
  it("обычная карточка магазина — «Работает»", () => {
    const list = buildCardVerdicts({ facts: shop([]), diagnoses: [] });
    assert.equal(byNm(list, "a").verdict, "works");
  });

  it("мало переходов, но конверсия не хуже и маржа есть — «хорошая, но её мало видят»", () => {
    const list = buildCardVerdicts({ facts: shop([fact("hid", { openCount: 120, cartCount: 20, orders: 5 })]), diagnoses: [] });
    const v = byNm(list, "hid");
    assert.equal(v.verdict, "great_hidden");
    assert.equal(v.traffic.status, "bad");
  });

  it("мало переходов и недозаполненный контент — «Почти не видят»", () => {
    const list = buildCardVerdicts({ facts: shop([fact("h2", { openCount: 120, cartCount: 20, orders: 5, contentScore: 30 })]), diagnoses: [] });
    assert.equal(byNm(list, "h2").verdict, "hidden");
  });

  it("значимо хуже остального магазина по конверсии (из диагноза) — «Видят, но не покупают», вес растёт с потенциалом", () => {
    const diagnosis: Diagnosis = { nmId: "bad", stage: "cartToOrder", mine: 8, benchmark: 27, pValue: 0.001, extraOrders: 12, extraRevenue: 9000, blockers: [], verdict: "fix_card" };
    const list = buildCardVerdicts({ facts: shop([fact("bad", { cartCount: 150, orders: 12 })]), diagnoses: [diagnosis] });
    const v = byNm(list, "bad");
    assert.equal(v.verdict, "leaky");
    assert.equal(list[0]!.nmId, "bad");
    assert.match(v.conversion.note, /против/);
  });

  it("выкуп значимо ниже остального магазина — «Покупают, но возвращают»", () => {
    const list = buildCardVerdicts({ facts: shop([fact("ret", { pastOrderCount: 100, pastBuyoutCount: 30 })]), diagnoses: [] });
    // у остальных: 4 карточки по 30/40 = 75%; у ret 30%
    assert.equal(byNm(list, "ret").verdict, "returns");
    assert.equal(byNm(list, "ret").buyout.status, "bad");
  });

  it("рейтинг ниже среднего по магазину при достаточных отзывах — «есть что улучшить»", () => {
    const list = buildCardVerdicts({ facts: shop([fact("rt", { reviewRatingAvg: 4.2, reviewCount180: 12 })]), diagnoses: [] });
    assert.equal(byNm(list, "rt").verdict, "polish");
    assert.equal(byNm(list, "rt").rating.status, "bad");
  });

  it("нет воронки — пусто; у новой карточки без показов на фоне магазина — «Почти не видят»", () => {
    assert.deepEqual(buildCardVerdicts({ facts: [fact("x", { openCount: null })], diagnoses: [] }), []);
    const list = buildCardVerdicts({ facts: [...shop([]), fact("n", { openCount: 5, cartCount: 0, orders: 0 })], diagnoses: [] });
    assert.equal(byNm(list, "n").verdict, "hidden");
  });

  it("когда переходов мало у всего магазина, вывод не делаем — «Мало данных»", () => {
    const tiny = [1, 2, 3].map((i) => fact(`t${i}`, { openCount: 10, cartCount: 1, orders: 0 }));
    assert.equal(buildCardVerdicts({ facts: tiny, diagnoses: [] })[0]!.verdict, "no_data");
  });
});
