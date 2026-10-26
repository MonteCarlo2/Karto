import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { salesWindowShift } from "../event-engine/compare";
import { DEFAULT_TASK_SETTINGS, type TaskSettings } from "./config";
import { reconcileTasks } from "./engine";
import {
  ABSENT_SINCE_KEY,
  CONDITION_CLEARED_RESOLUTION,
  DISABLED_BY_SETTINGS_RESOLUTION,
  USER_COMPLETED_RESOLUTION,
  isActionableTask,
  isPendingSnooze,
} from "./lifecycle";
import {
  ruleExcessStock,
  ruleLowMargin,
  ruleLowPhoto,
  ruleLowStock,
  ruleNegativeMargin,
  ruleNoSales,
  ruleSalesDrop,
  ruleStagnantCapital,
  ruleStockOut,
  ruleUnansweredReviews,
} from "./rules";
import type { SellerTask, TaskBaseline, TaskFact } from "./types";
import { EMPTY_STOCKS_REPORT_FIELDS } from "./types";
import type { StoreMoneyContext } from "./severity";

const storeEmpty: StoreMoneyContext = {
  turnoverRub: null,
  grossProfitRub: null,
  useGrossProfit: false,
};

function fact(patch: Partial<TaskFact> = {}): TaskFact {
  return {
    nmId: "100",
    itemId: "item",
    title: "Товар",
    vendorCode: "ART",
    stock: 10,
    price: 1000,
    promoPrice: 800,
    cost: 400,
    salesQty: 20,
    salesKnown: true,
    priorSalesQty: 20,
    recentSalesQty: 5,
    coverDays: 20,
    paceWindow: "span" as const,
    dailyPace: 0.5,
    sittingRub: 0,
    marginPercent: 20,
    marginRub: 160,
    marginSource: "sku",
    contentScore: 80,
    contentGap: null,
    photoCount: 7,
    createdAt: "2020-01-01T00:00:00.000Z",
    paceSource: "sales-span",
    funnelStatus: "not_loaded",
    orders: null,
    priorOrders: null,
    ordersPerDay: null,
    priorOrdersPerDay: null,
    openCount: null,
    priorOpenCount: null,
    cartCount: null,
    priorCartCount: null,
    addToCartPercent: null,
    priorAddToCartPercent: null,
    cartToOrderPercent: null,
    priorCartToOrderPercent: null,
    avgOrderPrice: null,
    orderSum: null,
    priorOrderSum: null,
    funnelDateFrom: null,
    funnelDateTo: null,
    funnelPastDateFrom: null,
    funnelPastDateTo: null,
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
    ...patch,
  };
}

function settings(patch: Partial<TaskSettings> = {}): TaskSettings {
  return {
    ...DEFAULT_TASK_SETTINGS,
    ...patch,
    thresholds: { ...DEFAULT_TASK_SETTINGS.thresholds, ...patch.thresholds },
  };
}

/** Короткий запас: спрос 1 шт./день без обнуления в окне. */
function shortStock(stock: number): TaskFact {
  return fact({
    stock,
    orders: 28,
    buyoutPercentFunnelPast: 1,
    avgOrderPrice: 500,
    dailyPace: 1,
    coverDays: stock,
  });
}

/** Запас длиннее точки заказа при спросе 1 шт./день. */
function longStock(stock = 200): TaskFact {
  return fact({
    stock,
    orders: 28,
    buyoutPercentFunnelPast: 1,
    avgOrderPrice: 500,
    dailyPace: 1,
    coverDays: stock,
  });
}

let sequence = 0;
function run(input: Partial<Parameters<typeof reconcileTasks>[0]> = {}) {
  return reconcileTasks({
    now: input.now ?? "2026-10-08T10:00:00.000Z",
    storeId: input.storeId ?? "wildberries",
    facts: input.facts ?? [],
    baselines: input.baselines ?? {},
    store: input.store ?? {
      unansweredFeedbacks: null,
      unansweredQuestions: null,
      feedbacksStatus: null,
      unansweredPositiveCount: null,
      unansweredPositiveProductCount: null,
    },
    settings: input.settings ?? settings(),
    tasks: input.tasks ?? [],
    events: input.events ?? [],
    createId: () => `id-${++sequence}`,
  });
}

