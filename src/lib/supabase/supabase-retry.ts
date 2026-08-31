import { isSupabaseNetworkError } from "@/lib/supabase/network-error";

const DEFAULT_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Повторяет Supabase-операцию при сетевых сбоях (Timeweb → Supabase). */
export async function withSupabaseRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = DEFAULT_ATTEMPTS
): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (isSupabaseNetworkError(error) && attempt < attempts - 1) {
        console.warn(`[supabase-retry] ${label} attempt ${attempt + 1}/${attempts} failed`);
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? label));
}

export function supabaseAuthNetworkErrorMessage(): string {
  return "Не удалось связаться с сервером авторизации. Попробуйте через минуту или войдите по email.";
}
