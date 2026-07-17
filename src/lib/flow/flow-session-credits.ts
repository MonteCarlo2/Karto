/**
 * Кредиты внутри сессии Потока (visual_state в visual_data).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { creditsPerFlowGrant, photoCreditCost } from "@/lib/credits-pricing";
import { DEMO_FLOW_VISUAL_LIMIT, DEMO_FLOW_IMAGE_RESOLUTION } from "@/lib/demo-flow";

export type FlowCreditsState = {
  credits_remaining: number;
  credits_total: number;
  credits_spent: number;
  /** legacy */
  generation_used?: number;
  generation_limit?: number;
};

function toNonNeg(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

export function parseFlowCreditsState(
  raw: Record<string, unknown> | null | undefined
): FlowCreditsState {
  const credits_total = toNonNeg(raw?.credits_total);
  const credits_remaining = Math.max(
    0,
    raw?.credits_remaining != null
      ? Math.floor(Number(raw.credits_remaining))
      : credits_total
  );
  const credits_spent = toNonNeg(raw?.credits_spent);
  return {
    credits_remaining,
    credits_total,
    credits_spent,
    generation_used: toNonNeg(raw?.generation_used),
    generation_limit: toNonNeg(raw?.generation_limit),
  };
}

export async function seedFlowSessionCredits(
  supabase: SupabaseClient,
  sessionId: string,
  opts: { isDemo: boolean; flowPlanVolume: number }
): Promise<FlowCreditsState> {
  let total: number;
  if (opts.isDemo) {
    // 5 фото 2K
    total = DEMO_FLOW_VISUAL_LIMIT * photoCreditCost(DEMO_FLOW_IMAGE_RESOLUTION);
  } else {
    total = creditsPerFlowGrant(opts.flowPlanVolume);
  }

  const state: FlowCreditsState = {
    credits_remaining: total,
    credits_total: total,
    credits_spent: 0,
    generation_used: 0,
    generation_limit: opts.isDemo ? DEMO_FLOW_VISUAL_LIMIT : Math.floor(total / 100),
  };

  const { error } = await supabase.from("visual_data").upsert(
    {
      session_id: sessionId,
      visual_state: state,
    },
    { onConflict: "session_id" }
  );
  if (error) {
    console.warn("[flow-credits] seed failed:", error.message);
  }
  return state;
}

export async function getFlowSessionCredits(
  supabase: SupabaseClient,
  sessionId: string
): Promise<FlowCreditsState | null> {
  const { data, error } = await supabase
    .from("visual_data")
    .select("visual_state")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error || !data) return null;
  return parseFlowCreditsState(
    (data as { visual_state?: Record<string, unknown> }).visual_state
  );
}

export async function consumeFlowSessionCredits(
  supabase: SupabaseClient,
  sessionId: string,
  amount: number
): Promise<{ ok: boolean; state?: FlowCreditsState; error?: string }> {
  if (amount <= 0) {
    const cur = await getFlowSessionCredits(supabase, sessionId);
    return { ok: true, state: cur ?? undefined };
  }

  const current = await getFlowSessionCredits(supabase, sessionId);
  if (!current) {
    return { ok: false, error: "no_flow_credits_state" };
  }
  if (current.credits_remaining < amount) {
    return { ok: false, error: "insufficient_flow_credits", state: current };
  }

  const next: FlowCreditsState = {
    ...current,
    credits_remaining: current.credits_remaining - amount,
    credits_spent: current.credits_spent + amount,
    generation_used: (current.generation_used ?? 0) + 1,
  };

  const { error } = await supabase
    .from("visual_data")
    .update({ visual_state: next })
    .eq("session_id", sessionId);

  if (error) {
    return { ok: false, error: error.message, state: current };
  }
  return { ok: true, state: next };
}

/** Возврат кредитов при сбое генерации (например, не удалось создать видео-задачу). */
export async function refundFlowSessionCredits(
  supabase: SupabaseClient,
  sessionId: string,
  amount: number
): Promise<void> {
  if (amount <= 0) return;

  const current = await getFlowSessionCredits(supabase, sessionId);
  if (!current) return;

  const next: FlowCreditsState = {
    ...current,
    credits_remaining: Math.min(
      current.credits_total,
      current.credits_remaining + amount
    ),
    credits_spent: Math.max(0, current.credits_spent - amount),
    generation_used: Math.max(0, (current.generation_used ?? 0) - 1),
  };

  await supabase
    .from("visual_data")
    .update({ visual_state: next })
    .eq("session_id", sessionId);
}

/** Сжигание остатка при завершении Потока. */
export async function burnFlowSessionCredits(
  supabase: SupabaseClient,
  sessionId: string
): Promise<void> {
  const current = await getFlowSessionCredits(supabase, sessionId);
  if (!current) return;
  const next: FlowCreditsState = {
    ...current,
    credits_remaining: 0,
  };
  await supabase
    .from("visual_data")
    .update({ visual_state: next })
    .eq("session_id", sessionId);
}
