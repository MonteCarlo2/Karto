/**
 * Константы тарифов: Поток (1, 5, 15) и Свободное творчество (10, 30, 100)
 * Новым пользователям при первом запросе подписки: 3 бесплатные фото-генерации + 100 видео-токенов.
 */
export const FLOW_VOLUMES = [1, 5, 15] as const;
export const CREATIVE_VOLUMES = [10, 30, 100] as const;
/** Цены в рублях: Поток (1/5/15), Свободное творчество (10/30/100 ген.). */
export const FLOW_PRICES = [299, 1190, 2990] as const;
export const CREATIVE_PRICES = [249, 590, 1490] as const;
/** Количество бесплатных генераций «Свободное творчество» для новых пользователей после регистрации */
export const FREE_WELCOME_CREATIVE_LIMIT = 3;
/** Бесплатные видео-токены при первом запросе подписки (вместе с приветственными фото) */
export const FREE_WELCOME_VIDEO_TOKENS = 100;
export const SUBSCRIPTION_PERIOD_DAYS = 30;

export type PlanType = "flow" | "creative" | "video_tokens";

export interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_type: PlanType;
  plan_volume: number;
  period_start: string;
  flows_used: number;
  creative_used: number;
  /** Только plan_type = video_tokens: накопленно списано токенов */
  video_tokens_spent?: number;
  /** Только plan_type = video_tokens: сумма токенов, начисленных покупками за всё время */
  video_tokens_lifetime_purchased?: number;
}

export interface SubscriptionState {
  /** Для объединённого состояния UI: всегда flow или creative (не video_tokens). */
  planType: "flow" | "creative";
  planVolume: number;
  flowsUsed: number;
  flowsLimit: number;
  creativeUsed: number;
  creativeLimit: number;
  /** Кредиты только на видео (пополнение отдельными пакетами). */
  videoTokenBalance: number;
  /** Всего списано видео-токенов (из строки user_subscriptions plan_type=video_tokens). */
  videoTokensSpent: number;
  /** Всего начислено покупками (lifetime) для video_tokens. */
  videoTokensLifetimePurchased: number;
  periodStart?: string;
  expiresAt?: string;
}

export function subscriptionToState(row: SubscriptionRow): SubscriptionState {
  if (row.plan_type === "video_tokens") {
    return {
      planType: "creative",
      planVolume: 0,
      flowsUsed: 0,
      flowsLimit: 0,
      creativeUsed: 0,
      creativeLimit: 0,
      videoTokenBalance: Math.max(0, Number(row.plan_volume) || 0),
      videoTokensSpent: Math.max(0, Number(row.video_tokens_spent) || 0),
      videoTokensLifetimePurchased: Math.max(
        0,
        Number(row.video_tokens_lifetime_purchased) || 0
      ),
      periodStart: row.period_start,
      expiresAt: getSubscriptionExpiryIso(row),
    };
  }
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
    videoTokenBalance: 0,
    videoTokensSpent: 0,
    videoTokensLifetimePurchased: 0,
    periodStart,
    expiresAt,
  };
}

/** Объединить несколько строк подписки (flow + creative + video_tokens) в одно состояние. */
export function mergeSubscriptionRows(rows: SubscriptionRow[]): SubscriptionState {
  const flowRow = rows.find((r) => r.plan_type === "flow");
  const creativeRow = rows.find((r) => r.plan_type === "creative");
  const videoRow = rows.find((r) => r.plan_type === "video_tokens");
  const flowsLimit = flowRow ? flowRow.plan_volume : 0;
  const creativeLimit = creativeRow ? creativeRow.plan_volume : 0;
  const flowsUsed = flowRow ? flowRow.flows_used : 0;
  const creativeUsed = creativeRow ? creativeRow.creative_used : 0;
  const videoTokenBalance = videoRow ? Math.max(0, Number(videoRow.plan_volume) || 0) : 0;
  const videoTokensSpent = videoRow ? Math.max(0, Number(videoRow.video_tokens_spent) || 0) : 0;
  const videoTokensLifetimePurchased = videoRow
    ? Math.max(0, Number(videoRow.video_tokens_lifetime_purchased) || 0)
    : 0;
  const periodStart =
    flowRow?.period_start ??
    creativeRow?.period_start ??
    videoRow?.period_start ??
    new Date().toISOString();
  return {
    planType: flowsLimit > 0 ? "flow" : "creative",
    planVolume: flowsLimit || creativeLimit,
    flowsUsed,
    flowsLimit,
    creativeUsed,
    creativeLimit,
    videoTokenBalance,
    videoTokensSpent,
    videoTokensLifetimePurchased,
    periodStart,
    expiresAt: flowRow
      ? getSubscriptionExpiryIso(flowRow)
      : creativeRow
        ? getSubscriptionExpiryIso(creativeRow)
        : videoRow
          ? getSubscriptionExpiryIso(videoRow)
          : undefined,
  };
}

export function getSubscriptionExpiryIso(row: Pick<SubscriptionRow, "period_start">): string {
  const startedAtMs = new Date(row.period_start).getTime();
  if (!Number.isFinite(startedAtMs)) return new Date(0).toISOString();
  return new Date(startedAtMs + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function isSubscriptionExpired(
  row: Pick<SubscriptionRow, "period_start" | "plan_type">,
  now = new Date()
): boolean {
  const expiryMs = new Date(getSubscriptionExpiryIso(row)).getTime();
  if (!Number.isFinite(expiryMs)) return true;
  return now.getTime() >= expiryMs;
}

/** Активные строки: не истёк 30-дневный период с period_start (включая video_tokens). */
export function filterActiveSubscriptionRows(rows: SubscriptionRow[]): SubscriptionRow[] {
  return rows.filter((r) => !isSubscriptionExpired(r));
}

/** Получить подписку по user_id. Не удаляем строки по сроку — только выборка и объединение. */
export async function getSubscriptionByUserId(supabase: any, userId: string): Promise<SubscriptionState | null> {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("*")
    .eq("user_id", userId);
  if (error) return null;
  const rows = (data ?? []) as SubscriptionRow[];
  if (rows.length === 0) return null;
  const active = filterActiveSubscriptionRows(rows);
  if (active.length === 0) return null;
  return mergeSubscriptionRows(active);
}

/** Получить сырые строки подписки по user_id (для списания потока/генераций). */
export async function getSubscriptionRowsByUserId(supabase: any, userId: string): Promise<SubscriptionRow[]> {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("*")
    .eq("user_id", userId);
  if (error || !data) return [];
  return filterActiveSubscriptionRows(data as SubscriptionRow[]);
}
