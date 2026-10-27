import { extractJson } from "@/lib/seller-hub/llm";
import { FACT_GUIDE } from "./ai-review";
import { describeCriterion, describePlanAction, type Strategy } from "./strategy";
import type { Solution } from "./ai-solver";
import { WB_KNOWLEDGE } from "./knowledge";

/**
 * Независимая проверка планов вторым ИИ. Он не знает, как рассуждал составитель. Проверяет по существу: цифры, условия владельца, безопасность каждого действия программы
 * (цена, ставка, текст карточки), связность плана. Решение по каждому плану: согласен (все действия остаются), есть замечания (останавливаются только названные шаги, остальное остаётся),
 * отвергнут (план не показывается). Так строгость проверяющего защищает деньги и карточки, но не отключает автоматизацию целиком из-за замечания к одному шагу.
 */

export const PLAN_REVIEWER_SYSTEM = `Ты независимый проверяющий, опытный руководитель отдела продаж на маркетплейсах. Тебе дают картину кабинета Wildberries, цель владельца (если она была) и планы по товарам. Ты не знаешь, как их составляли. Твоя задача: найти реальные недостатки, которые могут навредить владельцу, и не придираться к мелочам.

${WB_KNOWLEDGE}

${FACT_GUIDE}

ВАЖНО О ПРОГРАММЕ. Все шаги программы только предлагаются владельцу и выполняются после его кнопки «Выполнить» (а шаги-триггеры «если …» предлагаются, только когда условие выполнено по свежим данным). Поэтому просьба владельца «только предложи, ничего не выполняй» шагами программы не нарушается: не блокируй шаг по этой причине. Блокируй по существу: неверные цифры, опасное действие, нарушение запретов и границ владельца.

ЧТО ПРОВЕРЯТЬ
1. Цифры в доказательствах и целях совпадают с фактами; цели и критерии успеха достижимы и измеримы.
2. Условия владельца из диалога выполнены: если он запретил менять карточки, цену или рекламу, в плане нет таких шагов; названные минимальная маржа и предельный ДРР учтены.
3. Каждое действие программы безопасно и обосновано:
   - цена: направление и ступень соответствуют причине (при мизерном трафике снижение цены не поможет; при убытке нельзя снижать);
   - ставка в рекламе: есть основания, ДРР и маржа учтены, ступень небольшая;
   - текст карточки (content_edit): только правдивые факты из карточки и отзывов, ничего выдуманного (материалы, размеры, сертификаты, свойства), нет рекламных обещаний, сравнений «лучший», ссылок и контактов, смысл не искажён, ключевые слова не потеряны;
   - выход из акции (promo_exit): выход делается сбросом скидки продавца до 0%, то есть цена для покупателя заметно растёт; допустим, только когда участие в акции убыточно или явно невыгодно по фактам и рост цены не убьёт заказы; вернуть можно только вручную;
   - реклама: убрать товар из кампании, добавить в другую, пополнить бюджет (500, 1000 или 2000 ₽ за шаг): пополнение допустимо только при подтверждённой окупаемости (ДРР ниже маржи);
   - вход в акцию (promo_join): маржа в акции не ниже порога владельца, акция даёт рост заказов, цена акции не ломает остальные шаги плана; скидка Клуба (club_discount): цена для участников Клуба остаётся выше безубыточной;
   - минус-фразы (ads_minus_phrases): запросы действительно нерелевантные товару и не целевые; не минусуй полезные запросы; места показа (ads_placements): основание в данных кампании, хотя бы одно место остаётся включённым;
   - характеристики (characteristics_edit): значения прямо следуют из названия, описания или заполненных характеристик, ничего не домыслено (материал, размеры, комплектация, сертификаты), числовые значения разумны;
   - тестовая кампания: уместна.
4. ГЛАВНОЕ: решает ли план саму задачу владельца (owner_goal и диалог) и устраняет ли реальную причину проблемы по этому товару? Проверь цепочку «причина в числах → действие → ожидаемое следствие». Если действия не устраняют причину (например, цена при почти нулевых просмотрах, реклама при слабой карточке, новая карточка там, где задача про отзывы) или есть более прямое и надёжное решение, поставь dispute и в reason назови конкретно, что нужно сделать вместо этого: твоё замечание получит автор плана и доработает его. Если план из одного точного действия решает задачу, это хорошо: не требуй лишних шагов.
5. План связный: шаги по порядку, есть контрольные точки и ограничители там, где шаг стоит денег или конверсии.

ПРАВИЛА ОТВЕТА
- verdict: agree (план можно запускать), dispute (есть конкретные замечания), reject (план вредит или противоречит условиям владельца и так не годится).
- blockedSteps: номера шагов (поле i) с действием программы, которые нельзя выполнять автоматически из-за конкретной проблемы, с причиной. Если замечание общее и не относится к действиям, blockedSteps пустой массив, и действия остаются. Не блокируй шаги без причины. Шаги для человека не блокируй.
- reason: одно-два предложения с числами из фактов. Не придумывай замечаний ради осторожности: если план хороший, ставь agree.

ФОРМАТ. Только JSON: {"review":[{"index":0,"verdict":"agree|dispute|reject","reason":"...","blockedSteps":[]}]} по одному объекту на план, в том же порядке.`;

