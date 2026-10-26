import type { SellerFeedbacksSnapshot } from "@/lib/seller-hub/feedbacks/types";

/**
 * Репутация магазина: рейтинг, отзывы и вопросы без ответа, доля негатива в динамике.
 * Только чтение данных WB; ответы покупателям остаются в модуле автоотзывов.
 */

/** Меньше стольких отзывов в окне или базе: долю негатива не сравниваем, чтобы не принять случайность за тренд. */
export const MIN_REVIEWS_FOR_TREND = 5;

export type ReputationRow = {
  nmId: string;
  reviews: number;
  rating: number | null;
  unanswered: number;
  unansweredNegative: number;
  unansweredQuestions: number;
  /** Доля негатива 1–3★ в окне и в базе, %. null — отзывов мало. */
  negativeShareWindow: number | null;
  negativeShareBase: number | null;
  /** Негатив за окно вырос относительно базы (оба периода с достаточной базой). */
  negativeRising: boolean;
};

export type Reputation = {
  reviews: number;
  /** Средний рейтинг по магазину, взвешенный по числу отзывов. */
  rating: number | null;
  unanswered: number;
  unansweredNegative: number;
  unansweredQuestions: number;
  unansweredPositive: number;
  risingProducts: number;
  rows: ReputationRow[];
};

const share = (neg: number, n: number): number | null => (n >= MIN_REVIEWS_FOR_TREND ? Math.round((neg / n) * 1000) / 10 : null);

export function buildReputation(feedbacks: SellerFeedbacksSnapshot | null | undefined): Reputation | null {
  if (!feedbacks || feedbacks.status === "error" || feedbacks.status === "forbidden" || feedbacks.status === "not_loaded") return null;
  const rows: ReputationRow[] = Object.entries(feedbacks.byNm).map(([nmId, s]) => {
    const window = share(s.windowNeg, s.windowN);
    const base = share(s.baseNeg, s.baseN);
    return {
      nmId,
      reviews: s.reviewCount180,
      rating: s.ratingAvg,
      unanswered: s.unansweredTotal,
      unansweredNegative: s.unansweredNegative,
      unansweredQuestions: s.unansweredQuestions,
      negativeShareWindow: window,
      negativeShareBase: base,
      negativeRising: window != null && base != null && window > base,
    };
  });
  let weighted = 0;
  let counted = 0;
  for (const row of rows) {
    if (row.rating != null && row.reviews > 0) {
      weighted += row.rating * row.reviews;
      counted += row.reviews;
    }
  }
  rows.sort(
    (a, b) =>
      b.unansweredNegative - a.unansweredNegative ||
      Number(b.negativeRising) - Number(a.negativeRising) ||
      b.unansweredQuestions - a.unansweredQuestions ||
      (a.rating ?? 6) - (b.rating ?? 6),
  );
  return {
    reviews: rows.reduce((sum, row) => sum + row.reviews, 0),
    rating: counted > 0 ? Math.round((weighted / counted) * 100) / 100 : null,
    unanswered: rows.reduce((sum, row) => sum + row.unanswered, 0),
    unansweredNegative: rows.reduce((sum, row) => sum + row.unansweredNegative, 0),
    unansweredQuestions: rows.reduce((sum, row) => sum + row.unansweredQuestions, 0),
    unansweredPositive: feedbacks.unansweredPositiveCount,
    risingProducts: rows.filter((row) => row.negativeRising).length,
    rows,
  };
}
