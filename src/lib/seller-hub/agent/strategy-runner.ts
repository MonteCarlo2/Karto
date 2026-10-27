import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentProposal } from "@/lib/seller-hub/ads-agent-engine";
import type { ActionableFinding } from "./ai-finding-proposals";
import { attemptFromStrategy } from "./ai-solver-run";
import type { ScenarioProduct } from "./scenario-run";
import { loadAdQueries } from "./ads-queries";
import { adsStepProposal } from "./strategy-step-proposals";
import { dueProgramSteps, evaluateStrategy, normalizeStoredStrategy, pickMetrics, trackedMetrics, type Strategy, type StrategyState } from "./strategy";

/**
 * Ведение принятых решений по дням: фиксирует контрольные точки (которые задал ИИ), измеряет «было → стало» по выбранным метрикам, проверяет критерии успеха и ограничители,
 * по итогу ставит «сработало», «не сработало» или «наблюдение» (при неудаче запоминает попытку и открывает решение заново, чтобы ИИ предложил другой подход),
 * и отдаёт шаги программы, у которых наступил день: шаг цены (через ограничители цены) и шаги по рекламе. Шаги сами не выполняются: каждый становится обычным предложением
 * «Выполнить», подтверждает человек. Шаг считается сделанным, когда владелец выполнил предложение (`markStrategyStepDone`).
 */

const MARKETPLACE = "wildberries";

type Row = { id: string; nm_id: string | null; title: string; strategy: Strategy | null; strategy_state: StrategyState | null; attempts: unknown };

export type AdvanceResult = { priceSteps: ActionableFinding[]; proposals: AgentProposal[]; skipped: Array<{ nmId: string; reason: string }> };

/** Есть ли у пользователя принятые владельцем находки или решения: тогда для расчёта нужны данные товаров даже без включённых сценариев. */
export async function hasOwnerAccepted(db: SupabaseClient, userId: string): Promise<boolean> {
  const { count } = await db.from("seller_hub_ai_findings").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("marketplace_id", MARKETPLACE).eq("owner_accepted", true).neq("status", "dismissed");
  return (count ?? 0) > 0;
}

/** Владелец выполнил предложение по шагу плана: шаг отмечается сделанным, следующий считается от этого момента. */
export async function markStrategyStepDone(db: SupabaseClient, userId: string, findingId: string, stepIndex: number, isPrice: boolean, nowMs: number): Promise<void> {
  const { data } = await db.from("seller_hub_ai_findings").select("strategy_state").eq("id", findingId).eq("user_id", userId).maybeSingle();
  if (!data) return;
  const state = (data.strategy_state ?? {}) as StrategyState;
  const doneSteps = [...new Set([...(state.doneSteps ?? []), stepIndex])];
  const nowIso = new Date(nowMs).toISOString();
  await db.from("seller_hub_ai_findings").update({ strategy_state: { ...state, doneSteps, lastDoneAt: nowIso, ...(isPrice ? { lastPriceDoneAt: nowIso } : {}) } }).eq("id", findingId).eq("user_id", userId);
}

export async function advanceStrategies(db: SupabaseClient, userId: string, products: ScenarioProduct[], nowMs: number): Promise<AdvanceResult> {
  const { data, error } = await db
    .from("seller_hub_ai_findings")
    .select("id, nm_id, title, strategy, strategy_state, attempts")
    .eq("user_id", userId)
    .eq("marketplace_id", MARKETPLACE)
    .eq("owner_accepted", true)
    .not("strategy", "is", null)
    .neq("status", "dismissed");
  if (error) throw new Error(`Решения ИИ не прочитались: ${error.message}`);
  const productByNm = new Map(products.map((p) => [p.nmId, p]));
  const out: AdvanceResult = { priceSteps: [], proposals: [], skipped: [] };

  for (const row of (data ?? []) as Row[]) {
    const strategy = normalizeStoredStrategy(row.strategy);
    const state0 = row.strategy_state ?? {};
    if (!strategy || !state0.acceptedAt || (state0.status && state0.status !== "running")) continue;
    const product = row.nm_id ? productByNm.get(row.nm_id) : undefined;
    const facts = product?.ai?.facts;
    if (!product || !facts || !row.nm_id) continue;
    // Точка отсчёта фиксируется один раз, при первом пересчёте после принятия.
    const base: StrategyState = { ...state0, status: "running", baseline: state0.baseline ?? pickMetrics(facts, trackedMetrics(strategy)) };
    const state = evaluateStrategy(strategy, base, facts, nowMs);
    const changed = JSON.stringify(state) !== JSON.stringify(state0);

    if (state.status === "not_worked") {
      // Не сработало: запоминаем попытку и открываем решение заново, чтобы ИИ предложил другой подход.
      const prior = Array.isArray(row.attempts) ? (row.attempts as unknown[]) : [];
      const attempts = [...prior, attemptFromStrategy(strategy, state, row.title)].slice(-3);
      await db.from("seller_hub_ai_findings").update({ strategy_state: state, owner_accepted: false, signal_fp: null, attempts, status: "open" }).eq("id", row.id);
      continue;
    }
    if (changed) await db.from("seller_hub_ai_findings").update({ strategy_state: state }).eq("id", row.id);
    if (state.status !== "running") continue;

    const due = dueProgramSteps(strategy, { doneSteps: state.doneSteps ?? [], lastPriceDoneAtMs: state.lastPriceDoneAt ? Date.parse(state.lastPriceDoneAt) : null, acceptedAtMs: Date.parse(state.acceptedAt!), nowMs });
    for (const ref of due) {
      const action = ref.step.action;
      if (action.type === "price") {
        out.priceSteps.push({
          nmId: row.nm_id,
          title: row.title,
          humanAdvice: "",
          action: { type: "price", direction: action.direction, stepPercent: action.stepPercent, reason: `Шаг цены плана «${strategy.goal}». ${action.reason}`.trim() },
          ownerAccepted: true,
          stepRef: { findingId: row.id, stepIndex: ref.index },
        });
        continue;
      }
      // Для минус-фраз запросы перечитываются сейчас: минусовать можно только то, что и сейчас без заказов.
      const fresh = action.type === "ads_minus_phrases" ? ((await loadAdQueries(db, userId, [product], nowMs)).get(row.nm_id) ?? []) : undefined;
      const made = adsStepProposal({ ref, findingId: row.id, nmId: row.nm_id, planTitle: row.title, goal: strategy.goal, product, adQueries: fresh });
      if (made.proposal) out.proposals.push(made.proposal);
      else if (made.skip) out.skipped.push({ nmId: row.nm_id, reason: made.skip });
    }
  }
  return out;
}
