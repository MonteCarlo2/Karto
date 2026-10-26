import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_TASK_SETTINGS, DEFAULT_TASK_THRESHOLDS } from "./config";
import { collectDrafts, finalizeNoSalesDrafts, ruleExcessStock, ruleNoSales } from "./rules";
import {
  coverDaysFromBurn,
  excessUnits,
  resolveNetBurnPerDay,
  storageMoneyAtRisk28d,
  storagePerUnitDayFromPaidRows,
} from "./stock-math";
import { EMPTY_STOCKS_REPORT_FIELDS } from "./types";
import type { TaskEventRef, TaskFact } from "./types";

const t = DEFAULT_TASK_THRESHOLDS;
const TURNOVER = 308_345;
const store = {
  turnoverRub: TURNOVER as number | null,
  grossProfitRub: null as number | null,
  useGrossProfit: false,
};

function fact(patch: Partial<TaskFact> = {}): TaskFact {
  const row: TaskFact = {
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
    orders: 28,
    priorOrders: 28,
    ordersPerDay: 1,
    priorOrdersPerDay: 1,
    openCount: null,
    priorOpenCount: null,
    cartCount: null,
    priorCartCount: null,
    addToCartPercent: null,
    priorAddToCartPercent: null,
    cartToOrderPercent: null,
    priorCartToOrderPercent: null,
    avgOrderPrice: 500,
    orderSum: 14_000,
    priorOrderSum: 14_000,
    funnelDateFrom: null,
    funnelDateTo: null,
    funnelPastDateFrom: null,
    funnelPastDateTo: null,
    ...EMPTY_STOCKS_REPORT_FIELDS,
    buyoutPercentFunnelPast: 0.5,
    ...patch,
  };
  /** Тесты задают долю; без счётчиков синтезируем n≥20 для product_only. */
  if (
    row.pastOrderCount == null &&
    row.pastBuyoutCount == null &&
    row.buyoutPercentFunnelPast != null
  ) {
    row.pastOrderCount = 100;
    row.pastBuyoutCount = Math.round(row.buyoutPercentFunnelPast * 100);
  }
  return row;
}

