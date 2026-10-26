import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sortByPriority } from "@/lib/seller-hub/task-engine/priority";
import type { SellerTask, TaskActionType, TaskEvidence, TaskImpactType, TaskSeverity, TaskType } from "@/lib/seller-hub/task-engine/types";
import { buildTopActions, topActionEffect } from "./top-actions";

function task(patch: {
  id: string;
  type?: TaskType;
  severity?: TaskSeverity;
  impact?: TaskImpactType;
  evidence?: TaskEvidence;
  nmId?: string | null;
  itemId?: string | null;
  actionType?: TaskActionType;
  status?: SellerTask["status"];
  snoozeUntil?: string | null;
  productTitle?: string | null;
  score?: number;
}): SellerTask {
  return {
    id: patch.id,
    storeId: "wildberries",
    nmId: patch.nmId === undefined ? patch.id : patch.nmId,
    itemId: patch.itemId ?? null,
    productTitle: patch.productTitle ?? null,
    vendorCode: null,
    type: patch.type ?? "TASK_NO_SALES",
    category: "sales",
    severity: patch.severity ?? "important",
    status: patch.status ?? "active",
    title: patch.id,
    description: "",
    reason: "Причина из задачи",
    evidence: patch.evidence ?? {},
    recommendation: "",
    actionType: patch.actionType ?? "OPEN_PRODUCT",
    businessImpactType: patch.impact ?? "OPERATIONAL",
    score: patch.score ?? 0,
    sourceEventId: null,
    createdAt: "2026-10-08T00:00:00.000Z",
    updatedAt: "2026-10-08T00:00:00.000Z",
    snoozeUntil: patch.snoozeUntil ?? null,
    resolvedAt: null,
    resolution: null,
  };
}

