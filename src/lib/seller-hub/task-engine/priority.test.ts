import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareByPriority, priorityRank, sortByPriority } from "./priority";
import type { SellerTask, TaskEvidence, TaskImpactType, TaskSeverity, TaskType } from "./types";

function task(patch: {
  id?: string;
  type?: TaskType;
  severity?: TaskSeverity;
  impact?: TaskImpactType;
  evidence?: TaskEvidence;
  nmId?: string | null;
}): SellerTask {
  return {
    id: patch.id ?? "t",
    storeId: "wildberries",
    nmId: patch.nmId === undefined ? "1" : patch.nmId,
    itemId: null,
    productTitle: null,
    vendorCode: null,
    type: patch.type ?? "TASK_NO_SALES",
    category: "sales",
    severity: patch.severity ?? "important",
    status: "active",
    title: "",
    description: "",
    reason: "",
    evidence: patch.evidence ?? {},
    recommendation: "",
    actionType: "NONE",
    businessImpactType: patch.impact ?? "CAPITAL_RELEASE",
    score: 0,
    sourceEventId: null,
    createdAt: "2026-10-08T00:00:00.000Z",
    updatedAt: "2026-10-08T00:00:00.000Z",
    snoozeUntil: null,
    resolvedAt: null,
    resolution: null,
  };
}

