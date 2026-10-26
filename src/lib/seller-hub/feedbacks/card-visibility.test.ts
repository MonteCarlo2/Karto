import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFeedbacksSnapshot } from "./build-snapshot";
import { feedbackCountsOnCard } from "./card-visibility";
import { mapWbFeedback } from "./map";
import type { SellerFeedbackRow } from "./types";
import type { WbFeedback } from "@/lib/services/wildberries/types";

function row(patch: Partial<SellerFeedbackRow> & Pick<SellerFeedbackRow, "id" | "nmId" | "rating" | "createdAt">): SellerFeedbackRow {
  return {
    answered: true,
    answeredAt: patch.createdAt,
    text: "",
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

describe("feedbackCountsOnCard", () => {
  it("excludes rejected orders (не на карточке покупателя)", () => {
    assert.equal(feedbackCountsOnCard({ orderStatus: "rejected", childFeedbackId: null }), false);
  });

  it("excludes superseded parent when childFeedbackId set", () => {
    assert.equal(feedbackCountsOnCard({ orderStatus: "buyout", childFeedbackId: "child1" }), false);
  });

  it("includes buyout and returned", () => {
    assert.equal(feedbackCountsOnCard({ orderStatus: "buyout", childFeedbackId: null }), true);
    assert.equal(feedbackCountsOnCard({ orderStatus: "returned", childFeedbackId: null }), true);
  });
});

describe("mapWbFeedback + snapshot", () => {
  it("maps rejected → countsOnCard false; rating uses only card-visible", () => {
    const raw: WbFeedback = {
      id: "okRxQpDIgvxfFGY8ydpq",
      productValuation: 1,
      createdDate: "2026-10-07T18:14:30.257Z",
      state: "wbRu",
      orderStatus: "rejected",
      answer: { text: "ok ответ", state: "wbRu", createDate: "2026-10-07T18:20:00Z" },
      productDetails: { nmId: 999504735, imtId: 1796814889 },
      parentFeedbackId: null,
      childFeedbackId: null,
    };
    const mapped = mapWbFeedback(raw);
    assert.equal(mapped?.countsOnCard, false);
    assert.equal(mapped?.orderStatus, "rejected");
    assert.equal(mapped?.imtId, "1796814889");

    const now = "2026-10-14T12:00:00.000Z";
    const snap = buildFeedbacksSnapshot({
      feedbacks: [
        mapped!,
        row({
          id: "buy1",
          nmId: "999504735",
          rating: 5,
          createdAt: "2026-10-01T00:00:00.000Z",
          orderStatus: "buyout",
          countsOnCard: true,
        }),
      ],
      questions: [],
      nowIso: now,
      status: "ok",
      dateFrom: "2026-04-18",
      dateTo: "2026-10-14",
    });
    const nm = snap.byNm["999504735"]!;
    assert.equal(nm.reviewCount180, 1);
    assert.equal(nm.ratingAvg, 5);
  });

  it("lists rating mismatch vs funnel when |Δ| > 0.1", () => {
    const now = "2026-10-14T12:00:00.000Z";
    const snap = buildFeedbacksSnapshot({
      feedbacks: [
        row({
          id: "a",
          nmId: "100",
          rating: 5,
          createdAt: "2026-10-01T00:00:00.000Z",
        }),
      ],
      questions: [],
      nowIso: now,
      status: "ok",
      dateFrom: "2026-04-18",
      dateTo: "2026-10-14",
      wbFeedbackRatingByNm: { "100": 4.5 },
    });
    assert.equal(snap.ratingMismatches.length, 1);
    assert.equal(snap.ratingMismatches[0]?.wbFeedbackRating, 4.5);
  });

  it("rejected-only nmId has null rating and mismatches funnel 0/null", () => {
    const now = "2026-10-14T12:00:00.000Z";
    const snap = buildFeedbacksSnapshot({
      feedbacks: [
        row({
          id: "r",
          nmId: "999549871",
          rating: 1,
          createdAt: "2026-05-25T03:21:42.000Z",
          orderStatus: "rejected",
          countsOnCard: false,
        }),
      ],
      questions: [],
      nowIso: now,
      status: "ok",
      dateFrom: "2026-04-18",
      dateTo: "2026-10-14",
      wbFeedbackRatingByNm: { "999549871": 0 },
    });
    assert.equal(snap.byNm["999549871"]?.reviewCount180, 0);
    assert.equal(snap.byNm["999549871"]?.ratingAvg, null);
    assert.equal(snap.ratingMismatches.length, 0);
  });
});
