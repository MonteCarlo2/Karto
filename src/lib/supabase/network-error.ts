/**
 * Определяет, что ошибка связана с недоступностью Supabase (таймаут, сеть).
 * Используется в API: при такой ошибке возвращаем 200 с безопасными данными,
 * чтобы на проде не сыпались 401/500, когда с хостинга нет доступа к Supabase.
 */
const PATTERNS = [
  "Connect Timeout",
  "fetch failed",
  "UND_ERR_CONNECT_TIMEOUT",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ENOTFOUND",
  "ECONNRESET",
  "socket hang up",
];

export function isSupabaseNetworkError(e: unknown): boolean {
  const msg = String((e as any)?.message ?? (e as any)?.code ?? "");
  return PATTERNS.some((p) => msg.includes(p));
}
