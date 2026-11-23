import { autoRepliesAuthorizedFetch } from "@/lib/auto-replies/auto-replies-fetch";

/**
 * Браузерная проверка тестового режима перед действием агента. Читается каждый раз, без кэша: переключатель в настройках действует сразу.
 * Не удалось прочитать: считаем режим включённым (безопаснее ничего не отправить).
 */
export async function isSandboxOnClient(): Promise<boolean> {
  try {
    const res = await autoRepliesAuthorizedFetch("/api/seller-hub/user-settings", { method: "GET", timeoutMs: 10_000 });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; settings?: Record<string, unknown> };
    if (!res.ok || !data.ok || !data.settings) return true;
    return data.settings["agent.sandbox"] !== false;
  } catch {
    return true;
  }
}
