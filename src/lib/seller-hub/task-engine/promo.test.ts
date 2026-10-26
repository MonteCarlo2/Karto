import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rulePromoLoss, rulePromoOpportunity } from "./promo";
import type { PromoOfferFact, TaskFact } from "./types";

const NOW = "2026-10-21T09:00:00.000Z";

const offer = (patch: Partial<PromoOfferFact> = {}): PromoOfferFact => ({
  promoId: "1",
  promoName: "Осенние скидки",
  promoType: "regular",
  startAt: "2026-10-25T00:00:00.000Z",
  endAt: "2026-11-20T00:00:00.000Z",
  canManage: true,
  planPrice: 500,
  inPromo: true,
  cohort: "loss",
  marginPromoRub: -40,
  marginPromoPercent: -8,
  marginNowRub: 90,
  ...patch,
});

const fact = (offers: PromoOfferFact[], patch: Partial<TaskFact> = {}): TaskFact =>
  ({ nmId: "100", itemId: "i", title: "Ведро", vendorCode: "V", stock: 30, coverDays: 40, promoOffers: offers, ...patch }) as TaskFact;

describe("задача «акция уводит в минус»", () => {
  it("товар в акции с убыточной ценой: задача важная, до старта", () => {
    const d = rulePromoLoss(fact([offer()]), NOW);
    assert.ok(d);
    assert.equal(d.type, "TASK_PROMO_LOSS");
    assert.equal(d.baseSeverity, "important");
    assert.equal(d.evidence.promo_margin_rub, -40);
    assert.equal(d.evidence.plan_price, 500);
    assert.equal(d.actionType, "OPEN_PROMOTIONS");
  });

  it("акция уже идёт: критично", () => {
    const d = rulePromoLoss(fact([offer({ startAt: "2026-10-20T00:00:00.000Z" })]), NOW);
    assert.equal(d?.baseSeverity, "critical");
  });

  it("автоакция: рекомендация про кабинет WB, а не про страницу «Акции»", () => {
    const d = rulePromoLoss(fact([offer({ canManage: false, promoType: "auto" })]), NOW);
    assert.match(d?.recommendation ?? "", /кабинете WB/);
  });

  it("молчит: товар не в акции, акция закончилась, маржа плюсовая, нет цены входа", () => {
    assert.equal(rulePromoLoss(fact([offer({ inPromo: false })]), NOW), null);
    assert.equal(rulePromoLoss(fact([offer({ inPromo: null })]), NOW), null);
    assert.equal(rulePromoLoss(fact([offer({ endAt: "2026-10-20T00:00:00.000Z" })]), NOW), null);
    assert.equal(rulePromoLoss(fact([offer({ cohort: "boost", marginPromoRub: 60 })]), NOW), null);
    assert.equal(rulePromoLoss(fact([offer({ planPrice: null })]), NOW), null);
    assert.equal(rulePromoLoss(fact([]), NOW), null);
    assert.equal(rulePromoLoss({ ...fact([]), promoOffers: undefined }, NOW), null);
  });

  it("несколько акций: берётся самая убыточная, число акций в доказательствах", () => {
    const d = rulePromoLoss(fact([offer({ promoId: "1", marginPromoRub: -10 }), offer({ promoId: "2", promoName: "11.11", marginPromoRub: -70 })]), NOW);
    assert.equal(d?.evidence.promo_name, "11.11");
    assert.equal(d?.evidence.promo_count, 2);
  });
});

describe("задача «можно добавить в акцию»", () => {
  const free = (patch: Partial<PromoOfferFact> = {}) => offer({ inPromo: false, cohort: "boost", marginPromoRub: 80, marginPromoPercent: 16, ...patch });

  it("товар не в календарной акции, цена входа даёт плюс, есть остаток", () => {
    const d = rulePromoOpportunity(fact([free()]), NOW);
    assert.ok(d);
    assert.equal(d.type, "TASK_PROMO_OPPORTUNITY");
    assert.equal(d.baseSeverity, "opportunity");
    assert.doesNotMatch(d.recommendation, /вырастут|увеличит продажи/);
  });

  it("молчит: автоакция, участие неизвестно, нет остатка, мало запаса, акция далеко или закончилась, минус", () => {
    assert.equal(rulePromoOpportunity(fact([free({ canManage: false })]), NOW), null);
    assert.equal(rulePromoOpportunity(fact([free({ inPromo: null })]), NOW), null);
    assert.equal(rulePromoOpportunity(fact([free()], { stock: 0 }), NOW), null);
    assert.equal(rulePromoOpportunity(fact([free()], { coverDays: 3 }), NOW), null);
    assert.equal(rulePromoOpportunity(fact([free({ startAt: "2026-12-01T00:00:00.000Z" })]), NOW), null);
    assert.equal(rulePromoOpportunity(fact([free({ endAt: "2026-10-01T00:00:00.000Z" })]), NOW), null);
    assert.equal(rulePromoOpportunity(fact([free({ cohort: "loss", marginPromoRub: -5 })]), NOW), null);
    assert.equal(rulePromoOpportunity(fact([free({ cohort: "open", marginPromoRub: null })]), NOW), null);
  });

  it("из нескольких акций выбирается с лучшей маржой на штуке", () => {
    const d = rulePromoOpportunity(fact([free({ promoId: "1", marginPromoRub: 50 }), free({ promoId: "2", promoName: "11.11", marginPromoRub: 120 })]), NOW);
    assert.equal(d?.evidence.promo_name, "11.11");
  });
});
