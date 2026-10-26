import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPnl } from "./pnl";
import type { MoneyAnalytics, MoneyBreakdown } from "./money-analytics";

/** Цифры реального кабинета за 14 дней (экран «Деньги» 21 октября). */
const real = (over: Partial<MoneyBreakdown> = {}): MoneyAnalytics => {
  const current: MoneyBreakdown = {
    revenue: 136_119, wbHold: 42_618, pay: 93_501, logistics: 26_462, storage: 58, acceptance: 650, beforeCost: 66_330,
    penalties: 1_177, units: 61, cost: 30_406, costCoverage: 1, profit: 35_924, margin: 0.264, ...over,
  };
  return { current, past: null, period: { from: "2026-10-08", to: "2026-10-21", days: 14 }, products: [], truncated: false };
};
const line = (pnl: NonNullable<ReturnType<typeof buildPnl>>, id: string) => pnl.lines.find((l) => l.id === id)!;

describe("отчёт о прибылях и убытках", () => {
  it("строки сходятся: выручка = удержания WB + к перечислению; расходы вычитаются по порядку", () => {
    const p = buildPnl({ money: real(), adSpend: 4_000, tax: null })!;
    assert.equal(line(p, "revenue").amount! - line(p, "wbHold").amount!, line(p, "pay").amount);
    // 93 501 − 26 462 − 58 − 650 − 1 177 − 4 000 = 61 154
    assert.equal(line(p, "afterCosts").amount, 61_154);
    assert.equal(line(p, "afterCosts").label, "Остаётся после расходов WB и рекламы");
    // минус себестоимость 30 406 → 30 748
    assert.equal(p.net, 30_748);
    assert.equal(line(p, "net").label, "Чистая прибыль");
    assert.deepEqual(p.missing, []);
    assert.ok(Math.abs(p.netMargin! - 30_748 / 136_119) < 1e-9);
  });

  it("нет данных по рекламе: итог помечен «без рекламы», в missing названа реклама, а не молчаливый ноль", () => {
    const p = buildPnl({ money: real(), adSpend: null, adsNote: "WB отдаёт статистику рекламы не больше чем за 30 дней", tax: null })!;
    assert.equal(line(p, "ads").amount, null);
    assert.match(line(p, "ads").note, /30 дней/);
    assert.equal(line(p, "afterCosts").amount, 65_154);
    assert.equal(line(p, "afterCosts").label, "Остаётся после расходов WB (без рекламы)");
    assert.equal(line(p, "net").label, "Чистая прибыль (без рекламы)");
    assert.deepEqual(p.missing, ["реклама"]);
    assert.equal(p.net, 34_748);
  });

  it("себестоимость известна меньше чем по 95% выручки: чистая прибыль не считается, причина названа", () => {
    const p = buildPnl({ money: real({ costCoverage: 0.6 }), adSpend: 4_000, tax: null })!;
    assert.equal(p.net, null);
    assert.equal(line(p, "net").amount, null);
    assert.match(line(p, "cost").note, /60% выручки/);
    assert.ok(p.missing.includes("себестоимость"));
    const none = buildPnl({ money: real({ cost: null, costCoverage: 0, profit: null, margin: null }), adSpend: 4_000, tax: null })!;
    assert.equal(line(none, "cost").amount, null);
    assert.equal(none.net, null);
  });

  it("налог по ставке пользователя: от выручки, от суммы к перечислению, от прибыли до налога", () => {
    const rev = buildPnl({ money: real(), adSpend: 4_000, tax: { ratePercent: 6, base: "revenue" } })!;
    assert.equal(line(rev, "tax").amount, Math.round(136_119 * 0.06)); // 8 167
    assert.ok(Math.abs(rev.net! - (61_154 - 30_406 - 136_119 * 0.06)) < 1e-6);
    const pay = buildPnl({ money: real(), adSpend: 4_000, tax: { ratePercent: 6, base: "pay" } })!;
    assert.equal(line(pay, "tax").amount, Math.round(93_501 * 0.06));
    const profit = buildPnl({ money: real(), adSpend: 4_000, tax: { ratePercent: 15, base: "profit" } })!;
    assert.equal(line(profit, "tax").amount, Math.round(30_748 * 0.15));
    assert.ok(Math.abs(profit.net! - 30_748 * 0.85) < 1e-6);
  });

  it("налог от прибыли без себестоимости не считается; убыток налога не даёт; без ставки строки налога нет", () => {
    const noCost = buildPnl({ money: real({ costCoverage: 0.3 }), adSpend: 0, tax: { ratePercent: 15, base: "profit" } })!;
    assert.equal(line(noCost, "tax").amount, null);
    assert.ok(noCost.missing.includes("налог"));
    const loss = buildPnl({ money: real({ cost: 120_000 }), adSpend: 0, tax: { ratePercent: 15, base: "profit" } })!;
    assert.equal(line(loss, "tax").amount, 0);
    assert.ok(loss.net! < 0);
    assert.equal(buildPnl({ money: real(), adSpend: 0, tax: { ratePercent: 0, base: "revenue" } })!.lines.some((l) => l.id === "tax"), false);
    assert.equal(buildPnl({ money: null, adSpend: 0, tax: null }), null);
  });
});
