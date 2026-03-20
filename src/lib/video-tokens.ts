import type { SupabaseClient } from "@supabase/supabase-js";

export async function getVideoTokenBalance(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("plan_volume")
    .eq("user_id", userId)
    .eq("plan_type", "video_tokens")
    .maybeSingle();

  if (error) {
    console.warn("[video-tokens] get balance:", error.message);
    return 0;
  }
  return Math.max(0, Number((data as { plan_volume?: number })?.plan_volume ?? 0));
}

export async function addVideoTokens(
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
    console.error("[video-tokens] add:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function consumeVideoTokens(
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
    console.error("[video-tokens] consume rpc error:", error.message);
    return { ok: false, error: error.message };
  }
  if (data !== true) {
    return { ok: false, error: "insufficient_balance" };
  }
  return { ok: true };
}
