import type { CacheStore } from "@/lib/seller-hub/data-cache";
import { shortHash } from "@/lib/seller-hub/data-cache";
import {
  ANALYSIS_PROTOCOL_VERSION,
  ANALYST_SYSTEM,
  MAX_DATA_REQUESTS,
  REVIEWER_SYSTEM,
  combineOpinions,
  evaluateInitiative,
  parseAnalysis,
  parseReview,
  promptPayload,
  type AiProductInput,
  type AiStoreProfile,
  type AnalystItem,
  type ConsensusResult,
  type DataRequest,
  type ExtraData,
  type InitiativeResult,
  type ReviewerItem,
} from "./ai-review";
import { moscowDateKey } from "@/lib/seller-hub/complete-days";
import { KNOWLEDGE_VERSION } from "./knowledge";

/**
 * Запуск двух нейросетей над предложениями агента по цене: аналитик и независимый проверяющий.
 * Работает пачками, результат хранится по отпечатку фактов (те же цифры повторно не оплачиваются), есть суточный предел вызовов.
 * Если аналитик просит данные, из нашей базы выдаются только запрошенные из закрытого перечня, и второй круг делается один раз.
 * Любой сбой нейросети не мешает предложению: оно остаётся решением по правилам и ограничителям, с пометкой «ИИ-проверка не выполнена».
 */

export type AiAsk = (input: { system: string; user: string; maxTokens: number; role: "analyst" | "reviewer" }) => Promise<{ text: string; costUsd: number }>;
/** Читает запрошенные данные из нашей базы. null — данных нет. Ответ обрезается до MAX_DATA_CHARS. */
export type DataFetcher = (request: DataRequest) => Promise<string | null>;

export const MAX_DATA_CHARS = 1800;

export type AiOutcome = {
  analysis: AnalystItem | null;
  review: ReviewerItem | null;
  /** Итог по предложению алгоритма. */
  consensus: ConsensusResult;
  /** Итог по собственной инициативе ИИ (только если алгоритм ничего не предлагал). */
  initiative: InitiativeResult | null;
  /** Данные, которые аналитик запрашивал и получил. */
  dataUsed: DataRequest[];
};

export type AiRunResult = {
  byNm: Map<string, AiOutcome>;
  costUsd: number;
  calls: number;
  reused: number;
  errors: string[];
};

/** Сколько товаров разбираем за один вызов нейросети. */
export const AI_BATCH = 6;

type Cached = { analysis: AnalystItem; review: ReviewerItem | null; dataUsed: DataRequest[] };

const outcomeOf = (product: AiProductInput, analysis: AnalystItem | null, review: ReviewerItem | null, dataUsed: DataRequest[]): AiOutcome => ({
  analysis,
  review,
  consensus: combineOpinions(analysis, review),
  initiative: product.candidate == null ? evaluateInitiative(analysis, review) : null,
  dataUsed,
});

