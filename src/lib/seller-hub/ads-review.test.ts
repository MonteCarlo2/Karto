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
  it("товар, которого уже нет в кампании, не попадает в итоги и товары, а попадает в replaced", () => {
    const swapped = { ...campaign, bids: [{ nmId: "222", searchRub: 300 } as never] };
    const withOld = stats({ spend: 900, orders: 5, orderSum: 7000, byNm: { "111": { name: "Старый", views: 20000, clicks: 400, spend: 700, orders: 5, orderSum: 7000 }, "222": { name: "Новый", views: 500, clicks: 10, spend: 200, orders: 0, orderSum: 0 } } });
    const [f] = buildCampaignFacts({ campaigns: [swapped], stats: [withOld], products: [], bids: [], days: 7, storeCpo: 150 });
    assert.equal(f!.spend, 200, "расход считается только по нынешнему товару");
    assert.equal(f!.orders, 0);
    assert.deepEqual(f!.products.map((x) => x.nmId), ["222"]);
    assert.deepEqual(f!.replaced, ["Старый"]);
    assert.equal(f!.ruleVerdict, "no_data", "по новому товару данных мало");
  });
  it("новый товар без статистики всё равно виден в кампании", () => {
    const swapped = { ...campaign, bids: [{ nmId: "333", searchRub: 300 } as never] };
    const [f] = buildCampaignFacts({ campaigns: [swapped], stats: [stats()], products: [], bids: [], days: 7, storeCpo: null });
    assert.deepEqual(f!.products.map((x) => x.nmId), ["333"]);
    assert.equal(f!.spend, 0);
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
    assert.deepEqual(r[0]!.options.map((o) => o.kind), ["raise_bid", "deposit"]);
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
    assert.deepEqual(actionForOption({ kind: "raise_bid", nmId: "111", reason: "" }, f), { type: "bid", advertId: "10", nmId: "111", bidRub: 375, previousBidRub: 300 });
    assert.deepEqual(actionForOption({ kind: "lower_bid", nmId: "111", reason: "" }, f), { type: "bid", advertId: "10", nmId: "111", bidRub: 240, previousBidRub: 300 });
    assert.deepEqual(actionForOption({ kind: "pause", nmId: null, reason: "" }, f), { type: "pause", campaignId: "10" });
    assert.equal(actionForOption({ kind: "keep", nmId: null, reason: "" }, f), null);
    assert.equal(actionForOption({ kind: "remove_product", nmId: "111", reason: "" }, f), null); // единственный товар: пауза вместо удаления
  });
});

describe("разбор не противоречит правилам", () => {
  const facts = (patch: Partial<CampaignFacts> = {}, product: Partial<CampaignFacts["products"][number]> = {}): CampaignFacts => {
    const [f] = buildCampaignFacts({ campaigns: [campaign], stats: [stats()], products: [product0], bids: [], days: 7, storeCpo: 150 });
    return { ...f!, ...patch, products: f!.products.map((p) => ({ ...p, bidRub: 300, competitiveRub: 400, ...product })) };
  };
  const product0 = { nmId: "111", title: "Ведро", marginRub: 200, marginPercent: 25, stock: 50, orders28: 30 };
  const reply = (verdict: string, kinds: string[]) => JSON.stringify({ reviews: [{ id: "10", verdict, headline: "х", summary: "у", options: kinds.map((kind) => ({ kind, nmId: "111", reason: "р" })) }] });

  it("«ничего не менять» не соседствует с действиями", () => {
    const [r] = parseReviews(reply("improve", ["keep", "lower_bid"]), [facts()])!;
    assert.deepEqual(r!.options.map((o) => o.kind), ["lower_bid"]);
  });
  it("в хорошей кампании не советуют остановку и урезание", () => {
    const [r] = parseReviews(reply("good", ["pause", "lower_bid", "keep"]), [facts()])!;
    assert.deepEqual(r!.options.map((o) => o.kind), ["keep"]);
  });
  it("ставку поднимать можно только при запасе по марже", () => {
    const [ok] = parseReviews(reply("improve", ["raise_bid"]), [facts({}, { drr: 10, marginPercent: 25 })])!;
    assert.equal(ok!.options.length, 1);
    const [no] = parseReviews(reply("improve", ["raise_bid"]), [facts({}, { drr: 24, marginPercent: 25 })])!;
    assert.equal(no!.options.some((o) => o.kind === "raise_bid"), false);
  });
  it("в убыточную кампанию не советуют пополнять бюджет", () => {
    const [r] = parseReviews(reply("bad", ["deposit", "pause"]), [facts({ ruleVerdict: "bad" })])!;
    assert.deepEqual(r!.options.map((o) => o.kind), ["pause"]);
    assert.equal(actionForOption({ kind: "deposit", nmId: null, reason: "" }, facts({ ruleVerdict: "bad" })), null);
  });
  it("кампания за клик создаётся только для кампании за показы и товара из неё", () => {
    const act = actionForOption({ kind: "new_campaign_cpc", nmId: "111", reason: "" }, facts());
    assert.equal(act?.type, "create_campaign");
    assert.equal(actionForOption({ kind: "new_campaign_cpc", nmId: "111", reason: "" }, facts({ paymentType: "cpc" })), null);
  });
});
