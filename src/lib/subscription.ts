/**
 * Константы тарифов: Поток (1, 5, 15) и Свободное творчество (10, 30, 100)
 */
export const FLOW_VOLUMES = [1, 5, 15] as const;
export const CREATIVE_VOLUMES = [10, 30, 100] as const;
export const SUBSCRIPTION_PERIOD_DAYS = 30;

export type PlanType = "flow" | "creative";

export interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_type: PlanType;
  plan_volume: number;
  period_start: string;
  flows_used: number;
  creative_used: number;
}

export interface SubscriptionState {
  planType: PlanType;
  planVolume: number;
  flowsUsed: number;
  flowsLimit: number;
  creativeUsed: number;
  creativeLimit: number;
  periodStart?: string;
  expiresAt?: string;
}

export function subscriptionToState(row: SubscriptionRow): SubscriptionState {
  const flowsLimit = row.plan_type === "flow" ? row.plan_volume : 0;
  const creativeLimit = row.plan_type === "creative" ? row.plan_volume : 0;
  const periodStart = row.period_start;
  const expiresAt = getSubscriptionExpiryIso(row);
  return {
    planType: row.plan_type,
    planVolume: row.plan_volume,
    flowsUsed: row.flows_used,
    flowsLimit,
    creativeUsed: row.creative_used,
    creativeLimit,
    periodStart,
    expiresAt,
  };
}

export function getSubscriptionExpiryIso(row: Pick<SubscriptionRow, "period_start">): string {
  const startedAtMs = new Date(row.period_start).getTime();
  if (!Number.isFinite(startedAtMs)) return new Date(0).toISOString();
  return new Date(startedAtMs + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function isSubscriptionExpired(row: Pick<SubscriptionRow, "period_start">, now = new Date()): boolean {
  const expiryMs = new Date(getSubscriptionExpiryIso(row)).getTime();
  if (!Number.isFinite(expiryMs)) return true;
  return now.getTime() >= expiryMs;
}

/** Получить подписку по user_id (серверный Supabase client). */
export async function getSubscriptionByUserId(supabase: any, userId: string): Promise<SubscriptionRow | null> {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as SubscriptionRow;
  if (!isSubscriptionExpired(row)) return row;

  // Тариф истёк: считаем его неактивным и удаляем запись.
  await supabase.from("user_subscriptions").delete().eq("user_id", userId);
  return null;
}
