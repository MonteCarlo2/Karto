import type { SupabaseClient } from "@supabase/supabase-js";
import { moscowDateKey } from "@/lib/seller-hub/complete-days";

/**
 * Учёт расхода на нейросети агента в базе: месячный потолок на кабинет и данные для экрана «Агенты».
 * Потолок задаётся SELLER_HUB_AI_MONTH_CAP_USD (по умолчанию 3 доллара). Когда он исчерпан, ИИ молчит, а алгоритмы работают как обычно.
 */

export const DEFAULT_MONTH_CAP_USD = 3;

export const monthCapUsd = (): number => {
  const raw = Number(process.env.SELLER_HUB_AI_MONTH_CAP_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MONTH_CAP_USD;
};

const monthStart = (nowMs: number) => `${moscowDateKey(nowMs).slice(0, 7)}-01`;

export async function monthSpend(db: SupabaseClient, userId: string, nowMs: number): Promise<{ costUsd: number; calls: number }> {
  const { data, error } = await db.from("seller_hub_ai_usage").select("cost_usd, calls").eq("user_id", userId).gte("day", monthStart(nowMs));
  if (error || !data) return { costUsd: 0, calls: 0 };
  return data.reduce((acc, row) => ({ costUsd: acc.costUsd + Number(row.cost_usd ?? 0), calls: acc.calls + Number(row.calls ?? 0) }), { costUsd: 0, calls: 0 });
}

/** Сколько ещё можно потратить в этом месяце; не больше, чем осталось на равную долю дней (чтобы не сжечь всё за неделю). */
export function remainingBudget(spent: number, cap: number, nowMs: number): { monthLeft: number; todayLeft: number } {
  const [y, m, d] = moscowDateKey(nowMs).split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const daysLeft = Math.max(1, daysInMonth - (d ?? 1) + 1);
  const monthLeft = Math.max(0, cap - spent);
  return { monthLeft, todayLeft: Math.min(monthLeft, (monthLeft / daysLeft) * 2) };
}

export async function recordAiUsage(db: SupabaseClient, userId: string, input: { kind: string; calls: number; costUsd: number; nowMs: number }): Promise<void> {
  if (input.calls <= 0 && input.costUsd <= 0) return;
  await db.from("seller_hub_ai_usage").insert({ user_id: userId, day: moscowDateKey(input.nowMs), kind: input.kind, calls: input.calls, cost_usd: Number(input.costUsd.toFixed(5)) });
}
