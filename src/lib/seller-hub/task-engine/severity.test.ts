import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_TASK_THRESHOLDS } from "./config";
import {
  buildStoreMoneyContext,
  severityFromMoney,
  whyImportantLine,
} from "./severity";
import {
  availableStock,
  dailyDemand,
  excessUnits,
  netBurnPerDay,
  reorderQty,
  safetyStock,
} from "./stock-math";
import {
  ruleExcessStock,
  ruleLowStock,
  ruleStagnantCapital,
  ruleStockOut,
} from "./rules";
import { EMPTY_STOCKS_REPORT_FIELDS } from "./types";
import type { TaskBaseline, TaskFact } from "./types";

const t = DEFAULT_TASK_THRESHOLDS;

function fact(patch: Partial<TaskFact> = {}): TaskFact {
  return {
    nmId: "1",
    itemId: "i",
    title: "Товар",
    vendorCode: "A",
    stock: 50,
    price: 1000,
    promoPrice: 800,
    cost: 300,
    salesQty: 20,
    salesKnown: true,
    priorSalesQty: 20,
    recentSalesQty: 5,
    coverDays: 20,
    paceWindow: "span",
    dailyPace: 2,
    sittingRub: 0,
    marginPercent: 20,
    marginRub: 100,
    marginSource: "sku",
    contentScore: 80,
    contentGap: null,
    photoCount: 7,
    createdAt: "2020-01-01T00:00:00.000Z",
    paceSource: "orders",
    funnelStatus: "ok",
    orders: 56,
    priorOrders: 56,
    ordersPerDay: 2,
    priorOrdersPerDay: 2,
    openCount: null,
    priorOpenCount: null,
    cartCount: null,
    priorCartCount: null,
    addToCartPercent: null,
    priorAddToCartPercent: null,
    cartToOrderPercent: null,
    priorCartToOrderPercent: null,
    avgOrderPrice: 500,
    orderSum: 28_000,
    priorOrderSum: 28_000,
    funnelDateFrom: null,
    funnelDateTo: null,
    funnelPastDateFrom: null,
    funnelPastDateTo: null,
    ...EMPTY_STOCKS_REPORT_FIELDS,
    buyoutPercentFunnelPast: 0.5,
    ...patch,
  };
}

function baseline(patch: Partial<TaskBaseline> = {}): TaskBaseline {
  return {
    stock: 10,
    promoPrice: 800,
    marginPercent: 20,
    salesQty: 20,
    priorSalesQty: 20,
    coverDays: 20,
    ...patch,
  };
}

const store = {
  turnoverRub: 1_000_000 as number | null,
  grossProfitRub: null as number | null,
  useGrossProfit: false,
};

