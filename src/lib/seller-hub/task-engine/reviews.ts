/**
 * Правила отзывов/вопросов (стандарт 3.9 + рост доли негатива).
 * Не трогает priority / demand / stock / margin.
 */
import { previewText } from "@/lib/seller-hub/feedbacks/map";
import type { SellerFeedbackRow, SellerQuestionRow } from "@/lib/seller-hub/feedbacks/types";
import { benjaminiHochberg, fisherExactOneSidedGreater } from "./stats";
import type { StoreTaskFacts, TaskDraft, TaskFact, TaskSeverity } from "./types";

function rub(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function draft(
  fact: TaskFact | null,
  partial: Omit<TaskDraft, "nmId" | "itemId" | "productTitle" | "vendorCode" | "severityFloor" | "severityCeiling"> &
    Partial<Pick<TaskDraft, "severityFloor" | "severityCeiling">>,
): TaskDraft {
  return {
    nmId: fact?.nmId ?? null,
    itemId: fact?.itemId ?? null,
    productTitle: fact?.title ?? null,
    vendorCode: fact?.vendorCode ?? null,
    severityFloor: partial.severityFloor ?? partial.baseSeverity,
    severityCeiling: partial.severityCeiling ?? partial.baseSeverity,
    ...partial,
  };
}

function hasOrders28(fact: TaskFact): boolean {
  return (fact.orders != null && fact.orders > 0) || (fact.salesQty != null && fact.salesQty > 0);
}

function formatNegList(
  rows: Array<{ createdAt: string; rating: number; preview: string }>,
): string {
  return rows
    .slice(0, 12)
    .map((r) => `${r.createdAt.slice(0, 10)}, ${r.rating}★: ${r.preview}`)
    .join("; ");
}

function formatQList(rows: NonNullable<TaskFact["staleQuestions"]>): string {
  return rows
    .slice(0, 12)
    .map((r) => `${r.createdAt.slice(0, 10)}: ${r.preview}`)
    .join("; ");
}

/** Нет доступа токена → одна задача магазина, остальные правила отзывов молчат. */
export function ruleFeedbacksAccess(store: StoreTaskFacts): TaskDraft | null {
  if (store.feedbacksStatus !== "forbidden") return null;
  return draft(null, {
    type: "TASK_FEEDBACKS_ACCESS",
    category: "reviews",
    baseSeverity: "important",
    severityFloor: "important",
    severityCeiling: "important",
    title: "Дайте токену доступ к отзывам и вопросам",
    description:
      "В токене WB нет категории «Вопросы и отзывы». Без неё Seller Hub не видит отзывы и вопросы по товарам.",
    reason: "feedbacks-api вернул 401/403.",
    evidence: { feedbacks_status: "forbidden" },
    recommendation:
      "В кабинете WB добавьте категорию «Вопросы и отзывы» к токену Seller Hub. После этого откройте «Автоотзывы»: /studio/auto-replies/workspace.",
    actionType: "OPEN_REVIEW_RESPONSES",
    businessImpactType: "OPERATIONAL",
    eventKind: null,
  });
}

export function ruleUnansweredNegativeReview(fact: TaskFact): TaskDraft | null {
  const rows = fact.staleNegativeReviews;
  if (!rows || rows.length === 0) return null;
  const visibleOnCard = rows.some((r) => r.countsOnCard);
  // Отмена заказа / не на карточке — покупатели не видят; не выше Возможности.
  const important = hasOrders28(fact) && visibleOnCard;
  const severity: TaskSeverity = important ? "important" : "opportunity";
  const list = formatNegList(rows);
  const why = important
    ? " У товара есть заказы за 28 дней — отзыв видят покупатели, которые выбирают товар сейчас."
    : !visibleOnCard
      ? " Отзыв не виден на карточке (например, отменённый заказ) — покупатели его не видят."
      : "";
  return draft(fact, {
    type: "TASK_UNANSWERED_NEGATIVE_REVIEW",
    category: "reviews",
    baseSeverity: severity,
    severityFloor: severity,
    severityCeiling: severity,
    title: "Негативный отзыв без ответа",
    description: `${fact.title}: ${rows.length.toLocaleString("ru-RU")} негативных отзывов без ответа дольше 24 часов.${why} ${list}`,
    reason: visibleOnCard
      ? "Оценка 1–3★, без ответа > 24 ч."
      : "Оценка 1–3★, без ответа > 24 ч.; на карточке nmId не показывается.",
    evidence: {
      count: rows.length,
      orders_28d: fact.orders ?? fact.salesQty,
      review_ids: rows.map((r) => r.id).join(","),
      visible_on_card: visibleOnCard,
    },
    recommendation: `Ответьте в «Автоотзывах» (/studio/auto-replies/workspace) или в кабинете WB: https://seller.wildberries.ru/feedback-question/feedbacks${
      fact.nmId ? ` (артикул ${fact.nmId})` : ""
    }.`,
    actionType: "OPEN_REVIEW_RESPONSES",
    businessImpactType: "OPERATIONAL",
    eventKind: "reviews_unanswered",
  });
}

export function ruleUnansweredQuestion(fact: TaskFact): TaskDraft | null {
  const rows = fact.staleQuestions;
  if (!rows || rows.length === 0) return null;
  const important = hasOrders28(fact);
  const severity: TaskSeverity = important ? "important" : "opportunity";
  return draft(fact, {
    type: "TASK_UNANSWERED_QUESTION",
    category: "reviews",
    baseSeverity: severity,
    severityFloor: severity,
    severityCeiling: severity,
    title: "Вопрос без ответа",
    description: `${fact.title}: ${rows.length.toLocaleString("ru-RU")} вопросов без ответа дольше 24 часов.${
      important ? " У товара есть заказы за 28 дней — вопрос задают до покупки." : ""
    } ${formatQList(rows)}`,
    reason: "Вопрос без ответа > 24 ч.",
    evidence: {
      count: rows.length,
      orders_28d: fact.orders ?? fact.salesQty,
      question_ids: rows.map((r) => r.id).join(","),
    },
    recommendation: `Ответьте в «Автоотзывах» (/studio/auto-replies/workspace) или в кабинете WB: https://seller.wildberries.ru/feedback-question/questions${
      fact.nmId ? ` (артикул ${fact.nmId})` : ""
    }.`,
    actionType: "OPEN_QUESTIONS",
    businessImpactType: "OPERATIONAL",
    eventKind: "questions_unanswered",
  });
}

export function ruleUnansweredPositiveReviews(store: StoreTaskFacts): TaskDraft | null {
  const n = store.unansweredPositiveCount;
  const m = store.unansweredPositiveProductCount;
  if (n == null || n <= 0 || m == null || m <= 0) return null;
  return draft(null, {
    type: "TASK_UNANSWERED_POSITIVE_REVIEWS",
    category: "reviews",
    baseSeverity: "opportunity",
    severityFloor: "opportunity",
    severityCeiling: "opportunity",
    title: "Позитивные отзывы без ответа",
    description: `${n.toLocaleString("ru-RU")} отзывов без ответа по ${m.toLocaleString("ru-RU")} товарам (оценка 4–5★).`,
    reason: "Позитивные отзывы без ответа — возможность поблагодарить покупателя.",
    evidence: { unanswered_positive: n, products: m },
    recommendation:
      "Ответьте в «Автоотзывах» (/studio/auto-replies/workspace) или в кабинете WB: https://seller.wildberries.ru/feedback-question/feedbacks.",
    actionType: "OPEN_REVIEW_RESPONSES",
    businessImpactType: "OPERATIONAL",
    eventKind: null,
  });
}

export type NegativeShareCandidate = {
  fact: TaskFact;
  pValue: number;
  windowNeg: number;
  windowN: number;
  baseNeg: number;
  baseN: number;
};

export function collectNegativeShareCandidates(facts: TaskFact[]): NegativeShareCandidate[] {
  const out: NegativeShareCandidate[] = [];
  for (const fact of facts) {
    const wN = fact.negativeWindowN;
    const wNeg = fact.negativeWindowNeg;
    const bN = fact.negativeBaseN;
    const bNeg = fact.negativeBaseNeg;
    if (wN == null || wNeg == null || bN == null || bNeg == null) continue;
    if (wN < 5 || bN < 10) continue;
    if (!(wNeg / wN > bNeg / bN)) continue;
    const a = wNeg;
    const b = wN - wNeg;
    const c = bNeg;
    const d = bN - bNeg;
    const pValue = fisherExactOneSidedGreater(a, b, c, d);
    out.push({ fact, pValue, windowNeg: wNeg, windowN: wN, baseNeg: bNeg, baseN: bN });
  }
  return out;
}

export function finalizeNegativeShareDrafts(
  candidates: NegativeShareCandidate[],
  q = 0.05,
): TaskDraft[] {
  if (candidates.length === 0) return [];
  const rejected = benjaminiHochberg(
    candidates.map((c) => c.pValue),
    q,
  );
  const drafts: TaskDraft[] = [];
  for (let i = 0; i < candidates.length; i++) {
    if (!rejected[i]) continue;
    const c = candidates[i]!;
    const negRows = c.fact.windowNegativeReviews ?? [];
    const listHint =
      negRows.length > 0 ? ` ${formatNegList(negRows)}.` : "";
    drafts.push(
      draft(c.fact, {
        type: "TASK_NEGATIVE_SHARE_UP",
        category: "reviews",
        baseSeverity: "opportunity",
        severityFloor: "opportunity",
        severityCeiling: "opportunity",
        title: "Рост доли негатива",
        description: `${c.fact.title}: негативных отзывов стало больше: ${c.windowNeg} из ${c.windowN} за 28 дней против ${c.baseNeg} из ${c.baseN} раньше.${listHint}`,
        reason: "Доля 1–3★ выросла; Фишер односторонний + BH q=0.05.",
        evidence: {
          window_neg: c.windowNeg,
          window_n: c.windowN,
          base_neg: c.baseNeg,
          base_n: c.baseN,
          p_value: Math.round(c.pValue * 1e6) / 1e6,
        },
        recommendation: `Разберите негативные отзывы окна в «Автоотзывах» (/studio/auto-replies/workspace) или в кабинете WB: https://seller.wildberries.ru/feedback-question/feedbacks${
          c.fact.nmId ? ` (артикул ${c.fact.nmId})` : ""
        }.`,
        actionType: "OPEN_REVIEW_RESPONSES",
        businessImpactType: "OPERATIONAL",
        eventKind: null,
      }),
    );
  }
  return drafts;
}

/** Поднять NEGATIVE_SHARE_UP до важности задачи спроса, если есть CONVERSION_DROP. */
export function elevateNegativeShareWithConversion(
  drafts: TaskDraft[],
): TaskDraft[] {
  const conversionByNm = new Map<string, TaskDraft>();
  for (const d of drafts) {
    if (d.type === "TASK_CONVERSION_DROP" && d.nmId) conversionByNm.set(d.nmId, d);
  }
  return drafts.map((d) => {
    if (d.type !== "TASK_NEGATIVE_SHARE_UP" || !d.nmId) return d;
    const conv = conversionByNm.get(d.nmId);
    if (!conv) return d;
    const money = typeof conv.evidence.money_at_risk === "number" ? conv.evidence.money_at_risk : null;
    return {
      ...d,
      baseSeverity: conv.baseSeverity,
      severityFloor: conv.severityFloor,
      severityCeiling: conv.severityCeiling,
      businessImpactType: conv.businessImpactType,
      evidence: {
        ...d.evidence,
        linked_conversion_drop: true,
        money_at_risk: money,
        conversion_severity: conv.baseSeverity,
      },
      description: `${d.description} Падение конверсии по этому товару уже в задачах спроса${
        money != null ? ` (≈ ${rub(money)})` : ""
      }.`,
    };
  });
}

/** Хелпер для тестов: превью из сырого отзыва. */
export function reviewPreviewFromRow(row: SellerFeedbackRow | SellerQuestionRow): string {
  if ("rating" in row) return previewText(row);
  const t = row.text.trim() || "Без текста";
  return t.length > 200 ? `${t.slice(0, 200)}…` : t;
}
