import { NO_RULES, applyOwnerRules, currentFromEvidence, loadOwnerRules, withOwnerRules } from "./owner-rules";
import type { SupabaseClient } from "@supabase/supabase-js";
import { takeAiBudget } from "@/lib/seller-hub/ai-budget";
import { agentModel, askHubModel } from "@/lib/seller-hub/llm";
import { buildStoreProfile, withStoreMedians } from "./ai-context";
import { PLAN_REVIEWER_SYSTEM, applyPlanReview, parsePlanReviews, planForReview, type PlanReview } from "./plan-review";
import type { AiAsk } from "./ai-orchestrator";
import { SOLVER_SYSTEM, groupSignals, parseSolver, selectGroups, solverPayload, type PastAttempt, type SignalTask, type Solution, type TaskGroup } from "./ai-solver";
import { monthCapUsd, monthSpend, recordAiUsage, remainingBudget } from "./ai-usage";
import type { ScenarioProduct } from "./scenario-run";
import { describeCriterion, describePlanAction, stepCompliance, type Strategy, type StrategyState } from "./strategy";


const MARKETPLACE = "wildberries";
/** Сколько товаров решается за один вызов: стратегии длинные, поэтому пачка небольшая. */
export const SOLVER_BATCH = 4;
/** Сколько товаров разбирается за один запуск фона: остальные дождутся следующего (самые важные идут первыми). */
export const SOLVER_LIMIT = 12;
/** Сколько пачек одновременно уходит к ИИ. */
export const SOLVER_CONCURRENCY = 3;

const defaultAsk: AiAsk = ({ system, user, maxTokens, role }) => askHubModel({ system, user, maxTokens, model: agentModel(role), timeoutMs: 120_000 });

export type SolverTaskInput = SignalTask & { score: number };
export type SecondOpinion = "agree" | "dispute" | "not_checked";

export type SolvedItem = { solution: Solution; severity: "important" | "watch"; second: SecondOpinion; secondReason: string; kept: boolean };

export type SolverRun = {
  ran: boolean;
  reason: string;
  solved: SolvedItem[];
  dropped: number;
  pending: number;
  costUsd: number;
  calls: number;
};

const rowFp = (key: string) => `sol:${key}`;

/** Прошлые неудачные попытки для нового решения. */
export function attemptFromStrategy(strategy: Strategy, state: StrategyState, title: string): PastAttempt {
  const prices = strategy.steps.filter((p) => p.action).map((p) => `день ${p.day}: ${describePlanAction(p.action!)}`);
  const program = prices.length > 0 ? prices.join(", ") : strategy.steps.map((p) => p.step).join("; ").slice(0, 300);
  const metrics = state.finalMetrics ? Object.entries(state.finalMetrics).map(([k, v]) => `${k}=${v}`).join(", ") : "";
  // Если план выполнен не полностью, это важно знать при выборе следующего подхода: неудача могла быть из-за невыполненных шагов, а не из-за самого подхода.
  const compliance = stepCompliance(strategy, state, Date.parse(state.resolvedAt ?? new Date().toISOString()));
  return { title, goal: strategy.goal, program, result: `не сработало: ${state.reason ?? "критерии не выполнены"}; итог: ${metrics}; исполнение плана: ${compliance.text}` };
}

