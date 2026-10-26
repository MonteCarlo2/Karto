import { wbLimitFor, type WbTokenKind } from "./index";
import { WbRateGate } from "./rate-gate";

/**
 * Обёртка над fetch, которая пропускает запросы к *.wildberries.ru через шлюз лимитов WB.
 * Ставится один раз в процессе воркера: тогда под лимиты попадает каждый запрос любого клиента WB в проекте,
 * без правки каждого клиента отдельно. Лимит считается на токен: ключ кабинета берётся из заголовка Authorization (в виде хэша,
 * сам токен нигде не хранится).
 */

export type GatedFetchOptions = {
  gate?: WbRateGate;
  tokenKind?: WbTokenKind;
  /** Источник времени и ожидание подменяются в тестах. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Вызывается на каждый запрос: для журнала расхода лимитов. */
  onRequest?: (info: { key: string; method: string; path: string; waitedMs: number; known: boolean }) => void;
  /** Сколько ждать ответа WB после реальной отправки, если запрос стоял в очереди, мс. */
  requestTimeoutMs?: number;
  /** Вызывается на каждый ответ: для учёта 429 и ошибок доступа. */
  onResponse?: (info: { key: string; status: number }) => void;
};

/** Предел ожидания ответа WB после реальной отправки (запросы, которые стояли в очереди на лимит). */
const REQUEST_TIMEOUT_MS = 60_000;
const WB_HOST = /(^|\.)wildberries\.ru$/i;

/** Короткий хэш строки (djb2): для ключа кабинета, не для безопасности. */
function shortHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function headerValue(headers: HeadersInit | undefined, name: string): string {
  if (!headers) return "";
  if (headers instanceof Headers) return headers.get(name) ?? "";
  if (Array.isArray(headers)) return headers.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ?? "";
  const record = headers as Record<string, string>;
  const key = Object.keys(record).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? record[key]! : "";
}

function retryAfterMs(res: Response): number | null {
  const raw = res.headers.get("x-ratelimit-retry") ?? res.headers.get("retry-after");
  if (!raw) return null;
  const sec = Number.parseInt(raw, 10);
  return Number.isFinite(sec) && sec > 0 ? Math.min(120, sec) * 1000 : null;
}

export function createGatedFetch(base: typeof fetch, options: GatedFetchOptions = {}): typeof fetch {
  const gate = options.gate ?? new WbRateGate();
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const token = options.tokenKind ?? "personal";

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (!WB_HOST.test(url.hostname)) return base(input, init);

    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const authorization = headerValue(init?.headers, "authorization") || (input instanceof Request ? input.headers.get("authorization") ?? "" : "");
    const cabinet = shortHash(authorization);
    const limit = wbLimitFor(method, url.pathname, token);

    // Ждём разрешённого момента. Проверка и запись в одном синхронном куске: два запроса не получат один и тот же слот.
    let waited = 0;
    for (;;) {
      const wait = gate.waitMs(cabinet, limit, now());
      if (wait <= 0) {
        gate.record(cabinet, limit, now());
        break;
      }
      waited += wait;
      await sleep(wait);
    }
    options.onRequest?.({ key: limit.key, method, path: url.pathname, waitedMs: waited, known: limit.known });

    // Клиенты WB засекают таймаут (обычно 15 с) с момента вызова fetch, то есть и пока мы стоим в очереди на лимит.
    // Время очереди не время ответа WB: если клиентский таймаут «истёк» в очереди, запрос обрывать нельзя, иначе он
    // вообще не дойдёт до WB и будет записан как «WB не ответил вовремя». После очереди отсчёт ведём сами, от реальной отправки.
    let outgoing: RequestInit | undefined = init;
    let cleanup = () => {};
    const clientSignal = init?.signal ?? undefined;
    if (clientSignal && waited > 0) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS);
      const onAbort = () => controller.abort();
      if (!clientSignal.aborted) clientSignal.addEventListener("abort", onAbort, { once: true });
      outgoing = { ...init, signal: controller.signal };
      cleanup = () => {
        clearTimeout(timer);
        clientSignal.removeEventListener("abort", onAbort);
      };
    }
    let res: Response;
    try {
      res = await base(input, outgoing);
    } finally {
      cleanup();
    }
    options.onResponse?.({ key: limit.key, status: res.status });
    if (res.status === 429) gate.penalize(cabinet, limit, now(), retryAfterMs(res));
    return res;
  };
}

/**
 * Подменяет глобальный fetch на время работы процесса. Возвращает функцию возврата прежнего fetch.
 *
 * Простая подмена, без перехвата присваивания: Next.js оборачивает fetch для своего кэша, читая текущее значение, и вызывает
 * его изнутри. Если бы шлюз перехватывал присваивание, получился бы замкнутый круг (обёртка Next вызывает шлюз, шлюз её).
 * При простой подмене порядок не важен: если Next оборачивает после нас, наш шлюз оказывается внутри его обёртки, и любой
 * запрос к WB всё равно проходит через шлюз. Ставить шлюз надо при старте сервера (instrumentation), до первых запросов.
 */
export function installWbGate(options: GatedFetchOptions = {}): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = createGatedFetch(original, options);
  return () => {
    globalThis.fetch = original;
  };
}