describe("severityFromMoney", () => {
  it("maps turnover shares to levels", () => {
    assert.equal(
      severityFromMoney({ moneyAtRiskRub: 60_000, store, thresholds: t }).severity,
      "critical",
    );
    assert.equal(
      severityFromMoney({ moneyAtRiskRub: 20_000, store, thresholds: t }).severity,
      "important",
    );
    assert.equal(
      severityFromMoney({ moneyAtRiskRub: 5_000, store, thresholds: t }).severity,
      "opportunity",
    );
    assert.equal(
      severityFromMoney({ moneyAtRiskRub: null, store, thresholds: t }).severity,
      "opportunity",
    );
    assert.equal(
      severityFromMoney({
        moneyAtRiskRub: 50_000,
        store: { turnoverRub: null, grossProfitRub: null, useGrossProfit: false },
        thresholds: t,
      }).basis,
      "деньги неизвестны",
    );
    const zeroKnown = severityFromMoney({
      moneyAtRiskRub: 0,
      store,
      thresholds: t,
    });
    assert.equal(zeroKnown.severity, "opportunity");
    assert.equal(zeroKnown.basis, "хранение 0 ₽");
    assert.equal(zeroKnown.moneyAtRiskRub, 0);
  });

  it("uses gross profit branch when coverage allows", () => {
    const decision = severityFromMoney({
      moneyAtRiskRub: 25_000,
      store: { turnoverRub: 100_000, grossProfitRub: 100_000, useGrossProfit: true },
      thresholds: t,
    });
    assert.equal(decision.severity, "critical");
    assert.equal(decision.basis, "доля валовой прибыли");
    assert.equal(
      severityFromMoney({
        moneyAtRiskRub: 10_000,
        store: { turnoverRub: 100_000, grossProfitRub: 100_000, useGrossProfit: true },
        thresholds: t,
      }).severity,
      "important",
    );
  });

  it("urgency overrides share", () => {
    const decision = severityFromMoney({
      moneyAtRiskRub: 100,
      store,
      thresholds: t,
      urgencyCritical: true,
    });
    assert.equal(decision.severity, "critical");
    assert.equal(decision.basis, "срочность");
  });

  it("buildStoreMoneyContext prefers funnel turnover", () => {
    const ctx = buildStoreMoneyContext(
      [
        { orderSum: 80_000, retailSum: 10_000, cost: 100, marginRub: 50, salesQty: 10 },
        { orderSum: 20_000, retailSum: 5_000, cost: null, marginRub: null, salesQty: 0 },
      ],
      t,
    );
    assert.equal(ctx.turnoverRub, 100_000);
    assert.equal(ctx.useGrossProfit, true);
  });
});

