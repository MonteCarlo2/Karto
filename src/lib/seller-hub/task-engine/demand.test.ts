import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { supplyPace } from "../product-signal";
import { DEFAULT_TASK_SETTINGS, type TaskSettings } from "./config";
import {
  conversionTrafficLine,
  demandSeverityFromMoney,
  finalizeDemandDrafts,
  candidateSalesDrop,
  collectDemandCandidates,
  type DemandCandidate,
} from "./demand";
import { reconcileTasks } from "./engine";
import {
  collectDrafts,
  daysOutOfStockSince,
  missedOrdersEstimate,
  ruleConversionDrop,
  ruleLowTraffic,
  ruleSalesDrop,
  stockOutPace,
} from "./rules";
import type { SellerTask, TaskBaseline, TaskEventRef, TaskFact } from "./types";
import { EMPTY_STOCKS_REPORT_FIELDS } from "./types";

function fact(patch: Partial<TaskFact> = {}): TaskFact {
  return {
    nmId: "100",
    itemId: "item",
    title: "Товар",
    vendorCode: "ART",
    stock: 50,
    price: 1000,
    promoPrice: 800,
    cost: 400,
    salesQty: 20,
    salesKnown: true,
    priorSalesQty: 40,
    recentSalesQty: 5,
    coverDays: 40,
    paceWindow: "span",
    dailyPace: 0.5,
    sittingRub: 0,
    marginPercent: 20,
    marginRub: 160,
    marginSource: "sku",
    contentScore: 80,
    contentGap: null,
    photoCount: 7,
    createdAt: "2020-01-01T00:00:00.000Z",
    paceSource: null,
    funnelStatus: "ok",
    orders: 10,
    priorOrders: 40,
    ordersPerDay: 0.4,
    priorOrdersPerDay: 1.2,
    openCount: 200,
    priorOpenCount: 210,
    cartCount: 40,
    priorCartCount: 80,
    addToCartPercent: 10,
    priorAddToCartPercent: 20,
    cartToOrderPercent: 50,
    priorCartToOrderPercent: 50,
    avgOrderPrice: 800,
    orderSum: 8000,
    priorOrderSum: 32000,
    funnelDateFrom: "2026-09-15",
    funnelDateTo: "2026-10-12",
    funnelPastDateFrom: "2026-08-18",
    funnelPastDateTo: "2026-09-14",
    ...EMPTY_STOCKS_REPORT_FIELDS,
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
    updatedAt: "2026-10-01T10:00:00.000Z",
    ...patch,
  };
}

function settings(patch: Partial<TaskSettings["thresholds"]> = {}): TaskSettings {
  return {
    ...DEFAULT_TASK_SETTINGS,
    thresholds: { ...DEFAULT_TASK_SETTINGS.thresholds, ...patch },
  };
}

function ctx(patch: Parameters<typeof ruleSalesDrop>[3] = {}) {
  const storeOrderSum = patch.storeOrderSum ?? patch.store?.turnoverRub ?? 100_000;
  const store = patch.store ?? {
    turnoverRub: storeOrderSum,
    grossProfitRub: null as number | null,
    useGrossProfit: false,
  };
  return {
    now: "2026-10-13T12:00:00.000Z",
    events: [] as TaskEventRef[],
    hadStockOutAt: false,
    ...patch,
    storeOrderSum: patch.storeOrderSum ?? store.turnoverRub ?? storeOrderSum,
    store: patch.store ?? { ...store, turnoverRub: patch.storeOrderSum ?? store.turnoverRub },
  };
}

