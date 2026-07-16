/**
 * Хелперы демо-потока: флаг сессии, стили описаний, разрешение картинок.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEMO_FLOW_IMAGE_RESOLUTION,
  DEMO_FLOW_PLAN_TYPE,
  DEMO_FLOW_VOLUME,
  visualLimitForSession,
} from "@/lib/demo-flow";
import { SUBSCRIPTION_PERIOD_DAYS } from "@/lib/subscription";

export async function isDemoProductSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<boolean> {
  if (!sessionId) return false;
  const { data, error } = await supabase
    .from("product_sessions")
    .select("is_demo")
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !data) return false;
  return Boolean((data as { is_demo?: boolean }).is_demo);
}

export async function getSessionImageResolution(
  supabase: SupabaseClient,
  sessionId: string
): Promise<"2k" | "4k"> {
  const demo = await isDemoProductSession(supabase, sessionId);
  return demo ? DEMO_FLOW_IMAGE_RESOLUTION : "4k";
}

/** В демо: первичная генерация (2 стиля) + ещё одна перегенерация (POST или PUT). */
export const DEMO_DESCRIPTION_MAX_GENS = 2;

export async function getDemoDescriptionGensUsed(
  supabase: SupabaseClient,
  sessionId: string
): Promise<number> {
  const { data } = await supabase
    .from("description_data")
    .select("description_gens_used")
    .eq("session_id", sessionId)
    .maybeSingle();
  return Math.max(0, Math.floor(Number(data?.description_gens_used ?? 0)));
}

/** Можно ли ещё генерировать/переделывать описание в демо. */
export async function assertDemoDescriptionGenAllowed(
  supabase: SupabaseClient,
  sessionId: string
): Promise<{ ok: true; used: number } | { error: string; status: number }> {
  const isDemo = await isDemoProductSession(supabase, sessionId);
  if (!isDemo) return { ok: true, used: 0 };

  const used = await getDemoDescriptionGensUsed(supabase, sessionId);
  if (used >= DEMO_DESCRIPTION_MAX_GENS) {
    return {
      error:
        "В демо-потоке лимит перегенераций описания исчерпан. В полном Потоке — 4 стиля и безлимитные правки.",
      status: 403,
    };
  }
  return { ok: true, used };
}

/** Списать одно использование после успешной генерации/переделки. */
export async function consumeDemoDescriptionGeneration(
  supabase: SupabaseClient,
  sessionId: string
): Promise<{ ok: true; used: number } | { error: string; status: number }> {
  const gate = await assertDemoDescriptionGenAllowed(supabase, sessionId);
  if ("error" in gate) return gate;

  const nextUsed = gate.used + 1;
  const { error } = await supabase.from("description_data").upsert(
    { session_id: sessionId, description_gens_used: nextUsed },
    { onConflict: "session_id" }
  );
  if (error) {
    console.error("[demo-flow] description mark:", error.message);
    return { error: "Не удалось учесть генерацию описания", status: 500 };
  }
  return { ok: true, used: nextUsed };
}

/** @deprecated — используйте assertDemoDescriptionGenAllowed */
export async function assertDemoDescriptionEditAllowed(
  supabase: SupabaseClient,
  sessionId: string
): Promise<{ ok: true } | { error: string; status: number }> {
  const gate = await assertDemoDescriptionGenAllowed(supabase, sessionId);
  if ("error" in gate) return gate;
  return { ok: true };
}

/**
 * Зафиксировать право на демо строго в момент успешной новой регистрации.
 * Повторный вход эту функцию не вызывает.
 */
export async function markDemoFlowEligibleOnRegistration(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase.from("demo_flow_grants").insert({
    user_id: userId,
    registered_at: new Date().toISOString(),
  });
  if (error && error.code !== "23505") {
    console.error("[demo-flow] registration marker:", error.message);
  }
}

/**
 * Выдать демо только аккаунту с регистрационным маркером и только один раз.
 * `granted_at` остаётся навсегда, даже если демо удалено после покупки.
 */
export async function grantDemoFlowOnWelcome(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { data: grant, error: grantSelectErr } = await supabase
    .from("demo_flow_grants")
    .select("granted_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (grantSelectErr) {
    console.error("[demo-flow] grant marker select:", grantSelectErr.message);
    return;
  }
  if (!grant || grant.granted_at) return;

  const { data: existing, error: selectErr } = await supabase
    .from("user_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("plan_type", DEMO_FLOW_PLAN_TYPE)
    .maybeSingle();

  if (selectErr) {
    console.error("[demo-flow] grant select:", selectErr.message);
    return;
  }
  if (existing?.id) {
    await supabase
      .from("demo_flow_grants")
      .update({ granted_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("granted_at", null);
    return;
  }

  const { error: insertErr } = await supabase.from("user_subscriptions").insert({
    user_id: userId,
    plan_type: DEMO_FLOW_PLAN_TYPE,
    plan_volume: DEMO_FLOW_VOLUME,
    period_start: new Date().toISOString(),
    flows_used: 0,
    creative_used: 0,
  });

  if (insertErr) {
    if (insertErr.code !== "23505") {
      console.error("[demo-flow] grant insert:", insertErr.message);
      return;
    }
  }

  const { error: markErr } = await supabase
    .from("demo_flow_grants")
    .update({ granted_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("granted_at", null);
  if (markErr) {
    console.error("[demo-flow] grant mark used:", markErr.message);
  }
}

/**
 * Если у пользователя есть активный платный Поток — демо снимаем полностью.
 */
export async function clearDemoFlowIfHasPaid(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data: flowRow } = await supabase
    .from("user_subscriptions")
    .select("id, plan_volume")
    .eq("user_id", userId)
    .eq("plan_type", "flow")
    .maybeSingle();

  if (!flowRow || Number(flowRow.plan_volume) <= 0) return false;

  const { error } = await supabase
    .from("user_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("plan_type", DEMO_FLOW_PLAN_TYPE);

  if (error) {
    console.error("[demo-flow] clear on paid:", error.message);
    return false;
  }

  const { error: markerError } = await supabase
    .from("demo_flow_grants")
    .update({
      granted_at: new Date().toISOString(),
      removed_for_paid_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (markerError) {
    console.error("[demo-flow] clear marker:", markerError.message);
  }
  return true;
}

export function demoFlowPeriodDays(): number {
  return SUBSCRIPTION_PERIOD_DAYS;
}

export { visualLimitForSession };

/** @deprecated use grantDemoFlowOnWelcome */
export const ensureDemoFlowGrant = grantDemoFlowOnWelcome;
