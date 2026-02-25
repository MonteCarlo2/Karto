import type { SupabaseClient } from "@supabase/supabase-js";

export type PlanType = "flow" | "creative";

/**
 * Единственное место начисления по оплате: добавляет объём к user_subscriptions.
 * Таблица: id, user_id, plan_type, plan_volume, period_start, flows_used, creative_used, created_at (без updated_at).
 */
export async function creditSubscription(
  supabase: SupabaseClient,
  userId: string,
  planType: PlanType,
  addVolume: number
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { data: row } = await supabase
    .from("user_subscriptions")
    .select("id, plan_volume")
    .eq("user_id", userId)
    .eq("plan_type", planType)
    .maybeSingle();

  if (row) {
    const newVolume = (row.plan_volume ?? 0) + addVolume;
    const { error } = await supabase
      .from("user_subscriptions")
      .update({ plan_volume: newVolume, period_start: now })
      .eq("user_id", userId)
      .eq("plan_type", planType);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await supabase.from("user_subscriptions").insert({
    user_id: userId,
    plan_type: planType,
    plan_volume: addVolume,
    period_start: now,
    flows_used: 0,
    creative_used: 0,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