describe("Package B: excess + no-sales etalons", () => {
  it("1: excess Important by storage (4970 = 1.61%)", () => {
    const demand = 1;
    const b = 0.5;
    const burn = resolveNetBurnPerDay({
      demandPerDay: demand,
      buyoutPercent: b,
      realizationBuyoutsPerDay: null,
    }).burn;
    assert.equal(burn, 0.5);
    const available = 400;
    const excess = excessUnits({ available, netBurnPerDay: burn!, excessCoverDays: 90 });
    assert.equal(excess, 355);
    const money = storageMoneyAtRisk28d(excess, 0.5);
    assert.equal(money, 4_970);
    const draft = ruleExcessStock(
      fact({
        stock: 400,
        orders: 28,
        buyoutPercentFunnelPast: 0.5,
        cost: 300,
        storagePerUnitDay: 0.5,
        storageSource: "paid_storage",
      }),
      t,
      store,
    );
    assert.equal(draft?.severityFloor, "important");
    assert.equal(draft?.evidence.money_at_risk_rub, 4_970);
    assert.equal(draft?.evidence.frozen_rub, 106_500);
    assert.equal(draft?.evidence.frozen_basis, "cost");
    assert.ok((draft?.evidence.cover_days_burn as number) > 365);
  });

  it("2: illiquid raises storage-opportunity to Important", () => {
    const draft = ruleExcessStock(
      fact({
        stock: 400,
        orders: 28,
        buyoutPercentFunnelPast: 0.5,
        cost: 300,
        storagePerUnitDay: 0.1,
        storageSource: "paid_storage",
      }),
      t,
      store,
    );
    assert.equal(draft?.evidence.money_at_risk_rub, 994);
    assert.equal(draft?.severityFloor, "important");
    assert.equal(draft?.evidence.illiquid_raise, true);
  });

  it("3: illiquid but immaterial stays opportunity", () => {
    /** спрос 0.1: дни наличия 10, заказы в них 1 */
    const draft = ruleExcessStock(
      fact({
        stock: 30,
        orders: null,
        daysInStock: 10,
        ordersInStockDays: 1,
        buyoutPercentFunnelPast: 0.5,
        cost: 50,
        storagePerUnitDay: 0.2,
        storageSource: "paid_storage",
      }),
      t,
      store,
    );
    assert.ok(draft);
    assert.equal(draft?.evidence.excess_units, 25.5);
    assert.equal(draft?.severityFloor, "opportunity");
    assert.equal(draft?.evidence.illiquid_raise, false);
    const frozen = draft?.evidence.frozen_rub as number;
    assert.ok(frozen < 3_083.45);
  });

  it("4: without cost, sale-price upper bound raises to Important", () => {
    const draft = ruleExcessStock(
      fact({
        stock: 400,
        orders: 28,
        buyoutPercentFunnelPast: 0.5,
        cost: null,
        price: 400,
        promoPrice: 400,
        storagePerUnitDay: 0.1,
        storageSource: "paid_storage",
      }),
      t,
      store,
    );
    assert.equal(draft?.severityFloor, "important");
    assert.equal(draft?.evidence.upper_bound_note, true);
    assert.match(draft?.description ?? "", /верхняя граница/);
  });

  it("5: price decides days — same rubles, different pieces", () => {
    const burn = 10;
    const highPieces = excessUnits({ available: 3_240, netBurnPerDay: burn, excessCoverDays: 90 });
    assert.equal(highPieces, 2_340);
    assert.equal(coverDaysFromBurn(3_240, burn), 324);
    const lowPieces = excessUnits({ available: 108, netBurnPerDay: burn, excessCoverDays: 90 });
    assert.equal(lowPieces, 0);
    assert.ok((coverDaysFromBurn(108, burn) ?? 0) < 14);

    const yes = ruleExcessStock(
      fact({
        stock: 3_240,
        orders: 560,
        buyoutPercentFunnelPast: 0.5,
        cost: 50,
        storagePerUnitDay: 0.01,
        storageSource: "paid_storage",
      }),
      t,
      store,
    );
    assert.ok(yes);
    const no = ruleExcessStock(
      fact({
        stock: 108,
        orders: 560,
        buyoutPercentFunnelPast: 0.5,
        cost: 50,
        storagePerUnitDay: 0.01,
        storageSource: "paid_storage",
      }),
      t,
      store,
    );
    assert.equal(no, null);
  });

  it("6: unknown storage, cover < year → opportunity + copy", () => {
    const draft = ruleExcessStock(
      fact({
        stock: 200,
        orders: 56,
        buyoutPercentFunnelPast: 0.5,
        cost: 300,
        storagePerUnitDay: null,
      }),
      t,
      store,
    );
    assert.equal(draft?.severityFloor, "opportunity");
    assert.match(draft?.description ?? "", /стоимость хранения неизвестна/i);
  });

  it("7: no-sales diagnoses + mutual exclusion with excess", () => {
    const now = "2026-10-13T12:00:00.000Z";
    const base = {
      stock: 40,
      orders: 0 as const,
      priorOrders: 0 as const,
      funnelStatus: "ok" as const,
      createdAt: "2020-01-01T00:00:00.000Z",
      cost: 200,
      storagePerUnitDay: 0.5,
      storageSource: "paid_storage" as const,
      buyoutPercentFunnelPast: 0.5,
    };
    const noOpens = ruleNoSales(
      fact({ ...base, openCount: 0, priorOpenCount: 0, cartCount: 0, priorCartCount: 0 }),
      t,
      { now, store },
    );
    assert.match(noOpens?.description ?? "", /не видят/);
    const noCarts = ruleNoSales(
      fact({ ...base, openCount: 20, priorOpenCount: 20, cartCount: 0, priorCartCount: 0 }),
      t,
      { now, store },
    );
    assert.match(noCarts?.description ?? "", /не кладут в корзину/);
    const noOrders = ruleNoSales(
      fact({ ...base, openCount: 10, priorOpenCount: 10, cartCount: 2, priorCartCount: 1 }),
      t,
      { now, store },
    );
    assert.match(noOrders?.description ?? "", /не заказывают/);

    const settings = DEFAULT_TASK_SETTINGS;
    const drafts = collectDrafts(
      fact({
        ...base,
        openCount: 0,
        priorOpenCount: 0,
        stock: 400,
        orders: 0,
        priorOrders: 0,
      }),
      null,
      settings,
      now,
      store,
      [],
    );
    assert.ok(drafts.some((d) => d.type === "TASK_NO_SALES"));
    assert.equal(
      drafts.some((d) => d.type === "TASK_EXCESS_STOCK"),
      false,
    );
  });

  it("8: no-sales not created — young / no funnel / stock_out in window", () => {
    const now = "2026-10-13T12:00:00.000Z";
    assert.equal(
      ruleNoSales(
        fact({
          stock: 10,
          orders: 0,
          priorOrders: 0,
          funnelStatus: "ok",
          createdAt: "2026-09-03T00:00:00.000Z",
        }),
        t,
        { now, store },
      ),
      null,
    );
    assert.equal(
      ruleNoSales(
        fact({
          stock: 10,
          orders: 0,
          priorOrders: 0,
          funnelStatus: "not_loaded",
          createdAt: "2020-01-01T00:00:00.000Z",
        }),
        t,
        { now, store },
      ),
      null,
    );
    const events: TaskEventRef[] = [
      { id: "e1", kind: "stock_out", nmId: "1", createdAt: "2026-09-20T00:00:00.000Z" },
    ];
    assert.equal(
      ruleNoSales(
        fact({
          stock: 10,
          orders: 0,
          priorOrders: 0,
          funnelStatus: "ok",
          createdAt: "2020-01-01T00:00:00.000Z",
          openCount: 0,
          priorOpenCount: 0,
        }),
        t,
        { now, store, events },
      ),
      null,
    );
  });

  it("8b presence: undated stock_out → caveat, not blocked", () => {
    const now = "2026-10-13T12:00:00.000Z";
    const historySince = "2025-01-01T00:00:00.000Z";
    const undated: TaskEventRef[] = [{ id: "e0", kind: "stock_out", nmId: "999468907", createdAt: null }];
    const shopMate = fact({
      nmId: "shop",
      stock: 10,
      orders: 40,
      priorOrders: 40,
      openCount: 2_000,
      priorOpenCount: 2_000,
      cartCount: 300,
      priorCartCount: 300,
      funnelStatus: "ok",
      createdAt: "2020-01-01T00:00:00.000Z",
    });
    const target = fact({
      nmId: "999468907",
      stock: 100,
      stockFbo: 0,
      stockFbs: 100,
      orders: 0,
      priorOrders: 0,
      funnelStatus: "ok",
      createdAt: "2026-04-29T16:05:38.749338Z",
      openCount: 5,
      priorOpenCount: 2,
      cartCount: 1,
      priorCartCount: 0,
      cost: 1_170,
      storagePerUnitDay: null,
    });
    const drafts = finalizeNoSalesDrafts(
      [target, shopMate],
      DEFAULT_TASK_SETTINGS,
      now,
      store,
      undated,
      historySince,
    );
    const draft = drafts.find((row) => row.nmId === "999468907");
    assert.ok(draft);
    assert.equal(draft?.evidence.undated_stock_out, true);
    assert.equal(draft?.evidence.presence_verified, false);
    assert.match(
      draft?.description ?? "",
      /мы не можем проверить, был ли товар в наличии весь период/i,
    );
  });

  it("8b2 presence: history shorter than 56d → caveat", () => {
    const now = "2026-10-13T12:00:00.000Z";
    /** 30 дней истории — короче окна. */
    const historySince = "2026-09-13T12:00:00.000Z";
    const draft = ruleNoSales(
      fact({
        stock: 10,
        orders: 0,
        priorOrders: 0,
        funnelStatus: "ok",
        createdAt: "2020-01-01T00:00:00.000Z",
        openCount: 0,
        priorOpenCount: 0,
      }),
      t,
      { now, store, events: [], stockHistorySince: historySince },
    );
    assert.ok(draft);
    assert.equal(draft?.evidence.presence_verified, false);
    assert.equal(draft?.evidence.undated_stock_out, false);
    assert.equal(draft?.evidence.stock_history_days, 30);
    assert.match(
      draft?.description ?? "",
      /мы не можем проверить, был ли товар в наличии весь период/i,
    );
  });

  it("8b3 presence: full history, no stock_out → verified, no caveat", () => {
    const now = "2026-10-13T12:00:00.000Z";
    const historySince = "2025-01-01T00:00:00.000Z";
    const draft = ruleNoSales(
      fact({
        stock: 10,
        orders: 0,
        priorOrders: 0,
        funnelStatus: "ok",
        createdAt: "2020-01-01T00:00:00.000Z",
        openCount: 0,
        priorOpenCount: 0,
      }),
      t,
      { now, store, events: [], stockHistorySince: historySince },
    );
    assert.ok(draft);
    assert.equal(draft?.evidence.presence_verified, true);
    assert.equal(draft?.evidence.undated_stock_out, false);
    assert.ok((draft?.evidence.stock_history_days as number) >= 56);
    assert.doesNotMatch(
      draft?.description ?? "",
      /мы не можем проверить, был ли товар в наличии весь период/i,
    );
  });

  it("8c: Excess without cost keeps one upper-bound phrase, not two", () => {
    const draft = ruleExcessStock(
      fact({
        stock: 400,
        orders: 28,
        buyoutPercentFunnelPast: 0.5,
        cost: null,
        promoPrice: 800,
        storagePerUnitDay: 0.1,
        storageSource: "paid_storage",
      }),
      t,
      store,
    );
    assert.ok(draft);
    const text = draft?.description ?? "";
    assert.match(text, /Сумма оценена по цене продажи/);
    assert.doesNotMatch(text, /Введите себестоимость, чтобы видеть сумму/);
    assert.equal((text.match(/себестоимость/gi) ?? []).length, 1);
  });

  it("9: net burn without buyout uses realization pace; else no excess", () => {
    const withSales = ruleExcessStock(
      fact({
        stock: 400,
        orders: 28,
        buyoutPercentFunnelPast: null,
        buyoutPercentStocks: null,
        salesKnown: true,
        salesQty: 14,
        cost: 300,
        storagePerUnitDay: 0.5,
        storageSource: "paid_storage",
      }),
      t,
      store,
    );
    assert.ok(withSales);
    assert.equal(withSales?.evidence.net_burn_basis, "realization_buyouts");

    const none = ruleExcessStock(
      fact({
        stock: 400,
        orders: 28,
        buyoutPercentFunnelPast: null,
        buyoutPercentStocks: null,
        salesKnown: false,
        salesQty: null,
        storagePerUnitDay: 0.5,
      }),
      t,
      store,
    );
    assert.equal(none, null);
  });

  it("10: frozen uses cost only; sale price is upper bound for illiquid check", () => {
    const draft = ruleExcessStock(
      fact({
        stock: 400,
        orders: 28,
        buyoutPercentFunnelPast: 0.5,
        cost: 300,
        promoPrice: 9999,
        storagePerUnitDay: 0.5,
        storageSource: "paid_storage",
      }),
      t,
      store,
    );
    assert.equal(draft?.evidence.frozen_basis, "cost");
    assert.equal(draft?.evidence.frozen_rub, 106_500);
  });

  it("paid_storage unit-day rate from rows", () => {
    const rate = storagePerUnitDayFromPaidRows([
      { warehousePrice: 12.6, barcodesCount: 42 },
      { warehousePrice: 13.2, barcodesCount: 44 },
    ]);
    assert.equal(rate, 0.3);
  });

  it("step 4: low orders line + poisson note", () => {
    const draft = ruleExcessStock(
      fact({
        stock: 400,
        orders: 1,
        priorOrders: 5,
        buyoutPercentFunnelPast: 0.5,
        cost: 300,
        storagePerUnitDay: 0.5,
        storageSource: "paid_storage",
      }),
      t,
      store,
    );
    assert.match(draft?.description ?? "", /заказов: 1/i);
    assert.match(draft?.description ?? "", /случайным/);
  });
});