describe("TASK_CONVERSION_DROP", () => {
  it("fires when orders and cart conversion drop with stable traffic", () => {
    const draft = ruleConversionDrop(
      fact({
        orders: 20,
        priorOrders: 40,
        openCount: 200,
        priorOpenCount: 210,
        cartCount: 20,
        priorCartCount: 80,
        addToCartPercent: 10,
        priorAddToCartPercent: 38,
      }),
      settings().thresholds,
      ctx(),
    );
    assert.equal(draft?.type, "TASK_CONVERSION_DROP");
    assert.equal(draft?.evidence.conversion_stage, "add_to_cart");
    assert.equal(typeof draft?.evidence.p_value, "number");
    assert.equal(typeof draft?.evidence.p_adjusted, "number");
  });

  it("stays silent when total opens are below the floor", () => {
    assert.equal(
      ruleConversionDrop(
        fact({ priorOpenCount: 4, openCount: 4, priorOrders: 20, orders: 5 }),
        settings().thresholds,
        ctx(),
      ),
      null,
    );
  });

  it("stays silent when traffic also dropped hard", () => {
    assert.equal(
      ruleConversionDrop(
        fact({
          orders: 20,
          priorOrders: 40,
          openCount: 100,
          priorOpenCount: 200,
          cartCount: 10,
          priorCartCount: 80,
          addToCartPercent: 10,
          priorAddToCartPercent: 40,
        }),
        settings().thresholds,
        ctx(),
      ),
      null,
    );
  });

  it("stays silent when stock is zero", () => {
    assert.equal(ruleConversionDrop(fact({ stock: 0 }), settings().thresholds, ctx()), null);
  });

  it("describes stable traffic as «при стабильных переходах»", () => {
    assert.equal(conversionTrafficLine(-0.02), "при стабильных переходах");
    assert.equal(conversionTrafficLine(0), "при стабильных переходах");
    assert.equal(conversionTrafficLine(0.05), "при стабильных переходах");
    const draft = ruleConversionDrop(
      fact({
        orders: 20,
        priorOrders: 40,
        openCount: 200,
        priorOpenCount: 210,
        cartCount: 20,
        priorCartCount: 80,
        addToCartPercent: 10,
        priorAddToCartPercent: 38,
      }),
      settings().thresholds,
      ctx(),
    );
    assert.match(draft?.description ?? "", /при стабильных переходах/);
  });

  it("describes traffic growth without calling it stable", () => {
    assert.equal(
      conversionTrafficLine(0.2),
      "переходов стало больше, но в корзину и заказ они конвертируются хуже",
    );
    const draft = ruleConversionDrop(
      fact({
        openCount: 300,
        priorOpenCount: 200,
        cartCount: 18,
        priorCartCount: 80,
        addToCartPercent: 6,
        priorAddToCartPercent: 40,
        orders: 10,
        priorOrders: 40,
      }),
      settings().thresholds,
      ctx(),
    );
    assert.match(
      draft?.description ?? "",
      /переходов стало больше, но в корзину и заказ они конвертируются хуже/,
    );
    assert.doesNotMatch(draft?.description ?? "", /при стабильных переходах/);
  });
});

describe("TASK_LOW_TRAFFIC", () => {
  it("fires when orders and opens drop while conversions stay flat", () => {
    const draft = ruleLowTraffic(
      fact({
        orders: 20,
        priorOrders: 40,
        openCount: 100,
        priorOpenCount: 200,
        cartCount: 20,
        priorCartCount: 40,
        addToCartPercent: 20,
        priorAddToCartPercent: 20,
        cartToOrderPercent: 50,
        priorCartToOrderPercent: 50,
      }),
      settings().thresholds,
      ctx(),
    );
    assert.equal(draft?.type, "TASK_LOW_TRAFFIC");
  });

  it("stays silent when conversion also dropped", () => {
    assert.equal(
      ruleLowTraffic(
        fact({
          orders: 20,
          priorOrders: 40,
          openCount: 100,
          priorOpenCount: 200,
          cartCount: 10,
          priorCartCount: 80,
          addToCartPercent: 10,
          priorAddToCartPercent: 40,
        }),
        settings().thresholds,
        ctx(),
      ),
      null,
    );
  });
});

