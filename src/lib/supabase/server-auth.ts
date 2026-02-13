import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Создает серверный клиент Supabase с сессией пользователя из cookies
 * Используется для получения информации о текущем пользователе
 */
export async function createServerClientWithAuth() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn("⚠️ NEXT_PUBLIC_SUPABASE_URL или NEXT_PUBLIC_SUPABASE_ANON_KEY не установлены");
      return null;
    }

    const cookieStore = await cookies();
    
    // Получаем project ref из URL для правильного имени cookie
    const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1] || 'default';
    const authTokenCookieName = `sb-${projectRef}-auth-token`;
    
    // Получаем все cookies для отладки
    const allCookies = cookieStore.getAll();
    const authCookies = allCookies.filter(c => 
      c.name.includes('auth') || 
      c.name.includes('supabase') || 
      c.name === authTokenCookieName
    );
    
    // Логируем найденные auth cookies (только для отладки)
    if (authCookies.length > 0) {
      console.log("🔍 [server-auth] Найдено auth cookies:", authCookies.map(c => c.name));
    } else {
      console.warn("⚠️ [server-auth] Auth cookies не найдены. Ожидаемое имя:", authTokenCookieName);
      console.warn("⚠️ [server-auth] Все cookies:", allCookies.map(c => c.name));
    }
    
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          let value = cookieStore.get(name)?.value;
          if (!value && name.includes('auth-token')) {
            value = cookieStore.get(authTokenCookieName)?.value;
          }
          if (!value && name.includes('auth')) {
            for (const cookie of allCookies) {
              if (cookie.name.includes('auth') || cookie.name.includes('supabase')) {
                value = cookie.value;
                break;
              }
            }
          }
          return value || undefined;
        },
        set(_name: string, _value: string, _options?: unknown) {},
        remove(_name: string, _options?: unknown) {},
      },
    } as Parameters<typeof createClient>[2]);
    
    return client;
  } catch (error: any) {
    console.error("⚠️ Ошибка создания клиента с авторизацией:", error?.message || error);
    return null;
  }
}
