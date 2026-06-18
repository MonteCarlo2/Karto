import { isSupabaseNetworkError } from "@/lib/supabase/network-error";

export function isSupabaseFailure(error: unknown): boolean {
  if (isSupabaseNetworkError(error)) return true;
  if (!error || typeof error !== "object") return false;
  const rec = error as { message?: string; details?: string; hint?: string };
  const blob = [rec.message, rec.details, rec.hint].filter(Boolean).join(" ");
  return isSupabaseNetworkError({ message: blob });
}

export async function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  label = "operation"
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}: timeout ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