describe("demand statistical gates", () => {
  it("does not create a sales drop for 5→1 orders", () => {
    assert.equal(
      ruleSalesDrop(
        fact({
          funnelStatus: "ok",
          orders: 1,
          priorOrders: 5,
          salesQty: null,
          priorSalesQty: null,
        }),
        baseline(),
        settings().thresholds,
        ctx(),
      ),
      null,
    );
  });

  it("creates a sales drop for 400→300 at normal volumes", () => {
    const draft = ruleSalesDrop(
      fact({
        funnelStatus: "ok",
        orders: 300,
        priorOrders: 400,
        openCount: 2000,
        priorOpenCount: 2100,
        avgOrderPrice: 500,
      }),
      baseline(),
      settings().thresholds,
      ctx({ storeOrderSum: 500_000 }),
    );
    assert.equal(draft?.type, "TASK_SALES_DROP");
    assert.ok((draft?.evidence.p_value as number) < 0.05);
    assert.equal(draft?.evidence.money_is_estimate, true);
  });

  it("does not create a task for a significant-looking but small 5% drop", () => {
    assert.equal(
      ruleSalesDrop(
        fact({
          orders: 950,
          priorOrders: 1000,
          openCount: 5000,
          priorOpenCount: 5100,
        }),
        baseline(),
        settings().thresholds,
        ctx(),
      ),
      null,
    );
  });

  it("blocks demand drop when OOS event exists in the store", () => {
    assert.equal(
      ruleSalesDrop(
        fact({ orders: 300, priorOrders: 400 }),
        baseline(),
        settings().thresholds,
        ctx({
          events: [{ id: "e1", kind: "stock_out", nmId: "100" }],
        }),
      ),
      null,
    );
  });

  it("puts a price change into probable cause", () => {
    const draft = ruleSalesDrop(
      fact({
        orders: 300,
        priorOrders: 400,
        promoPrice: 700,
      }),
      baseline({ promoPrice: 800 }),
      settings().thresholds,
      ctx(),
    );
    assert.equal(draft?.type, "TASK_SALES_DROP");
    assert.match(String(draft?.evidence.probable_cause ?? ""), /цен/);
    assert.match(draft?.description ?? "", /Вероятная причина/);
  });

  it("does not compare a new card younger than 56 days", () => {
    assert.equal(
      ruleSalesDrop(
        fact({
          orders: 300,
          priorOrders: 400,
          createdAt: "2026-09-20T00:00:00.000Z",
        }),
        baseline(),
        settings().thresholds,
        ctx({ now: "2026-10-13T12:00:00.000Z" }),
      ),
      null,
    );
  });

  it("FDR drops part of weak candidates among many products", () => {
    const strong = candidateSalesDrop(
      fact({ nmId: "strong", orders: 200, priorOrders: 400, avgOrderPrice: 500 }),
      {
        now: "2026-10-13T12:00:00.000Z",
        events: [],
        baseline: baseline(),
        storeOrderSum: 1_000_000,
        hadStockOutAt: false,
      },
      settings().thresholds,
    );
    assert.ok(strong);
    const weakShell = strong!.draft;
    const candidates: DemandCandidate[] = [
      strong!,
      ...Array.from({ length: 8 }, (_, i) => ({
        draft: {
          ...weakShell,
          nmId: `weak-${i}`,
          evidence: { ...weakShell.evidence, p_value: 0.2 },
        },
        // Порог существенности уже пройден у кандидата, но p=0.2 не проходит FDR при m=9.
        pValue: 0.2,
      })),
    ];
    const kept = finalizeDemandDrafts(candidates, 0.05);
    const drops = kept.filter((row) => row.type === "TASK_SALES_DROP");
    assert.equal(drops.length, 1);
    assert.equal(drops[0]?.nmId, "strong");
  });
});

describe("demand severity by store turnover", () => {
  it("maps 6% / 2% / 0.5% / unknown money", () => {
    const t = settings().thresholds;
    assert.equal(demandSeverityFromMoney(6000, 100_000, t), "critical");
    assert.equal(demandSeverityFromMoney(2000, 100_000, t), "important");
    assert.equal(demandSeverityFromMoney(500, 100_000, t), "opportunity");
    assert.equal(demandSeverityFromMoney(null, 100_000, t), "opportunity");
  });

  it("applies critical severity when money share is large", () => {
    const draft = ruleSalesDrop(
      fact({
        orders: 100,
        priorOrders: 400,
        avgOrderPrice: 1000,
      }),
      baseline(),
      settings().thresholds,
      ctx({ storeOrderSum: 50_000 }),
    );
    assert.equal(draft?.baseSeverity, "critical");
    assert.equal(draft?.severityFloor, "critical");
  });
});

describe("demand task mutual exclusion", () => {
  it("skips TASK_SALES_DROP when conversion survives FDR", () => {
    const thresholds = settings().thresholds;
    const f = fact({
      orders: 20,
      priorOrders: 40,
      openCount: 200,
      priorOpenCount: 210,
      cartCount: 20,
      priorCartCount: 80,
      addToCartPercent: 10,
      priorAddToCartPercent: 38,
    });
    const candidates = collectDemandCandidates(
      f,
      {
        now: "2026-10-13T12:00:00.000Z",
        events: [],
        baseline: baseline(),
        storeOrderSum: 100_000,
        hadStockOutAt: false,
      },
      thresholds,
      {},
    );
    const drafts = finalizeDemandDrafts(candidates, thresholds.demandFdrQ);
    assert.ok(drafts.some((row) => row.type === "TASK_CONVERSION_DROP"));
    assert.equal(drafts.some((row) => row.type === "TASK_SALES_DROP"), false);
  });

  it("skips TASK_SALES_DROP when traffic survives FDR", () => {
    const thresholds = settings().thresholds;
    const f = fact({
      orders: 20,
      priorOrders: 40,
      openCount: 100,
      priorOpenCount: 200,
      cartCount: 20,
      priorCartCount: 40,
      addToCartPercent: 20,
      priorAddToCartPercent: 20,
      cartToOrderPercent: 50,
      priorCartToOrderPercent: 50,
    });
    const drafts = finalizeDemandDrafts(
      collectDemandCandidates(
        f,
        {
          now: "2026-10-13T12:00:00.000Z",
          events: [],
          baseline: baseline(),
          storeOrderSum: 100_000,
          hadStockOutAt: false,
        },
        thresholds,
        {},
      ),
      thresholds.demandFdrQ,
    );
    assert.ok(drafts.some((row) => row.type === "TASK_LOW_TRAFFIC"));
    assert.equal(drafts.some((row) => row.type === "TASK_SALES_DROP"), false);
  });

  it("keeps realization sales drop without funnel", () => {
    const draft = ruleSalesDrop(
      fact({
        funnelStatus: "not_loaded",
        orders: null,
        priorOrders: null,
        salesQty: 10,
        priorSalesQty: 40,
      }),
      baseline(),
      settings().thresholds,
      ctx(),
    );
    assert.equal(draft?.type, "TASK_SALES_DROP");
  });
});