describe("buildTopActions", () => {
  it("returns at most five actions", () => {
    const tasks = [
      task({ id: "c", severity: "critical", type: "TASK_STOCK_OUT", impact: "SALES_PROTECTION" }),
      task({ id: "i1", severity: "important", type: "TASK_EXCESS_STOCK", impact: "CAPITAL_RELEASE" }),
      task({ id: "i2", severity: "important", type: "TASK_LOW_STOCK", impact: "STOCK_RISK" }),
      task({ id: "o1", severity: "opportunity", type: "TASK_CONTENT_OPPORTUNITY", impact: "SALES_GROWTH" }),
      task({ id: "o2", severity: "opportunity", type: "TASK_SALES_GROWTH", impact: "SALES_GROWTH" }),
      task({ id: "o3", severity: "opportunity", type: "TASK_LOW_CONTENT_SCORE", impact: "OPERATIONAL" }),
    ];
    const actions = buildTopActions(tasks);
    assert.equal(actions.length, 5);
    assert.equal(tasks.length, 6);
  });

  it("keeps critical before important and important before opportunity", () => {
    const tasks = [
      task({
        id: "late",
        severity: "opportunity",
        type: "TASK_CONTENT_OPPORTUNITY",
        impact: "SALES_GROWTH",
        score: 9999,
        evidence: { sales_28d: 80 },
      }),
      task({
        id: "mid",
        severity: "important",
        type: "TASK_EXCESS_STOCK",
        impact: "CAPITAL_RELEASE",
        evidence: { cover_days: 200, stock: 5 },
      }),
      task({
        id: "first",
        severity: "critical",
        type: "TASK_STOCK_OUT",
        impact: "SALES_PROTECTION",
        evidence: { stock: 0 },
      }),
    ];
    assert.deepEqual(
      buildTopActions(tasks).map((action) => action.id),
      sortByPriority(tasks).map((item) => item.id),
    );
    assert.deepEqual(
      buildTopActions(tasks).map((action) => action.primary.severity),
      ["critical", "important", "opportunity"],
    );
  });

  it("folds no-sales and weak content on one sku into one action", () => {
    const tasks = [
      task({
        id: "sales",
        nmId: "100",
        type: "TASK_NO_SALES",
        severity: "important",
        impact: "CAPITAL_RELEASE",
        actionType: "OPEN_PRODUCT",
        productTitle: "Строительное ведро 12 л",
        evidence: { sales_28d: 0, stock: 15, sitting_rub: 117_000 },
      }),
      task({
        id: "content",
        nmId: "100",
        type: "TASK_LOW_CONTENT_SCORE",
        severity: "important",
        impact: "OPERATIONAL",
        actionType: "OPEN_CONTENT_EDITOR",
        evidence: { content_score: 40 },
      }),
    ];
    const before = tasks.map((item) => item.id);
    const actions = buildTopActions(tasks);
    assert.equal(actions.length, 1);
    assert.equal(actions[0]?.primary.type, "TASK_NO_SALES");
    assert.deepEqual(
      actions[0]?.supporting.map((item) => item.type),
      ["TASK_LOW_CONTENT_SCORE"],
    );
    assert.deepEqual(
      tasks.map((item) => item.id),
      before,
    );
    assert.equal(actions[0]?.supportNote, "Дополнительно: слабый контент");
  });

  it("folds excess stock and content opportunity on one sku into one action", () => {
    const tasks = [
      task({
        id: "excess",
        nmId: "200",
        type: "TASK_EXCESS_STOCK",
        severity: "important",
        impact: "CAPITAL_RELEASE",
        actionType: "OPEN_STOCKS",
        evidence: { stock: 5, cover_days: 400, sitting_rub: 78_600 },
      }),
      task({
        id: "chance",
        nmId: "200",
        type: "TASK_CONTENT_OPPORTUNITY",
        severity: "opportunity",
        impact: "SALES_GROWTH",
        evidence: { sales_28d: 12, content_score: 60 },
      }),
    ];
    const actions = buildTopActions(tasks);
    assert.equal(actions.length, 1);
    assert.equal(actions[0]?.primary.id, "excess");
    assert.equal(actions[0]?.supporting[0]?.id, "chance");
    assert.equal(tasks.length, 2);
  });

  it("keeps a store question separate from a product", () => {
    const tasks = [
      task({
        id: "sku",
        nmId: "300",
        type: "TASK_NO_SALES",
        severity: "opportunity",
        impact: "STOCK_RISK",
      }),
      task({
        id: "questions",
        nmId: null,
        type: "TASK_UNANSWERED_QUESTIONS",
        severity: "important",
        impact: "OPERATIONAL",
        actionType: "OPEN_QUESTIONS",
        evidence: { unanswered_questions: 4 },
      }),
    ];
    const actions = buildTopActions(tasks);
    assert.equal(actions.length, 2);
    const questions = actions.find((action) => action.id === "questions");
    assert.ok(questions);
    assert.equal(questions.primary.nmId, null);
    assert.equal(questions.actionType, "OPEN_QUESTIONS");
    assert.equal(actions.find((action) => action.id === "sku")?.supporting.length, 0);
  });

  it("returns nothing when there is no current work", () => {
    assert.deepEqual(buildTopActions([]), []);
    const done = task({ id: "done", status: "completed" });
    const snoozed = task({ id: "later", status: "snoozed", severity: "critical" });
    assert.deepEqual(buildTopActions([done, snoozed]), []);
  });

  it("excludes a future snooze and a dismissal, and keeps an expired snooze", () => {
    const now = Date.parse("2026-10-08T10:00:00.000Z");
    const future = task({
      id: "later",
      status: "snoozed",
      severity: "critical",
      snoozeUntil: "2026-10-15T10:00:00.000Z",
    });
    const expired = task({
      id: "back",
      status: "snoozed",
      severity: "important",
      snoozeUntil: "2026-10-08T09:00:00.000Z",
    });
    const dismissed = task({ id: "hide", status: "dismissed", severity: "critical" });
    const actions = buildTopActions([future, expired, dismissed], now);
    assert.deepEqual(
      actions.map((action) => action.id),
      ["back"],
    );
  });

  it("uses the same order as the full list and keeps the stronger task of a sku", () => {
    const tasks = [
      task({
        id: "a-weak",
        nmId: "sku",
        type: "TASK_CONTENT_OPPORTUNITY",
        severity: "opportunity",
        impact: "SALES_GROWTH",
        evidence: { sales_28d: 3 },
      }),
      task({
        id: "a-strong",
        nmId: "sku",
        type: "TASK_EXCESS_STOCK",
        severity: "important",
        impact: "CAPITAL_RELEASE",
        evidence: { sitting_rub: 6664, cover_days: 200 },
      }),
      task({ id: "b", nmId: "other", type: "TASK_STOCK_OUT", severity: "critical", impact: "SALES_PROTECTION" }),
      task({
        id: "c",
        nmId: "third",
        type: "TASK_EXCESS_STOCK",
        severity: "important",
        impact: "CAPITAL_RELEASE",
        evidence: { cover_days: 2772, stock: 99 },
      }),
    ];
    const actions = buildTopActions(tasks);
    const seen = new Set<string>();
    const grouped: string[] = [];
    for (const item of sortByPriority(tasks)) {
      const key = item.nmId ?? item.id;
      if (seen.has(key)) continue;
      seen.add(key);
      grouped.push(item.id);
    }
    assert.deepEqual(
      actions.map((action) => action.id),
      grouped,
    );
    assert.equal(actions.find((action) => action.primary.nmId === "sku")?.primary.id, "a-strong");
    assert.deepEqual(sortByPriority(tasks).map((item) => item.severity), ["critical", "important", "important", "opportunity"]);
  });

  it("uses the primary task destination", () => {
    const tasks = [
      task({
        id: "stocks",
        type: "TASK_EXCESS_STOCK",
        severity: "important",
        impact: "CAPITAL_RELEASE",
        actionType: "OPEN_STOCKS",
      }),
    ];
    const action = buildTopActions(tasks)[0];
    assert.equal(action?.actionType, "OPEN_STOCKS");
    assert.equal(action?.actionType, action?.primary.actionType);
  });
});