export async function runSolver(input: {
  db: SupabaseClient;
  userId: string;
  products: ScenarioProduct[];
  tasks: SolverTaskInput[];
  nowMs: number;
  ask?: AiAsk;
  limit?: number;
  /** Не писать в базу (проверочный прогон). */
  dryRun?: boolean;
  /** Разобрать заново даже уже разобранные сигналы. */
  force?: boolean;
}): Promise<SolverRun> {
  const { db, userId, nowMs } = input;
  const none = (reason: string, pending = 0): SolverRun => ({ ran: false, reason, solved: [], dropped: 0, pending, costUsd: 0, calls: 0 });
  if (input.tasks.length === 0) return none("нет открытых сигналов");

  const { data: rows } = await db
    .from("seller_hub_ai_findings")
    .select("task_id, signal_fp, status, owner_accepted, strategy_state, attempts")
    .eq("user_id", userId)
    .eq("marketplace_id", MARKETPLACE)
    .eq("origin", "signal")
    .neq("status", "faded");
  const solvedMap = new Map<string, string>();
  const attempts = new Map<string, PastAttempt[]>();
  for (const r of rows ?? []) {
    const key = r.task_id ? String(r.task_id) : "";
    if (!key) continue;
    if (!input.force && r.signal_fp) solvedMap.set(key, String(r.signal_fp));
    // Идущая стратегия, принятая владельцем, не пересматривается, пока не получен её итог.
    const stStatus = (r.strategy_state as StrategyState | null)?.status;
    const running = r.owner_accepted === true && (stStatus === "running" || stStatus === "scheduled");
    if (running) solvedMap.set(key, "running");
    if (Array.isArray(r.attempts) && r.attempts.length > 0) attempts.set(key, r.attempts as PastAttempt[]);
  }
  const groupsAll = groupSignals(input.tasks);
  for (const g of groupsAll) if (solvedMap.get(g.key) === "running") solvedMap.set(g.key, g.fingerprint);

  const selection = selectGroups(input.tasks, solvedMap, input.limit ?? SOLVER_LIMIT);
  if (selection.toSolve.length === 0) return none("новых или изменившихся сигналов нет");

  const spent = await monthSpend(db, userId, nowMs);
  if (remainingBudget(spent.costUsd, monthCapUsd(), nowMs).todayLeft <= 0) return none(`месячный потолок $${monthCapUsd()} исчерпан`, selection.toSolve.length);

  const profile = buildStoreProfile(input.products);
  const withMedians = withStoreMedians(input.products, profile);
  const facts = new Map(withMedians.filter((p) => p.ai).map((p) => [p.nmId, p.ai!.facts]));
  const titles = new Map(input.products.map((p) => [p.nmId, p.title]));
  const adsByNm = new Map(input.products.map((p) => [p.nmId, p.ads ?? []]));
  const promosByNm = new Map(input.products.map((p) => [p.nmId, p.promos ?? []]));
  const promoOpenByNm = new Map(input.products.map((p) => [p.nmId, p.promoOpen ?? []]));
  const clubByNm = new Map(input.products.map((p) => [p.nmId, p.clubDiscount ?? null]));
  const adsOtherByNm = new Map(input.products.map((p) => [p.nmId, p.adsOther ?? []]));
  const cardsByNm = new Map(input.products.filter((p) => p.card).map((p) => [p.nmId, p.card!]));
  const ask = input.ask ?? defaultAsk;
  const nowIso = new Date(nowMs).toISOString();
  const groupByKey = new Map(groupsAll.map((g) => [g.key, g]));

  const rules = await loadOwnerRules(db, userId).catch(() => NO_RULES);
  const solved: SolvedItem[] = [];
  let dropped = 0;
  let costUsd = 0;
  let calls = 0;
  let budgetStopped = false;

  // Пачки решаются параллельно (по SOLVER_CONCURRENCY): время равно самой долгой пачке, а не сумме. Качество то же: пачки независимы.
  const batches: TaskGroup[][] = [];
  for (let i = 0; i < selection.toSolve.length; i += SOLVER_BATCH) {
    if (!takeAiBudget(userId, "agent-solver", 20, nowMs).ok) {
      budgetStopped = true;
      break;
    }
    batches.push(selection.toSolve.slice(i, i + SOLVER_BATCH));
  }

  const solveBatch = async (batch: TaskGroup[]): Promise<void> => {
    const user = withOwnerRules(solverPayload({ profile, groups: batch, facts, titles, attempts, ads: adsByNm, adsOther: adsOtherByNm, promos: promosByNm, promoOpen: promoOpenByNm, club: clubByNm, cards: cardsByNm, nowIso }), rules);
    let parsed;
    try {
      const first = await ask({ system: SOLVER_SYSTEM, user, maxTokens: 12000, role: "analyst" });
      calls += 1;
      costUsd += first.costUsd;
      parsed = parseSolver(first.text, batch, facts, profile, adsByNm, promosByNm, adsOtherByNm, promoOpenByNm, new Map(), cardsByNm);
      parsed = { ...parsed, items: parsed.items.map((item) => ({ ...item, strategy: applyOwnerRules(item.strategy, rules, currentFromEvidence(item.evidence)) })) };
    } catch (error) {
      console.error("[seller-hub-agent] ИИ-решатель не ответил:", error instanceof Error ? error.message : String(error));
      return;
    }
    dropped += parsed.dropped;
    if (parsed.reasons.length > 0) console.info(`[seller-hub-agent] решатель, не принято: ${parsed.reasons.join(" | ")}`);

    const importantOf = (s: Solution) => {
      const g = groupByKey.get(s.key)!;
      return s.verdict === "problem" && g.tasks.some((t) => t.severity === "critical" || t.severity === "important");
    };
    // Второй ИИ проверяет планы по важным проблемам: согласился (действия остаются), есть замечания (останавливаются только названные шаги) или отверг.
    const toReview = parsed.items.map((s, index) => ({ s, index })).filter(({ s }) => importantOf(s) && s.strategy);
    let verdicts: Array<PlanReview | null> | null = null;
    if (toReview.length > 0) {
      try {
        const second = await ask({ system: PLAN_REVIEWER_SYSTEM, user: JSON.stringify({ picture: JSON.parse(user), plans: toReview.map(({ s }) => planForReview(s)) }), maxTokens: 6000, role: "reviewer" });
        calls += 1;
        costUsd += second.costUsd;
        verdicts = parsePlanReviews(second.text, toReview.length);
      } catch (error) {
        console.error("[seller-hub-agent] второй ИИ решателя не ответил:", error instanceof Error ? error.message : String(error));
      }
    }
    parsed.items.forEach((s, index) => {
      const n = toReview.findIndex((x) => x.index === index);
      const important = importantOf(s);
      // Без проверки вторым ИИ действия программы не включаются: деньги и карточки трогаются только по проверенному плану.
      solved.push(applyPlanReview(s, n < 0 ? null : (verdicts?.[n] ?? null), important));
    });
  };
  for (let i = 0; i < batches.length; i += SOLVER_CONCURRENCY) await Promise.all(batches.slice(i, i + SOLVER_CONCURRENCY).map(solveBatch));

  if (!input.dryRun) {
    for (const s of solved) {
      const sol = s.solution;
      const group = groupByKey.get(sol.key)!;
      const notProblem = sol.verdict === "not_a_problem" || !s.kept;
      const steps = (sol.strategy?.steps ?? []).map((p) => ({ step: `${p.when}: ${p.step}`, by: p.by, action: null }));
      const row = {
        origin: "signal",
        task_id: sol.key,
        task_ids: sol.taskIds,
        signal_fp: group.fingerprint,
        verdict: sol.verdict,
        plan: steps,
        strategy: sol.strategy,
        strategy_state: {},
        nm_id: sol.nmId,
        kind: sol.kind,
        severity: s.severity,
        title: sol.title,
        what: sol.diagnosis,
        why_now: sol.problems.map((p) => p.note).filter(Boolean).join(" "),
        evidence: sol.evidence,
        human_advice: steps.filter((p) => p.by === "human").map((p) => p.step).join(" "),
        action: null,
        algorithm_view: { covered: true, tasks: group.tasks.map((t) => t.title), otherTasks: 0, problems: sol.problems },
        second_opinion: s.second,
        second_reason: s.secondReason,
        owner_accepted: false,
        action_note: "",
        status: notProblem ? "not_problem" : "open",
        last_seen_at: nowIso,
      };
      const fp = rowFp(sol.key);
      const existing = await db.from("seller_hub_ai_findings").select("id, status").eq("user_id", userId).eq("marketplace_id", MARKETPLACE).eq("fingerprint", fp).maybeSingle();
      if (existing.data) {
        // Скрытое владельцем остаётся скрытым, даже если сигнал изменился.
        await db.from("seller_hub_ai_findings").update({ ...row, status: existing.data.status === "dismissed" ? "dismissed" : row.status }).eq("id", existing.data.id);
      } else {
        await db.from("seller_hub_ai_findings").insert({ user_id: userId, marketplace_id: MARKETPLACE, fingerprint: fp, first_seen_at: nowIso, ...row });
      }
    }
    // Все сигналы товара исчезли (алгоритм больше не видит проблему): решение больше не актуально, кроме идущей принятой стратегии.
    const activeKeys = new Set(groupsAll.map((g) => g.key));
    const { data: open } = await db.from("seller_hub_ai_findings").select("id, task_id, owner_accepted, strategy_state").eq("user_id", userId).eq("marketplace_id", MARKETPLACE).eq("origin", "signal").in("status", ["open", "not_problem"]);
    const gone = (open ?? []).filter((r) => r.task_id && !activeKeys.has(String(r.task_id)) && !(r.owner_accepted === true && ["running", "scheduled"].includes(String((r.strategy_state as StrategyState | null)?.status)))).map((r) => r.id as string);
    if (gone.length > 0) await db.from("seller_hub_ai_findings").update({ status: "faded" }).in("id", gone);
    await recordAiUsage(db, userId, { kind: "agent-solver", calls, costUsd, nowMs }).catch(() => undefined);
  }
  console.info(`[seller-hub-agent] решатель: решений ${solved.length}, не принято проверкой цифр ${dropped}, вызовов ${calls}, $${costUsd.toFixed(4)}${budgetStopped ? ", остановлен суточным пределом" : ""}`);
  return { ran: true, reason: "есть новые сигналы", solved, dropped, pending: Math.max(0, selection.toSolve.length - solved.length), costUsd, calls };
}
