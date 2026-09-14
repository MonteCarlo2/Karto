import { createHash } from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

function emailHashSalt(): string {
  return (
    process.env.WELCOME_DEVICE_SALT?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 24) ||
    "karto-demo-email-v1"
  );
}

export function hashAccountEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  return createHash("sha256")
    .update(`${emailHashSalt()}:${normalized}`)
    .digest("hex");
}

export async function isDemoFlowEmailUsed(
  supabase: SupabaseClient,
  email: string | null | undefined
): Promise<boolean> {
  if (!email?.trim()) return false;
  const emailHash = hashAccountEmail(email);
  const { data, error } = await supabase
    .from("demo_flow_email_usage")
    .select("email_hash")
    .eq("email_hash", emailHash)
    .maybeSingle();

  if (error) {
    console.error("[demo-flow] email usage select:", error.message);
    return false;
  }
  return Boolean(data);
}

export async function recordDemoFlowEmailUsage(
  supabase: SupabaseClient,
  email: string | null | undefined
): Promise<void> {
  if (!email?.trim()) return;
  const emailHash = hashAccountEmail(email);
  const { error } = await supabase.from("demo_flow_email_usage").upsert(
    {
      email_hash: emailHash,
      first_used_at: new Date().toISOString(),
    },
    { onConflict: "email_hash", ignoreDuplicates: true }
  );
  if (error) {
    console.error("[demo-flow] email usage upsert:", error.message);
  }
}

/** Перед удалением аккаунта — запомнить email, если демо уже выдавалось или использовалось. */
export async function preserveDemoFlowEmailUsageOnAccountDeletion(
  supabase: SupabaseClient,
  userId: string,
  email: string | null | undefined
): Promise<void> {
  if (!email?.trim()) return;

  const { data: grant } = await supabase
    .from("demo_flow_grants")
    .select("granted_at")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: demoSub } = await supabase
    .from("user_subscriptions")
    .select("flows_used")
    .eq("user_id", userId)
    .eq("plan_type", "demo_flow")
    .maybeSingle();

  const demoUsed =
    Boolean(grant?.granted_at) || Number((demoSub as { flows_used?: number } | null)?.flows_used) > 0;

  if (!demoUsed) return;
  await recordDemoFlowEmailUsage(supabase, email);
}
