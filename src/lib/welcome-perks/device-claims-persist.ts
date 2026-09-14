import type { SupabaseClient } from "@supabase/supabase-js";

import { WELCOME_PERKS_WINDOW_MS } from "@/lib/welcome-perks/constants";

function windowStartIso(): string {
  return new Date(Date.now() - WELCOME_PERKS_WINDOW_MS).toISOString();
}

/** Сохранить eligible-claim устройства перед удалением аккаунта (строка в registrations исчезает по CASCADE). */
export async function preserveWelcomePerkDeviceClaimOnAccountDeletion(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("welcome_perk_registrations")
    .select("device_hash, registered_at, perks_eligible")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[welcome-perks] preserve select:", error.message);
    return;
  }

  const row = data as {
    device_hash?: string | null;
    registered_at?: string;
    perks_eligible?: boolean;
  } | null;

  if (!row?.device_hash || row.perks_eligible !== true) return;

  const { error: insErr } = await supabase.from("welcome_perk_device_claims").insert({
    device_hash: row.device_hash,
    registered_at: row.registered_at ?? new Date().toISOString(),
    perks_eligible: true,
  });

  if (insErr) {
    console.error("[welcome-perks] preserve insert:", insErr.message);
  }
}

export async function countPersistedEligibleDeviceClaims(
  supabase: { from: (table: string) => any },
  deviceHash: string
): Promise<number> {
  const { count, error } = await supabase
    .from("welcome_perk_device_claims")
    .select("id", { count: "exact", head: true })
    .eq("device_hash", deviceHash)
    .eq("perks_eligible", true)
    .gte("registered_at", windowStartIso());

  if (error) {
    console.error("[welcome-perks] count persisted claims:", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function oldestPersistedEligibleDeviceClaimAt(
  supabase: { from: (table: string) => any },
  deviceHash: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("welcome_perk_device_claims")
    .select("registered_at")
    .eq("device_hash", deviceHash)
    .eq("perks_eligible", true)
    .gte("registered_at", windowStartIso())
    .order("registered_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[welcome-perks] oldest persisted claim:", error.message);
    return null;
  }
  return (data as { registered_at?: string } | null)?.registered_at ?? null;
}
