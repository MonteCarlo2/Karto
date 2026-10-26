import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFeedbacksSnapshot, STALE_MS } from "@/lib/seller-hub/feedbacks/build-snapshot";
import type { SellerFeedbackRow, SellerQuestionRow } from "@/lib/seller-hub/feedbacks/types";
import { DEFAULT_TASK_SETTINGS } from "./config";
import { reconcileTasks } from "./engine";
import { fisherExactOneSidedGreater } from "./stats";
import {
  collectNegativeShareCandidates,
  elevateNegativeShareWithConversion,
  finalizeNegativeShareDrafts,
  ruleFeedbacksAccess,
  ruleUnansweredNegativeReview,
  ruleUnansweredPositiveReviews,
  ruleUnansweredQuestion,
} from "./reviews";
import type { SellerTask, TaskBaseline, TaskDraft, TaskFact } from "./types";
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

function feedback(
  patch: Partial<SellerFeedbackRow> & Pick<SellerFeedbackRow, "id" | "rating" | "createdAt" | "answered">,
): SellerFeedbackRow {
  return {
    nmId: "100",
    answeredAt: patch.answered ? patch.createdAt : null,
    text: patch.text ?? "текст",
    pros: "",
    cons: "",
    orderStatus: "buyout",
    state: "wbRu",
    imtId: null,
    parentFeedbackId: null,
    childFeedbackId: null,
    countsOnCard: true,
    ...patch,
  };
}

function question(
  patch: Partial<SellerQuestionRow> & Pick<SellerQuestionRow, "id" | "createdAt" | "answered">,
): SellerQuestionRow {
  return {
    nmId: "100",
    answeredAt: patch.answered ? patch.createdAt : null,
    text: patch.text ?? "вопрос",
    ...patch,
  };
}

function hoursAgo(nowIso: string, hours: number): string {
  return new Date(Date.parse(nowIso) - hours * 3_600_000).toISOString();
}

function daysAgo(nowIso: string, days: number): string {
  return new Date(Date.parse(nowIso) - days * 86_400_000).toISOString();
}

describe("fisherExactOneSidedGreater — рост доли негатива", () => {
  it("окно 7/20 против базы 6/60 → p ≈ 0.0148", () => {
    const p = fisherExactOneSidedGreater(7, 13, 6, 54);
    assert.ok(Math.abs(p - 0.0148) < 0.0005, `p=${p}`);
  });

  it("окно 2/10 против базы 6/60 → p ≈ 0.320", () => {
    const p = fisherExactOneSidedGreater(2, 8, 6, 54);
    assert.ok(Math.abs(p - 0.32) < 0.01, `p=${p}`);
  });

  it("окно 3/8 против базы 2/40 → p ≈ 0.0272", () => {
    const p = fisherExactOneSidedGreater(3, 5, 2, 38);
    assert.ok(Math.abs(p - 0.0272) < 0.001, `p=${p}`);
  });
});

describe("TASK_NEGATIVE_SHARE_UP", () => {
  it("окно 7/20, база 6/60 → задача есть (один товар, BH проходит)", () => {
    const candidates = collectNegativeShareCandidates([
      fact({
        negativeWindowNeg: 7,
        negativeWindowN: 20,
        negativeBaseNeg: 6,
        negativeBaseN: 60,
        windowNegativeReviews: [
          { id: "n1", createdAt: "2026-10-01T00:00:00.000Z", rating: 1, preview: "плохо" },
        ],
      }),
    ]);
    assert.equal(candidates.length, 1);
    assert.ok(Math.abs(candidates[0]!.pValue - 0.0148) < 0.0005);
    const drafts = finalizeNegativeShareDrafts(candidates);
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0]!.type, "TASK_NEGATIVE_SHARE_UP");
    assert.equal(drafts[0]!.baseSeverity, "opportunity");
    assert.match(drafts[0]!.description, /7 из 20/);
    assert.match(drafts[0]!.description, /6 из 60/);
  });

  it("окно 2/10, база 6/60 → задачи нет", () => {
    const drafts = finalizeNegativeShareDrafts(
      collectNegativeShareCandidates([
        fact({
          negativeWindowNeg: 2,
          negativeWindowN: 10,
          negativeBaseNeg: 6,
          negativeBaseN: 60,
        }),
      ]),
    );
    assert.equal(drafts.length, 0);
  });

  it("окно 3/8, база 2/40 → задача есть", () => {
    const drafts = finalizeNegativeShareDrafts(
      collectNegativeShareCandidates([
        fact({
          negativeWindowNeg: 3,
          negativeWindowN: 8,
          negativeBaseNeg: 2,
          negativeBaseN: 40,
        }),
      ]),
    );
    assert.equal(drafts.length, 1);
  });

  it("окно 4 отзыва, все негативные → задачи нет (< 5 в окне)", () => {
    const drafts = finalizeNegativeShareDrafts(
      collectNegativeShareCandidates([
        fact({
          negativeWindowNeg: 4,
          negativeWindowN: 4,
          negativeBaseNeg: 10,
          negativeBaseN: 40,
        }),
      ]),
    );
    assert.equal(drafts.length, 0);
  });

  it("поднимает важность, если есть TASK_CONVERSION_DROP с деньгами", () => {
    const share: TaskDraft = {
      type: "TASK_NEGATIVE_SHARE_UP",
      category: "reviews",
      nmId: "100",
      itemId: "item",
      productTitle: "Товар",
      vendorCode: "ART",
      baseSeverity: "opportunity",
      severityFloor: "opportunity",
      severityCeiling: "opportunity",
      title: "Рост доли негатива",
      description: "Негативных стало больше.",
      reason: "тест",
      evidence: {},
      recommendation: "разберите",
      actionType: "OPEN_REVIEW_RESPONSES",
      businessImpactType: "OPERATIONAL",
      eventKind: null,
    };
    const conv: TaskDraft = {
      ...share,
      type: "TASK_CONVERSION_DROP",
      category: "sales",
      baseSeverity: "important",
      severityFloor: "important",
      severityCeiling: "critical",
      title: "Падение конверсии",
      description: "Конверсия упала",
      evidence: { money_at_risk: 12_500 },
      actionType: "OPEN_PRODUCT",
      businessImpactType: "SALES_PROTECTION",
    };
    const [elevated] = elevateNegativeShareWithConversion([share, conv]);
    assert.equal(elevated?.baseSeverity, "important");
    assert.equal(elevated?.evidence.money_at_risk, 12_500);
    assert.match(elevated?.description ?? "", /12\s?500/);
  });
});

