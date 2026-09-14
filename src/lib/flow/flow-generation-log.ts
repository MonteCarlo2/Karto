import type { SupabaseClient } from "@supabase/supabase-js";

import { parseFlowCreditsState } from "@/lib/flow/flow-session-credits";

export type FlowSessionOwner = {
  sessionId: string;
  userId: string | null;
  userEmail: string | null;
  isDemo: boolean;
  creditsRemaining: number | null;
  creditsSpent: number | null;
  generationUsed: number | null;
  generationLimit: number | null;
};

/**
 * Привязка session_id Потока к аккаунту (product_sessions + visual_data).
 * Для расследования злоупотреблений и логов на сервере.
 */
export async function resolveFlowSessionOwner(
  supabase: SupabaseClient,
  sessionId: string
): Promise<FlowSessionOwner> {
  const base: FlowSessionOwner = {
    sessionId,
    userId: null,
    userEmail: null,
    isDemo: false,
    creditsRemaining: null,
    creditsSpent: null,
    generationUsed: null,
    generationLimit: null,
  };

  const { data: sessionRow } = await supabase
    .from("product_sessions")
    .select("user_id, is_demo")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionRow) {
    base.userId = typeof sessionRow.user_id === "string" ? sessionRow.user_id : null;
    base.isDemo = Boolean(sessionRow.is_demo);
  }

  if (base.userId) {
    try {
      const { data: authData } = await supabase.auth.admin.getUserById(base.userId);
      base.userEmail = authData.user?.email ?? null;
    } catch {
      /* email optional in logs */
    }
  }

  const { data: visualRow } = await supabase
    .from("visual_data")
    .select("visual_state")
    .eq("session_id", sessionId)
    .maybeSingle();

  const credits = parseFlowCreditsState(
    (visualRow as { visual_state?: Record<string, unknown> } | null)?.visual_state
  );
  if (credits.credits_total > 0 || credits.credits_spent > 0) {
    base.creditsRemaining = credits.credits_remaining;
    base.creditsSpent = credits.credits_spent;
    base.generationUsed = credits.generation_used ?? null;
    base.generationLimit = credits.generation_limit ?? null;
  }

  return base;
}

/** Единый формат строки в «Логи приложения» Timeweb / Vercel. */
export function logFlowGenerationEvent(
  route: string,
  owner: FlowSessionOwner,
  detail?: Record<string, unknown>
): void {
  const parts = [
    `🧾 [FLOW/${route}]`,
    `session_id=${owner.sessionId}`,
    `user_id=${owner.userId ?? "—"}`,
    `email=${owner.userEmail ?? "—"}`,
    `demo=${owner.isDemo ? "yes" : "no"}`,
    `credits_left=${owner.creditsRemaining ?? "?"}`,
    `credits_spent=${owner.creditsSpent ?? "?"}`,
  ];
  if (owner.generationLimit != null) {
    parts.push(`gen=${owner.generationUsed ?? 0}/${owner.generationLimit}`);
  }
  if (detail && Object.keys(detail).length > 0) {
    parts.push(JSON.stringify(detail));
  }
  console.log(parts.join(" | "));
}

export async function logFlowSessionStart(
  supabase: SupabaseClient,
  route: string,
  sessionId: string,
  detail?: Record<string, unknown>
): Promise<FlowSessionOwner> {
  const owner = await resolveFlowSessionOwner(supabase, sessionId);
  logFlowGenerationEvent(route, owner, detail);
  return owner;
}
