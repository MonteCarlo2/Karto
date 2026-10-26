import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildReputation } from "./reputation";
import type { SellerFeedbackNmStats, SellerFeedbacksSnapshot } from "./feedbacks/types";

const stats = (patch: Partial<SellerFeedbackNmStats>): SellerFeedbackNmStats => ({
  reviewCount180: 0,
  ratingAvg: null,
  unansweredTotal: 0,
  unansweredNegative: 0,
  unansweredQuestions: 0,
  staleNegatives: [],
  staleQuestions: [],
  windowNegatives: [],
  windowNeg: 0,
  windowN: 0,
  baseNeg: 0,
  baseN: 0,
  ...patch,
});

const snap = (byNm: Record<string, SellerFeedbackNmStats>, patch: Partial<SellerFeedbacksSnapshot> = {}): SellerFeedbacksSnapshot => ({
  loadedAt: "2026-10-16T00:00:00Z",
  version: 2,
  status: "ok",
  dateFrom: "2026-04-01",
  dateTo: "2026-10-16",
  byNm,
  unansweredPositiveCount: 3,
  unansweredPositiveProductCount: 2,
  ratingMismatches: [],
  ...patch,
});

describe("buildReputation", () => {
  it("рейтинг взвешен по отзывам, суммы без ответа сходятся", () => {
    const result = buildReputation(
      snap({
        a: stats({ reviewCount180: 30, ratingAvg: 4.0, unansweredTotal: 2, unansweredNegative: 1, unansweredQuestions: 1 }),
        b: stats({ reviewCount180: 10, ratingAvg: 5.0, unansweredTotal: 1, unansweredQuestions: 2 }),
      }),
    );
    assert.ok(result);
    assert.equal(result.rating, 4.25);
    assert.equal(result.reviews, 40);
    assert.equal(result.unanswered, 3);
    assert.equal(result.unansweredNegative, 1);
    assert.equal(result.unansweredQuestions, 3);
    assert.equal(result.unansweredPositive, 3);
  });

  it("рост негатива считаем только при достаточной базе, сначала карточки с негативом без ответа", () => {
    const result = buildReputation(
      snap({
        calm: stats({ reviewCount180: 20, ratingAvg: 4.8 }),
        rising: stats({ reviewCount180: 40, ratingAvg: 4.1, windowNeg: 4, windowN: 10, baseNeg: 3, baseN: 30 }),
        tiny: stats({ reviewCount180: 3, ratingAvg: 3, windowNeg: 3, windowN: 3, baseNeg: 0, baseN: 0 }),
        open: stats({ reviewCount180: 12, ratingAvg: 4.5, unansweredTotal: 2, unansweredNegative: 2 }),
      }),
    );
    assert.ok(result);
    const rising = result.rows.find((r) => r.nmId === "rising");
    assert.equal(rising?.negativeShareWindow, 40);
    assert.equal(rising?.negativeShareBase, 10);
    assert.equal(rising?.negativeRising, true);
    assert.equal(result.rows.find((r) => r.nmId === "tiny")?.negativeRising, false);
    assert.equal(result.risingProducts, 1);
    assert.equal(result.rows[0]!.nmId, "open");
  });

  it("нет данных или ошибка — null", () => {
    assert.equal(buildReputation(null), null);
    assert.equal(buildReputation(snap({}, { status: "error" })), null);
    assert.equal(buildReputation(snap({}, { status: "forbidden" })), null);
  });
});
