import type { SupabaseClient } from "@supabase/supabase-js";
import { moscowDateKey } from "@/lib/seller-hub/complete-days";
import { loadOrdersByNm } from "./signals";
import { normalizeRules, type AgentAction, type AgentProposal, type AgentRule } from "@/lib/seller-hub/ads-agent-engine";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { findingProposals, loadActionableFindings } from "./ai-finding-proposals";
import { advanceStrategies, hasOwnerAccepted, markStrategyStepDone } from "./strategy-runner";
import { applyAiLayer } from "./ai-pipeline";
import { measureOutcome, observeUntil } from "./outcomes";
import { reconcileProposals, type ProposalStatus, type StoredProposal } from "./reconcile";
import { scenarioProposalsFor } from "./scenario-inputs";
import { promoWatchProposals, routineEnabled } from "./routines";
import { proposalKey, proposalsFromSnapshot } from "./server-proposals";

const TABLE = "seller_hub_agent_proposals";

export async function loadAgentRules(db: SupabaseClient, userId: string): Promise<AgentRule[]> {
  const { data, error } = await db.from("seller_hub_agent_rules").select("kind, enabled, mode, params").eq("user_id", userId).eq("agent", "ads");
  if (error) throw new Error(`Правила агента не прочитались: ${error.message}`);
  return normalizeRules(data ?? []);
}

/** Сколько пополнено сегодня по кампаниям (по Москве): основа суточного лимита автопополнения. */
export async function loadDepositedToday(db: SupabaseClient, userId: string, nowMs = Date.now()): Promise<Record<string, number>> {
  const dayStart = new Date(`${moscowDateKey(nowMs)}T00:00:00+03:00`).toISOString();
  const { data } = await db
    .from("seller_hub_agent_actions")
    .select("target_id, request")
    .eq("user_id", userId)
    .eq("agent", "ads")
    .eq("action", "ad_deposit")
    .eq("result", "ok")
    .gte("created_at", dayStart);
  const out: Record<string, number> = {};
  for (const a of data ?? []) {
    const sum = (a.request as { sum?: unknown } | null)?.sum;
    if (a.target_id != null && typeof sum === "number") out[String(a.target_id)] = (out[String(a.target_id)] ?? 0) + sum;
  }
  return out;
}

const rowOf = (userId: string, marketplaceId: string, key: string, proposal: AgentProposal, nowIso: string) => ({
  user_id: userId,
  marketplace_id: marketplaceId,
  proposal_key: key,
  rule: proposal.rule,
  title: proposal.title,
  facts: proposal.facts,
  effect: proposal.effect,
  risk: proposal.risk,
  action: proposal.action,
  meta: proposal.meta ?? {},
  last_seen_at: nowIso,
});

export type ProposalSyncResult = { open: number; inserted: number; expired: number; reopened: number; unavailable: string | null };

/**
 * Пересчитывает предложения агента по снимку и приводит таблицу в соответствие: новые добавляет, пропавшие закрывает как устаревшие.
 * Отклонённые и выполненные не возвращаются раньше срока (см. reconcile.ts).
 */
