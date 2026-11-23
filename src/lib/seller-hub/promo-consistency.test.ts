import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { optionApplies, type ProductFacts } from "./product-advice";
import { promoLossOffers, promoOpportunityOffers } from "./task-engine/promo";
import type { PromoOfferFact, TaskFact } from "./task-engine/types";

const NOW = Date.parse("2026-11-10T00:00:00Z");
const offer = (over: Partial<PromoOfferFact>): PromoOfferFact => ({
  promoId: "1",
  promoName: "Акция",
  promoType: null,
  startAt: "2026-11-11T00:00:00Z",
  endAt: "2026-11-30T00:00:00Z",
  canManage: true,
  planPrice: 500,
  inPromo: false,
  cohort: "boost",
  marginPromoRub: 80,
  marginPromoPercent: 16,
  marginNowRub: 120,
  ...over,
});
const fact = (offers: PromoOfferFact[], over: Partial<TaskFact> = {}) => ({ stock: 50, coverDays: 30, promoOffers: offers, ...over }) as unknown as TaskFact;
const advice = (available: number, losing: number) => ({ promotions: { available, joined: 0, losing } }) as unknown as ProductFacts;

describe("акции: подсказки и задачи не спорят", () => {
  it("выгодная акция считается возможностью", () => {
    assert.equal(promoOpportunityOffers(fact([offer({})]), NOW).length, 1);
  });
  it("убыточная цена входа не считается возможностью", () => {
    assert.equal(promoOpportunityOffers(fact([offer({ cohort: "loss", marginPromoRub: -40 })]), NOW).length, 0);
  });
  it("без остатка или с малым запасом входить не советуем", () => {
    assert.equal(promoOpportunityOffers(fact([offer({})], { stock: 0 }), NOW).length, 0);
    assert.equal(promoOpportunityOffers(fact([offer({})], { coverDays: 3 }), NOW).length, 0);
  });
  it("если товар в убыточной акции, «войти в акцию» не предлагается", () => {
    const f = fact([offer({ inPromo: true, cohort: "loss", marginPromoRub: -30 }), offer({ promoId: "2" })]);
    assert.equal(promoLossOffers(f, NOW).length, 1);
    assert.equal(optionApplies("join_promo", advice(promoOpportunityOffers(f, NOW).length, 1)), false);
  });
  it("при выгодной акции и без убыточных вариант доступен", () => {
    assert.equal(optionApplies("join_promo", advice(1, 0)), true);
  });
});
