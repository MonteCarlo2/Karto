import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMonitoring, type MonitorFact } from "./monitoring";
import type { ProductRow } from "./analytics-core";
import type { LogisticsCostSummary } from "./logistics-cost";
import type { StockRow } from "./stock-analytics";

const row = (nmId: string, o: Partial<ProductRow> = {}): ProductRow => ({
  nmId, title: `Товар ${nmId}`, vendorCode: "", brand: "", category: "", opens: 0, carts: 0, orders: 0, orderSum: 0, prevOrders: null, prevOrderSum: null, prevOpens: null, prevCarts: null, buyouts: 0, cancels: 0, prevBuyouts: null, prevCancels: null, sumChange: null, sumDelta: null,
  share: 0, abc: "none", buyoutRate: null, cartRate: null, orderRate: null, rating: null, stock: null, saleRateDays: null, lostOrders: 0, lostSum: 0, missingDays: null, leak: null, marginRub: null, marginPercent: null, ...o,
});
const fact = (nmId: string, marginPercent: number | null, priorMarginPercent: number | null, contentGrade: MonitorFact["contentGrade"] = "A"): MonitorFact => ({ nmId, marginPercent, priorMarginPercent, contentGrade });
const stockRow = (nmId: string, status: StockRow["status"], saleRateDays: number | null = null): StockRow => ({ nmId, title: `Товар ${nmId}`, status, stock: 1, saleRateDays, noSales: false, turnoverDays: null, orders: 0, lostOrders: 0, lostSum: 0, lostBuyouts: 0, lostBuyoutsSum: 0, missingDays: null, availability: null, stockValue: null });

describe("мониторинг по направлениям", () => {
  const costs = { products: [{ nmId: "1", title: "Товар 1", highReturn: true, overpay: 0, returnRate: 0.5, changePercent: null }, { nmId: "2", title: "Товар 2", highReturn: false, overpay: 300, returnRate: 0.1, changePercent: 25 }, { nmId: "3", title: "Товар 3", highReturn: false, overpay: 0, returnRate: 0, changePercent: 0 }] } as unknown as LogisticsCostSummary;

  it("считает затронутые товары по каждому направлению и называет примеры", () => {
    const rows = [row("1", { rating: 4.2, orderSum: 100, leak: "cart", opens: 500 }), row("2", { rating: 4.9 }), row("3", { rating: 3.9, orderSum: 50 })];
    const facts = [fact("1", -5, 10, "C"), fact("2", 12, 20, "A"), fact("3", 20, 22, "D")];
    const m = Object.fromEntries(buildMonitoring({ rows, facts, costs, stock: [stockRow("1", "out"), stockRow("2", "low", 9), stockRow("3", "ok")] }).map((d) => [d.id, d]));
    assert.equal(m.finance!.count, 2); // товар 1 убыточен, товар 2 просел на 8 п. п.
    assert.equal(m.finance!.severity, "bad");
    assert.equal(m.logistics!.count, 2);
    assert.equal(m.rating!.count, 2);
    assert.equal(m.rating!.items[0]!.nmId, "1"); // по сумме заказов
    assert.equal(m.content!.count, 2);
    assert.equal(m.funnel!.count, 1);
    assert.equal(m.stock!.count, 2);
    assert.equal(m.stock!.severity, "bad");
    assert.match(m.stock!.items[1]!.note, /9 дн/);
  });

  it("нет данных по направлению — count null и severity unknown, не ноль", () => {
    const m = Object.fromEntries(buildMonitoring({ rows: [row("1")], facts: [], costs: null, stock: null }).map((d) => [d.id, d]));
    for (const id of ["finance", "logistics", "rating", "content", "stock"] as const) {
      assert.equal(m[id]!.count, null, id);
      assert.equal(m[id]!.severity, "unknown", id);
    }
    assert.equal(m.funnel!.count, 0);
    assert.equal(m.funnel!.severity, "ok");
  });
});