describe("неотвеченные отзывы и вопросы", () => {
  const now = "2026-10-14T12:00:00.000Z";

  it("отзыв 2★ без ответа 23 часа → задачи нет", () => {
    const snap = buildFeedbacksSnapshot({
      feedbacks: [
        feedback({
          id: "f23",
          rating: 2,
          answered: false,
          createdAt: hoursAgo(now, 23),
        }),
      ],
      questions: [],
      nowIso: now,
      status: "ok",
      dateFrom: "2026-04-18",
      dateTo: "2026-10-14",
    });
    assert.equal(snap.byNm["100"]?.staleNegatives.length, 0);
    assert.equal(
      ruleUnansweredNegativeReview(
        fact({
          orders: 3,
          staleNegativeReviews:
            snap.byNm["100"]?.staleNegatives.map((r) => ({
              id: r.id,
              createdAt: r.createdAt,
              rating: r.rating,
              preview: r.text,
              countsOnCard: r.countsOnCard,
            })) ?? [],
        }),
      ),
      null,
    );
  });

  it("отзыв 2★ 25 часов, заказы 3, на карточке → Важно", () => {
    const createdAt = hoursAgo(now, 25);
    assert.ok(Date.parse(now) - Date.parse(createdAt) >= STALE_MS);
    const draft = ruleUnansweredNegativeReview(
      fact({
        orders: 3,
        salesQty: 0,
        staleNegativeReviews: [
          { id: "f25", createdAt, rating: 2, preview: "плохо", countsOnCard: true },
        ],
      }),
    );
    assert.equal(draft?.type, "TASK_UNANSWERED_NEGATIVE_REVIEW");
    assert.equal(draft?.baseSeverity, "important");
  });

  it("отзыв 2★ 25 часов, заказы 3, не на карточке (отмена) → Возможность", () => {
    const draft = ruleUnansweredNegativeReview(
      fact({
        orders: 3,
        salesQty: 0,
        staleNegativeReviews: [
          {
            id: "f25rej",
            createdAt: hoursAgo(now, 25),
            rating: 2,
            preview: "плохо",
            countsOnCard: false,
          },
        ],
      }),
    );
    assert.equal(draft?.baseSeverity, "opportunity");
    assert.match(draft?.description ?? "", /не видят/i);
  });

  it("отзыв 1★ 30 часов, товар с заказами, countsOnCard=false → Возможность", () => {
    const draft = ruleUnansweredNegativeReview(
      fact({
        orders: 12,
        salesQty: 8,
        staleNegativeReviews: [
          {
            id: "f1star",
            createdAt: hoursAgo(now, 30),
            rating: 1,
            preview: "брак",
            countsOnCard: false,
          },
        ],
      }),
    );
    assert.equal(draft?.type, "TASK_UNANSWERED_NEGATIVE_REVIEW");
    assert.equal(draft?.baseSeverity, "opportunity");
    assert.equal(draft?.severityCeiling, "opportunity");
    assert.match(draft?.description ?? "", /не видят/i);
  });

  it("отзыв 2★ 25 часов, заказов 0 → Возможность", () => {
    const draft = ruleUnansweredNegativeReview(
      fact({
        orders: 0,
        salesQty: 0,
        staleNegativeReviews: [
          {
            id: "f25b",
            createdAt: hoursAgo(now, 25),
            rating: 2,
            preview: "плохо",
            countsOnCard: true,
          },
        ],
      }),
    );
    assert.equal(draft?.baseSeverity, "opportunity");
  });

  it("вопрос без ответа 30 часов, заказов 0 → Возможность", () => {
    const draft = ruleUnansweredQuestion(
      fact({
        orders: 0,
        salesQty: 0,
        staleQuestions: [
          { id: "q30", createdAt: hoursAgo(now, 30), preview: "есть размер?" },
        ],
      }),
    );
    assert.equal(draft?.type, "TASK_UNANSWERED_QUESTION");
    assert.equal(draft?.baseSeverity, "opportunity");
  });

  it("позитивные без ответа → одна задача магазина", () => {
    const draft = ruleUnansweredPositiveReviews({
      unansweredFeedbacks: null,
      unansweredQuestions: null,
      feedbacksStatus: "ok",
      unansweredPositiveCount: 12,
      unansweredPositiveProductCount: 4,
    });
    assert.equal(draft?.type, "TASK_UNANSWERED_POSITIVE_REVIEWS");
    assert.equal(draft?.nmId, null);
    assert.equal(draft?.baseSeverity, "opportunity");
    assert.match(draft?.description ?? "", /12/);
    assert.match(draft?.description ?? "", /4/);
  });
});

