/**
 * Константы тарифов: Поток (1, 5, 15) и Свободное творчество (10, 30, 100)
 * Новым пользователям при первом запросе подписки: 3 бесплатные фото-генерации + 100 видео-токенов + 1 демо-поток.
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

export type PlanType = "flow" | "creative" | "video_tokens" | "demo_flow" | "auto_replies";

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
  /** Демо-поток: отдельно от платного Потока (1 раз на аккаунт). */
  demoFlowsUsed: number;
  demoFlowsLimit: number;
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
  /**
   * В БД есть строка plan_type=flow с лимитом, но прошло ≥30 дней с period_start —
   * лимит не применяется. Частая причина: ручное изменение только plan_volume без period_start.
   */
  flowPackExpired?: boolean;
  /** Только при flowPackExpired */
  expiredFlowVolume?: number;
  expiredFlowsUsed?: number;
  expiredFlowPeriodStart?: string;
  /** Демо-поток был, но 30-дневный period_start истёк. */
  demoFlowPackExpired?: boolean;
  expiredDemoFlowVolume?: number;
  expiredDemoFlowsUsed?: number;
  expiredDemoFlowPeriodStart?: string;
  /** Пакет creative был, но 30-дневный period_start истёк. */
  creativePackExpired?: boolean;
  expiredCreativeVolume?: number;
  expiredCreativeUsed?: number;
  expiredCreativePeriodStart?: string;
  /** Все месячные пакеты (flow/creative/video) в БД есть, но период истёк — лимиты не действуют. */
  servicesPeriodExpired?: boolean;
  /** Сроки пакета creative (если строка в БД была). */
  creativePeriodStart?: string;
  creativePeriodEnd?: string;
  /** Сроки пакета flow. */
  flowPeriodStart?: string;
  flowPeriodEnd?: string;
  /** Сроки демо-потока. */
  demoFlowPeriodStart?: string;
  demoFlowPeriodEnd?: string;
  /** Сроки пакета video_tokens. */
  videoPeriodStart?: string;
  videoPeriodEnd?: string;
  /** Пакет автоответов (Отзывы). */
  autoReplyBalance?: number;
  autoReplyWelcomeRemaining?: number;
  autoReplyPaidRemaining?: number;
  autoReplyPeriodStart?: string;
  autoReplyPeriodEnd?: string;
  autoReplyPackExpired?: boolean;
  autoReplyAutoRenew?: boolean;
  autoReplyHasSavedCard?: boolean;
  autoReplyCardLast4?: string;
  autoReplyCardBrand?: string;
  autoReplyNextRenewAt?: string;
  autoReplyTariffIndex?: number;
  autoReplyMonthlyPriceRub?: number;
}

