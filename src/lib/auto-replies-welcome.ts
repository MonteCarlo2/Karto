import type { SupabaseClient } from "@supabase/supabase-js";

export const AUTO_REPLY_WELCOME_CREDITS = 30;

export async function grantAutoReplyWelcomeIfEligible(
  supabase: SupabaseClient,
  userId: string
): Promise<{ ok: boolean; granted: boolean; balance?: number; error?: string }> {
  const { data: existingGrant } = await supabase
    .from("auto_reply_welcome_grants")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingGrant) {
    return { ok: true, granted: false };
  }

  const { error: grantErr } = await supabase
    .from("auto_reply_welcome_grants")
    .insert({ user_id: userId });

  if (grantErr?.code === "23505") {
    return { ok: true, granted: false };
  }
  if (grantErr) {
    console.error("[auto-replies-welcome] grant insert:", grantErr.message);
    return { ok: false, granted: false, error: grantErr.message };
  }

  const { data: row } = await supabase
    .from("user_subscriptions")
    .select("id, auto_reply_welcome_remaining")
    .eq("user_id", userId)
    .eq("plan_type", "auto_replies")
    .maybeSingle();

  const nowIso = new Date().toISOString();

  if (row) {
    const nextWelcome =
      Math.max(0, Number((row as { auto_reply_welcome_remaining?: number }).auto_reply_welcome_remaining ?? 0)) +
      AUTO_REPLY_WELCOME_CREDITS;
    const { error } = await supabase
      .from("user_subscriptions")
      .update({ auto_reply_welcome_remaining: nextWelcome })
      .eq("user_id", userId)
      .eq("plan_type", "auto_replies");
    if (error) {
      console.error("[auto-replies-welcome] update:", error.message);
      return { ok: false, granted: false, error: error.message };
    }
    return { ok: true, granted: true, balance: nextWelcome };
  }

  const { error: insertErr } = await supabase.from("user_subscriptions").insert({
    user_id: userId,
    plan_type: "auto_replies",
    plan_volume: 0,
    auto_reply_welcome_remaining: AUTO_REPLY_WELCOME_CREDITS,
    period_start: nowIso,
    flows_used: 0,
    creative_used: 0,
  });

  if (insertErr) {
    console.error("[auto-replies-welcome] insert:", insertErr.message);
    return { ok: false, granted: false, error: insertErr.message };
  }

  return { ok: true, granted: true, balance: AUTO_REPLY_WELCOME_CREDITS };
}
