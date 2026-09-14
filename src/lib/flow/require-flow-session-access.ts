import type { SupabaseClient } from "@supabase/supabase-js";

export type FlowSessionAccessResult =
  | { ok: true; sessionId: string }
  | { ok: false; error: string; status: 400 | 403 | 404 };

export function parseFlowSessionId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed
    )
  ) {
    return null;
  }
  return trimmed;
}

/** Сессия Потока должна принадлежать текущему пользователю. */
export async function requireFlowSessionAccess(
  supabase: SupabaseClient,
  userId: string,
  rawSessionId: unknown
): Promise<FlowSessionAccessResult> {
  const sessionId = parseFlowSessionId(rawSessionId);
  if (!sessionId) {
    return { ok: false, error: "sessionId обязателен", status: 400 };
  }

  const { data, error } = await supabase
    .from("product_sessions")
    .select("user_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "Сессия Потока не найдена", status: 404 };
  }

  if (!data.user_id || data.user_id !== userId) {
    return { ok: false, error: "Нет доступа к этой сессии Потока", status: 403 };
  }

  return { ok: true, sessionId };
}

export function flowSessionAccessResponse(result: Extract<FlowSessionAccessResult, { ok: false }>) {
  return {
    success: false,
    error: result.error,
    code: result.status === 403 ? "FLOW_SESSION_FORBIDDEN" : "FLOW_SESSION_NOT_FOUND",
  };
}
