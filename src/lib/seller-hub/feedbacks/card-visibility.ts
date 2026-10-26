/**
 * Какие отзывы из feedbacks-api попадают на карточку nmId у покупателя.
 * Отмены (rejected) остаются в кабинете продавца, но на карточке «Нет оценок».
 * Дополненный отзыв (есть childFeedbackId) заменён новой версией — в рейтинг не входит.
 */

export type FeedbackCardFlags = {
  orderStatus: string | null;
  childFeedbackId: string | null;
};

export function feedbackCountsOnCard(row: FeedbackCardFlags): boolean {
  if (row.childFeedbackId) return false;
  if (row.orderStatus === "rejected") return false;
  return true;
}
