import { createClient } from "@supabase/supabase-js";

/**
 * Создает серверный клиент Supabase с service_role ключом
 * ВАЖНО: Использовать только на сервере (API routes), никогда не отправлять клиенту
 */
export function createServerClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    console.error("❌ Отсутствует SUPABASE_URL или NEXT_PUBLIC_SUPABASE_URL");
    throw new Error(
      "SUPABASE_URL или NEXT_PUBLIC_SUPABASE_URL должны быть установлены в .env.local"
    );
  }

  if (!supabaseServiceRoleKey) {
    console.error("❌ Отсутствует SUPABASE_SERVICE_ROLE_KEY");
    console.error("💡 Убедитесь, что:");
    console.error("   1. Файл .env.local существует в корне проекта");
    console.error("   2. Переменная SUPABASE_SERVICE_ROLE_KEY указана в файле");
    console.error("   3. Сервер разработки перезапущен после изменения .env.local");
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY должен быть установлен в .env.local"
    );
  }

  // Проверяем формат ключа (service_role ключ обычно начинается с eyJ и имеет длину ~200+ символов)
  if (!supabaseServiceRoleKey.startsWith("eyJ")) {
    console.error("❌ SUPABASE_SERVICE_ROLE_KEY неверного формата (не начинается с eyJ)");
    console.error("   Первые 50 символов:", supabaseServiceRoleKey.substring(0, 50));
    throw new Error("SUPABASE_SERVICE_ROLE_KEY имеет неверный формат. Ключ должен начинаться с 'eyJ'");
  }
  
  // Проверяем, что ключ не обрезан (должен быть достаточно длинным)
  // Service Role ключ обычно имеет длину 200-250 символов
  if (supabaseServiceRoleKey.length < 150) {
    console.error("❌ SUPABASE_SERVICE_ROLE_KEY кажется обрезанным");
    console.error(`   Длина ключа: ${supabaseServiceRoleKey.length} символов (ожидается ~200+)`);
    console.error("   Первые 100 символов:", supabaseServiceRoleKey.substring(0, 100));
    console.error("   Последние 20 символов:", supabaseServiceRoleKey.substring(supabaseServiceRoleKey.length - 20));
    throw new Error(`SUPABASE_SERVICE_ROLE_KEY слишком короткий (${supabaseServiceRoleKey.length} символов, ожидается ~200+). Убедитесь, что ключ полный в .env.local (без переносов строк, кавычек или пробелов). Ключ должен заканчиваться длинной строкой после последней точки.`);
  }
  
  // Дополнительная проверка: ключ должен содержать 3 части, разделенные точками
  const parts = supabaseServiceRoleKey.split('.');
  if (parts.length !== 3) {
    console.error("❌ SUPABASE_SERVICE_ROLE_KEY имеет неверный формат");
    console.error(`   Количество частей (разделенных точками): ${parts.length} (ожидается 3)`);
    throw new Error("SUPABASE_SERVICE_ROLE_KEY имеет неверный формат. JWT токен должен содержать 3 части, разделенные точками.");
  }
  
  // Проверяем, что последняя часть (подпись) достаточно длинная
  if (parts[2].length < 40) {
    console.error("❌ SUPABASE_SERVICE_ROLE_KEY: последняя часть (подпись) слишком короткая");
    console.error(`   Длина подписи: ${parts[2].length} символов (ожидается ~40+)`);
    console.error("   Последняя часть:", parts[2].substring(0, 50));
    throw new Error("SUPABASE_SERVICE_ROLE_KEY обрезан. Последняя часть (подпись) слишком короткая. Скопируйте полный ключ из Supabase Dashboard.");
  }
  
  // Проверяем на наличие пробелов или переносов строк
  if (supabaseServiceRoleKey.includes("\n") || supabaseServiceRoleKey.includes("\r")) {
    console.error("❌ SUPABASE_SERVICE_ROLE_KEY содержит переносы строк");
    throw new Error("SUPABASE_SERVICE_ROLE_KEY содержит переносы строк. Ключ должен быть на одной строке");
  }
  
  if (supabaseServiceRoleKey.trim() !== supabaseServiceRoleKey) {
    console.warn("⚠️ SUPABASE_SERVICE_ROLE_KEY содержит пробелы в начале или конце - они будут удалены");
  }

  try {
    // Убираем пробелы в начале и конце ключа
    const cleanKey = supabaseServiceRoleKey.trim();
    
    const client = createClient(supabaseUrl, cleanKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    return client;
  } catch (error: any) {
    console.error("❌ Ошибка создания Supabase клиента:", error);
    console.error("   URL:", supabaseUrl);
    console.error("   Длина ключа:", supabaseServiceRoleKey.length);
    console.error("   Начинается с:", supabaseServiceRoleKey.substring(0, 20));
    
    // Проверяем, является ли это ошибкой "Invalid API key"
    if (error.message && error.message.includes("Invalid API key")) {
      throw new Error("Неверный API ключ Supabase. Проверьте, что в .env.local указан правильный SUPABASE_SERVICE_ROLE_KEY (Service Role Key, а не Anon Key)");
    }
    
    throw new Error(`Ошибка создания Supabase клиента: ${error.message || String(error)}`);
  }
}
