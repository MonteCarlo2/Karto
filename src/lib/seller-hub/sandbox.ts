import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Тестовый режим агента: пока он включён, агент работает как обычно (чат, планы, задачи, предложения), но ни одно его действие не уходит в Wildberries.
 * Хранится в настройках пользователя (ключ agent.sandbox). По умолчанию включён: человек сам включает «боевой» режим.
 * Режим касается только агента: ручные кнопки владельца в других разделах работают как раньше.
 */
export const SANDBOX_SETTING_KEY = "agent.sandbox";

/** Текст для интерфейса, когда действие агента остановлено тестовым режимом. */
export const SANDBOX_MESSAGE = "Тестовый режим: действие проверено, в Wildberries ничего не отправлено. Боевой режим включается в «Правила и автопилот».";

/** Серверная проверка. Любой сбой чтения считаем включённым тестовым режимом: безопаснее не отправлять, чем отправить по ошибке. */
export async function isSandboxOn(db: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data, error } = await db.from("seller_hub_user_settings").select("value").eq("user_id", userId).eq("marketplace_id", "wildberries").eq("setting_key", SANDBOX_SETTING_KEY).maybeSingle();
    if (error) return true;
    return (data as { value?: unknown } | null)?.value !== false;
  } catch {
    return true;
  }
}
