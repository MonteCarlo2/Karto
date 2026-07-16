import { isDemoProductSession } from "@/lib/demo-flow-server";
import { DEMO_FLOW_VISUAL_LIMIT } from "@/lib/demo-flow";

const VISUAL_GENERATION_LIMIT = 12;

type VisualQuotaState = {
  generation_used?: number;
  generation_limit?: number;
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

async function resolveSessionLimit(supabase: any, sessionId: string): Promise<number> {
  const isDemo = await isDemoProductSession(supabase, sessionId);
  return isDemo ? DEMO_FLOW_VISUAL_LIMIT : VISUAL_GENERATION_LIMIT;
}

export async function getVisualQuota(
  supabase: any,
  sessionId: string
): Promise<VisualQuota> {
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
    const used = toNonNegativeInt(state.generation_used);
    // Для демо всегда жёсткий лимит; для paid — сохранённый или 12
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

export async function incrementVisualQuota(
  supabase: any,
  sessionId: string,
  incrementBy: number
): Promise<VisualQuota> {
  const step = toNonNegativeInt(incrementBy);
  const sessionLimit = await resolveSessionLimit(supabase, sessionId);
  const { data, error } = await supabase
    .from("visual_data")
    .select("visual_state")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Ошибка чтения лимита визуала: ${error.message || String(error)}`);
  }

  const currentState = (data?.visual_state || {}) as Record<string, unknown>;
  const currentUsed = toNonNegativeInt(currentState.generation_used);
  const stored = toNonNegativeInt(currentState.generation_limit);
  const limit =
    sessionLimit === DEMO_FLOW_VISUAL_LIMIT
      ? DEMO_FLOW_VISUAL_LIMIT
      : stored || VISUAL_GENERATION_LIMIT;
  const nextUsed = Math.min(limit, currentUsed + step);
  const nextState = {
    ...currentState,
    generation_used: nextUsed,
    generation_limit: limit,
  };

  const { error: upsertError } = await supabase
    .from("visual_data")
    .upsert(
      {
        session_id: sessionId,
        visual_state: nextState,
      },
      { onConflict: "session_id" }
    );

  if (upsertError) {
    throw new Error(`Ошибка обновления лимита визуала: ${upsertError.message || String(upsertError)}`);
  }

  return {
    used: nextUsed,
    limit,
    remaining: Math.max(0, limit - nextUsed),
  };
}