export async function syncAgentProposals(db: SupabaseClient, userId: string, snapshot: SellerCatalogSnapshot, nowMs = Date.now(), options: { rules?: AgentRule[] } = {}): Promise<ProposalSyncResult> {
  const marketplaceId = snapshot.marketplaceId || "wildberries";
  const nowIso = new Date(nowMs).toISOString();
  const [rules, deposited] = await Promise.all([options.rules ? Promise.resolve(options.rules) : loadAgentRules(db, userId), loadDepositedToday(db, userId, nowMs)]);
  const adsCalc = proposalsFromSnapshot({ snapshot, rules, depositedTodayRub: deposited });
  // Сценарии цен: их сбой не должен ронять предложения по рекламе, поэтому ошибка здесь только записывается.
  let scenario: Awaited<ReturnType<typeof scenarioProposalsFor>> = { proposals: [], skipped: [], enabledCount: 0, context: null };
  let scenarioFailed = false;
  try {
    scenario = await scenarioProposalsFor(db, userId, snapshot, nowMs, { forceContext: await hasOwnerAccepted(db, userId).catch(() => false) });
  } catch (error) {
    scenarioFailed = true;
    console.error("[seller-hub-agent] сценарии цен не пересчитались:", error instanceof Error ? error.message : String(error));
  }
  // ИИ-проверка предложений по ценам (аналитик и независимый проверяющий). Включается отдельно: платная. Сбой не мешает предложениям.
  if (process.env.SELLER_HUB_AGENT_AI === "1" && scenario.context) {
    try {
      const layer = await applyAiLayer({ db, userId, context: { proposals: scenario.proposals, ...scenario.context }, nowMs });
      scenario.proposals = layer.proposals;
      if (layer.errors.length > 0) console.error("[seller-hub-agent] ИИ-проверка:", layer.errors.join("; "));
    } catch (error) {
      console.error("[seller-hub-agent] ИИ-проверка не выполнена:", error instanceof Error ? error.message : String(error));
    }
  }
  // Находки наблюдателя с действием, которые подтвердил второй ИИ, становятся предложениями «Выполнить» (те же ограничители, только внутри включённого сценария).
  if (scenario.context) {
    try {
      // Принятые стратегии ведутся по дням: сверка с критериями и очередной шаг цены, когда подошёл срок.
      const advanced = await advanceStrategies(db, userId, scenario.context.products, nowMs);
      const findings = [...(await loadActionableFindings(db, userId)), ...advanced.priceSteps];
      // Шаги плана по рекламе: готовые предложения (параметры посчитаны по свежим данным), без пересечения с уже имеющимися.
      const have = new Set(scenario.proposals.map((p) => p.id));
      scenario.proposals = [...scenario.proposals, ...advanced.proposals.filter((p) => !have.has(p.id))];
      // Регулярная проверка акций (если включена владельцем): предложения выйти из убыточных акций, выполняет только человек.
      if (await routineEnabled(db, userId, "promo_watch").catch(() => false)) {
        const taken = new Set(scenario.proposals.map((p) => p.id));
        scenario.proposals = [...scenario.proposals, ...promoWatchProposals(scenario.context.products).filter((p) => !taken.has(p.id))];
      }
      if (findings.length > 0) {
        const taken = new Set(scenario.proposals.flatMap((p) => (p.action.type === "price" ? [p.action.nmId] : [])));
        const made = findingProposals({ findings, scenarios: scenario.context.scenarios, products: scenario.context.products, taken, states: scenario.context.states, lastChangeAt: scenario.context.lastChangeAt, nowMs, existingCount: scenario.proposals.length });
        scenario.proposals = [...scenario.proposals, ...made.proposals];
        // Владелец должен видеть, почему принятое действие пока не стало предложением (например, пауза после прошлой смены цены).
        const reasonByNm = new Map(made.skipped.map((x) => [x.nmId, x.reason]));
        for (const f of findings.filter((x) => x.ownerAccepted)) {
          const note = reasonByNm.get(f.nmId) ?? "";
          await db.from("seller_hub_ai_findings").update({ action_note: note }).eq("user_id", userId).eq("marketplace_id", "wildberries").eq("nm_id", f.nmId).eq("owner_accepted", true);
        }
      }
    } catch (error) {
      console.error("[seller-hub-agent] предложения по находкам ИИ не собрались:", error instanceof Error ? error.message : String(error));
    }
  }
  // Входные данные для ИИ (в том числе выдержки из отзывов покупателей) в базе предложений не хранятся.
  scenario.proposals = scenario.proposals.map((p) => {
    if (!p.meta || !("aiInput" in p.meta)) return p;
    const { aiInput: _drop, ...meta } = p.meta;
    void _drop;
    return { ...p, meta };
  });
  const calc = {
    proposals: [...(adsCalc.unavailable ? [] : adsCalc.proposals), ...scenario.proposals],
    statsMissing: adsCalc.statsMissing,
    // Расчёта нет вовсе, если нечего считать: ни правил рекламы, ни включённых сценариев цен.
    unavailable: adsCalc.unavailable != null && scenario.enabledCount === 0 && !scenarioFailed ? adsCalc.unavailable : null,
  };

  const { data, error } = await db.from(TABLE).select("proposal_key, status, resolved_at").eq("user_id", userId).eq("marketplace_id", marketplaceId);
  if (error) throw new Error(`Предложения агента не прочитались: ${error.message}`);
  const stored: StoredProposal[] = (data ?? []).map((row) => ({ key: row.proposal_key as string, status: row.status as ProposalStatus, resolvedAt: (row.resolved_at as string | null) ?? null }));

  // Нет расчёта вовсе (правила выключены, нет кампаний): открытые предложения больше не актуальны.
  // Нет статистики рекламы или сценарии не прочитались: расчёт неполный, пустой результат не значит «всё решено», поэтому ничего не закрываем.
  const ops = calc.unavailable
    ? { insert: [], touch: [], reopen: [], expire: stored.filter((row) => row.status === "open").map((row) => row.key) }
    : reconcileProposals(stored, calc.proposals, nowMs);
  if (calc.statsMissing || scenarioFailed) ops.expire = [];

  const upserts = [
    ...ops.insert.map(({ key, proposal }) => ({ ...rowOf(userId, marketplaceId, key, proposal, nowIso), status: "open", first_seen_at: nowIso, resolved_at: null, resolution_note: null })),
    ...ops.touch.map(({ key, proposal }) => rowOf(userId, marketplaceId, key, proposal, nowIso)),
    ...ops.reopen.map(({ key, proposal }) => ({ ...rowOf(userId, marketplaceId, key, proposal, nowIso), status: "open", first_seen_at: nowIso, resolved_at: null, resolution_note: null })),
  ];
  if (upserts.length > 0) {
    const { error: writeError } = await db.from(TABLE).upsert(upserts, { onConflict: "user_id,marketplace_id,proposal_key" });
    if (writeError) throw new Error(`Предложения агента не записались: ${writeError.message}`);
  }
  if (ops.expire.length > 0) {
    const { error: expireError } = await db
      .from(TABLE)
      .update({ status: "expired", resolved_at: nowIso, resolution_note: "Расчёт больше не предлагает это действие" })
      .eq("user_id", userId)
      .eq("marketplace_id", marketplaceId)
      .eq("status", "open")
      .in("proposal_key", ops.expire);
    if (expireError) throw new Error(`Предложения агента не закрылись: ${expireError.message}`);
  }
  return { open: ops.insert.length + ops.touch.length + ops.reopen.length, inserted: ops.insert.length, expired: ops.expire.length, reopened: ops.reopen.length, unavailable: calc.unavailable };
}

