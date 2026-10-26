import {
  SELLER_FEEDBACKS_SNAPSHOT_VERSION,
  type FeedbackRatingMismatch,
  type SellerFeedbackNmStats,
  type SellerFeedbackRow,
  type SellerFeedbacksLoadStatus,
  type SellerFeedbacksSnapshot,
  type SellerQuestionRow,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_MS = DAY_MS; // 24 часа
const WINDOW_DAYS = 28;
const SPAN_DAYS = 180;
const BASE_DAYS = SPAN_DAYS - WINDOW_DAYS; // 152
const RATING_MISMATCH_EPS = 0.1;

function ms(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function emptyNm(): SellerFeedbackNmStats {
  return {
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
  };
}

export function buildFeedbacksSnapshot(input: {
  feedbacks: SellerFeedbackRow[];
  questions: SellerQuestionRow[];
  nowIso: string;
  status: SellerFeedbacksLoadStatus;
  error?: string;
  dateFrom: string;
  dateTo: string;
  /** feedbackRating из воронки WB по nmId (для сверки). */
  wbFeedbackRatingByNm?: Record<string, number | null | undefined>;
}): SellerFeedbacksSnapshot {
  const now = ms(input.nowIso);
  const windowFrom = now - WINDOW_DAYS * DAY_MS;
  const baseFrom = now - SPAN_DAYS * DAY_MS;
  const byNm: Record<string, SellerFeedbackNmStats> = {};

  const ensure = (nmId: string) => {
    if (!byNm[nmId]) byNm[nmId] = emptyNm();
    return byNm[nmId]!;
  };

  let unansweredPositiveCount = 0;
  const positiveNm = new Set<string>();

  for (const row of input.feedbacks) {
    const created = ms(row.createdAt);
    if (!(created >= baseFrom && created <= now)) continue;
    const nm = ensure(row.nmId);

    // Рейтинг и доли негатива — только то, что WB показывает на карточке nmId.
    if (row.countsOnCard) {
      nm.reviewCount180 += 1;
      nm.ratingAvg =
        nm.ratingAvg == null
          ? row.rating
          : (nm.ratingAvg * (nm.reviewCount180 - 1) + row.rating) / nm.reviewCount180;

      if (created >= windowFrom) {
        nm.windowN += 1;
        if (row.rating <= 3) {
          nm.windowNeg += 1;
          nm.windowNegatives.push(row);
        }
      } else {
        nm.baseN += 1;
        if (row.rating <= 3) nm.baseNeg += 1;
      }
    }

    // Без ответа — кабинет продавца: все отзывы API, в т.ч. с orderStatus=rejected.
    if (!row.answered) {
      nm.unansweredTotal += 1;
      if (row.rating <= 3) {
        nm.unansweredNegative += 1;
        if (now - created >= STALE_MS) nm.staleNegatives.push(row);
      } else {
        unansweredPositiveCount += 1;
        positiveNm.add(row.nmId);
      }
    }
  }

  for (const row of input.questions) {
    if (row.answered) continue;
    const nm = ensure(row.nmId);
    nm.unansweredQuestions += 1;
    if (now - ms(row.createdAt) >= STALE_MS) nm.staleQuestions.push(row);
  }

  for (const nm of Object.values(byNm)) {
    nm.staleNegatives.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    nm.staleQuestions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    nm.windowNegatives.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (nm.ratingAvg != null) nm.ratingAvg = Math.round(nm.ratingAvg * 100) / 100;
  }

  const ratingMismatches = reconcileFeedbackRatings(byNm, input.wbFeedbackRatingByNm);

  return {
    loadedAt: input.nowIso,
    version: SELLER_FEEDBACKS_SNAPSHOT_VERSION,
    status: input.status,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    byNm,
    unansweredPositiveCount,
    unansweredPositiveProductCount: positiveNm.size,
    ratingMismatches,
    error: input.error,
  };
}

/** Сверка нашего рейтинга карточки с feedbackRating воронки; порог > 0.1. */
export function reconcileFeedbackRatings(
  byNm: Record<string, SellerFeedbackNmStats>,
  wbByNm: Record<string, number | null | undefined> | undefined,
): FeedbackRatingMismatch[] {
  if (!wbByNm) return [];
  const out: FeedbackRatingMismatch[] = [];
  const nmIds = new Set([...Object.keys(byNm), ...Object.keys(wbByNm)]);
  for (const nmId of nmIds) {
    const our = byNm[nmId];
    const ourRating = our?.ratingAvg ?? null;
    const ourCount = our?.reviewCount180 ?? 0;
    const raw = wbByNm[nmId];
    const wb =
      raw == null || !Number.isFinite(raw)
        ? null
        : raw === 0 && ourCount === 0
          ? null
          : raw === 0
            ? 0
            : Math.round(raw * 100) / 100;
    // Воронка 0 = нет оценок на карточке.
    const wbNorm = wb === 0 ? null : wb;
    const ourNorm = ourCount === 0 ? null : ourRating;
    if (ourNorm == null && wbNorm == null) continue;
    if (ourNorm == null || wbNorm == null) {
      out.push({ nmId, ourRating: ourNorm, ourCount, wbFeedbackRating: wbNorm });
      continue;
    }
    if (Math.abs(ourNorm - wbNorm) > RATING_MISMATCH_EPS) {
      out.push({ nmId, ourRating: ourNorm, ourCount, wbFeedbackRating: wbNorm });
    }
  }
  out.sort((a, b) => a.nmId.localeCompare(b.nmId));
  return out;
}

/** Приложить сверку к уже собранному снимку (когда воронка появилась позже). */
export function withFunnelRatingReconcile(
  snapshot: SellerFeedbacksSnapshot,
  wbFeedbackRatingByNm: Record<string, number | null | undefined> | undefined,
): SellerFeedbacksSnapshot {
  return {
    ...snapshot,
    ratingMismatches: reconcileFeedbackRatings(snapshot.byNm, wbFeedbackRatingByNm),
  };
}

export { WINDOW_DAYS, SPAN_DAYS, BASE_DAYS, STALE_MS, RATING_MISMATCH_EPS };
