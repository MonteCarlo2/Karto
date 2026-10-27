import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentAction } from "@/lib/seller-hub/ads-agent-engine";
import { recordAction } from "@/lib/seller-hub/action-log";
import { moscowDateKey } from "@/lib/seller-hub/complete-days";
import { parseAdDepositRequest } from "@/lib/seller-hub/ads-deposit";
import { parseAdMinusRequest } from "@/lib/seller-hub/ads-minus";
import { parseAdRemoveNmRequest } from "@/lib/seller-hub/ads-nms";
import { openSellerHubWbToken, safeSellerHubMessage } from "@/lib/seller-hub/wb-token";
import { supabaseSellerHubSecretDb } from "@/lib/seller-hub/wb-token-store";
import { addWbAdMinusPhrases, depositWbAdBudget, removeWbAdNm, toggleWbAdCampaign } from "@/lib/services/wildberries/ads-write-client";
import { ACTION_SPECS } from "./actions";
import { resolveAgentProposal } from "./repository";

/**
 * Автопилот: выполняет безопасные шаги принятых планов без кнопки, строго по правилам владельца.
 * Условия запуска шага (все сразу): автопилот включён владельцем; у плана включён автопилот; план принят и идёт; вид действия разрешён владельцем и помечен в реестре
 * как допустимый для автоматики (`autoEligible`); не исчерпан суточный предел числа действий и (для пополнения) суммы. Цена, акции, карточка и ставки автопилотом не выполняются:
 * только по кнопке владельца. Каждое действие записывается в журнал действий и в журнал решений с пометкой «Автопилот».
 */

export const AUTOPILOT_TYPES = ["pause", "remove_nm", "minus_phrases", "deposit"] as const;
export type AutopilotType = (typeof AUTOPILOT_TYPES)[number];

export const AUTOPILOT_TYPE_LABEL: Record<AutopilotType, string> = {
  pause: "Ставить на паузу рекламные кампании",
  remove_nm: "Убирать товар из рекламной кампании",
  minus_phrases: "Добавлять минус-фразы (запросы без заказов)",
  deposit: "Пополнять бюджет кампании (500–2000 ₽ за шаг)",
};

/** Регулярные задачи: выполняются сами раз в сутки при включённом автопилоте, без привязки к плану. Каждое действие идёт через те же правила и суточные пределы. */
export const ROUTINES = ["minus_queries", "waste_guard", "autopay", "promo_watch", "weekly_report"] as const;
export type RoutineId = (typeof ROUTINES)[number];
export const ROUTINE_LABEL: Record<RoutineId, string> = {
  minus_queries: "Раз в сутки добавлять минус-фразы: запросы с большим числом кликов и без заказов",
  waste_guard: "Защита бюджета: ставить на паузу кампании и убирать товары, которые тратят деньги без заказов (предложения рекламного агента)",
  promo_watch: "Проверка акций раз в сутки: предлагать выйти из акций, где товар приносит убыток (выход только по вашей кнопке)",
  weekly_report: "Недельный отчёт о работе агентов (по понедельникам): что выполнено, чем закончились планы, что ждёт решения",
  autopay: "Автопополнение: пополнять бюджет активной кампании, когда остаток упал ниже порога рекламного агента (в пределах суточной суммы)",
};
/** Какие предложения рекламного агента выполняет каждая регулярная задача (по полю rule предложения). */
export const ROUTINE_PROPOSAL_RULE: Partial<Record<RoutineId, string>> = { waste_guard: "waste_guard", autopay: "autopay" };
export const isRoutine = (t: string): t is RoutineId => (ROUTINES as readonly string[]).includes(t);

export type AutopilotSettings = { enabled: boolean; allowedTypes: AutopilotType[]; maxActionsPerDay: number; maxDepositPerDayRub: number; routines: RoutineId[] };

export const DEFAULT_AUTOPILOT: AutopilotSettings = { enabled: false, allowedTypes: [...AUTOPILOT_TYPES], maxActionsPerDay: 10, maxDepositPerDayRub: 1000, routines: [] };

export const isAutopilotType = (t: string): t is AutopilotType => (AUTOPILOT_TYPES as readonly string[]).includes(t);

/** Настройки из базы с подрезкой: неизвестные виды отбрасываются, пределы приводятся к допустимым. */
export function normalizeSettings(row: { enabled?: unknown; allowed_types?: unknown; max_actions_per_day?: unknown; max_deposit_per_day_rub?: unknown; routines?: unknown } | null | undefined): AutopilotSettings {
  if (!row) return DEFAULT_AUTOPILOT;
  const types = Array.isArray(row.allowed_types) ? (row.allowed_types as unknown[]).filter((t): t is AutopilotType => typeof t === "string" && isAutopilotType(t)) : DEFAULT_AUTOPILOT.allowedTypes;
  const clamp = (v: unknown, lo: number, hi: number, d: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);
  return { enabled: row.enabled === true, allowedTypes: [...new Set(types)], maxActionsPerDay: clamp(row.max_actions_per_day, 1, 50, 10), maxDepositPerDayRub: clamp(row.max_deposit_per_day_rub, 0, 20000, 1000), routines: Array.isArray(row.routines) ? [...new Set((row.routines as unknown[]).filter((t): t is RoutineId => typeof t === "string" && isRoutine(t)))] : [] };
}

