import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTION_LABEL } from "@/lib/seller-hub/action-labels";
import { moscowDateKey } from "@/lib/seller-hub/complete-days";

/**
 * Недельный отчёт о работе агентов. Только наши данные: что выполнено (журнал действий), чем закончились планы, что ждёт решения.
 * Денежных оценок в отчёте нет: деньги и прибыль смотрите в разделе «Финансы», там они считаются по данным WB и сверяются с банком.
 */

export type WeeklyReport = {
  period: { start: string; end: string };
  actions: { total: number; byUser: number; byAgent: number; errors: number; list: Array<{ label: string; count: number }> };
  plans: { accepted: number; worked: number; notWorked: number; observed: number; running: number };
  finished: Array<{ title: string; outcome: "worked" | "not_worked" | "observed"; reason: string }>;
  openProposals: number;
};

const DAY = 86_400_000;
const keyToMs = (key: string) => Date.parse(`${key}T00:00:00+03:00`);
const addDays = (key: string, n: number) => moscowDateKey(keyToMs(key) + n * DAY + 12 * 3_600_000);

/** Последняя полностью закончившаяся неделя (понедельник–воскресенье по Москве). */
export function lastFullWeek(nowMs: number): { start: string; end: string } {
  const today = moscowDateKey(nowMs);
  const weekday = new Date(`${today}T12:00:00+03:00`).getUTCDay() === 0 ? 7 : new Date(`${today}T12:00:00+03:00`).getUTCDay();
  const end = addDays(today, -weekday);
  return { start: addDays(end, -6), end };
}

export type ReportActionRow = { action: string; result: string; initiator: string };
export type ReportPlanRow = { title: string; state: { status?: string; acceptedAt?: string; resolvedAt?: string; reason?: string } | null };

/** Чистая сборка отчёта из строк журнала и планов. */
export function buildWeeklyReport(input: { period: { start: string; end: string }; actions: ReportActionRow[]; plans: ReportPlanRow[]; openProposals: number }): WeeklyReport {
  const { period } = input;
  const from = keyToMs(period.start);
  const to = keyToMs(period.end) + DAY;
  const inPeriod = (iso?: string) => {
    const t = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(t) && t >= from && t < to;
  };
  const real = input.actions.filter((a) => a.result === "ok" || a.result === "error");
  const counts = new Map<string, number>();
  for (const a of real.filter((x) => x.result === "ok")) counts.set(a.action, (counts.get(a.action) ?? 0) + 1);
  const list = [...counts.entries()].map(([action, count]) => ({ label: ACTION_LABEL[action] ?? action, count })).sort((a, b) => b.count - a.count);
  const ok = real.filter((a) => a.result === "ok");
  const finished = input.plans
    .filter((p) => p.state && (p.state.status === "worked" || p.state.status === "not_worked" || p.state.status === "observed") && inPeriod(p.state.resolvedAt))
    .map((p) => ({ title: p.title, outcome: p.state!.status as "worked" | "not_worked" | "observed", reason: p.state!.reason ?? "" }));
  return {
    period,
    actions: { total: ok.length, byUser: ok.filter((a) => a.initiator !== "agent").length, byAgent: ok.filter((a) => a.initiator === "agent").length, errors: real.filter((a) => a.result === "error").length, list },
    plans: {
      accepted: input.plans.filter((p) => inPeriod(p.state?.acceptedAt)).length,
      worked: finished.filter((f) => f.outcome === "worked").length,
      notWorked: finished.filter((f) => f.outcome === "not_worked").length,
      observed: finished.filter((f) => f.outcome === "observed").length,
      running: input.plans.filter((p) => p.state?.status === "running").length,
    },
    finished: finished.slice(0, 10),
    openProposals: input.openProposals,
  };
}

/** Создаёт отчёт за последнюю закончившуюся неделю, если его ещё нет. Возвращает true, если создан. */
export async function ensureWeeklyReport(db: SupabaseClient, userId: string, nowMs: number): Promise<boolean> {
  const period = lastFullWeek(nowMs);
  const { data: have } = await db.from("seller_hub_agent_reports").select("id").eq("user_id", userId).eq("marketplace_id", "wildberries").eq("kind", "weekly").eq("period_end", period.end).maybeSingle();
  if (have) return false;
  const startIso = new Date(keyToMs(period.start)).toISOString();
  const endIso = new Date(keyToMs(period.end) + DAY).toISOString();
  const [actions, plans, open] = await Promise.all([
    db.from("seller_hub_agent_actions").select("action, result, initiator").eq("user_id", userId).gte("created_at", startIso).lt("created_at", endIso).limit(2000),
    db.from("seller_hub_ai_findings").select("title, strategy_state").eq("user_id", userId).eq("owner_accepted", true).limit(500),
    db.from("seller_hub_agent_proposals").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("marketplace_id", "wildberries").eq("status", "open"),
  ]);
  const report = buildWeeklyReport({
    period,
    actions: (actions.data ?? []) as ReportActionRow[],
    plans: ((plans.data ?? []) as Array<{ title: string; strategy_state: ReportPlanRow["state"] }>).map((p) => ({ title: p.title, state: p.strategy_state })),
    openProposals: open.count ?? 0,
  });
  const { error } = await db.from("seller_hub_agent_reports").insert({ user_id: userId, marketplace_id: "wildberries", kind: "weekly", period_start: period.start, period_end: period.end, payload: report });
  return !error;
}
