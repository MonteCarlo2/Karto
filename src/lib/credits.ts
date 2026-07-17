import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FREE_WELCOME_CREDITS,
  LEGACY_CREATIVE_GEN_TO_CREDITS,
  LEGACY_VIDEO_TOKEN_TO_CREDITS,
} from "@/lib/credits-pricing";

/** Единый кошелёк: user_subscriptions.plan_type = 'credits' (legacy: video_tokens). */
const CREDITS_PLAN_TYPES = ["credits", "video_tokens"] as const;

async function readCreditsRow(
  supabase: SupabaseClient,
  userId: string
): Promise<{ plan_volume?: number; plan_type?: string } | null> {
  for (const planType of CREDITS_PLAN_TYPES) {
    const { data, error } = await supabase
      .from("user_subscriptions")
      .select("plan_volume, plan_type")
      .eq("user_id", userId)
      .eq("plan_type", planType)
      .maybeSingle();
    if (error) {
      console.warn("[credits] get balance:", error.message);
      return null;
    }
    if (data) return data as { plan_volume?: number; plan_type?: string };
  }
  return null;
}

export async function getCreditBalance(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const row = await readCreditsRow(supabase, userId);
  return Math.max(0, Number(row?.plan_volume ?? 0));
}

export async function addCredits(
  supabase: SupabaseClient,
  userId: string,
  amount: number
): Promise<{ ok: boolean; error?: string }> {
  if (amount <= 0) return { ok: true };
  const { error } = await supabase.rpc("add_user_video_tokens", {
    p_user_id: userId,
    p_amount: amount,
  });
  if (error) {
    console.error("[credits] add:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function consumeCredits(
  supabase: SupabaseClient,
  userId: string,
  amount: number
): Promise<{ ok: boolean; error?: string }> {
  if (amount <= 0) return { ok: true };
  const { data, error } = await supabase.rpc("consume_user_video_tokens", {
    p_user_id: userId,
    p_amount: amount,
  });
  if (error) {
    console.error("[credits] consume rpc error:", error.message);
    return { ok: false, error: error.message };
  }
  if (data !== true) {
    return { ok: false, error: "insufficient_balance" };
  }
  return { ok: true };
}

/** Алиасы для постепенной замены импортов video-tokens. */
export const getVideoTokenBalance = getCreditBalance;
export const addVideoTokens = addCredits;
export const consumeVideoTokens = consumeCredits;

/**
 * Одноразовая миграция: остаток creative-генераций → кредиты, обнуляем creative.
 */
export async function migrateLegacyCreativeToCredits(
  supabase: SupabaseClient,
  userId: string
): Promise<{ migrated: number }> {
  const { data: creative } = await supabase
    .from("user_subscriptions")
    .select("plan_volume, creative_used, period_start")
    .eq("user_id", userId)
    .eq("plan_type", "creative")
    .maybeSingle();

  if (!creative) return { migrated: 0 };

  const volume = Math.max(0, Number(creative.plan_volume) || 0);
  const used = Math.max(0, Number(creative.creative_used) || 0);
  const remaining = Math.max(0, volume - used);
  if (remaining <= 0) {
    if (volume > 0) {
      await supabase
        .from("user_subscriptions")
        .delete()
        .eq("user_id", userId)
        .eq("plan_type", "creative");
    }
    return { migrated: 0 };
  }

  const credits = remaining * LEGACY_CREATIVE_GEN_TO_CREDITS;
  const add = await addCredits(supabase, userId, credits);
  if (!add.ok) {
    console.error("[credits] migrate creative failed:", add.error);
    return { migrated: 0 };
  }

  await supabase
    .from("user_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("plan_type", "creative");

  console.log("[credits] migrated creative→credits", userId, remaining, "gens →", credits);
  return { migrated: credits };
}

export async function ensureWelcomeCredits(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const balance = await getCreditBalance(supabase, userId);
  const { data: creative } = await supabase
    .from("user_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("plan_type", "creative")
    .maybeSingle();
  const creditsRow = await readCreditsRow(supabase, userId);

  if (!creative && !creditsRow && balance <= 0) {
    await addCredits(supabase, userId, FREE_WELCOME_CREDITS);
  }
}

export { LEGACY_VIDEO_TOKEN_TO_CREDITS };
