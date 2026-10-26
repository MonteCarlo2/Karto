import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_TASK_SETTINGS, DEFAULT_TASK_THRESHOLDS } from "./config";
import {
  finalizeNoSalesDiagnosis,
  noSalesStageTests,
  runNoSalesBh,
  shopConversionExcluding,
} from "./no-sales-diag";
import { ruleContent, ruleExcessStock } from "./rules";
import { poissonCdfLower, poissonZeroP } from "./stats";
import {
  availableStock,
  buildShopBuyoutContext,
  coverDaysFromBurn,
  dailyDemand,
  excessUnits,
  resolveNetBurnPerDay,
  resolveStorageMoneyAtRisk,
  smoothProductBuyout,
} from "./stock-math";
import { EMPTY_STOCKS_REPORT_FIELDS } from "./types";
import type { TaskFact } from "./types";

const t = DEFAULT_TASK_THRESHOLDS;
const TURNOVER = 308_345;
const B_SHOP = 0.795;
const store = {
  turnoverRub: TURNOVER as number | null,
  grossProfitRub: null as number | null,
  useGrossProfit: false,
};
const shop = buildShopBuyoutContext({
  products: [{ pastOrders: 200, pastBuyouts: 159 }],
});

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
    salesQty: 0,
    salesKnown: true,
    priorSalesQty: 0,
    recentSalesQty: 0,
    coverDays: 20,
    paceWindow: "span",
    dailyPace: 0,
    sittingRub: 0,
    marginPercent: null,
    marginRub: null,
    marginSource: null,
    contentScore: 80,
    contentGap: null,
    photoCount: 7,
    createdAt: "2020-01-01T00:00:00.000Z",
    paceSource: "orders",
    funnelStatus: "ok",
    orders: 0,
    priorOrders: 0,
    ordersPerDay: 0,
    priorOrdersPerDay: 0,
    openCount: null,
    priorOpenCount: null,
    cartCount: null,
    priorCartCount: null,
    addToCartPercent: null,
    priorAddToCartPercent: null,
    cartToOrderPercent: null,
    priorCartToOrderPercent: null,
    avgOrderPrice: 500,
    orderSum: 0,
    priorOrderSum: 0,
    funnelDateFrom: null,
    funnelDateTo: null,
    funnelPastDateFrom: null,
    funnelPastDateTo: null,
    ...EMPTY_STOCKS_REPORT_FIELDS,
    ...patch,
  };
}

describe("Package C step 1: smoothed buyout", () => {
  it("etalons with b_shop = 0.795", () => {
    assert.ok(Math.abs((shop.bShop ?? 0) - B_SHOP) < 1e-9);
    assert.equal(smoothProductBuyout({ pastOrders: 0, pastBuyouts: 0, bShop: B_SHOP }).percent, B_SHOP);
    assert.equal(
      Math.round(
        (smoothProductBuyout({ pastOrders: 1, pastBuyouts: 1, bShop: B_SHOP }).percent ?? 0) * 1e5,
      ) / 1e5,
      0.80476,
    );
    assert.equal(
      Math.round(
        (smoothProductBuyout({ pastOrders: 16, pastBuyouts: 13, bShop: B_SHOP }).percent ?? 0) * 1e5,
      ) / 1e5,
      0.80278,
    );
    assert.equal(
      Math.round(
        (smoothProductBuyout({ pastOrders: 100, pastBuyouts: 50, bShop: B_SHOP }).percent ?? 0) * 1e5,
      ) / 1e5,
      0.54917,
    );
    assert.equal(
      smoothProductBuyout({ pastOrders: 5, pastBuyouts: 0, bShop: null }).percent,
      null,
    );
    assert.equal(
      smoothProductBuyout({ pastOrders: 5, pastBuyouts: 0, bShop: null }).source,
      null,
    );
  });
});

describe("Package C step 2: orders_56d demand", () => {
  it("current 0 past >0 without OOS → orders_56d", () => {
    const d = dailyDemand({
      orders28: 0,
      priorOrders28: 1,
      daysInStock: null,
      ordersInStockDays: null,
      hadStockOutInWindow: false,
      pastOrdersPerDay: null,
    });
    assert.equal(d.basis, "orders_56d");
    assert.equal(d.demandPerDay, 1 / 56);
  });
});

