/** Снимок отзывов/вопросов Seller Hub (только чтение WB). Без ПДн покупателя. */

export const SELLER_FEEDBACKS_SNAPSHOT_VERSION = 2 as const;

export type SellerFeedbacksLoadStatus =
  | "ok"
  | "partial"
  | "rate_limited"
  | "forbidden"
  | "error"
  | "not_loaded";

export type SellerFeedbackRow = {
  id: string;
  nmId: string;
  rating: number;
  createdAt: string;
  answered: boolean;
  answeredAt: string | null;
  text: string;
  pros: string;
  cons: string;
  /** WB orderStatus: buyout | rejected | returned | notSpecified. */
  orderStatus: string | null;
  /** WB state отзыва: none | wbRu. */
  state: string | null;
  imtId: string | null;
  parentFeedbackId: string | null;
  childFeedbackId: string | null;
  /** Входит ли в рейтинг карточки nmId у покупателя. */
  countsOnCard: boolean;
};

export type FeedbackRatingMismatch = {
  nmId: string;
  ourRating: number | null;
  ourCount: number;
  wbFeedbackRating: number | null;
};

export type SellerQuestionRow = {
  id: string;
  nmId: string;
  createdAt: string;
  answered: boolean;
  answeredAt: string | null;
  text: string;
};

export type SellerFeedbackNmStats = {
  reviewCount180: number;
  ratingAvg: number | null;
  unansweredTotal: number;
  unansweredNegative: number;
  unansweredQuestions: number;
  /** Негатив 1–3★ без ответа старше 24 ч (для задач). */
  staleNegatives: SellerFeedbackRow[];
  /** Вопросы без ответа старше 24 ч. */
  staleQuestions: SellerQuestionRow[];
  /** Негатив окна 28д (для текста TASK_NEGATIVE_SHARE_UP). */
  windowNegatives: SellerFeedbackRow[];
  /** Окно 28д / база 152д для доли негатива. */
  windowNeg: number;
  windowN: number;
  baseNeg: number;
  baseN: number;
};

export type SellerFeedbacksSnapshot = {
  loadedAt: string;
  version: typeof SELLER_FEEDBACKS_SNAPSHOT_VERSION;
  status: SellerFeedbacksLoadStatus;
  dateFrom: string;
  dateTo: string;
  byNm: Record<string, SellerFeedbackNmStats>;
  /** Позитивные 4–5★ без ответа (магазин). */
  unansweredPositiveCount: number;
  unansweredPositiveProductCount: number;
  /**
   * Расхождение нашего рейтинга (карточка) с feedbackRating воронки WB > 0.1.
   * Пусто, пока воронку не приложили к снимку.
   */
  ratingMismatches: FeedbackRatingMismatch[];
  error?: string;
};