export type PlanReview = { verdict: "agree" | "dispute" | "reject"; reason: string; blockedSteps: number[] | null };

/** Подробное описание плана для проверяющего: шаги с номерами и полным видом действий (включая текст карточки целиком). */
export function planForReview(s: Solution) {
  const st = s.strategy;
  return {
    nmId: s.nmId,
    kind: s.kind,
    title: s.title,
    diagnosis: s.diagnosis,
    evidence: s.evidence,
    goal: st?.goal ?? null,
    steps: (st?.steps ?? []).map((p, i) => ({ i, day: p.day, by: p.by, step: p.step, action: p.action ?? null, action_summary: p.action ? describePlanAction(p.action) : null })),
    checks: (st?.checks ?? []).map((c) => `день ${c.day}: ${c.label}`),
    success: (st?.success ?? []).map(describeCriterion),
    guards: (st?.guards ?? []).map(describeCriterion),
    reviewAfterDays: st?.reviewAfterDays ?? null,
    fallback: st?.fallback ?? null,
  };
}

export function parsePlanReviews(raw: string, count: number): Array<PlanReview | null> {
  const json = extractJson(raw) as { review?: unknown } | null;
  const list = Array.isArray(json?.review) ? (json!.review as Array<Record<string, unknown>>) : [];
  return Array.from({ length: count }, (_, index) => {
    const item = list.find((x) => Number(x.index) === index) ?? list[index];
    if (!item) return null;
    const verdict = item.verdict === "agree" || item.verdict === "reject" ? item.verdict : "dispute";
    const blocked = Array.isArray(item.blockedSteps) ? (item.blockedSteps as unknown[]).map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0) : null;
    return { verdict, reason: typeof item.reason === "string" ? item.reason.trim().slice(0, 400) : "", blockedSteps: blocked };
  });
}

const stripActions = (st: Strategy | null, only: Set<number> | null): Strategy | null =>
  st ? { ...st, steps: st.steps.map((p, i) => (p.action && (only == null || only.has(i)) ? { ...p, action: null, by: "human" as const } : p)) } : null;

export type ReviewedPlan = { solution: Solution; second: "agree" | "dispute" | "not_checked"; secondReason: string; kept: boolean; severity: "important" | "watch" };

/**
 * Применение проверки. Согласен: всё остаётся. Замечания: останавливаются только названные шаги (если не названы вовсе, по осторожности все действия программы).
 * Отвергнут: план не показывается. Проверка не состоялась: действия программы не включаются.
 */
export function applyPlanReview(solution: Solution, review: PlanReview | null, important: boolean): ReviewedPlan {
  if (!review) return { solution: { ...solution, strategy: stripActions(solution.strategy, null) }, second: "not_checked", secondReason: "", kept: true, severity: important ? "important" : "watch" };
  if (review.verdict === "reject") return { solution, second: "dispute", secondReason: review.reason, kept: false, severity: "watch" };
  if (review.verdict === "agree") return { solution, second: "agree", secondReason: review.reason, kept: true, severity: important ? "important" : "watch" };
  const only = review.blockedSteps ? new Set(review.blockedSteps) : null;
  return { solution: { ...solution, strategy: stripActions(solution.strategy, only) }, second: "dispute", secondReason: review.reason, kept: true, severity: "watch" };
}