describe("stock-math", () => {
  it("daily demand with days in stock, without, and past window after OOS", () => {
    assert.equal(
      dailyDemand({
        orders28: 56,
        daysInStock: 14,
        ordersInStockDays: 42,
        hadStockOutInWindow: false,
        pastOrdersPerDay: 1,
      }).demandPerDay,
      3,
    );
    assert.equal(
      dailyDemand({
        orders28: 56,
        daysInStock: null,
        ordersInStockDays: null,
        hadStockOutInWindow: false,
        pastOrdersPerDay: null,
      }).basis,
      "заказы / 28 без обнуления",
    );
    assert.equal(
      dailyDemand({
        orders28: 10,
        daysInStock: null,
        ordersInStockDays: null,
        hadStockOutInWindow: true,
        pastOrdersPerDay: 2.5,
      }).demandPerDay,
      2.5,
    );
  });

  it("available stock with and without path / buyout", () => {
    const full = availableStock({
      stock: 100,
      fromClientCount: 10,
      toClientCount: 20,
      buyoutPercent: 0.5,
    });
    assert.equal(full.available, 120);
    assert.equal(full.cautious, false);
    const cautious = availableStock({
      stock: 100,
      fromClientCount: null,
      toClientCount: null,
      buyoutPercent: 0.5,
    });
    assert.equal(cautious.available, 100);
    assert.equal(cautious.cautious, true);
    assert.equal(
      availableStock({
        stock: 100,
        fromClientCount: 5,
        toClientCount: 10,
        buyoutPercent: null,
      }).available,
      100,
    );
  });

  it("LOW_STOCK uses path fields when buyout known", () => {
    const storeCtx = { turnoverRub: 1_000_000, grossProfitRub: null, useGrossProfit: false };
    const draft = ruleLowStock(
      fact({
        stock: 40,
        stockCountReport: 40,
        fromClientCount: 10,
        toClientCount: 20,
        buyoutPercentFunnelPast: 0.5,
        orders: 112,
        avgOrderPrice: 500,
      }),
      t,
      storeCtx,
    );
    // available = 40 + 10 + 20*0.5 = 60; demand 4; cover 15 ≥ 14 → not critical by L
    // reorder point = 4*(14+7)+12.35 = 96.35; 60 < 96 → important
    assert.equal(draft?.severityFloor, "important");
    assert.equal(draft?.evidence.available_stock, 60);
    assert.equal(draft?.evidence.stock_cautious, false);
  });

  it("LOW_STOCK reference numbers", () => {
    const demand = 4;
    const L = 14;
    const z = 1.65;
    const safety = safetyStock(demand, L, z);
    assert.ok(Math.abs(safety - 12.35) < 0.02);
    const storeCtx = { turnoverRub: 1_000_000, grossProfitRub: null, useGrossProfit: false };
    const critical = ruleLowStock(
      fact({ stock: 50, orders: 112, buyoutPercentFunnelPast: 1, avgOrderPrice: 500 }),
      t,
      storeCtx,
    );
    assert.equal(critical?.severityFloor, "critical");
    assert.equal(critical?.evidence.replenish_units, 131);
    const important = ruleLowStock(
      fact({ stock: 80, orders: 112, buyoutPercentFunnelPast: 1, avgOrderPrice: 500 }),
      t,
      storeCtx,
    );
    assert.equal(important?.severityFloor, "important");
    assert.equal(
      ruleLowStock(
        fact({ stock: 120, orders: 112, buyoutPercentFunnelPast: 1 }),
        t,
        storeCtx,
      ),
      null,
    );
    assert.equal(
      reorderQty({
        demandPerDay: 4,
        leadTimeDays: 14,
        supplyCoverDays: 28,
        safety,
        available: 50,
      }),
      131,
    );
  });

  it("excess reference and stagnant no longer created", () => {
    const burn = netBurnPerDay(2, 0.5);
    assert.equal(burn, 1);
    assert.equal(excessUnits({ available: 200, netBurnPerDay: 1, excessCoverDays: 90 }), 110);
    const draft = ruleExcessStock(
      fact({
        stock: 200,
        orders: 56,
        buyoutPercentFunnelPast: 0.5,
        cost: 300,
        storagePerUnitDay: 0.5,
        storageSource: "paid_storage",
      }),
      t,
      store,
    );
    assert.equal(draft?.type, "TASK_EXCESS_STOCK");
    assert.equal(draft?.evidence.excess_units, 110);
    /** 110 × 0.5 × 28 = 1540 → <1% от 1М → opportunity; дни 200 < 365 — без illiquid raise */
    assert.equal(draft?.evidence.money_at_risk_rub, 1_540);
    assert.equal(draft?.severityFloor, "opportunity");
    assert.equal(ruleStagnantCapital(fact({ sittingRub: 50_000 }), t), null);
  });

  it("STOCK_OUT critical with demand, opportunity without, WB figures primary", () => {
    const withSales = ruleStockOut(
      fact({ stock: 0, priorOrdersPerDay: 2, avgOrderPrice: 500 }),
      baseline({ stock: 5 }),
      t,
      store,
      "2026-10-08T12:00:00.000Z",
    );
    assert.equal(withSales?.severityFloor, "critical");
    const noSales = ruleStockOut(
      fact({
        stock: 0,
        priorOrdersPerDay: null,
        orders: 0,
        ordersPerDay: 0,
        avgOrderPrice: 500,
      }),
      baseline({ stock: 5, coverDays: null }),
      t,
      store,
      "2026-10-08T12:00:00.000Z",
    );
    assert.equal(noSales?.severityFloor, "opportunity");
    assert.match(noSales?.description ?? "", /не было/);
    const wb = ruleStockOut(
      fact({
        stock: 0,
        priorOrdersPerDay: 2,
        avgOrderPrice: 500,
        lostOrdersCount: 12,
        lostOrdersSum: 9_000,
        officeMissingTime: 48,
      }),
      baseline({ stock: 5, stockOutAt: "2026-10-01T12:00:00.000Z" }),
      t,
      store,
      "2026-10-08T12:00:00.000Z",
    );
    assert.equal(wb?.evidence.wb_figures_primary, true);
    assert.equal(wb?.evidence.money_at_risk_rub, 9_000);
    assert.ok(typeof wb?.evidence.missed_orders_rub_est === "number");
  });
});

describe("whyImportantLine", () => {
  it("formats money and share", () => {
    const line = whyImportantLine(
      severityFromMoney({ moneyAtRiskRub: 12_300, store, thresholds: t }),
    );
    assert.match(line ?? "", /12.?300/);
    assert.match(line ?? "", /оборот/);
  });
});
