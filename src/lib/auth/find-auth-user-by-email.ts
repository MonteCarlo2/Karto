import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthUserLookup = {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
};

type RpcRow = { id: string; email: string | null; email_confirmed_at: string | null };

/**
 * Поиск пользователя в auth.users по email за один запрос (RPC).
 * Раньше использовался listUsers с пагинацией — на большой базе это висело до таймаута.
 */
export async function findAuthUserByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<AuthUserLookup | null> {
  const p_email = email.trim().toLowerCase();
  const { data, error } = await supabase.rpc("find_auth_user_by_email", { p_email });

  if (error) {
    console.error("[findAuthUserByEmail] rpc:", error.message);
    return null;
  }

  const rows = data as RpcRow[] | RpcRow | null;
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row?.id) return null;

  return {
    id: row.id,
    email: row.email ?? undefined,
    email_confirmed_at: row.email_confirmed_at,
  };
}
