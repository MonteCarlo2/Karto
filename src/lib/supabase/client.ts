import { createClient } from "@supabase/supabase-js";

/**
 * Создает клиентский клиент Supabase для использования в браузере
 * Настроен для сохранения сессии в cookies (для синхронизации с сервером)
 */
export function createBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Если переменные не установлены, выбрасываем ошибку
  if (!supabaseUrl || !supabaseAnonKey) {
    const error = new Error(
      "Supabase не настроен. Добавьте NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY в .env.local (локально) или в Settings → Environment Variables на Vercel (продакшен)"
    );
    console.error("❌", error.message);
    throw error;
  }

  // Извлекаем project ref из URL для правильного имени cookie
  const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1] || 'default';
  
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: typeof window !== 'undefined' ? {
        getItem: (key: string) => {
          // Пытаемся получить из cookie, если не найдено - из localStorage
          if (typeof document !== 'undefined') {
            const cookies = document.cookie.split(';');
            for (const cookie of cookies) {
              const [name, value] = cookie.trim().split('=');
              if (name === key || name === `sb-${projectRef}-auth-token`) {
                try {
                  return decodeURIComponent(value);
                } catch {
                  return value;
                }
              }
            }
          }
          // Fallback на localStorage
          if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage.getItem(key);
          }
          return null;
        },
        setItem: (key: string, value: string) => {
          // Сохраняем и в cookie, и в localStorage
          if (typeof document !== 'undefined') {
            // Устанавливаем cookie с правильными параметрами
            const cookieName = key.includes('auth-token') ? `sb-${projectRef}-auth-token` : key;
            document.cookie = `${cookieName}=${encodeURIComponent(value)}; path=/; SameSite=Lax; Secure=${location.protocol === 'https:'}`;
          }
          // Также сохраняем в localStorage для обратной совместимости
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(key, value);
          }
        },
        removeItem: (key: string) => {
          // Удаляем и из cookie, и из localStorage
          if (typeof document !== 'undefined') {
            const cookieName = key.includes('auth-token') ? `sb-${projectRef}-auth-token` : key;
            document.cookie = `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
          }
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem(key);
          }
        },
      } : undefined,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}
