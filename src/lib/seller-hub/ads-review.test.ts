import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { actionForOption, buildCampaignFacts, parseReviews, ruleVerdictOf, type CampaignFacts } from "./ads-review";
import type { SellerAdCampaignRow, SellerAdCampaignStats } from "./types";

const campaign: SellerAdCampaignRow = { id: "10", name: "К1", status: 9, paymentType: "cpm", bidType: "manual", budget: 600, bids: [{ nmId: "111", searchRub: 300 } as never] };
const stats = (patch: Partial<SellerAdCampaignStats> = {}): SellerAdCampaignStats =>
  ({ advertId: "10", spend: 700, orders: 5, orderSum: 7000, views: 20000, clicks: 400, addToCart: 0, days: [], byNm: { "111": { name: "Ведро", views: 20000, clicks: 400, spend: 700, orders: 5, orderSum: 7000 } }, ...patch }) as SellerAdCampaignStats;
const product = { nmId: "111", title: "Ведро", marginRub: 200, marginPercent: 25, stock: 50, orders28: 30 };

describe("buildCampaignFacts", () => {
  it("считает ДРР, CTR, CPO, запас бюджета и сортирует товары по расходу", () => {
    const [f] = buildCampaignFacts({ campaigns: [campaign], stats: [stats()], products: [product], bids: [], days: 7, storeCpo: 150 });
    assert.equal(f!.drr, 10);
    assert.equal(f!.ctr, 2);
    assert.equal(f!.cpo, 140);
    assert.equal(f!.avgDailySpend, 100);
    assert.equal(f!.runwayDays, 6);
    assert.equal(f!.products[0]!.marginPercent, 25);
    assert.equal(f!.products[0]!.bidRub, 300);
  });
  it("завершённые и неактивные без статистики пропускаются", () => {
    assert.equal(buildCampaignFacts({ campaigns: [{ ...campaign, status: 7 }], stats: [stats()], products: [], bids: [], days: 7, storeCpo: null }).length, 0);
  });
});

describe("ruleVerdictOf", () => {
  const base = { clicks: 400, spend: 700, orders: 5, drr: 10, storeCpo: 150, products: [{ marginPercent: 25 }] as never };
  it("малые данные, убыток и хорошая работа", () => {
    assert.equal(ruleVerdictOf({ ...base, clicks: 10 }), "no_data");
    assert.equal(ruleVerdictOf({ ...base, orders: 0, drr: null }), "bad");
    assert.equal(ruleVerdictOf({ ...base, drr: 30 }), "bad");
    assert.equal(ruleVerdictOf({ ...base, drr: 10 }), "good");
    assert.equal(ruleVerdictOf({ ...base, drr: 20 }), "neutral");
  });
});

describe("parseReviews и actionForOption", () => {
  const [facts] = buildCampaignFacts({ campaigns: [campaign], stats: [stats()], products: [product], bids: [{ advertId: "10", campaignName: "К1", nmId: "111", currentRub: 300, competitiveRub: 500, leadersRub: 600, verdict: "below_competitive", note: "" }], days: 7, storeCpo: 150 });
  const f = facts as CampaignFacts;

  it("оставляет только известные варианты с товаром из кампании, максимум три", () => {
    const text = JSON.stringify({ reviews: [{ id: "10", verdict: "improve", headline: "ок", summary: "s", options: [
      { kind: "raise_bid", nmId: "111", reason: "r" },
      { kind: "lower_bid", nmId: "999", reason: "чужой товар" },
      { kind: "buy_stuff", nmId: null, reason: "выдумка" },
      { kind: "deposit", nmId: null, reason: "r" },
      { kind: "keep", nmId: null, reason: "r" },
      { kind: "pause", nmId: null, reason: "четвёртый" },
    ] }] });
    const r = parseReviews(text, [f])!;
    assert.deepEqual(r[0]!.options.map((o) => o.kind), ["raise_bid", "deposit", "keep"]);
  });
  it("подъём ставки отбрасывается, если ставка уже не ниже конкурентной; удаление единственного товара отбрасывается", () => {
    const high = { ...f, products: [{ ...f.products[0]!, bidRub: 600, competitiveRub: 500 }] };
    const text = JSON.stringify({ reviews: [{ id: "10", verdict: "improve", headline: "", summary: "", options: [{ kind: "raise_bid", nmId: "111", reason: "r" }, { kind: "remove_product", nmId: "111", reason: "r" }, { kind: "lower_bid", nmId: "111", reason: "r" }] }] });
    assert.deepEqual(parseReviews(text, [high])![0]!.options.map((o) => o.kind), ["lower_bid"]);
  });
  it("кампания без ответа получает «нет разбора», мусор отклоняется", () => {
    assert.equal(parseReviews('{"reviews":[]}', [f])![0]!.verdict, "no_data");
    assert.equal(parseReviews("не json", [f]), null);
  });
  it("числа в действиях считает программа: подъём ставки не выше конкурентной и шага, снижение на 20%", () => {
    assert.deepEqual(actionForOption({ kind: "raise_bid", nmId: "111", reason: "" }, f), { type: "bid", advertId: "10", nmId: "111", bidRub: 375 });
    assert.deepEqual(actionForOption({ kind: "lower_bid", nmId: "111", reason: "" }, f), { type: "bid", advertId: "10", nmId: "111", bidRub: 240 });
    assert.deepEqual(actionForOption({ kind: "pause", nmId: null, reason: "" }, f), { type: "pause", campaignId: "10" });
    assert.equal(actionForOption({ kind: "keep", nmId: null, reason: "" }, f), null);
    assert.equal(actionForOption({ kind: "remove_product", nmId: "111", reason: "" }, f), null); // единственный товар: пауза вместо удаления
  });
});