describe("Package C cabinet excess etalons", () => {
  it("999468906", () => {
    const b = smoothProductBuyout({ pastOrders: 0, pastBuyouts: 0, bShop: B_SHOP }).percent!;
    assert.equal(b, B_SHOP);
    const demand = dailyDemand({
      orders28: 7,
      priorOrders28: 0,
      daysInStock: null,
      ordersInStockDays: null,
      hadStockOutInWindow: false,
      pastOrdersPerDay: null,
    });
    assert.equal(demand.demandPerDay, 0.25);
    const burn = resolveNetBurnPerDay({
      demandPerDay: demand.demandPerDay,
      buyoutPercent: b,
      realizationBuyoutsPerDay: null,
    }).burn!;
    assert.equal(burn, 0.19875);
    const avail = availableStock({
      stock: 93,
      fromClientCount: 3,
      toClientCount: 0,
      buyoutPercent: b,
    }).available;
    assert.equal(avail, 96);
    const days = coverDaysFromBurn(avail, burn)!;
    assert.ok(Math.abs(days - 483) < 0.1);
    const excess = excessUnits({ available: avail, netBurnPerDay: burn, excessCoverDays: 90 });
    assert.ok(Math.abs(excess - 78.1125) < 0.01);
    const draft = ruleExcessStock(
      fact({
        nmId: "999468906",
        stock: 93,
        fromClientCount: 3,
        toClientCount: 0,
        orders: 7,
        priorOrders: 0,
        pastOrderCount: 0,
        pastBuyoutCount: 0,
        cost: null,
        price: 3745,
        promoPrice: 3745,
        storagePerUnitDay: null,
      }),
      t,
      store,
      false,
      shop,
    );
    assert.equal(draft?.severityFloor, "important");
    assert.equal(draft?.evidence.upper_bound_note, true);
  });

  it("999504776", () => {
    const b = B_SHOP;
    const demand = 1 / 28;
    const burn = demand * b;
    const avail = availableStock({
      stock: 99,
      fromClientCount: 0,
      toClientCount: 1,
      buyoutPercent: b,
    }).available;
    assert.ok(Math.abs(avail - 99.205) < 0.001);
    const excess = excessUnits({ available: avail, netBurnPerDay: burn, excessCoverDays: 90 });
    assert.ok(Math.abs(excess - 96.6496) < 0.01);
    const draft = ruleExcessStock(
      fact({
        nmId: "999504776",
        stock: 99,
        fromClientCount: 0,
        toClientCount: 1,
        orders: 1,
        priorOrders: 0,
        pastOrderCount: 0,
        pastBuyoutCount: 0,
        cost: null,
        price: 1483,
        promoPrice: 1483,
        storagePerUnitDay: null,
      }),
      t,
      store,
      false,
      shop,
    );
    assert.equal(draft?.severityFloor, "important");
    assert.ok((draft?.evidence.cover_days_burn as number) > 3000);
  });

  it("999549867 orders_56d + cost frozen", () => {
    const draft = ruleExcessStock(
      fact({
        nmId: "999549867",
        stock: 99,
        fromClientCount: 0,
        toClientCount: 0,
        orders: 0,
        priorOrders: 1,
        pastOrderCount: 1,
        pastBuyoutCount: 1,
        cost: 68,
        storagePerUnitDay: null,
      }),
      t,
      store,
      false,
      shop,
    );
    assert.equal(draft?.evidence.demand_basis, "orders_56d");
    assert.equal(draft?.severityFloor, "important");
    assert.equal(draft?.evidence.frozen_basis, "cost");
    assert.ok((draft?.evidence.frozen_rub as number) >= 3_083);
  });

  it("999468991 storage Important 1.01%", () => {
    const draft = ruleExcessStock(
      fact({
        nmId: "999468991",
        stock: 99,
        orders: 1,
        priorOrders: 5,
        pastOrderCount: 5,
        pastBuyoutCount: 5,
        cost: 200,
        storagePerUnitDay: 1.154538,
        storageSource: "paid_storage",
        stockFbo: 99,
        stockFbs: 0,
      }),
      t,
      store,
      false,
      shop,
    );
    assert.equal(draft?.severityFloor, "important");
    const money = draft?.evidence.storage_money_28d as number;
    assert.ok(Math.abs(money - 3114) < 2);
  });
});