describe("top action effect", () => {
  it("uses a capital sentence for no-sales only when sitting rub is present", () => {
    const withMoney = topActionEffect({
      type: "TASK_NO_SALES",
      evidence: { sales_28d: 0, stock: 15, sitting_rub: 117_000 },
    });
    const withoutMoney = topActionEffect({
      type: "TASK_NO_SALES",
      evidence: { sales_28d: 0, stock: 99, cover_days: 2772 },
    });
    assert.equal(withMoney, "Товар занимает капитал, но за последние 28 дней не принёс продаж.");
    assert.equal(withoutMoney, "Товар остаётся в запасе без продаж за последние 28 дней.");
    assert.equal(withoutMoney.includes("₽"), false);
    assert.equal(withoutMoney.includes("117"), false);
  });

  it("does not invent capital or a year forecast for a long excess cover", () => {
    const effect = topActionEffect({
      type: "TASK_EXCESS_STOCK",
      evidence: { stock: 99, cover_days: 2772 },
    });
    assert.equal(effect, "При текущем темпе продаж запас значительно превышает потребность.");
    assert.equal(effect.includes("₽"), false);
    assert.equal(effect.includes("лет"), false);
    assert.equal(
      topActionEffect({ type: "TASK_EXCESS_STOCK", evidence: { cover_days: 200, stock: 40 } }),
      "Текущий объём запаса значительно превышает потребность при текущем темпе продаж.",
    );
  });

  it("keeps a separate sentence for each listed task type", () => {
    const effects = [
      topActionEffect({ type: "TASK_LOW_STOCK", evidence: { cover_days: 3, stock: 2 } }),
      topActionEffect({ type: "TASK_STOCK_OUT", evidence: { stock: 0 } }),
      topActionEffect({ type: "TASK_SALES_DROP", evidence: { sales_delta_units: -10 } }),
      topActionEffect({ type: "TASK_SALES_GROWTH", evidence: { sales_delta_units: 8 } }),
      topActionEffect({ type: "TASK_NEGATIVE_MARGIN", evidence: { margin_rub: -40 } }),
      topActionEffect({ type: "TASK_MARGIN_DETERIORATION", evidence: { margin_drop_points: 6 } }),
      topActionEffect({ type: "TASK_LOW_CONTENT_SCORE", evidence: { content_score: 40 } }),
      topActionEffect({ type: "TASK_CONTENT_OPPORTUNITY", evidence: { sales_28d: 12, content_score: 60 } }),
      topActionEffect({ type: "TASK_STAGNANT_CAPITAL", evidence: { sitting_rub: 8000, stock: 20 } }),
      topActionEffect({ type: "TASK_UNANSWERED_REVIEWS", evidence: { unanswered_feedbacks: 3 } }),
      topActionEffect({ type: "TASK_UNANSWERED_QUESTIONS", evidence: { unanswered_questions: 4 } }),
    ];
    assert.deepEqual(effects, [
      "Текущего запаса может не хватить на ближайший период продаж.",
      "Продажи товара сейчас ограничены отсутствием остатка.",
      "Продажи товара снизились относительно предыдущего периода.",
      "Спрос на товар вырос относительно предыдущего периода.",
      "Текущая цена не покрывает рассчитанную себестоимость товара.",
      "Маржа товара снизилась относительно предыдущего периода.",
      "Карточка товара требует улучшения по текущей оценке контента.",
      "Товар уже получает продажи, но карточка имеет потенциал для улучшения.",
      "Часть капитала связана в запасе, который продаётся медленнее текущего уровня потребности.",
      "Покупатели оставили отзывы, на которые ещё нет ответа.",
      "В магазине есть вопросы покупателей без ответа.",
    ]);
    assert.equal(new Set(effects).size, effects.length);
    for (const effect of effects) assert.equal(effect.includes("TASK_"), false);
  });

  it("does not claim a negative margin without a negative figure", () => {
    const effect = topActionEffect({ type: "TASK_NEGATIVE_MARGIN", evidence: { stock: 10 } });
    assert.equal(effect, "Отрицательная маржа в этих данных не показана.");
  });
});
