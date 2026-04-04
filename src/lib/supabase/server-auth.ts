import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Серверный anon-клиент с сессией из запроса (cookies).
 * Использует @supabase/ssr — те же фрагментированные cookies, что и createBrowserClient().
 */
export async function createServerClientWithAuth() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("⚠️ NEXT_PUBLIC_SUPABASE_URL или NEXT_PUBLIC_SUPABASE_ANON_KEY не установлены");
    return null;
  }

  try {
    const cookieStore = await cookies();

    return createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
            );
          } catch {
            // В части контекстов (например, статический рендер) set недоступен — только чтение
          }
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("⚠️ Ошибка создания Supabase-клиента с cookies:", message);
    return null;
  }
}