describe("priority", () => {
  it("ranks a larger sitting sum above a smaller one", () => {
    const large = task({ id: "large", evidence: { sitting_rub: 117_000, stock: 10 } });
    const small = task({ id: "small", evidence: { sitting_rub: 8_000, stock: 400 } });
    assert.ok(compareByPriority(large, small) < 0);
  });

  it("uses excess cover when there is no capital, and capital when there is", () => {
    const long = task({
      id: "long",
      type: "TASK_EXCESS_STOCK",
      evidence: { cover_days: 2772, stock: 10 },
    });
    const shorter = task({
      id: "short",
      type: "TASK_EXCESS_STOCK",
      evidence: { cover_days: 500, stock: 10 },
    });
    assert.ok(compareByPriority(long, shorter) < 0);

    const richShort = task({
      id: "rich",
      type: "TASK_EXCESS_STOCK",
      evidence: { sitting_rub: 52_000, cover_days: 200 },
    });
    const poorLong = task({
      id: "poor",
      type: "TASK_EXCESS_STOCK",
      evidence: { sitting_rub: 8_000, cover_days: 2772 },
    });
    assert.ok(compareByPriority(richShort, poorLong) < 0);
  });

  it("does not let an unknown long cover outrank confirmed capital on the same impact", () => {
    const unknown = task({
      id: "unknown",
      type: "TASK_EXCESS_STOCK",
      evidence: { cover_days: 2772, stock: 99 },
    });
    const confirmed = task({
      id: "confirmed",
      type: "TASK_EXCESS_STOCK",
      evidence: { sitting_rub: 6664, cover_days: 2772, stock: 99 },
    });
    assert.equal(priorityRank(unknown).money, null);
    assert.equal(priorityRank(confirmed).money, 6664);
    assert.ok(compareByPriority(confirmed, unknown) < 0);
    const critical = task({
      id: "critical",
      severity: "critical",
      type: "TASK_STOCK_OUT",
      impact: "SALES_PROTECTION",
    });
    assert.deepEqual(sortByPriority([unknown, confirmed, critical]).map((item) => item.id), ["critical", "confirmed", "unknown"]);
  });

  it("ranks a larger confirmed sales drop above a steep drop of a few units", () => {
    const few = task({
      id: "few",
      type: "TASK_SALES_DROP",
      impact: "SALES_PROTECTION",
      evidence: { sales_delta_units: -2, change_percent: -60, current_sales_28d: 2, previous_sales_28d: 5 },
    });
    const many = task({
      id: "many",
      type: "TASK_SALES_DROP",
      impact: "SALES_PROTECTION",
      evidence: { sales_delta_units: -100, change_percent: -30, current_sales_28d: 233, previous_sales_28d: 333 },
    });
    assert.ok(compareByPriority(many, few) < 0);
  });

  it("ranks a content opportunity with more sales higher inside opportunity", () => {
    const busy = task({
      id: "busy",
      type: "TASK_CONTENT_OPPORTUNITY",
      severity: "opportunity",
      impact: "SALES_GROWTH",
      evidence: { sales_28d: 80, content_score: 40 },
    });
    const quiet = task({
      id: "quiet",
      type: "TASK_CONTENT_OPPORTUNITY",
      severity: "opportunity",
      impact: "SALES_GROWTH",
      evidence: { sales_28d: 5, content_score: 40 },
    });
    const ordered = sortByPriority([quiet, busy]);
    assert.deepEqual(ordered.map((item) => item.id), ["busy", "quiet"]);
    assert.equal(ordered[0]?.severity, "opportunity");
  });

  it("ranks a shorter cover above a longer one for low stock", () => {
    const soon = task({
      id: "soon",
      type: "TASK_LOW_STOCK",
      impact: "STOCK_RISK",
      evidence: { cover_days: 2, stock: 3, daily_pace: 1.5 },
    });
    const later = task({
      id: "later",
      type: "TASK_LOW_STOCK",
      impact: "STOCK_RISK",
      evidence: { cover_days: 6, stock: 12, daily_pace: 2 },
    });
    assert.ok(compareByPriority(soon, later) < 0);
  });

  it("does not throw when evidence is missing", () => {
    const empty = task({ id: "empty", evidence: {} });
    assert.equal(Number.isFinite(priorityRank(empty).score), true);
    assert.equal(priorityRank(empty).money, null);
    assert.doesNotThrow(() => sortByPriority([empty, task({ id: "also", type: "TASK_LOW_STOCK", evidence: {} })]));
  });

  it("keeps opportunity below important and important below critical", () => {
    const critical = task({ id: "c", severity: "critical", impact: "SALES_PROTECTION", type: "TASK_STOCK_OUT", evidence: {} });
    const important = task({ id: "i", severity: "important", impact: "OPERATIONAL", type: "TASK_LOW_CONTENT_SCORE", evidence: {} });
    const opportunity = task({
      id: "o",
      severity: "opportunity",
      impact: "SALES_GROWTH",
      type: "TASK_SALES_GROWTH",
      evidence: { sitting_rub: 500_000, current_sales_28d: 400, sales_delta_units: 400, cover_days: 1 },
    });
    assert.deepEqual(sortByPriority([opportunity, important, critical]).map((item) => item.id), ["c", "i", "o"]);
  });

  it("keeps the same tasks after sorting", () => {
    const rows = [
      task({ id: "a", evidence: { sitting_rub: 1 } }),
      task({ id: "b", severity: "opportunity", impact: "OPERATIONAL", type: "TASK_UNANSWERED_QUESTIONS", nmId: null, evidence: { unanswered_questions: 1 } }),
      task({ id: "c", severity: "critical", impact: "SALES_PROTECTION", type: "TASK_STOCK_OUT" }),
    ];
    const sorted = sortByPriority(rows);
    assert.equal(sorted.length, rows.length);
    assert.deepEqual(sorted.map((item) => item.id).sort(), ["a", "b", "c"]);
    assert.equal(rows[0]?.id, "a");
  });

  it("returns the same order when the same tasks are sorted twice", () => {
    const rows = [
      task({
        id: "z",
        type: "TASK_SALES_DROP",
        impact: "SALES_PROTECTION",
        evidence: { sales_delta_units: -12, change_percent: -40 },
      }),
      task({
        id: "m",
        type: "TASK_LOW_STOCK",
        impact: "STOCK_RISK",
        evidence: { cover_days: 3, stock: 4, daily_pace: 1 },
      }),
      task({
        id: "a",
        severity: "opportunity",
        impact: "SALES_GROWTH",
        type: "TASK_CONTENT_OPPORTUNITY",
        evidence: { sales_28d: 40, content_score: 35 },
      }),
      task({ id: "c", severity: "critical", impact: "SALES_PROTECTION", type: "TASK_STOCK_OUT" }),
    ];
    const first = sortByPriority(rows).map((item) => item.id);
    const second = sortByPriority([...rows].reverse()).map((item) => item.id);
    assert.deepEqual(first, second);
    assert.deepEqual(first, ["c", "z", "m", "a"]);
  });

  it("breaks a full tie with id localeCompare", () => {
    const shared = {
      type: "TASK_LOW_STOCK" as const,
      impact: "STOCK_RISK" as const,
      severity: "important" as const,
      evidence: { cover_days: 4, stock: 8, daily_pace: 2 },
    };
    const left = task({ id: "nm-200", ...shared });
    const right = task({ id: "nm-100", ...shared });
    assert.equal(priorityRank(left).score, priorityRank(right).score);
    assert.equal(priorityRank(left).urgency, priorityRank(right).urgency);
    assert.ok(compareByPriority(right, left) < 0);
    assert.deepEqual(sortByPriority([left, right]).map((item) => item.id), ["nm-100", "nm-200"]);
  });

  it("applies scaleBonus for no-sales, unanswered reviews, and margin drop", () => {
    const oldNoSales = task({
      id: "old",
      type: "TASK_NO_SALES",
      impact: "CAPITAL_RELEASE",
      evidence: { stock: 120, age_days: 200, sales_28d: 0 },
    });
    const youngNoSales = task({
      id: "young",
      type: "TASK_NO_SALES",
      impact: "CAPITAL_RELEASE",
      evidence: { stock: 5, age_days: 10, sales_28d: 0 },
    });
    assert.ok(compareByPriority(oldNoSales, youngNoSales) < 0);

    const manyReviews = task({
      id: "many-r",
      type: "TASK_UNANSWERED_REVIEWS",
      impact: "OPERATIONAL",
      nmId: null,
      evidence: { unanswered_feedbacks: 18 },
    });
    const fewReviews = task({
      id: "few-r",
      type: "TASK_UNANSWERED_REVIEWS",
      impact: "OPERATIONAL",
      nmId: null,
      evidence: { unanswered_feedbacks: 2 },
    });
    assert.ok(compareByPriority(manyReviews, fewReviews) < 0);

    const deepMargin = task({
      id: "deep-m",
      type: "TASK_MARGIN_DETERIORATION",
      impact: "PROFIT_PROTECTION",
      evidence: { margin_drop_points: 22, margin_percent: 4 },
    });
    const mildMargin = task({
      id: "mild-m",
      type: "TASK_MARGIN_DETERIORATION",
      impact: "PROFIT_PROTECTION",
      evidence: { margin_drop_points: 6, margin_percent: 12 },
    });
    assert.ok(compareByPriority(deepMargin, mildMargin) < 0);
  });
});
