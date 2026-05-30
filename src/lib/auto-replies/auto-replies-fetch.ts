import { createBrowserClient } from "@/lib/supabase/client";

export class AutoRepliesFetchError extends Error {
  readonly timeout: boolean;

  constructor(message: string, timeout = false) {
    super(message);
    this.name = "AutoRepliesFetchError";
    this.timeout = timeout;
  }
}

export async function autoRepliesAuthorizedFetch(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const supabase = createBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init?.headers);
  headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");
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
