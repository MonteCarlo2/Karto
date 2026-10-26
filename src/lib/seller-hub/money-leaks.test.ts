import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMoneyLeaks } from "./money-leaks";
import type { StoreKpis } from "./analytics-core";
import type { LogisticsCostSummary } from "./logistics-cost";
import type { MoneyAnalytics, ProductMoney } from "./money-analytics";

const prod = (title: string, profit: number | null): ProductMoney => ({ nmId: title, title, units: 1, revenue: 1000, beforeCost: 500, logistics: 100, storage: 0, cost: 400, profit, margin: null, serviceShare: null });
const money = (products: ProductMoney[], penalties = 0): MoneyAnalytics =>
  ({ current: { penalties } as MoneyAnalytics["current"], past: null, period: { from: "", to: "", days: 28 }, products, truncated: false }) as MoneyAnalytics;
const kpis = (lostSum: number): StoreKpis => ({ lost: { orders: 4, sum: lostSum, buyouts: 0, buyoutsSum: 0, products: 2 } }) as StoreKpis;
const costs = (returnCost: number, overpay: number): LogisticsCostSummary =>
  ({ returnCost, overpay, products: [{ title: "Кашпо", returnCost: 300, overpay: 120 }, { title: "Ведро", returnCost: 100, overpay: 0 }] }) as unknown as LogisticsCostSummary;

describe("где теряются деньги", () => {
  it("собирает только суммы из отчётов, по убыванию, с источником и товарами", () => {
    const out = buildMoneyLeaks({ kpis: kpis(8500), money: money([prod("А", -300), prod("Б", -200), prod("В", 900)], 2000), costs: costs(400, 120), days: 28 });
    assert.deepEqual(out.map((x) => x.id), ["lost_orders", "penalties", "loss_products", "returns", "delivery_growth"]);
    assert.equal(out.find((x) => x.id === "loss_products")!.amount, 500);
    assert.equal(out.find((x) => x.id === "loss_products")!.detail, "А; Б");
    assert.match(out.find((x) => x.id === "returns")!.detail, /Кашпо; Ведро/);
    assert.match(out[0]!.source, /28 дн/);
  });

  it("нет отчёта — нет и строки; нулевые суммы и неизвестная прибыль не считаются потерей", () => {
    assert.deepEqual(buildMoneyLeaks({ kpis: null, money: null, costs: null, days: 7 }), []);
    assert.deepEqual(buildMoneyLeaks({ kpis: kpis(0), money: money([prod("А", null), prod("Б", 500)]), costs: costs(0, 0), days: 7 }), []);
  });
});