export function subscriptionToState(row: SubscriptionRow): SubscriptionState {
  if (row.plan_type === "video_tokens") {
    return {
      planType: "creative",
      planVolume: 0,
      flowsUsed: 0,
      flowsLimit: 0,
      demoFlowsUsed: 0,
      demoFlowsLimit: 0,
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
  if (row.plan_type === "demo_flow") {
    return {
      planType: "creative",
      planVolume: 0,
      flowsUsed: 0,
      flowsLimit: 0,
      demoFlowsUsed: row.flows_used,
      demoFlowsLimit: row.plan_volume,
      creativeUsed: 0,
      creativeLimit: 0,
      videoTokenBalance: 0,
      videoTokensSpent: 0,
      videoTokensLifetimePurchased: 0,
      periodStart: row.period_start,
      expiresAt: getSubscriptionExpiryIso(row),
    };
  }
  if (row.plan_type === "auto_replies") {
    return {
      planType: "creative",
      planVolume: 0,
      flowsUsed: 0,
      flowsLimit: 0,
      demoFlowsUsed: 0,
      demoFlowsLimit: 0,
      creativeUsed: 0,
      creativeLimit: 0,
      videoTokenBalance: 0,
      videoTokensSpent: 0,
      videoTokensLifetimePurchased: 0,
      periodStart: row.period_start,
      expiresAt: getSubscriptionExpiryIso(row),
    };
  }
  const flowsLimit = row.plan_type === "flow" ? row.plan_volume : 0;
  const creativeLimit = row.plan_type === "creative" ? row.plan_volume : 0;
  const periodStart = row.period_start;
  const expiresAt = getSubscriptionExpiryIso(row);
  return {
    planType: row.plan_type === "flow" ? "flow" : "creative",
    planVolume: row.plan_volume,
    flowsUsed: row.plan_type === "flow" ? row.flows_used : 0,
    flowsLimit,
    demoFlowsUsed: 0,
    demoFlowsLimit: 0,
    creativeUsed: row.plan_type === "creative" ? row.creative_used : 0,
    creativeLimit,
    videoTokenBalance: 0,
    videoTokensSpent: 0,
    videoTokensLifetimePurchased: 0,
    periodStart,
    expiresAt,
  };
}

/** Объединить несколько строк подписки (flow + demo_flow + creative + video_tokens) в одно состояние. */
export function mergeSubscriptionRows(rows: SubscriptionRow[]): SubscriptionState {
  const flowRow = rows.find((r) => r.plan_type === "flow");
  const demoFlowRow = rows.find((r) => r.plan_type === "demo_flow");
  const creativeRow = rows.find((r) => r.plan_type === "creative");
  const videoRow = rows.find((r) => r.plan_type === "video_tokens");
  const flowsLimit = flowRow ? flowRow.plan_volume : 0;
  const demoFlowsLimit = demoFlowRow ? demoFlowRow.plan_volume : 0;
  const creativeLimit = creativeRow ? creativeRow.plan_volume : 0;
  const flowsUsed = flowRow ? flowRow.flows_used : 0;
  const demoFlowsUsed = demoFlowRow ? demoFlowRow.flows_used : 0;
  const creativeUsed = creativeRow ? creativeRow.creative_used : 0;
  const videoTokenBalance = videoRow ? Math.max(0, Number(videoRow.plan_volume) || 0) : 0;
  const videoTokensSpent = videoRow ? Math.max(0, Number(videoRow.video_tokens_spent) || 0) : 0;
  const videoTokensLifetimePurchased = videoRow
    ? Math.max(0, Number(videoRow.video_tokens_lifetime_purchased) || 0)
    : 0;
  const periodStart =
    flowRow?.period_start ??
    demoFlowRow?.period_start ??
    creativeRow?.period_start ??
    videoRow?.period_start ??
    new Date().toISOString();
  return {
    planType: flowsLimit > 0 ? "flow" : "creative",
    planVolume: flowsLimit || creativeLimit,
    flowsUsed,
    flowsLimit,
    demoFlowsUsed,
    demoFlowsLimit,
    creativeUsed,
    creativeLimit,
    videoTokenBalance,
    videoTokensSpent,
    videoTokensLifetimePurchased,
    periodStart,
    expiresAt: flowRow
      ? getSubscriptionExpiryIso(flowRow)
      : demoFlowRow
        ? getSubscriptionExpiryIso(demoFlowRow)
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

const PERIOD_DATE_FMT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** «12 марта 2026 г. — 11 апреля 2026 г.» */
export function formatSubscriptionPeriodRu(
  periodStart?: string,
  periodEnd?: string
): string | null {
  if (!periodStart) return null;
  const startMs = new Date(periodStart).getTime();
  const endMs = periodEnd ? new Date(periodEnd).getTime() : NaN;
  if (!Number.isFinite(startMs)) return null;
  const endIso = Number.isFinite(endMs)
    ? periodEnd!
    : getSubscriptionExpiryIso({ period_start: periodStart });
  const endParsed = new Date(endIso).getTime();
  if (!Number.isFinite(endParsed)) return null;
  return `${PERIOD_DATE_FMT.format(new Date(startMs))} — ${PERIOD_DATE_FMT.format(new Date(endParsed))}`;
}

function enrichWithServicePeriods(
  state: SubscriptionState,
  rows: SubscriptionRow[]
): SubscriptionState {
  const flowRow = rows.find((r) => r.plan_type === "flow");
  const demoFlowRow = rows.find((r) => r.plan_type === "demo_flow");
  const creativeRow = rows.find((r) => r.plan_type === "creative");
  const videoRow = rows.find((r) => r.plan_type === "video_tokens");

  if (flowRow?.period_start && flowRow.plan_volume > 0) {
    state.flowPeriodStart = flowRow.period_start;
    state.flowPeriodEnd = getSubscriptionExpiryIso(flowRow);
  }
  if (demoFlowRow?.period_start && demoFlowRow.plan_volume > 0) {
    state.demoFlowPeriodStart = demoFlowRow.period_start;
    state.demoFlowPeriodEnd = getSubscriptionExpiryIso(demoFlowRow);
  }
  if (creativeRow?.period_start && creativeRow.plan_volume > 0) {
    state.creativePeriodStart = creativeRow.period_start;
    state.creativePeriodEnd = getSubscriptionExpiryIso(creativeRow);
  }
  if (videoRow?.period_start && (videoRow.plan_volume > 0 || (videoRow.video_tokens_lifetime_purchased ?? 0) > 0)) {
    state.videoPeriodStart = videoRow.period_start;
    state.videoPeriodEnd = getSubscriptionExpiryIso(videoRow);
  }
  return state;
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

/** Собрать состояние подписки для UI (в т.ч. когда месячный период истёк). */
export function buildSubscriptionStateFromRows(
  rows: SubscriptionRow[],
  active: SubscriptionRow[]
): SubscriptionState {
  if (active.length > 0) {
    const merged = mergeSubscriptionRows(active);
    const flowRow = rows.find((r) => r.plan_type === "flow");
    const demoFlowRow = rows.find((r) => r.plan_type === "demo_flow");
    let state = enrichWithServicePeriods(merged, rows);
    if (flowRow && isSubscriptionExpired(flowRow) && flowRow.plan_volume > 0) {
      state = {
        ...state,
        flowsLimit: 0,
        flowPackExpired: true,
        expiredFlowVolume: flowRow.plan_volume,
        expiredFlowsUsed: flowRow.flows_used,
        expiredFlowPeriodStart: flowRow.period_start,
      };
    }
    if (demoFlowRow && isSubscriptionExpired(demoFlowRow) && demoFlowRow.plan_volume > 0) {
      state = {
        ...state,
        demoFlowsLimit: 0,
        demoFlowPackExpired: true,
        expiredDemoFlowVolume: demoFlowRow.plan_volume,
        expiredDemoFlowsUsed: demoFlowRow.flows_used,
        expiredDemoFlowPeriodStart: demoFlowRow.period_start,
      };
    }
    return state;
  }

  const flowRow = rows.find((r) => r.plan_type === "flow");
  const demoFlowRow = rows.find((r) => r.plan_type === "demo_flow");
  const creativeRow = rows.find((r) => r.plan_type === "creative");
  const videoRow = rows.find((r) => r.plan_type === "video_tokens");

  const state: SubscriptionState = {
    planType: flowRow && flowRow.plan_volume > 0 ? "flow" : "creative",
    planVolume: 0,
    flowsUsed: flowRow?.flows_used ?? 0,
    flowsLimit: 0,
    demoFlowsUsed: demoFlowRow?.flows_used ?? 0,
    demoFlowsLimit: 0,
    creativeUsed: creativeRow?.creative_used ?? 0,
    creativeLimit: 0,
    videoTokenBalance: 0,
    videoTokensSpent: videoRow ? Math.max(0, Number(videoRow.video_tokens_spent) || 0) : 0,
    videoTokensLifetimePurchased: videoRow
      ? Math.max(0, Number(videoRow.video_tokens_lifetime_purchased) || 0)
      : 0,
    servicesPeriodExpired: true,
  };

  if (flowRow && flowRow.plan_volume > 0) {
    state.flowPackExpired = true;
    state.expiredFlowVolume = flowRow.plan_volume;
    state.expiredFlowsUsed = flowRow.flows_used;
    state.expiredFlowPeriodStart = flowRow.period_start;
    state.planVolume = flowRow.plan_volume;
  }

  if (demoFlowRow && demoFlowRow.plan_volume > 0) {
    state.demoFlowPackExpired = true;
    state.expiredDemoFlowVolume = demoFlowRow.plan_volume;
    state.expiredDemoFlowsUsed = demoFlowRow.flows_used;
    state.expiredDemoFlowPeriodStart = demoFlowRow.period_start;
  }

  if (creativeRow && creativeRow.plan_volume > 0) {
    state.creativePackExpired = true;
    state.expiredCreativeVolume = creativeRow.plan_volume;
    state.expiredCreativeUsed = creativeRow.creative_used;
    state.expiredCreativePeriodStart = creativeRow.period_start;
  }

  return enrichWithServicePeriods(state, rows);
}

/** Сколько запусков Потока доступно (платный + демо). */
export function availableFlowStarts(sub: Pick<SubscriptionState, "flowsLimit" | "flowsUsed" | "demoFlowsLimit" | "demoFlowsUsed">): {
  paidLeft: number;
  demoLeft: number;
  totalLeft: number;
} {
  const paidLeft = Math.max(0, (sub.flowsLimit ?? 0) - (sub.flowsUsed ?? 0));
  const demoLeft = Math.max(0, (sub.demoFlowsLimit ?? 0) - (sub.demoFlowsUsed ?? 0));
  return { paidLeft, demoLeft, totalLeft: paidLeft + demoLeft };
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
  return buildSubscriptionStateFromRows(rows, active);
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