export async function runAiReview(input: {
  products: AiProductInput[];
  store: CacheStore;
  profile?: AiStoreProfile | null;
  nowMs?: number;
  ask: AiAsk;
  fetchData?: DataFetcher;
  /** Возвращает false, когда суточный предел вызовов исчерпан. */
  takeBudget: () => boolean;
}): Promise<AiRunResult> {
  const result: AiRunResult = { byNm: new Map(), costUsd: 0, calls: 0, reused: 0, errors: [] };
  const missing: AiProductInput[] = [];
  // Отпечаток грубый: цифры округлены до двух значащих, профиль магазина не входит (он выведен из тех же данных), плюс дата по Москве.
  // Фоновое обновление заказов и просмотров каждые 15 минут не запускает платный разбор заново: повтор только при заметном изменении цифр или на следующий день.
  const coarse = (facts: Record<string, number | null>) => Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, typeof v === "number" && v !== 0 ? Number(v.toPrecision(2)) : v]));
  const day = moscowDateKey(input.nowMs ?? Date.now());
  const keyOf = (p: AiProductInput) => `agent-ai:${ANALYSIS_PROTOCOL_VERSION}:${KNOWLEDGE_VERSION}:${day}:${p.nmId}:${shortHash(JSON.stringify({ facts: coarse(p.facts), candidate: p.candidate, snippets: p.reviewSnippets }))}`;

  for (const p of input.products) {
    const hit = await input.store.read<Cached>(keyOf(p)).catch(() => null);
    if (hit) {
      result.byNm.set(p.nmId, outcomeOf(p, hit.payload.analysis, hit.payload.review, hit.payload.dataUsed ?? []));
      result.reused += 1;
    } else {
      missing.push(p);
    }
  }

  const callBoth = async (batch: AiProductInput[], extra: ExtraData | null) => {
    const user = promptPayload(batch, input.profile ?? null, extra);
    // Проверяющий смотрит предложения алгоритма. Для товаров без предложения алгоритма он смотрит только то, что выдвинул аналитик (ниже).
    const withCandidate = batch.filter((p) => p.candidate != null);
    const reviewerUser = withCandidate.length === batch.length ? user : promptPayload(withCandidate, input.profile ?? null, extra);
    // Два независимых вызова: проверяющий не видит ответа аналитика.
    const [a, r] = await Promise.allSettled([
      input.ask({ system: ANALYST_SYSTEM, user, maxTokens: 8000, role: "analyst" }),
      withCandidate.length > 0 ? input.ask({ system: REVIEWER_SYSTEM, user: reviewerUser, maxTokens: 6000, role: "reviewer" }) : Promise.resolve({ text: "", costUsd: 0 }),
    ]);
    result.calls += withCandidate.length > 0 ? 2 : 1;
    if (a.status === "rejected") result.errors.push(`Аналитик: ${a.reason instanceof Error ? a.reason.message : String(a.reason)}`);
    if (r.status === "rejected") result.errors.push(`Проверяющий: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    if (a.status === "fulfilled") result.costUsd += a.value.costUsd;
    if (r.status === "fulfilled") result.costUsd += r.value.costUsd;
    const analyses = a.status === "fulfilled" ? parseAnalysis(a.value.text, batch) : null;
    const reviewMap = new Map<string, ReviewerItem>();
    if (r.status === "fulfilled" && withCandidate.length > 0) parseReview(r.value.text, withCandidate).forEach((item) => reviewMap.set(item.nmId, item));

    // Собственные предложения аналитика (товары без предложения алгоритма): независимый проверяющий оценивает только само действие, без рассуждений аналитика.
    const suggested = analyses ? batch.filter((p, index) => p.candidate == null && analyses[index]?.suggestion && analyses[index]!.grounded) : [];
    if (suggested.length > 0) {
      const asCandidates = suggested.map((p) => {
        const sg = analyses![batch.indexOf(p)]!.suggestion!;
        return { ...p, candidate: { stepPercent: sg.direction === "lower" ? -sg.stepPercent : sg.stepPercent, rules: ["ai_suggestion"], playbook: "ai" } };
      });
      try {
        const second = await input.ask({ system: REVIEWER_SYSTEM, user: promptPayload(asCandidates, input.profile ?? null, extra), maxTokens: 6000, role: "reviewer" });
        result.calls += 1;
        result.costUsd += second.costUsd;
        parseReview(second.text, asCandidates).forEach((item) => reviewMap.set(item.nmId, item));
      } catch (error) {
        result.errors.push(`Проверяющий (предложение ИИ): ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { analyses, reviews: batch.map((p) => reviewMap.get(p.nmId) ?? null), reviewerFailed: r.status === "rejected" };
  };

  for (let i = 0; i < missing.length; i += AI_BATCH) {
    const batch = missing.slice(i, i + AI_BATCH);
    if (!input.takeBudget()) {
      result.errors.push("Достигнут суточный предел ИИ-проверок");
      break;
    }
    let { analyses, reviews } = await callBoth(batch, null);
    const dataUsed = new Map<string, DataRequest[]>();

    // Второй круг: аналитик попросил данные. Выдаём из базы только запрошенное и спрашиваем обоих снова, один раз.
    const requests = (analyses ?? []).flatMap((item) => item.needs).slice(0, MAX_DATA_REQUESTS);
    if (input.fetchData && requests.length > 0 && input.takeBudget()) {
      const extra: ExtraData = new Map();
      for (const req of requests) {
        const data = await input.fetchData(req).catch(() => null);
        const list = extra.get(req.nmId) ?? [];
        list.push({ tool: req.tool, data: (data ?? "данных нет").slice(0, MAX_DATA_CHARS) });
        extra.set(req.nmId, list);
        dataUsed.set(req.nmId, [...(dataUsed.get(req.nmId) ?? []), req]);
      }
      const subset = batch.filter((p) => extra.has(p.nmId));
      const second = await callBoth(subset, extra);
      subset.forEach((p, index) => {
        const at = batch.indexOf(p);
        if (second.analyses && analyses) analyses = analyses.map((item, k) => (k === at ? { ...second.analyses![index]!, needs: [] } : item));
        if (reviews && (second.reviews[index] || p.candidate != null)) reviews = reviews.map((item, k) => (k === at ? (second.reviews[index] ?? item) : item));
      });
    }

    batch.forEach((p, index) => {
      const analysis = analyses?.[index] ?? null;
      const review = reviews?.[index] ?? null;
      const used = dataUsed.get(p.nmId) ?? [];
      result.byNm.set(p.nmId, outcomeOf(p, analysis, review, used));
      // В кэш кладём только когда ответ полный: аналитик не остался с неудовлетворённым запросом, а проверяющий ответил там, где он нужен
      // (по предложению алгоритма или по собственному предложению аналитика).
      const reviewerNeeded = p.candidate != null || Boolean(analysis?.suggestion);
      if (analysis && analysis.needs.length === 0 && (review || !reviewerNeeded)) void input.store.write(keyOf(p), { analysis, review, dataUsed: used } satisfies Cached).catch(() => undefined);
    });
  }
  return result;
}
