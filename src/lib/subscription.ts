/**
 * Константы тарифов: Поток (1, 5, 15) и Свободное творчество (10, 30, 100)
 * Новым пользователям при первом запросе подписки выдаётся приветственный лимит — 3 бесплатные генерации.
 */
export const FLOW_VOLUMES = [1, 5, 15] as const;
export const CREATIVE_VOLUMES = [10, 30, 100] as const;
/** Количество бесплатных генераций «Свободное творчество» для новых пользователей после регистрации */
export const FREE_WELCOME_CREATIVE_LIMIT = 3;
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

/** Объединить несколько строк подписки (flow + creative) в одно состояние. */
export function mergeSubscriptionRows(rows: SubscriptionRow[]): SubscriptionState {
  const flowRow = rows.find((r) => r.plan_type === "flow");
  const creativeRow = rows.find((r) => r.plan_type === "creative");
  const flowsLimit = flowRow ? flowRow.plan_volume : 0;
  const creativeLimit = creativeRow ? creativeRow.plan_volume : 0;
  const flowsUsed = flowRow ? flowRow.flows_used : 0;
  const creativeUsed = creativeRow ? creativeRow.creative_used : 0;
  const periodStart = flowRow?.period_start ?? creativeRow?.period_start ?? new Date().toISOString();
  return {
    planType: flowsLimit > 0 ? "flow" : "creative",
    planVolume: flowsLimit || creativeLimit,
    flowsUsed,
    flowsLimit,
    creativeUsed,
    creativeLimit,
    periodStart,
    expiresAt: flowRow ? getSubscriptionExpiryIso(flowRow) : creativeRow ? getSubscriptionExpiryIso(creativeRow) : undefined,
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

/** Получить подписку по user_id (одна строка — для обратной совместимости, если одна запись). */
export async function getSubscriptionByUserId(supabase: any, userId: string): Promise<SubscriptionState | null> {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("*")
    .eq("user_id", userId);
  if (error) return null;
  const rows = (data ?? []) as SubscriptionRow[];
  const valid: SubscriptionRow[] = [];
  for (const row of rows) {
    if (isSubscriptionExpired(row)) {
      await supabase.from("user_subscriptions").delete().eq("id", row.id);
    } else {
      valid.push(row);
    }
  }
  if (valid.length === 0) return null;
  return mergeSubscriptionRows(valid);
}

/** Получить сырые строки подписки по user_id (для списания потока/генераций). */
export async function getSubscriptionRowsByUserId(supabase: any, userId: string): Promise<SubscriptionRow[]> {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("*")
    .eq("user_id", userId);
  if (error || !data) return [];
  return (data as SubscriptionRow[]).filter((r) => !isSubscriptionExpired(r));
}