describe("missed orders and supply pace", () => {
  it("estimates missed orders and leaves null without pace", () => {
    assert.equal(missedOrdersEstimate(2, 7), 14);
    assert.equal(missedOrdersEstimate(null, 7), null);
  });

  it("prefers past funnel pace over current-window ordersPerDay", () => {
    const choice = stockOutPace(
      fact({ stock: 0, priorOrdersPerDay: 2, ordersPerDay: 0.1, avgOrderPrice: 500 }),
      baseline({ stock: 10, coverDays: 5 }),
    );
    assert.equal(choice.pace, 2);
    assert.match(choice.period ?? "", /прошлые 28/);
  });

  it("grows OOS days across syncs from stockOutAt, not baseline updatedAt", () => {
    const start = "2026-10-01T12:00:00.000Z";
    const first = reconcileTasks({
      now: start,
      storeId: "s",
      facts: [fact({ stock: 0, priorOrdersPerDay: 2, avgOrderPrice: 100 })],
      baselines: { "100": baseline({ stock: 8, coverDays: 4 }) },
      store: {
        unansweredFeedbacks: null,
        unansweredQuestions: null,
        feedbacksStatus: null,
        unansweredPositiveCount: null,
        unansweredPositiveProductCount: null,
      },
      settings: settings(),
      tasks: [],
      events: [],
    });
    assert.equal(first.baselines["100"]?.stockOutAt, start);
    const second = reconcileTasks({
      now: "2026-10-02T12:00:00.000Z",
      storeId: "s",
      facts: [fact({ stock: 0, priorOrdersPerDay: 2, avgOrderPrice: 100 })],
      baselines: first.baselines,
      store: {
        unansweredFeedbacks: null,
        unansweredQuestions: null,
        feedbacksStatus: null,
        unansweredPositiveCount: null,
        unansweredPositiveProductCount: null,
      },
      settings: settings(),
      tasks: first.tasks,
      events: [],
    });
    assert.equal(second.baselines["100"]?.stockOutAt, start);
    assert.equal(second.baselines["100"]?.updatedAt, "2026-10-02T12:00:00.000Z");
    assert.equal(daysOutOfStockSince(start, "2026-10-08T12:00:00.000Z"), 7);
    const third = reconcileTasks({
      now: "2026-10-08T12:00:00.000Z",
      storeId: "s",
      facts: [fact({ stock: 0, priorOrdersPerDay: 2, avgOrderPrice: 100 })],
      baselines: second.baselines,
      store: {
        unansweredFeedbacks: null,
        unansweredQuestions: null,
        feedbacksStatus: null,
        unansweredPositiveCount: null,
        unansweredPositiveProductCount: null,
      },
      settings: settings(),
      tasks: second.tasks,
      events: [],
    });
    assert.equal(third.baselines["100"]?.stockOutAt, start);
    const stockOut = third.tasks.find((task: SellerTask) => task.type === "TASK_STOCK_OUT");
    assert.ok(stockOut);
  });

  it("prefers funnel order pace and falls back to realization", () => {
    const orders = supplyPace({
      stock: 28,
      ordersPerDay: 2,
      realization: { qty: 14, priorQty: 10, recentQty: 7, retail: 1, net: 1 },
      reportReady: true,
    });
    assert.equal(orders.source, "orders");
    assert.equal(orders.days, 14);
    const sales = supplyPace({
      stock: 28,
      ordersPerDay: null,
      realization: { qty: 14, priorQty: 10, recentQty: 7, retail: 1, net: 1 },
      reportReady: true,
    });
    assert.equal(sales.source, "sales-recent");
  });
});

describe("collectDrafts without demand", () => {
  it("does not emit demand types from collectDrafts", () => {
    const drafts = collectDrafts(fact({ orders: 300, priorOrders: 400 }), baseline(), settings(), "2026-10-13T12:00:00.000Z");
    assert.equal(drafts.some((row) => row.type.startsWith("TASK_SALES") || row.type === "TASK_CONVERSION_DROP" || row.type === "TASK_LOW_TRAFFIC"), false);
  });
});