export type ProposalRow = {
  id: string;
  key: string;
  rule: string;
  title: string;
  facts: string[];
  effect: string;
  risk: "low" | "medium" | "high";
  action: AgentAction;
  meta: Record<string, unknown>;
  status: ProposalStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
};

export async function listAgentProposals(db: SupabaseClient, userId: string, marketplaceId = "wildberries"): Promise<ProposalRow[]> {
  const { data, error } = await db
    .from(TABLE)
    .select("id, proposal_key, rule, title, facts, effect, risk, action, meta, status, first_seen_at, last_seen_at, resolved_at, resolution_note")
    .eq("user_id", userId)
    .eq("marketplace_id", marketplaceId)
    .in("status", ["open", "done", "dismissed", "failed"])
    .order("last_seen_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Предложения агента не прочитались: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    key: row.proposal_key as string,
    rule: row.rule as string,
    title: row.title as string,
    facts: Array.isArray(row.facts) ? (row.facts as string[]) : [],
    effect: (row.effect as string) ?? "",
    risk: row.risk === "high" ? "high" : row.risk === "medium" ? "medium" : "low",
    action: row.action as AgentAction,
    meta: (row.meta ?? {}) as Record<string, unknown>,
    status: row.status as ProposalStatus,
    firstSeenAt: row.first_seen_at as string,
    lastSeenAt: row.last_seen_at as string,
    resolvedAt: (row.resolved_at as string | null) ?? null,
    resolutionNote: (row.resolution_note as string | null) ?? null,
  }));
}

export async function resolveAgentProposal(
  db: SupabaseClient,
  userId: string,
  id: string,
  status: "done" | "dismissed" | "failed",
  note: string | null,
  nowMs = Date.now(),
): Promise<boolean> {
  const { data: current, error: readError } = await db.from(TABLE).select("id, marketplace_id, action, meta, facts").eq("id", id).eq("user_id", userId).eq("status", "open").maybeSingle();
  if (readError) throw new Error(`Предложение не прочиталось: ${readError.message}`);
  if (!current) return false;

  const { data, error } = await db
    .from(TABLE)
    .update({ status, resolved_at: new Date(nowMs).toISOString(), resolution_note: note })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "open")
    .select("id");
  if (error) throw new Error(`Предложение не обновилось: ${error.message}`);
  if ((data ?? []).length === 0) return false;
  // Выполненное действие записывается в журнал решений; для сценариев цен ещё и состояние сценария вступает в силу только сейчас.
  if (status === "done") await recordExecutedDecision(db, userId, current as ProposalForJournal, note, nowMs);
  // Шаг плана ИИ выполнен: отмечаем, чтобы план шёл дальше и показывал ход.
  const planRef = ((current.meta ?? {}) as { strategy?: { findingId?: string; stepIndex?: number; price?: boolean } }).strategy;
  if (status === "done" && planRef?.findingId && typeof planRef.stepIndex === "number") {
    await markStrategyStepDone(db, userId, planRef.findingId, planRef.stepIndex, planRef.price === true, nowMs).catch((e) => console.error("[seller-hub-agent] шаг плана не отмечен:", e instanceof Error ? e.message : String(e)));
  }
  return true;
}

type ProposalForJournal = { marketplace_id: string; action: AgentAction; meta: Record<string, unknown> | null; facts: unknown };

