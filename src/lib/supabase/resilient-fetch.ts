/**
 * Fetch с увеличенным connect-timeout и повторами для Supabase с хостинга (Timeweb).
 * По умолчанию undici рвёт соединение через ~10s — отсюда «fetch failed» при OAuth.
 */
import { Agent, fetch as undiciFetch } from "undici";

/**
 * Соединение с Supabase иногда «зависает» на рукопожатии (примерно каждое шестое, по замеру 06.11.2026): раньше мы ждали такую попытку 30 с.
 * Теперь первые попытки короткие (4 и 6 с), а настойчивые и долгие остаются в конце: на медленном хостинге запрос всё равно дойдёт.
 * Таймаут соединения срабатывает до отправки запроса, поэтому повтор безопасен даже для записи.
 */
const CONNECT_TIMEOUTS_MS = [4_000, 6_000, 12_000, 30_000];
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = CONNECT_TIMEOUTS_MS.length;
const RETRY_PAUSE_MS = 300;

/** Соединения живут долго: каждое новое рукопожатие с удалённой базой стоит около секунды. */
const agents = CONNECT_TIMEOUTS_MS.map(
  (timeout) =>
    new Agent({
      connect: { timeout },
      keepAliveTimeout: 60_000,
      keepAliveMaxTimeout: 120_000,
    }),
);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableFetchError(error: unknown): boolean {
  const msg = String((error as { message?: string; code?: string })?.message ?? error ?? "");
  const code = String((error as { code?: string })?.code ?? "");
  return (
    msg.includes("fetch failed") ||
    msg.includes("Connect Timeout") ||
    msg.includes("UND_ERR_CONNECT_TIMEOUT") ||
    msg.includes("AbortError") ||
    msg.includes("aborted") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ECONNREFUSED") ||
    code === "UND_ERR_CONNECT_TIMEOUT"
  );
}

export async function resilientFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await undiciFetch(input as string, {
        ...init,
        signal: controller.signal,
        dispatcher: agents[attempt] ?? agents[agents.length - 1]!,
      } as Parameters<typeof undiciFetch>[1]);

      if (res.status >= 502 && res.status <= 504 && attempt < MAX_ATTEMPTS - 1) {
        await sleep(RETRY_PAUSE_MS * (attempt + 1));
        continue;
      }

      return res as unknown as Response;
    } catch (error) {
      lastError = error;
      if (isRetryableFetchError(error) && attempt < MAX_ATTEMPTS - 1) {
        console.warn(
          `[resilient-fetch] retry ${attempt + 1}/${MAX_ATTEMPTS}:`,
          error instanceof Error ? error.message : error
        );
        await sleep(RETRY_PAUSE_MS * (attempt + 1));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "fetch failed"));
}
