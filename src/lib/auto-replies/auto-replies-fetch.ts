import { createBrowserClient } from "@/lib/supabase/client";

export class AutoRepliesFetchError extends Error {
  readonly timeout: boolean;

  constructor(message: string, timeout = false) {
    super(message);
    this.name = "AutoRepliesFetchError";
    this.timeout = timeout;
  }
}

/** Коды, при которых запрос, скорее всего, даже не дошёл до обработки: сервер перезапускается, собирает страницу или перегружен. */
const TRANSIENT_STATUSES = new Set([404, 502, 503, 504]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Запрос с авторизацией. С retries (только для безопасного чтения, не для записи и не для денег) сбои сети и «временные» коды
 * повторяются с нарастающей паузой: человек не видит одиночный сбой, данные просто приходят чуть позже.
 */
export async function autoRepliesAuthorizedFetch(
  path: string,
  init?: RequestInit & { timeoutMs?: number; retries?: number }
): Promise<Response> {
  const retries = init?.retries ?? (init?.method == null || init.method === "GET" ? 2 : 0);
  let attempt = 0;
  for (;;) {
    try {
      const res = await autoRepliesAuthorizedFetchOnce(path, init);
      if (attempt < retries && TRANSIENT_STATUSES.has(res.status)) {
        attempt += 1;
        await sleep(1200 * attempt);
        continue;
      }
      return res;
    } catch (e) {
      const retryable = e instanceof AutoRepliesFetchError && !e.timeout && e.message !== "Войдите в аккаунт KARTO";
      if (attempt < retries && retryable) {
        attempt += 1;
        await sleep(1200 * attempt);
        continue;
      }
      throw e;
    }
  }
}

async function autoRepliesAuthorizedFetchOnce(
  path: string,
  init?: RequestInit & { timeoutMs?: number; retries?: number }
): Promise<Response> {
  const supabase = createBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init?.headers);
  if (init?.body instanceof FormData) headers.delete("Content-Type");
  else headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  } else {
    throw new AutoRepliesFetchError("Войдите в аккаунт KARTO");
  }

  const timeoutMs = init?.timeoutMs ?? 90_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(path, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new AutoRepliesFetchError(
        "Сервер не ответил вовремя. Проверьте интернет и попробуйте ещё раз.",
        true
      );
    }
    if (e instanceof TypeError) {
      throw new AutoRepliesFetchError(
        "Не удалось связаться с сервером. Обновите страницу или проверьте, что сайт запущен."
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