export type AutopilotUsage = { actionsToday: number; depositToday: number };

export type AutopilotDecision = { run: true } | { run: false; reason: string };

/** Решение по одному предложению. Чистая функция: все условия запуска в одном месте и под тестами. */
export function decideAutopilot(input: { action: AgentAction; planAutopilot: boolean; planRunning: boolean; settings: AutopilotSettings; usage: AutopilotUsage }): AutopilotDecision {
  const { action, settings, usage } = input;
  if (!settings.enabled) return { run: false, reason: "автопилот выключен" };
  if (!input.planAutopilot) return { run: false, reason: "у плана автопилот не включён" };
  if (!input.planRunning) return { run: false, reason: "план не идёт" };
  if (!isAutopilotType(action.type)) return { run: false, reason: "этот вид действия автопилот не выполняет: только по кнопке владельца" };
  if (!ACTION_SPECS[action.type].autoEligible) return { run: false, reason: "действие не помечено допустимым для автоматики" };
  if (!settings.allowedTypes.includes(action.type)) return { run: false, reason: "владелец не разрешил этот вид действия автопилоту" };
  if (usage.actionsToday >= settings.maxActionsPerDay) return { run: false, reason: `достигнут суточный предел действий (${settings.maxActionsPerDay})` };
  if (action.type === "deposit" && usage.depositToday + action.sumRub > settings.maxDepositPerDayRub) return { run: false, reason: `пополнение превысило бы суточный предел ${settings.maxDepositPerDayRub} ₽` };
  return { run: true };
}

/** changed: для минус-фраз false, если все фразы уже стояли (ничего не записано). */
export type ServerExecResult = { ok: boolean; error?: string; changed?: boolean };

/** Выполнение разрешённого действия на сервере напрямую в WB. Те же проверки запросов и те же методы записи, что у маршрутов, которыми пользуется кнопка «Выполнить». */
export async function executeAutopilotAction(token: string, action: AgentAction): Promise<ServerExecResult> {
  try {
    if (action.type === "pause") return toggleWbAdCampaign(token, Number(action.campaignId), "pause");
    if (action.type === "remove_nm") {
      const parsed = parseAdRemoveNmRequest({ advertId: Number(action.campaignId), nmId: Number(action.nmId), confirmNmId: Number(action.nmId) });
      return parsed.ok ? removeWbAdNm(token, parsed.request) : { ok: false, error: parsed.error };
    }
    if (action.type === "minus_phrases") {
      const parsed = parseAdMinusRequest({ advertId: Number(action.advertId), nmId: Number(action.nmId), queries: action.queries, confirmCount: action.queries.length });
      if (!parsed.ok) return { ok: false, error: parsed.error };
      const written = await addWbAdMinusPhrases(token, parsed.request);
      return { ok: written.ok, error: written.error, changed: (written.added ?? []).length > 0 };
    }
    if (action.type === "deposit") {
      const parsed = parseAdDepositRequest({ campaignId: Number(action.campaignId), sum: action.sumRub, confirmSum: action.sumRub });
      return parsed.ok ? depositWbAdBudget(token, parsed.request) : { ok: false, error: parsed.error };
    }
    return { ok: false, error: "Вид действия не поддерживается автопилотом" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? safeSellerHubMessage(e.message, token) : "Не удалось выполнить действие" };
  }
}

export const logName = (a: AgentAction) => (a.type === "pause" ? "autopilot_pause" : a.type === "remove_nm" ? "autopilot_remove_nm" : a.type === "minus_phrases" ? "autopilot_minus" : "autopilot_deposit");

export async function loadAutopilotSettings(db: SupabaseClient, userId: string): Promise<AutopilotSettings> {
  const { data } = await db.from("seller_hub_autopilot_settings").select("enabled, allowed_types, max_actions_per_day, max_deposit_per_day_rub, routines").eq("user_id", userId).eq("marketplace_id", "wildberries").maybeSingle();
  return normalizeSettings(data);
}

