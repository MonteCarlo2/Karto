import type { SupabaseClient } from "@supabase/supabase-js";

/** Откат незавершённой регистрации, если письмо с кодом не ушло. */
export async function rollbackPendingSignup(
  supabase: SupabaseClient,
  userId: string,
  deleteAuthUser: boolean
): Promise<void> {
  await supabase.from("signup_email_verification").delete().eq("user_id", userId);

  if (!deleteAuthUser) return;

  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    console.error("[signup-rollback] deleteUser:", error.message);
  }
}
