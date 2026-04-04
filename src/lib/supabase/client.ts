import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Клиент Supabase в браузере через @supabase/ssr:
 * сессия в cookies (в т.ч. фрагменты sb-…-auth-token.0, .1 …), совместимо с серверными API.
 * Раньше была одна огромная cookie + localStorage — JWT не помещался, сервер видел «обрезанную» сессию.
 */
export function createBrowserClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    const error = new Error(
      "Supabase не настроен. Добавьте NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY в .env.local или в переменные окружения на хостинге."
    );
    console.error("❌", error.message);
    throw error;
  }

  return createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey, {
    isSingleton: true,
  });
}