/** Журнал решений: что было предложено, что сделано, что было и что стало. Состояние сценария меняется только здесь, после выполнения. */
export async function recordExecutedDecision(db: SupabaseClient, userId: string, proposal: ProposalForJournal, note: string | null, nowMs: number): Promise<void> {
  const meta = (proposal.meta ?? {}) as Record<string, unknown>;
  const action = proposal.action;
  const nmId = "nmId" in action ? String(action.nmId) : null;
  const playbook = typeof meta.playbook === "string" ? meta.playbook : null;
  const before = (meta.before ?? {}) as Record<string, unknown>;
  const afterState = action.type === "price" ? { base: action.baseRub, discount: action.discount, buyerPrice: action.targetRub } : {};
  const nextState = meta.nextState ?? null;
  const { error } = await db.from("seller_hub_agent_decisions").insert({
    user_id: userId,
    marketplace_id: proposal.marketplace_id,
    nm_id: nmId,
    playbook,
    action_type: action.type,
    action,
    signals: meta.signals ?? {},
    reasons: meta.reasons ?? [],
    before_state: before,
    after_state: afterState,
    next_state: nextState,
    status: "executed",
    decided_by: "user",
    note,
    executed_at: new Date(nowMs).toISOString(),
    // Результат меряем только для цен: у остальных действий свои проверки в WB.
    observe_until: action.type === "price" ? observeUntil(nowMs) : null,
  });
  if (error) throw new Error(`Решение не записалось в журнал: ${error.message}`);
  if (playbook && nmId && nextState) {
    const { error: stateError } = await db
      .from("seller_hub_agent_playbook_state")
      .upsert({ user_id: userId, marketplace_id: proposal.marketplace_id, nm_id: nmId, playbook, state: nextState, updated_at: new Date(nowMs).toISOString() }, { onConflict: "user_id,marketplace_id,nm_id,playbook" });
    if (stateError) throw new Error(`Состояние сценария не сохранилось: ${stateError.message}`);
  }
}

export type OutcomeSweep = { measured: number; waiting: number };

/** Меряет результат у решений, у которых прошло окно наблюдения. Недостаточно дней — решение остаётся в очереди проверки до следующего раза. */
export async function measureDueOutcomes(db: SupabaseClient, userId: string, nowMs = Date.now()): Promise<OutcomeSweep> {
  const { data, error } = await db
    .from("seller_hub_agent_decisions")
    .select("id, nm_id, executed_at")
    .eq("user_id", userId)
    .eq("status", "executed")
    .is("outcome_verdict", null)
    .not("observe_until", "is", null)
    .lte("observe_until", new Date(nowMs).toISOString())
    .limit(200);
  if (error) throw new Error(`Журнал решений не прочитался: ${error.message}`);
  const due = (data ?? []).filter((row) => row.nm_id);
  if (due.length === 0) return { measured: 0, waiting: 0 };
  const todayKey = moscowDateKey(nowMs);
  const earliest = due.map((row) => (row.executed_at as string).slice(0, 10)).sort()[0]!;
  const since = new Date(Date.parse(`${earliest}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
  const ordersByNm = await loadOrdersByNm(db, userId, since);
  let measured = 0;
  let waiting = 0;
  for (const row of due) {
    const outcome = measureOutcome({ changeDate: moscowDateKey(Date.parse(row.executed_at as string)), todayKey, ordersByDate: ordersByNm.get(row.nm_id as string) ?? new Map<string, number>() });
    if (outcome.verdict === "too_early") {
      waiting += 1;
      continue;
    }
    const { error: writeError } = await db.from("seller_hub_agent_decisions").update({ outcome, outcome_verdict: outcome.verdict, outcome_at: new Date(nowMs).toISOString() }).eq("id", row.id as string).eq("user_id", userId);
    if (writeError) throw new Error(`Результат не записался: ${writeError.message}`);
    measured += 1;
  }
  return { measured, waiting };
}

export type DecisionRow = {
  id: string;
  nmId: string | null;
  playbook: string | null;
  actionType: string;
  reasons: unknown;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  executedAt: string;
  outcomeVerdict: string | null;
  outcome: Record<string, unknown> | null;
};

export async function listAgentDecisions(db: SupabaseClient, userId: string, limit = 50): Promise<DecisionRow[]> {
  const { data, error } = await db
    .from("seller_hub_agent_decisions")
    .select("id, nm_id, playbook, action_type, reasons, before_state, after_state, executed_at, outcome_verdict, outcome")
    .eq("user_id", userId)
    .order("executed_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Журнал решений не прочитался: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    nmId: (row.nm_id as string | null) ?? null,
    playbook: (row.playbook as string | null) ?? null,
    actionType: row.action_type as string,
    reasons: row.reasons,
    before: (row.before_state ?? {}) as Record<string, unknown>,
    after: (row.after_state ?? {}) as Record<string, unknown>,
    executedAt: row.executed_at as string,
    outcomeVerdict: (row.outcome_verdict as string | null) ?? null,
    outcome: (row.outcome as Record<string, unknown> | null) ?? null,
  }));
}

export { proposalKey };