/** Расход суток: сколько действий и рублей автопилот уже выполнил сегодня (по Москве). */
export async function loadUsageToday(db: SupabaseClient, userId: string, nowMs: number): Promise<AutopilotUsage> {
  const dayStart = new Date(`${moscowDateKey(nowMs)}T00:00:00+03:00`).toISOString();
  const { data: done } = await db.from("seller_hub_agent_proposals").select("action").eq("user_id", userId).eq("marketplace_id", "wildberries").eq("status", "done").like("resolution_note", "Автопилот%").gte("resolved_at", dayStart);
  return { actionsToday: (done ?? []).length, depositToday: (done ?? []).reduce((sum, r) => sum + ((r.action as AgentAction).type === "deposit" ? (r.action as { sumRub: number }).sumRub : 0), 0) };
}

type OpenProposal = { id: string; rule: string; action: AgentAction; meta: { strategy?: { findingId?: string } } | null };

export type AutopilotRunResult = { considered: number; executed: number; failed: number; skipped: Array<{ id: string; reason: string }> };

/**
 * Запуск автопилота по открытым предложениям шагов планов. Вызывается фоном после пересчёта предложений.
 * Всё, что не прошло правила, остаётся предложением «Выполнить» для владельца.
 */
export async function runAutopilot(input: { db: SupabaseClient; userId: string; nowMs: number; exec?: (token: string, action: AgentAction) => Promise<ServerExecResult>; dryRun?: boolean }): Promise<AutopilotRunResult> {
  const { db, userId, nowMs } = input;
  const result: AutopilotRunResult = { considered: 0, executed: 0, failed: 0, skipped: [] };
  const settings = await loadAutopilotSettings(db, userId);
  if (!settings.enabled) return result;

  const { data: open } = await db.from("seller_hub_agent_proposals").select("id, rule, action, meta").eq("user_id", userId).eq("marketplace_id", "wildberries").eq("status", "open");
  const routineRules = new Set(settings.routines.map((r) => ROUTINE_PROPOSAL_RULE[r]).filter((r): r is string => Boolean(r)));
  const isRoutine = (p: OpenProposal) => routineRules.has(p.rule);
  const candidates = ((open ?? []) as OpenProposal[]).filter((p) => (p.meta?.strategy?.findingId || isRoutine(p)) && isAutopilotType(p.action.type));
  if (candidates.length === 0) return result;

  const planIds = [...new Set(candidates.flatMap((p) => (p.meta?.strategy?.findingId ? [p.meta.strategy.findingId] : [])))];
  const { data: plans } = await db.from("seller_hub_ai_findings").select("id, autopilot, owner_accepted, strategy_state").eq("user_id", userId).in("id", planIds);
  const planById = new Map((plans ?? []).map((p) => [String(p.id), p]));

  const usage = await loadUsageToday(db, userId, nowMs);

  let token: string | null = null;
  for (const p of candidates) {
    result.considered += 1;
    const plan = p.meta?.strategy?.findingId ? planById.get(p.meta.strategy.findingId) : undefined;
    const byRoutine = !p.meta?.strategy?.findingId && isRoutine(p);
    const decision = decideAutopilot({ action: p.action, planAutopilot: byRoutine || (plan?.autopilot === true && plan?.owner_accepted === true), planRunning: byRoutine || (plan?.strategy_state as { status?: string } | null)?.status === "running", settings, usage });
    if (!decision.run) {
      result.skipped.push({ id: p.id, reason: decision.reason });
      continue;
    }
    if (input.dryRun) {
      result.executed += 1;
      usage.actionsToday += 1;
      continue;
    }
    if (!token) {
      const opened = await openSellerHubWbToken(userId, supabaseSellerHubSecretDb(db));
      if (!opened.ok) {
        result.skipped.push({ id: p.id, reason: "не удалось открыть доступ к кабинету" });
        break;
      }
      token = opened.token;
    }
    const res = await (input.exec ?? executeAutopilotAction)(token, p.action);
    const targetId = "campaignId" in p.action ? Number(p.action.campaignId) : "advertId" in p.action ? Number((p.action as { advertId: string }).advertId) : null;
    await recordAction({ userId, agent: "ads", action: logName(p.action), targetId: Number.isFinite(targetId ?? NaN) ? targetId : null, request: { proposalId: p.id, type: p.action.type }, result: res.ok ? "ok" : "error", message: res.ok ? "Автопилот выполнил шаг плана" : (res.error ?? "Ошибка"), initiator: "agent" });
    if (res.ok) {
      await resolveAgentProposal(db, userId, p.id, "done", byRoutine ? "Автопилот: регулярная задача выполнена по правилам владельца" : "Автопилот: шаг плана выполнен по правилам владельца", nowMs);
      result.executed += 1;
      usage.actionsToday += 1;
      if (p.action.type === "deposit") usage.depositToday += p.action.sumRub;
    } else {
      await resolveAgentProposal(db, userId, p.id, "failed", `Автопилот не смог выполнить: ${res.error ?? "ошибка WB"}`, nowMs);
      result.failed += 1;
    }
  }
  return result;
}