describe("нет доступа к отзывам", () => {
  it("forbidden → одна задача магазина, остальные правила отзывов не создаются", () => {
    assert.equal(
      ruleFeedbacksAccess({
        unansweredFeedbacks: null,
        unansweredQuestions: null,
        feedbacksStatus: "forbidden",
        unansweredPositiveCount: 5,
        unansweredPositiveProductCount: 2,
      })?.type,
      "TASK_FEEDBACKS_ACCESS",
    );

    const result = reconcileTasks({
      now: "2026-10-14T12:00:00.000Z",
      storeId: "store",
      facts: [
        fact({
          orders: 5,
          staleNegativeReviews: [
            {
              id: "x",
              createdAt: "2026-10-10T00:00:00.000Z",
              rating: 1,
              preview: "брак",
              countsOnCard: true,
            },
          ],
          staleQuestions: [{ id: "q", createdAt: "2026-10-10T00:00:00.000Z", preview: "?" }],
          negativeWindowNeg: 7,
          negativeWindowN: 20,
          negativeBaseNeg: 6,
          negativeBaseN: 60,
        }),
      ],
      store: {
        unansweredFeedbacks: null,
        unansweredQuestions: null,
        feedbacksStatus: "forbidden",
        unansweredPositiveCount: 9,
        unansweredPositiveProductCount: 3,
      },
      settings: DEFAULT_TASK_SETTINGS,
      tasks: [] as SellerTask[],
      baselines: {} as Record<string, TaskBaseline>,
      events: [],
    });

    const reviewTypes = result.tasks
      .filter((t) => t.status === "active" || t.status === "in_progress")
      .map((t) => t.type)
      .filter(
        (t) =>
          t === "TASK_FEEDBACKS_ACCESS" ||
          t === "TASK_UNANSWERED_NEGATIVE_REVIEW" ||
          t === "TASK_UNANSWERED_QUESTION" ||
          t === "TASK_UNANSWERED_POSITIVE_REVIEWS" ||
          t === "TASK_NEGATIVE_SHARE_UP",
      );
    assert.deepEqual(reviewTypes, ["TASK_FEEDBACKS_ACCESS"]);
  });
});

describe("buildFeedbacksSnapshot окна", () => {
  it("считает окно 28д и базу 152д", () => {
    const now = "2026-10-14T12:00:00.000Z";
    const snap = buildFeedbacksSnapshot({
      feedbacks: [
        ...Array.from({ length: 7 }, (_, i) =>
          feedback({
            id: `w${i}`,
            rating: 1,
            answered: true,
            createdAt: daysAgo(now, 5),
          }),
        ),
        ...Array.from({ length: 13 }, (_, i) =>
          feedback({
            id: `wg${i}`,
            rating: 5,
            answered: true,
            createdAt: daysAgo(now, 5),
          }),
        ),
        ...Array.from({ length: 6 }, (_, i) =>
          feedback({
            id: `b${i}`,
            rating: 2,
            answered: true,
            createdAt: daysAgo(now, 60),
          }),
        ),
        ...Array.from({ length: 54 }, (_, i) =>
          feedback({
            id: `bg${i}`,
            rating: 5,
            answered: true,
            createdAt: daysAgo(now, 60),
          }),
        ),
      ],
      questions: [
        question({ id: "q1", answered: false, createdAt: hoursAgo(now, 30) }),
      ],
      nowIso: now,
      status: "ok",
      dateFrom: "2026-04-18",
      dateTo: "2026-10-14",
    });
    const row = snap.byNm["100"]!;
    assert.equal(row.windowNeg, 7);
    assert.equal(row.windowN, 20);
    assert.equal(row.baseNeg, 6);
    assert.equal(row.baseN, 60);
    assert.equal(row.unansweredQuestions, 1);
    assert.equal(row.staleQuestions.length, 1);
  });
});
