import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ruleCostsEatMargin, ruleLowBuyout, ruleLowRating, storeRatingOf } from "./quality";
import type { ShopBuyoutContext } from "./stock-math";
import type { TaskFact } from "./types";

const shop = (b: number | null): ShopBuyoutContext => ({ bShop: b, shopPastOrders: 500, shopPastBuyouts: b == null ? null : Math.round(500 * b), bShopSource: "funnel_past" });
const fact = (patch: Partial<TaskFact> = {}): TaskFact =>
  ({ nmId: "100", itemId: "i", title: "Ведро", vendorCode: "V", stock: 30, ...patch }) as TaskFact;

describe("низкий выкуп", () => {
  it("выкуп 55% при 80% по магазину и 100 заказах: значимо, важная задача, считает невыкупленное сверх нормы", () => {
    const d = ruleLowBuyout(fact({ pastOrderCount: 100, pastBuyoutCount: 55 }), shop(0.8));
    assert.ok(d);
    assert.equal(d.type, "TASK_LOW_BUYOUT");
    assert.equal(d.baseSeverity, "important");
    assert.equal(d.evidence.extra_returns, 25);
    assert.equal(d.evidence.buyout_percent, 55);
    assert.equal(d.actionType, "OPEN_PRODUCT");
  });

  it("разница 10 пунктов на 30 заказах — «возможность»: сообщить и предложить", () => {
    const d = ruleLowBuyout(fact({ pastOrderCount: 150, pastBuyoutCount: 112 }), shop(0.85));
    assert.equal(d?.baseSeverity, "opportunity");
  });

  it("молчит: мало заказов, нет среднего по магазину, разница меньше 8 пунктов, шум малых чисел", () => {
    assert.equal(ruleLowBuyout(fact({ pastOrderCount: 15, pastBuyoutCount: 5 }), shop(0.8)), null);
    assert.equal(ruleLowBuyout(fact({ pastOrderCount: 100, pastBuyoutCount: 55 }), shop(null)), null);
    assert.equal(ruleLowBuyout(fact({ pastOrderCount: 100, pastBuyoutCount: 75 }), shop(0.8)), null);
    assert.equal(ruleLowBuyout(fact({ pastOrderCount: 22, pastBuyoutCount: 15 }), shop(0.8)), null);
    assert.equal(ruleLowBuyout(fact({ pastOrderCount: 100, pastBuyoutCount: 55 }), null), null);
  });
});

describe("низкая оценка", () => {
  it("4,2 по 30 отзывам: важная задача, переходит в раздел отзывов", () => {
    const d = ruleLowRating(fact({ reviewRatingAvg: 4.2, reviewCount180: 30 }), 4.8);
    assert.ok(d);
    assert.equal(d.baseSeverity, "important");
    assert.equal(d.actionType, "OPEN_REVIEWS");
    assert.equal(d.evidence.store_rating_avg, 4.8);
  });

  it("4,4 — возможность; 4,6 при среднем 4,95 — тоже (заметно ниже своих)", () => {
    assert.equal(ruleLowRating(fact({ reviewRatingAvg: 4.4, reviewCount180: 20 }), null)?.baseSeverity, "opportunity");
    assert.ok(ruleLowRating(fact({ reviewRatingAvg: 4.6, reviewCount180: 20 }), 4.95));
  });

  it("молчит: мало отзывов, нормальная оценка, оценка около среднего", () => {
    assert.equal(ruleLowRating(fact({ reviewRatingAvg: 3.9, reviewCount180: 5 }), 4.8), null);
    assert.equal(ruleLowRating(fact({ reviewRatingAvg: 4.8, reviewCount180: 40 }), 4.8), null);
    assert.equal(ruleLowRating(fact({ reviewRatingAvg: 4.6, reviewCount180: 40 }), 4.7), null);
    assert.equal(ruleLowRating(fact({ reviewRatingAvg: 4.49, reviewCount180: 40 }), null) === null, false);
  });

  it("средняя по магазину считается только при 5+ товарах с достаточным числом отзывов", () => {
    const f = (r: number) => fact({ reviewRatingAvg: r, reviewCount180: 20 });
    assert.equal(storeRatingOf([f(4.8), f(4.9), f(4.7)]), null);
    const v = storeRatingOf([f(4.8), f(4.8), f(4.8), f(4.8), f(4.8)]);
    assert.ok(v != null && Math.abs(v - 4.8) < 1e-9);
  });
});

describe("логистика и хранение съедают маржу", () => {
  const base = { marginRub: 60, logisticsPerUnit: 70, storagePerUnit: 10, salesQty: 20, unitSaleNoDeliveries: false, storageExcluded: false };

  it("логистика 70 + хранение 10 при марже 60: забирают 57% прибыли до них; советы про габариты", () => {
    const d = ruleCostsEatMargin(fact(base));
    assert.ok(d);
    assert.equal(d.type, "TASK_COSTS_EAT_MARGIN");
    assert.equal(d.evidence.margin_before_costs_rub, 140);
    assert.equal(d.evidence.costs_share_percent, 57.1);
    assert.match(d.recommendation, /габариты/);
  });

  it("хранение ведёт — другой совет; 70%+ доли — важная", () => {
    const d = ruleCostsEatMargin(fact({ ...base, marginRub: 20, logisticsPerUnit: 20, storagePerUnit: 50 }));
    assert.match(d?.recommendation ?? "", /запас/);
    assert.equal(d?.baseSeverity, "important");
  });

  it("молчит: маржа минусовая (это другая задача), доля меньше половины, мало продаж, нет доставок, хранение исключено из расчёта", () => {
    assert.equal(ruleCostsEatMargin(fact({ ...base, marginRub: -10 })), null);
    assert.equal(ruleCostsEatMargin(fact({ ...base, marginRub: 200 })), null);
    assert.equal(ruleCostsEatMargin(fact({ ...base, salesQty: 2 })), null);
    assert.equal(ruleCostsEatMargin(fact({ ...base, unitSaleNoDeliveries: true })), null);
    // Хранение исключено: считаем только логистику: 70 / (60 + 70) = 54%, задача есть, но хранение в тексте не упоминается.
    const d = ruleCostsEatMargin(fact({ ...base, storageExcluded: true }));
    assert.equal(d?.evidence.storage_per_unit, null);
  });
});