function openOf(tasks: SellerTask[], type: string) {
  return tasks.filter((task) => task.type === type && ["active", "in_progress", "snoozed"].includes(task.status));
}

describe("task rules", () => {
  it("creates stock out only on a real transition", () => {
    const t = settings().thresholds;
    assert.equal(ruleStockOut(fact({ stock: 0 }), null, t, storeEmpty), null);
    assert.equal(ruleStockOut(fact({ stock: 0 }), baseline({ stock: 0 }), t, storeEmpty), null);
    const task = ruleStockOut(
      fact({ stock: 0, priorOrdersPerDay: 0.5, avgOrderPrice: 800 }),
      baseline({ stock: 4, coverDays: 8 }),
      t,
      storeEmpty,
    );
    assert.equal(task?.type, "TASK_STOCK_OUT");
    assert.equal(task?.severityFloor, "critical");
    assert.equal(task?.evidence.pace_before_per_day, 0.5);
    assert.match(task?.recommendation ?? "", /пополнения/);
  });

  it("creates low stock from demand, lead time and safety stock", () => {
    const t = settings().thresholds;
    assert.equal(ruleLowStock(fact({ stock: 10, orders: null, priorOrdersPerDay: null }), t, storeEmpty), null);
    // спрос 4/день, запас 120 → выше точки заказа
    assert.equal(
      ruleLowStock(fact({ stock: 120, orders: 112, buyoutPercentFunnelPast: 1 }), t, storeEmpty),
      null,
    );
    const task = ruleLowStock(
      fact({ stock: 50, orders: 112, buyoutPercentFunnelPast: 1, avgOrderPrice: 500 }),
      t,
      { turnoverRub: 1_000_000, grossProfitRub: null, useGrossProfit: false },
    );
    assert.equal(task?.type, "TASK_LOW_STOCK");
    assert.equal(task?.severityFloor, "critical");
    assert.equal(task?.evidence.replenish_units, 131);
  });

  it("no longer creates stagnant capital (merged into excess)", () => {
    assert.equal(ruleStagnantCapital(fact({ sittingRub: 5000, salesQty: 4, coverDays: 40 }), settings().thresholds), null);
    assert.equal(ruleStagnantCapital(fact({ sittingRub: 80_000, salesQty: 4 }), settings().thresholds), null);
  });

  it("creates excess stock from net burn × 90 days (money = storage × 28)", () => {
    const t = settings().thresholds;
    const store = { turnoverRub: 1_000_000, grossProfitRub: null, useGrossProfit: false };
    // спрос 2/день, выкуп 50% → burn 1; запас 200 → излишек 110; хранение 2₽ → 6160 = 0.62% → opportunity
    const task = ruleExcessStock(
      fact({
        stock: 200,
        orders: 56,
        buyoutPercentFunnelPast: 0.5,
        cost: 300,
        promoPrice: 800,
        storagePerUnitDay: 2,
        storageSource: "paid_storage",
      }),
      t,
      store,
    );
    assert.equal(task?.type, "TASK_EXCESS_STOCK");
    assert.equal(task?.evidence.excess_units, 110);
    assert.equal(task?.evidence.money_at_risk_rub, 6_160);
    assert.equal(task?.severityFloor, "opportunity");
    assert.match(task?.description ?? "", /себестоимост/);
  });

  it("does not create a sales drop without both windows or below the threshold", () => {
    assert.equal(ruleSalesDrop(fact({ priorSalesQty: null }), baseline(), settings().thresholds), null);
    assert.equal(ruleSalesDrop(fact({ salesQty: 18, priorSalesQty: 20 }), baseline(), settings().thresholds), null);
    const task = ruleSalesDrop(
      fact({
        funnelStatus: "not_loaded",
        orders: null,
        priorOrders: null,
        salesQty: 100,
        priorSalesQty: 200,
        promoPrice: 700,
        avgOrderPrice: 500,
      }),
      baseline({ promoPrice: 800 }),
      settings().thresholds,
    );
    assert.equal(task?.type, "TASK_SALES_DROP");
    assert.ok((task?.evidence.change_percent as number) <= -40);
    assert.match(String(task?.evidence.probable_cause ?? ""), /цен/);
    assert.match(task?.description ?? "", /Вероятная причина/);
    assert.doesNotMatch(task?.recommendation ?? "", /Причина падения — цена/);
  });

  it("skips no-sales when young, funnel missing, or orders present", () => {
    const now = "2026-10-08T10:00:00.000Z";
    const store = { turnoverRub: 308_345, grossProfitRub: null, useGrossProfit: false };
    const ctx = { now, store, events: [] as { id: string; kind: string; nmId: string | null }[] };
    assert.equal(
      ruleNoSales(fact({ funnelStatus: "not_loaded", orders: null, priorOrders: null, stock: 5 }), settings().thresholds, ctx),
      null,
    );
    assert.equal(
      ruleNoSales(
        fact({
          funnelStatus: "ok",
          orders: 0,
          priorOrders: 0,
          stock: 5,
          createdAt: "2026-09-01T00:00:00.000Z",
        }),
        settings().thresholds,
        ctx,
      ),
      null,
    );
    const task = ruleNoSales(
      fact({
        funnelStatus: "ok",
        orders: 0,
        priorOrders: 0,
        openCount: 0,
        priorOpenCount: 0,
        stock: 8,
        cost: 400,
        createdAt: "2020-01-01T00:00:00.000Z",
        storagePerUnitDay: 1,
        storageSource: "paid_storage",
      }),
      settings().thresholds,
      ctx,
    );
    assert.equal(task?.type, "TASK_NO_SALES");
    assert.match(task?.description ?? "", /не видят/);
  });

  it("does not invent margin and keeps a missing low-margin threshold silent", () => {
    assert.equal(ruleNegativeMargin(fact({ marginPercent: null, cost: 100 })), null);
    const negative = ruleNegativeMargin(
      fact({
        marginPercent: -7.4,
        marginRub: -74,
        marginWindowP: -740,
        marginWindowU: -74,
        salesQty: 10,
        unitSaleNetSales90: 30,
        sellerRevenueS: 10_000,
        breakEvenPrice: 1_107,
        feeRateK: 0.25,
        logisticsPerUnit: 150,
        storagePerUnit: 20,
        unitSaleD: 40,
        unitSaleR: 10,
        unitSaleDeliveryUnit: 250,
        unitSaleReturnUnit: 150,
        unitSaleB: 0.77,
        acceptancePerUnit: 10,
      }),
    );
    assert.equal(negative?.type, "TASK_NEGATIVE_MARGIN");
    assert.match(negative?.description ?? "", /1 продажу|себестоимость/i);
    assert.doesNotMatch(negative?.description ?? "", /может быть неточн/);
    assert.ok(typeof negative?.evidence.money_at_risk_rub === "number");
    assert.ok(negative!.evidence.money_at_risk_rub! > 0);
    assert.ok(
      negative?.evidence.share_of_turnover == null ||
        typeof negative.evidence.share_of_turnover === "number",
    );
    const beforeCost = ruleNegativeMargin(
      fact({
        cost: null,
        marginPercent: null,
        marginRub: null,
        marginWindowP: null,
        marginBeforeCostP: -137,
        salesQty: 2,
        unitSaleNetSales90: 6,
        promoPrice: 2000,
        logisticsPerUnit: 1612,
      }),
    );
    assert.equal(beforeCost?.type, "TASK_NEGATIVE_MARGIN");
    assert.match(beforeCost?.description ?? "", /до себестоимости|до закупки/);
    assert.doesNotMatch(beforeCost?.description ?? "", /может быть неточн/);
    assert.equal(ruleLowMargin(fact({ marginPercent: 4, salesQty: 10 }), settings().thresholds), null);
    const low = ruleLowMargin(
      fact({
        marginPercent: 4,
        marginRub: 40,
        salesQty: 10,
        unitSaleNetSales90: 30,
        sellerRevenueS: 10_000,
        feeRateK: 0.25,
      }),
      settings({ thresholds: { ...settings().thresholds, lowMarginPercent: 10 } }).thresholds,
    );
    assert.equal(low?.type, "TASK_LOW_MARGIN");
    assert.equal(
      ruleNegativeMargin(
        fact({
          marginPercent: -10,
          marginRub: -100,
          unitSaleNoDeliveries: true,
          salesQty: 10,
        }),
      ),
      null,
    );
  });

  it("does not add a photo task when the content score is already below the threshold", () => {
    assert.equal(ruleLowPhoto(fact({ photoCount: 3, contentScore: 40 }), settings().thresholds), null);
    assert.equal(ruleLowPhoto(fact({ photoCount: null, contentScore: 90 }), settings().thresholds), null);
    assert.equal(ruleLowPhoto(fact({ photoCount: 3, contentScore: 85 }), settings().thresholds)?.type, "TASK_LOW_PHOTO_COUNT");
  });

  it("keeps unanswered reviews at store level", () => {
    assert.equal(
      ruleUnansweredReviews({
        unansweredFeedbacks: null,
        unansweredQuestions: null,
        feedbacksStatus: null,
        unansweredPositiveCount: null,
        unansweredPositiveProductCount: null,
      }),
      null,
    );
    const task = ruleUnansweredReviews({
      unansweredFeedbacks: 4,
      unansweredQuestions: null,
      feedbacksStatus: null,
      unansweredPositiveCount: null,
      unansweredPositiveProductCount: null,
    });
    assert.equal(task?.nmId, null);
    assert.equal(task?.actionType, "OPEN_REVIEW_RESPONSES");
  });
});

