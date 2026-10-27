import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAgentProposals, defaultRules, normalizeRules, validateRule, type AgentRule } from "./ads-agent-engine";
import type { BidRow } from "./ads-bids";
import type { AdsNmRow } from "./ads-metrics";
import type { SellerAdCampaignRow } from "./types";

const rules = (patch: Partial<Record<AgentRule["kind"], Partial<AgentRule>>>): AgentRule[] =>
  defaultRules().map((r) => ({ ...r, ...(patch[r.kind] ?? {}), enabled: patch[r.kind] ? (patch[r.kind]!.enabled ?? true) : false }));

const campaign = (patch: Partial<SellerAdCampaignRow> = {}): SellerAdCampaignRow => ({
  id: "10",
  name: "К1",
  status: 9,
  paymentType: "cpm",
  bidType: "manual",
  budget: 300,
  bids: [{ nmId: "111", searchRub: 300 } as never],
  ...patch,
});

const nmRow = (spend: number, orders: number, orderSum: number): AdsNmRow => ({ nmId: "111", name: "Ведро", views: 1000, clicks: 50, spend, orders, orderSum, summary: {} as never });
const product = { nmId: "111", title: "Ведро", marginRub: 200, marginPercent: 20, stock: 50, orders28: 30 };
const titles = new Map([["111", "Ведро"]]);

const base = { campaigns: [campaign()], adsByProduct: [], products: [product], advice: [], bids: [] as BidRow[], accountRub: 5000, depositedTodayRub: {}, titles };

describe("правила", () => {
  it("по умолчанию все выключены и в режиме «предлагать»", () => {
    for (const r of defaultRules()) {
      assert.equal(r.enabled, false);
      assert.equal(r.mode, "suggest");
    }
  });
  it("нормализация достраивает набор и отбрасывает неверные параметры", () => {
    const out = normalizeRules([{ kind: "drr_guard", enabled: true, mode: "auto", params: { stepPercent: 999, overPp: 3 } }]);
    assert.equal(out.length, 5);
    const drr = out.find((r) => r.kind === "drr_guard")!;
    assert.equal(drr.enabled, true);
    assert.equal(drr.mode, "auto");
    assert.equal(drr.params.stepPercent, 20); // 999 вне диапазона, вернули значение по умолчанию
    assert.equal(drr.params.overPp, 3);
  });
  it("проверка параметров", () => {
    assert.equal(validateRule({ kind: "autopay", mode: "suggest", params: { minBudgetRub: 500, topUpRub: 1000, dailyCapRub: 3000 } }), null);
    assert.match(validateRule({ kind: "autopay", mode: "suggest", params: { minBudgetRub: 500, topUpRub: 3000, dailyCapRub: 1000 } }) ?? "", /Суточный/);
    assert.match(validateRule({ kind: "autopay", mode: "suggest", params: { minBudgetRub: 50, topUpRub: 1000, dailyCapRub: 3000 } }) ?? "", /от 100/);
    assert.ok(validateRule({ kind: "nope", mode: "suggest", params: {} }));
    assert.ok(validateRule({ kind: "drr_guard", mode: "robot", params: { stepPercent: 20, overPp: 0 } }));
  });
});

