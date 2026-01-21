import { createClient } from "@supabase/supabase-js";

/**
 * Создает серверный клиент Supabase с service_role ключом
 * ВАЖНО: Использовать только на сервере (API routes), никогда не отправлять клиенту
 */
export function createServerClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("❌ Отсутствуют переменные окружения:");
    console.error("SUPABASE_URL:", supabaseUrl ? "✓" : "✗");
    console.error("SUPABASE_SERVICE_ROLE_KEY:", supabaseServiceRoleKey ? "✓" : "✗");
    throw new Error(
      "SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY должны быть установлены в .env.local"
    );
  }

  console.log("✅ Supabase клиент создан:", supabaseUrl.substring(0, 30) + "...");

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
