import { CREDIT_PHOTO_4K, FLOW_CREDITS_BASE } from "@/lib/credits-pricing";
import { isDemoProductSession } from "@/lib/demo-flow-server";
import { DEMO_FLOW_VISUAL_LIMIT } from "@/lib/demo-flow";
import {
  getFlowSessionCredits,
  parseFlowCreditsState,
} from "@/lib/flow/flow-session-credits";

const VISUAL_GENERATION_LIMIT = Math.floor(FLOW_CREDITS_BASE / CREDIT_PHOTO_4K);

type VisualQuotaState = {
  generation_used?: number;
  generation_limit?: number;
  credits_remaining?: number;
  credits_total?: number;
};

export type VisualQuota = {
  used: number;
  remaining: number;
  limit: number;
};

function toNonNegativeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function defaultQuota(limit: number): VisualQuota {
  return {
    used: 0,
    remaining: limit,
    limit,
  };
}

function quotaFromCredits(creditsTotal: number, creditsRemaining: number): VisualQuota {
  const limit = Math.max(1, Math.floor(creditsTotal / CREDIT_PHOTO_4K));
  const remaining = Math.floor(creditsRemaining / CREDIT_PHOTO_4K);
  const used = Math.max(0, limit - remaining);
  return { used, remaining, limit };
}

async function resolveSessionLimit(supabase: any, sessionId: string): Promise<number> {
  const isDemo = await isDemoProductSession(supabase, sessionId);
  return isDemo ? DEMO_FLOW_VISUAL_LIMIT : VISUAL_GENERATION_LIMIT;
}

/**
 * Квота визуала для UI: читает flow session credits и мапит в «фото 4K эквивалент»
 * (remaining ≈ floor(credits_remaining / 100)).
 */
export async function getVisualQuota(
  supabase: any,
  sessionId: string
): Promise<VisualQuota> {
  const creditsState = await getFlowSessionCredits(supabase, sessionId);
  if (creditsState && creditsState.credits_total > 0) {
    return quotaFromCredits(
      creditsState.credits_total,
      creditsState.credits_remaining
    );
  }

  const sessionLimit = await resolveSessionLimit(supabase, sessionId);
  try {
    const { data, error } = await supabase
      .from("visual_data")
      .select("visual_state")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (error) {
      console.warn("⚠️ [visual-quota] Чтение лимита не удалось, используем дефолт:", error.message);
      return defaultQuota(sessionLimit);
    }

    const state = (data?.visual_state || {}) as VisualQuotaState;
    const parsed = parseFlowCreditsState(state as Record<string, unknown>);
    if (parsed.credits_total > 0) {
      return quotaFromCredits(parsed.credits_total, parsed.credits_remaining);
    }

    const used = toNonNegativeInt(state.generation_used);
    const stored = toNonNegativeInt(state.generation_limit);
    const limit =
      sessionLimit === DEMO_FLOW_VISUAL_LIMIT
        ? DEMO_FLOW_VISUAL_LIMIT
        : stored || VISUAL_GENERATION_LIMIT;
    const remaining = Math.max(0, limit - used);

    return { used, remaining, limit };
  } catch (error) {
    console.warn("⚠️ [visual-quota] Сеть/Supabase недоступны, используем дефолт:", error);
    return defaultQuota(sessionLimit);
  }
}

/**
 * @deprecated Списание через consumeFlowSessionCredits в API-маршрутах генерации.
 */
export async function incrementVisualQuota(
  supabase: any,
  sessionId: string,
  incrementBy: number
): Promise<VisualQuota> {
  void incrementBy;
  return getVisualQuota(supabase, sessionId);
}