describe("buildAgentProposals", () => {
  it("тестовая реклама: из советов-кандидатов получаем предложение создать кампанию", () => {
    const advice = [{ id: "cand-111", kind: "candidate", level: "opportunity", title: "Ведро: можно протестировать рекламу", facts: ["Заказов нет, есть остаток"], action: "", nmId: "111" }] as never;
    const out = buildAgentProposals({ ...base, rules: rules({ test_ads: {} }), advice });
    assert.equal(out.proposals.length, 1);
    assert.deepEqual(out.proposals[0]!.action, { type: "create_campaign", nmId: "111", name: "KARTO тест: Ведро" });
    assert.equal(buildAgentProposals({ ...base, rules: rules({}), advice }).proposals.length, 0);
  });

  it("выключенные правила ничего не предлагают", () => {
    assert.deepEqual(buildAgentProposals({ ...base, rules: rules({}) }).proposals, []);
  });

  it("автопополнение: низкий остаток → предложение пополнить; суточный лимит и счёт учитываются", () => {
    const r = rules({ autopay: { params: { minBudgetRub: 500, topUpRub: 1000, dailyCapRub: 1500 } } });
    const out = buildAgentProposals({ ...base, rules: r, depositedTodayRub: { "10": 800 } });
    assert.equal(out.proposals.length, 1);
    assert.deepEqual(out.proposals[0]!.action, { type: "deposit", campaignId: "10", sumRub: 700 });
    const empty = buildAgentProposals({ ...base, rules: r, accountRub: null });
    assert.equal(empty.proposals.length, 0);
    assert.match(empty.skipped[0]!.text, /счёте/);
  });

  it("ДРР выше маржи → предложение снизить ставку на шаг", () => {
    const r = rules({ drr_guard: { params: { stepPercent: 20, overPp: 0 } } });
    const out = buildAgentProposals({ ...base, rules: r, adsByProduct: [nmRow(300, 2, 1000)] }); // ДРР 30% при марже 20%
    assert.equal(out.proposals.length, 1);
    assert.deepEqual(out.proposals[0]!.action, { type: "bid", advertId: "10", nmId: "111", bidRub: 240, previousBidRub: 300 });
    const fine = buildAgentProposals({ ...base, rules: r, adsByProduct: [nmRow(100, 2, 1000)] }); // ДРР 10%
    assert.equal(fine.proposals.length, 0);
  });

  it("подъём ставки: запас по марже, достаточно заказов, ставка ниже конкурентной; шаг ограничен", () => {
    const r = rules({ bid_climb: { params: { minHeadroomPp: 5, minOrders: 3, maxStepPercent: 25 } } });
    const bids: BidRow[] = [{ advertId: "10", campaignName: "К1", nmId: "111", currentRub: 300, competitiveRub: 500, leadersRub: 600, verdict: "below_competitive", note: "" }];
    const out = buildAgentProposals({ ...base, rules: r, bids, adsByProduct: [nmRow(100, 4, 1000)] }); // ДРР 10%, запас 10 п.п.
    assert.equal(out.proposals.length, 1);
    assert.deepEqual(out.proposals[0]!.action, { type: "bid", advertId: "10", nmId: "111", bidRub: 375, previousBidRub: 300 }); // 300 × 1,25, а не 500
    const few = buildAgentProposals({ ...base, rules: r, bids, adsByProduct: [nmRow(100, 2, 500)] });
    assert.equal(few.proposals.length, 0); // заказов меньше порога
    const noHeadroom = buildAgentProposals({ ...base, rules: r, bids, adsByProduct: [nmRow(180, 4, 1000)] }); // ДРР 18%, запас 2 п.п.
    assert.equal(noHeadroom.proposals.length, 0);
  });

  it("не поднимает ставку там, где сработала защита ДРР, и не трогает кампании не CPM или не с ручной ставкой", () => {
    const r = rules({ drr_guard: {}, bid_climb: {} });
    const bids: BidRow[] = [{ advertId: "10", campaignName: "К1", nmId: "111", currentRub: 300, competitiveRub: 500, leadersRub: 600, verdict: "below_competitive", note: "" }];
    const out = buildAgentProposals({ ...base, rules: r, bids, adsByProduct: [nmRow(400, 4, 1000)] }); // ДРР 40% > маржи
    assert.deepEqual(out.proposals.map((p) => p.rule), ["drr_guard"]);
    const cpc = buildAgentProposals({ ...base, campaigns: [campaign({ paymentType: "cpc" })], rules: r, bids, adsByProduct: [nmRow(400, 4, 1000)] });
    assert.equal(cpc.proposals.length, 0);
    const unified = buildAgentProposals({ ...base, campaigns: [campaign({ bidType: "unified" })], rules: r, bids, adsByProduct: [nmRow(400, 4, 1000)] });
    assert.equal(unified.proposals.length, 0);
  });

  it("реклама без заказов: берёт готовые действия из советов", () => {
    const r = rules({ waste_guard: {} });
    const advice = [
      { id: "no-1", kind: "no_orders", level: "critical", title: "Реклама без заказов", facts: ["потрачено 1 000 ₽"], action: "", fix: { type: "pause", campaignId: "10", campaignName: "К1" } },
      { id: "cand-1", kind: "candidate", level: "opportunity", title: "кандидат", facts: [], action: "" },
    ] as never;
    const out = buildAgentProposals({ ...base, rules: r, advice });
    assert.equal(out.proposals.length, 1);
    assert.deepEqual(out.proposals[0]!.action, { type: "pause", campaignId: "10" });
  });
});