describe("Package C step 3: storage FBS → 0", () => {
  it("entirely seller warehouse → 0 rub not null", () => {
    const r = resolveStorageMoneyAtRisk({
      excessOrStockUnits: 80,
      storagePerUnitDay: null,
      stockFbo: 0,
      stockFbs: 100,
    });
    assert.equal(r.moneyAtRiskRub, 0);
    assert.equal(r.basis, "seller_warehouse");
    assert.match(r.note ?? "", /вашем складе/);
  });

  it("partial WB uses share", () => {
    const r = resolveStorageMoneyAtRisk({
      excessOrStockUnits: 100,
      storagePerUnitDay: 1,
      stockFbo: 50,
      stockFbs: 50,
    });
    assert.equal(r.moneyAtRiskRub, 50 * 1 * 28);
    assert.equal(r.basis, "partial_wb");
  });
});

describe("Package C step 4: no-sales poisson + BH", () => {
  it("synthetic shop conversions", () => {
    const cA = 1300 / 9000;
    const cB = 220 / 1300;
    assert.ok(Math.abs(cA - 0.144444) < 1e-5);
    assert.ok(Math.abs(cB - 0.169231) < 1e-5);

    const t1 = noSalesStageTests({ opens: 100, carts: 2, cA, cB });
    const cart = t1.find((s) => s.stage === "open_to_cart")!;
    assert.ok(Math.abs(cart.expected - 14.444) < 0.01);
    assert.ok(cart.pValue < 1e-4);

    const t2 = noSalesStageTests({ opens: 40, carts: 30, cA, cB });
    const order = t2.find((s) => s.stage === "cart_to_order")!;
    assert.ok(Math.abs(order.expected - 5.077) < 0.01);
    assert.ok(Math.abs(order.pValue - Math.exp(-5.077)) < 1e-5);

    const t3 = noSalesStageTests({ opens: 10, carts: 1, cA, cB });
    assert.equal(t3.find((s) => s.stage === "open_to_cart")!.tested, false);
    const M = Math.ceil(3 / (cA * cB));
    assert.equal(M, 123);
  });

  it("cabinet 999468995 is no_carts after BH; 999549866 low_traffic", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = "c:/Users/Rabotyaga/Downloads/karto-diagnostics.json";
    if (!fs.existsSync(path)) {
      assert.ok(true, "skip: diagnostics file missing");
      return;
    }
    const diag = JSON.parse(fs.readFileSync(path, "utf8")) as {
      products: Array<{
        nmId: string;
        openCount: number | null;
        priorOpenCount: number | null;
        cartCount: number | null;
        priorCartCount: number | null;
        orders28: number | null;
        priorOrders28: number | null;
      }>;
    };
    const products = diag.products.map((p) => ({
      nmId: p.nmId,
      openCount: p.openCount,
      priorOpenCount: p.priorOpenCount,
      cartCount: p.cartCount,
      priorCartCount: p.priorCartCount,
      orders: p.orders28,
      priorOrders: p.priorOrders28,
    }));
    const focus = [
      "999468981",
      "999504756",
      "999504739",
      "999468962",
      "999504718",
      "999468995",
      "999549866",
    ];
    const cases = focus.map((nmId) => {
      const p = products.find((x) => x.nmId === nmId)!;
      return {
        nmId,
        opens: (p.openCount ?? 0) + (p.priorOpenCount ?? 0),
        carts: (p.cartCount ?? 0) + (p.priorCartCount ?? 0),
      };
    });

    const bhEntries: Array<{ draftIndex: number; stage: "open_to_cart" | "cart_to_order"; pValue: number }> =
      [];
    const rows = cases.map((c, i) => {
      const rates = shopConversionExcluding(products, c.nmId);
      const stages = noSalesStageTests({ opens: c.opens, carts: c.carts, cA: rates.cA, cB: rates.cB });
      for (const s of stages) {
        if (s.tested) bhEntries.push({ draftIndex: i, stage: s.stage, pValue: s.pValue });
      }
      return { c, rates, stages };
    });
    assert.equal(bhEntries.length, 7);
    const bh = runNoSalesBh(bhEntries, 0.05);

    const out = rows.map((row, i) => {
      const cart = row.stages.find((s) => s.stage === "open_to_cart")!;
      const order = row.stages.find((s) => s.stage === "cart_to_order")!;
      let cartSig = false;
      let orderSig = false;
      let p_cart: number | null = cart.tested ? cart.pValue : null;
      let p_order: number | null = order.tested ? order.pValue : null;
      let q_cart: number | null = null;
      let q_order: number | null = null;
      let rank_cart: number | null = null;
      let rank_order: number | null = null;
      for (let e = 0; e < bhEntries.length; e++) {
        if (bhEntries[e]!.draftIndex !== i) continue;
        if (bhEntries[e]!.stage === "open_to_cart") {
          cartSig = bh.rejected[e]!;
          q_cart = bh.adjusted[e]!;
          rank_cart = bh.ranks[e]!;
        } else {
          orderSig = bh.rejected[e]!;
          q_order = bh.adjusted[e]!;
          rank_order = bh.ranks[e]!;
        }
      }
      return finalizeNoSalesDiagnosis({
        opens: row.c.opens,
        carts: row.c.carts,
        rates: row.rates,
        cartSignificant: cartSig,
        orderSignificant: orderSig,
        p_cart,
        p_order,
        q_cart,
        q_order,
        bh_rank_cart: rank_cart,
        bh_rank_order: rank_order,
        E_c: cart.expected,
        E_o: order.expected,
      });
    });

    assert.equal(out[5]!.kind, "no_carts");
    assert.match(out[5]!.text, /не кладут в корзину/);
    assert.equal(out[6]!.kind, "low_traffic");
    assert.match(out[6]!.text, /Мало трафика: \d+/);
    // M и число переходов плавают с выгрузкой воронки в karto-diagnostics.json.
    assert.ok((out[6]!.M ?? 0) >= 115 && (out[6]!.M ?? 0) <= 130);

    const p865 = products.find((x) => x.nmId === "999549865")!;
    const rates865 = shopConversionExcluding(products, "999549865");
    const opens865 = (p865.openCount ?? 0) + (p865.priorOpenCount ?? 0);
    const carts865 = (p865.cartCount ?? 0) + (p865.priorCartCount ?? 0);
    const stages865 = noSalesStageTests({
      opens: opens865,
      carts: carts865,
      cA: rates865.cA,
      cB: rates865.cB,
    });
    assert.equal(stages865[0]!.tested, false);
    const d865 = finalizeNoSalesDiagnosis({
      opens: opens865,
      carts: carts865,
      rates: rates865,
      cartSignificant: false,
      orderSignificant: false,
      p_cart: null,
      p_order: null,
      q_cart: null,
      q_order: null,
      bh_rank_cart: null,
      bh_rank_order: null,
      E_c: stages865[0]!.expected,
      E_o: stages865[1]!.expected,
    });
    assert.equal(d865.kind, "low_traffic");
    assert.ok((d865.M ?? 0) >= 115 && (d865.M ?? 0) <= 130);
  });

  it("poisson helpers match etalon p for 999468981", () => {
    const E_c = 13.859;
    const p = poissonCdfLower(0, E_c);
    assert.ok(p < 1e-5);
    assert.ok(Math.abs(poissonZeroP(2.238) - Math.exp(-2.238)) < 1e-12);
  });
});

describe("Package C step 5: content ≤ opportunity", () => {
  it("content 44 sales 0 → opportunity", () => {
    const draft = ruleContent(fact({ contentScore: 44, salesQty: 0 }), t);
    assert.equal(draft?.type, "TASK_LOW_CONTENT_SCORE");
    assert.equal(draft?.severityFloor, "opportunity");
    assert.equal(draft?.severityCeiling, "opportunity");
  });
});

describe("Package C settings smoke", () => {
  it("DEFAULT_TASK_SETTINGS still loads", () => {
    assert.ok(DEFAULT_TASK_SETTINGS.thresholds.excessCoverDays > 0);
  });
});
