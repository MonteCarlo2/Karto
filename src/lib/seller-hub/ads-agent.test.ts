import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateAutopay, validateAutopayParams } from "./ads-agent";
import type { SellerAdCampaignRow } from "./types";

const params = { minBudgetRub: 1000, topUpRub: 2000, dailyCapRub: 5000 };
const camp = (patch: Partial<SellerAdCampaignRow>): SellerAdCampaignRow => ({
  id: "1",
  name: "К1",
  status: 9,
  budget: 300,
  ...patch,
});

describe("validateAutopayParams", () => {
  it("корректные параметры", () => assert.equal(validateAutopayParams(params), null));

  it("отклоняет нецелые, нулевые, слишком большие и суточный лимит меньше одного пополнения", () => {
    assert.notEqual(validateAutopayParams({ ...params, topUpRub: 10.5 }), null);
    assert.notEqual(validateAutopayParams({ ...params, minBudgetRub: 0 }), null);
    assert.notEqual(validateAutopayParams({ ...params, topUpRub: 100_001, dailyCapRub: 200_000 }), null);
    assert.notEqual(validateAutopayParams({ ...params, dailyCapRub: 1000 }), null);
  });
});

describe("evaluateAutopay", () => {
  it("пополняет кампанию с остатком ниже порога на заданную сумму", () => {
    const { deposits } = evaluateAutopay({ params, campaigns: [camp({})], depositedTodayRub: {}, accountRub: 17_212 });
    assert.deepEqual(deposits.map((d) => [d.campaignId, d.sumRub]), [["1", 2000]]);
  });

  it("не трогает кампании с достаточным бюджетом, неактивные и без известного остатка", () => {
    const { deposits, skipped } = evaluateAutopay({
      params,
      campaigns: [camp({ budget: 5000 }), camp({ id: "2", status: 11 }), camp({ id: "3", budget: null })],
      depositedTodayRub: {},
      accountRub: 17_212,
    });
    assert.deepEqual(deposits, []);
    assert.deepEqual(skipped, []);
  });

  it("не превышает суточный лимит: пополняет остаток лимита, а при исчерпании пропускает", () => {
    const partial = evaluateAutopay({ params, campaigns: [camp({})], depositedTodayRub: { "1": 4000 }, accountRub: 17_212 });
    assert.equal(partial.deposits[0]!.sumRub, 1000);
    const done = evaluateAutopay({ params, campaigns: [camp({})], depositedTodayRub: { "1": 5000 }, accountRub: 17_212 });
    assert.deepEqual(done.deposits, []);
    assert.match(done.skipped[0]!.reason, /Суточный лимит/);
  });

  it("не тратит больше, чем есть на счёте, и делит счёт между кампаниями по порядку", () => {
    const { deposits } = evaluateAutopay({
      params,
      campaigns: [camp({ id: "1" }), camp({ id: "2" })],
      depositedTodayRub: {},
      accountRub: 2500,
    });
    assert.deepEqual(deposits.map((d) => d.sumRub), [2000, 500]);
  });

  it("счёт неизвестен или пуст — не пополняет, а объясняет почему", () => {
    const unknown = evaluateAutopay({ params, campaigns: [camp({})], depositedTodayRub: {}, accountRub: null });
    assert.deepEqual(unknown.deposits, []);
    assert.match(unknown.skipped[0]!.reason, /Неизвестен остаток/);
    const empty = evaluateAutopay({ params, campaigns: [camp({})], depositedTodayRub: {}, accountRub: 0 });
    assert.match(empty.skipped[0]!.reason, /нет денег/);
  });

  it("неверные параметры — ничего не делает", () => {
    const r = evaluateAutopay({ params: { ...params, topUpRub: -1 }, campaigns: [camp({})], depositedTodayRub: {}, accountRub: 9999 });
    assert.deepEqual(r, { deposits: [], skipped: [] });
  });
});