describe("task engine", () => {
  it("keeps one open task and closes it when the condition is gone", () => {
    const first = run({
      facts: [shortStock(4)],
      baselines: { "100": baseline() },
    });
    const low = openOf(first.tasks, "TASK_LOW_STOCK");
    assert.equal(low.length, 1);
    const second = run({
      now: "2026-10-08T11:00:00.000Z",
      facts: [shortStock(2)],
      baselines: first.baselines,
      tasks: first.tasks,
    });
    const still = openOf(second.tasks, "TASK_LOW_STOCK");
    assert.equal(still.length, 1);
    assert.equal(still[0]?.id, low[0]?.id);
    assert.equal(still[0]?.evidence.cover_days, 2);
    // Условие пропало: сразу задача не закрывается (на промежуточном снимке данные могли быть неполными)...
    const marked = run({
      now: "2026-10-08T12:00:00.000Z",
      facts: [longStock(200)],
      baselines: second.baselines,
      tasks: second.tasks,
    });
    assert.equal(openOf(marked.tasks, "TASK_LOW_STOCK").length, 1);
    // ...а закрывается, когда оно не вернулось за ABSENT_GRACE_MS.
    const closed = run({
      now: "2026-10-08T12:40:00.000Z",
      facts: [longStock(200)],
      baselines: marked.baselines,
      tasks: marked.tasks,
    });
    assert.equal(openOf(closed.tasks, "TASK_LOW_STOCK").length, 0);
    assert.equal(closed.tasks.find((task) => task.id === low[0]?.id)?.status, "completed");
    const again = run({
      now: "2026-10-08T13:00:00.000Z",
      facts: [shortStock(2)],
      baselines: closed.baselines,
      tasks: closed.tasks,
    });
    const reopened = openOf(again.tasks, "TASK_LOW_STOCK");
    assert.equal(reopened.length, 1);
    assert.notEqual(reopened[0]?.id, low[0]?.id);
  });

  it("does not invent a stock-out on the first snapshot", () => {
    const first = run({ facts: [fact({ stock: 0, salesQty: 10, priorSalesQty: 20 })] });
    assert.equal(openOf(first.tasks, "TASK_STOCK_OUT").length, 0);
    assert.equal(first.baselines["100"]?.stock, 0);
    const same = run({
      now: "2026-10-08T11:00:00.000Z",
      facts: [fact({ stock: 0, salesQty: 10, priorSalesQty: 20 })],
      baselines: first.baselines,
      tasks: first.tasks,
    });
    assert.equal(openOf(same.tasks, "TASK_STOCK_OUT").length, 0);
  });

  it("does not mix stores", () => {
    const wb = run({
      storeId: "wildberries",
      facts: [shortStock(1)],
      baselines: { "100": baseline() },
    });
    const oz = run({
      storeId: "ozon",
      facts: [],
      tasks: wb.tasks,
      baselines: {},
    });
    assert.equal(oz.tasks.length, 0);
    assert.ok(wb.tasks.every((task) => task.storeId === "wildberries"));
  });

  it("respects a disabled type and does not duplicate a dismissed episode", () => {
    const disabled = run({
      facts: [shortStock(1)],
      baselines: { "100": baseline() },
      settings: settings({ disabledTypes: ["TASK_LOW_STOCK"] }),
    });
    assert.equal(openOf(disabled.tasks, "TASK_LOW_STOCK").length, 0);
    const created = run({
      facts: [shortStock(1)],
      baselines: { "100": baseline() },
    });
    const open = created.tasks.find((task) => task.type === "TASK_LOW_STOCK");
    assert.ok(open);
    const dismissed: SellerTask = { ...open!, status: "dismissed" };
    const held = run({
      now: "2026-10-08T11:00:00.000Z",
      facts: [shortStock(1)],
      baselines: created.baselines,
      tasks: [dismissed],
    });
    assert.equal(openOf(held.tasks, "TASK_LOW_STOCK").length, 0);
  });

  it("links a matching event and leaves the event formula intact", () => {
    const result = run({
      facts: [fact({ stock: 0 })],
      baselines: { "100": baseline({ stock: 6 }) },
      events: [{ id: "stock_out:100:out", kind: "stock_out", nmId: "100" }],
    });
    assert.equal(openOf(result.tasks, "TASK_STOCK_OUT")[0]?.sourceEventId, "stock_out:100:out");
    assert.equal(salesWindowShift(10, 20, { salesChangeMinUnits: 5, salesChangeRatio: 0.25 }), "down");
    assert.equal(salesWindowShift(19, 20, { salesChangeMinUnits: 5, salesChangeRatio: 0.25 }), null);
  });

  it("keeps a manual completion while the condition stays true and opens a new row only after it returns", () => {
    const facts = [shortStock(2)];
    const first = run({ facts, baselines: { "100": baseline() } });
    const open = openOf(first.tasks, "TASK_LOW_STOCK")[0];
    assert.ok(open);
    const manual: SellerTask = {
      ...open,
      status: "completed",
      resolvedAt: "2026-10-08T10:30:00.000Z",
      resolution: USER_COMPLETED_RESOLUTION,
      updatedAt: "2026-10-08T10:30:00.000Z",
    };
    const held = run({
      now: "2026-10-08T11:00:00.000Z",
      facts,
      baselines: first.baselines,
      tasks: first.tasks.map((task) => (task.id === open.id ? manual : task)),
    });
    const lowHeld = held.tasks.filter((task) => task.type === "TASK_LOW_STOCK");
    assert.equal(lowHeld.length, 1);
    assert.equal(lowHeld[0]?.id, open.id);
    assert.equal(lowHeld[0]?.status, "completed");
    assert.equal(lowHeld[0]?.resolution, USER_COMPLETED_RESOLUTION);
    assert.equal(openOf(held.tasks, "TASK_LOW_STOCK").length, 0);

    const again = run({
      now: "2026-10-08T12:00:00.000Z",
      facts,
      baselines: held.baselines,
      tasks: held.tasks,
    });
    const lowAgain = again.tasks.filter((task) => task.type === "TASK_LOW_STOCK");
    assert.equal(lowAgain.length, 1);
    assert.equal(lowAgain[0]?.id, open.id);
    assert.equal(lowAgain[0]?.status, "completed");
    assert.equal(lowAgain[0]?.resolution, USER_COMPLETED_RESOLUTION);

    const gone = run({
      now: "2026-10-08T13:00:00.000Z",
      facts: [longStock(200)],
      baselines: again.baselines,
      tasks: again.tasks,
    });
    const cleared = gone.tasks.find((task) => task.id === open.id);
    assert.equal(cleared?.status, "completed");
    assert.equal(cleared?.resolution, CONDITION_CLEARED_RESOLUTION);
    assert.equal(openOf(gone.tasks, "TASK_LOW_STOCK").length, 0);

    const back = run({
      now: "2026-10-08T14:00:00.000Z",
      facts,
      baselines: gone.baselines,
      tasks: gone.tasks,
    });
    const reopened = openOf(back.tasks, "TASK_LOW_STOCK");
    assert.equal(reopened.length, 1);
    assert.notEqual(reopened[0]?.id, open.id);
    assert.equal(back.tasks.filter((task) => task.type === "TASK_LOW_STOCK").length, 2);
    assert.equal(back.tasks.find((task) => task.id === open.id)?.resolution, CONDITION_CLEARED_RESOLUTION);
  });

  it("keeps a future snooze on the same row and returns that row when the time comes", () => {
    const facts = [shortStock(2)];
    const first = run({ facts, baselines: { "100": baseline() } });
    const open = openOf(first.tasks, "TASK_LOW_STOCK")[0];
    assert.ok(open);
    const until = "2026-10-11T10:00:00.000Z";
    const snoozed: SellerTask = { ...open, status: "snoozed", snoozeUntil: until };
    const heldAt = Date.parse("2026-10-09T10:00:00.000Z");
    const held = run({
      now: "2026-10-09T10:00:00.000Z",
      facts,
      baselines: first.baselines,
      tasks: [snoozed],
    });
    const low = held.tasks.filter((task) => task.type === "TASK_LOW_STOCK");
    assert.equal(low.length, 1);
    assert.equal(low[0]?.id, open.id);
    assert.equal(low[0]?.status, "snoozed");
    assert.equal(low[0]?.snoozeUntil, until);
    assert.equal(isPendingSnooze(low[0]!, heldAt), true);
    assert.equal(isActionableTask(low[0]!, heldAt), false);

    const repeated = run({
      now: "2026-10-10T10:00:00.000Z",
      facts,
      baselines: held.baselines,
      tasks: held.tasks,
    });
    assert.equal(repeated.tasks.filter((task) => task.type === "TASK_LOW_STOCK").length, 1);
    assert.equal(repeated.tasks.find((task) => task.id === open.id)?.status, "snoozed");

    const due = run({
      now: until,
      facts,
      baselines: repeated.baselines,
      tasks: repeated.tasks,
    });
    const active = due.tasks.filter((task) => task.type === "TASK_LOW_STOCK");
    assert.equal(active.length, 1);
    assert.equal(active[0]?.id, open.id);
    assert.equal(active[0]?.status, "active");
    assert.equal(active[0]?.snoozeUntil, null);
    assert.equal(isActionableTask(active[0]!, Date.parse(until)), true);
  });

  it("records a cleared snooze and creates a new task when the condition returns", () => {
    const facts = [shortStock(2)];
    const first = run({ facts, baselines: { "100": baseline() } });
    const open = openOf(first.tasks, "TASK_LOW_STOCK")[0];
    assert.ok(open);
    const snoozed: SellerTask = { ...open, status: "snoozed", snoozeUntil: "2026-10-11T10:00:00.000Z" };
    const held = run({
      now: "2026-10-09T10:00:00.000Z",
      facts,
      baselines: first.baselines,
      tasks: [snoozed],
    });
    const marked = run({
      now: "2026-10-09T12:00:00.000Z",
      facts: [longStock(200)],
      baselines: held.baselines,
      tasks: held.tasks,
    });
    const gone = run({
      now: "2026-10-09T12:40:00.000Z",
      facts: [longStock(200)],
      baselines: marked.baselines,
      tasks: marked.tasks,
    });
    const closed = gone.tasks.find((task) => task.id === open.id);
    assert.equal(closed?.status, "completed");
    assert.equal(closed?.resolution, CONDITION_CLEARED_RESOLUTION);
    const back = run({
      now: "2026-10-12T10:00:00.000Z",
      facts,
      baselines: gone.baselines,
      tasks: gone.tasks,
    });
    const fresh = openOf(back.tasks, "TASK_LOW_STOCK");
    assert.equal(fresh.length, 1);
    assert.notEqual(fresh[0]?.id, open.id);
    assert.equal(back.tasks.filter((task) => task.type === "TASK_LOW_STOCK" && task.status === "completed").length, 1);
  });

  it("does not revive a dismissed task until the condition clears and returns", () => {
    const facts = [shortStock(1)];
    const created = run({ facts, baselines: { "100": baseline() } });
    const open = created.tasks.find((task) => task.type === "TASK_LOW_STOCK");
    assert.ok(open);
    const dismissed: SellerTask = { ...open, status: "dismissed" };
    const held = run({
      now: "2026-10-08T11:00:00.000Z",
      facts,
      baselines: created.baselines,
      tasks: [dismissed],
    });
    assert.equal(held.tasks.filter((task) => task.type === "TASK_LOW_STOCK").length, 1);
    assert.equal(openOf(held.tasks, "TASK_LOW_STOCK").length, 0);
    const still = run({
      now: "2026-10-08T12:00:00.000Z",
      facts,
      baselines: held.baselines,
      tasks: held.tasks,
    });
    assert.equal(still.tasks.filter((task) => task.type === "TASK_LOW_STOCK").length, 1);
    assert.equal(still.tasks.find((task) => task.id === open.id)?.status, "dismissed");

    const gone = run({
      now: "2026-10-08T13:00:00.000Z",
      facts: [longStock(200)],
      baselines: still.baselines,
      tasks: still.tasks,
    });
    assert.equal(gone.tasks.find((task) => task.id === open.id)?.status, "dismissed");
    assert.ok(gone.tasks.find((task) => task.id === open.id)?.resolvedAt);
    const back = run({
      now: "2026-10-08T14:00:00.000Z",
      facts,
      baselines: gone.baselines,
      tasks: gone.tasks,
    });
    const fresh = openOf(back.tasks, "TASK_LOW_STOCK");
    assert.equal(fresh.length, 1);
    assert.notEqual(fresh[0]?.id, open.id);
  });

  it("мерцание: пропавшее на промежуточном снимке условие не закрывает задачу, а вернувшееся снимает пометку", () => {
    const first = run({ facts: [shortStock(2)], baselines: { "100": baseline() } });
    const open = openOf(first.tasks, "TASK_LOW_STOCK")[0]!;
    // Промежуточный снимок: данных по товару нет вовсе.
    const blip = run({ now: "2026-10-08T10:05:00.000Z", facts: [], baselines: first.baselines, tasks: first.tasks });
    const during = blip.tasks.find((task) => task.id === open.id)!;
    assert.equal(during.status, "active");
    assert.equal(typeof during.evidence[ABSENT_SINCE_KEY], "string");
    // Данные вернулись минутой позже: та же задача, пометка снята, нового ряда нет.
    const back = run({ now: "2026-10-08T10:06:00.000Z", facts: [shortStock(2)], baselines: blip.baselines, tasks: blip.tasks });
    const after = back.tasks.filter((task) => task.type === "TASK_LOW_STOCK");
    assert.equal(after.length, 1);
    assert.equal(after[0]!.id, open.id);
    assert.equal(after[0]!.status, "active");
    assert.equal(ABSENT_SINCE_KEY in after[0]!.evidence, false);
  });

  it("мерцание: короткие провалы условия подряд не накапливаются в «завершённые»", () => {
    let tasks = run({ facts: [shortStock(2)], baselines: { "100": baseline() } }).tasks;
    let baselines: Record<string, TaskBaseline> = { "100": baseline() };
    for (let i = 1; i <= 6; i += 1) {
      const gone = run({ now: `2026-10-08T1${i}:00:00.000Z`, facts: [], baselines, tasks });
      const returned = run({ now: `2026-10-08T1${i}:01:00.000Z`, facts: [shortStock(2)], baselines: gone.baselines, tasks: gone.tasks });
      tasks = returned.tasks;
      baselines = returned.baselines;
    }
    assert.equal(tasks.filter((task) => task.type === "TASK_LOW_STOCK").length, 1);
    assert.equal(tasks.filter((task) => task.status === "completed").length, 0);
  });

  it("условие, отсутствующее дольше срока, закрывает задачу; отложенная задача ведёт себя так же", () => {
    const first = run({ facts: [shortStock(2)], baselines: { "100": baseline() } });
    const open = openOf(first.tasks, "TASK_LOW_STOCK")[0]!;
    const snoozed: SellerTask = { ...open, status: "snoozed", snoozeUntil: "2026-10-20T10:00:00.000Z" };
    const marked = run({ now: "2026-10-08T11:00:00.000Z", facts: [longStock(200)], baselines: first.baselines, tasks: [snoozed] });
    assert.equal(marked.tasks.find((task) => task.id === open.id)!.status, "snoozed");
    const closed = run({ now: "2026-10-08T11:31:00.000Z", facts: [longStock(200)], baselines: marked.baselines, tasks: marked.tasks });
    assert.equal(closed.tasks.find((task) => task.id === open.id)!.status, "completed");
    assert.equal(closed.tasks.find((task) => task.id === open.id)!.resolution, CONDITION_CLEARED_RESOLUTION);
  });

  it("отключили тип в настройках: открытая задача закрывается сразу (не ждёт паузы) с понятной причиной", () => {
    const first = run({ facts: [shortStock(2)], baselines: { "100": baseline() } });
    const open = openOf(first.tasks, "TASK_LOW_STOCK")[0]!;
    const off = run({ now: "2026-10-08T10:05:00.000Z", facts: [shortStock(2)], baselines: first.baselines, tasks: first.tasks, settings: settings({ disabledTypes: ["TASK_LOW_STOCK"] }) });
    const closed = off.tasks.find((task) => task.id === open.id)!;
    assert.equal(closed.status, "completed");
    assert.equal(closed.resolution, DISABLED_BY_SETTINGS_RESOLUTION);
    assert.equal(openOf(off.tasks, "TASK_LOW_STOCK").length, 0);
    // Включили обратно: задача появляется снова новой строкой.
    const on = run({ now: "2026-10-08T10:10:00.000Z", facts: [shortStock(2)], baselines: off.baselines, tasks: off.tasks });
    assert.equal(openOf(on.tasks, "TASK_LOW_STOCK").length, 1);
  });

  it("отключили тип только по одному товару: по нему задача закрыта сразу, по другому остаётся", () => {
    const two = [shortStock(2), { ...shortStock(2), nmId: "200", itemId: "item2" }];
    const first = run({ facts: two, baselines: { "100": baseline(), "200": baseline() } });
    assert.equal(openOf(first.tasks, "TASK_LOW_STOCK").length, 2);
    const off = run({
      now: "2026-10-08T10:05:00.000Z",
      facts: two,
      baselines: first.baselines,
      tasks: first.tasks,
      settings: settings({ skuOverrides: [{ nmId: "100", type: "TASK_LOW_STOCK", disabled: true }] }),
    });
    const open = openOf(off.tasks, "TASK_LOW_STOCK");
    assert.equal(open.length, 1);
    assert.equal(open[0]!.nmId, "200");
  });
});

