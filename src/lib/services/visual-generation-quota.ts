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

export async function getVisualQuota(
  supabase: any,
  sessionId: string
): Promise<VisualQuota> {
  const { data, error } = await supabase
    .from("visual_data")
    .select("visual_state")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Ошибка чтения лимита визуала: ${error.message || String(error)}`);
  }

  const state = (data?.visual_state || {}) as VisualQuotaState;
  const used = toNonNegativeInt(state.generation_used);
  const limit = toNonNegativeInt(state.generation_limit) || VISUAL_GENERATION_LIMIT;
  const remaining = Math.max(0, limit - used);

  return { used, remaining, limit };
}

export async function incrementVisualQuota(
  supabase: any,
  sessionId: string,
  incrementBy: number
): Promise<VisualQuota> {
  const step = toNonNegativeInt(incrementBy);
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
  const limit = toNonNegativeInt(currentState.generation_limit) || VISUAL_GENERATION_LIMIT;
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

