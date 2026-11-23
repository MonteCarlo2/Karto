type UndiciProxyAgent = import("undici").ProxyAgent;

let proxyDispatcher: UndiciProxyAgent | null | undefined;
/** Пока прокси не отвечает, ходим напрямую: мёртвый прокси не должен задерживать каждый запрос к модели. */
let proxyBadUntil = 0;
const PROXY_BAD_MS = 5 * 60_000;
/** Когда прокси проверяли в последний раз и что показала проверка: не дёргаем его на каждый запрос. */
let proxyCheckedAt = 0;
const PROXY_CHECK_EVERY_MS = 2 * 60_000;

/**
 * Быстрая проверка прокси: открывает через него туннель до OpenRouter и ждёт ответ «200» не дольше 5 секунд.
 * Мёртвый прокси часто принимает соединение и молчит, и тогда запрос к модели висит до своего тайм-аута.
 */
async function proxyAnswers(proxyUrl: string): Promise<boolean> {
  const net = await import("node:net");
  let url: URL;
  try {
    url = new URL(proxyUrl);
  } catch {
    return false;
  }
  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: url.hostname, port: Number(url.port) || 80 });
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(5_000, () => finish(false));
    socket.on("error", () => finish(false));
    socket.on("connect", () => {
      const credentials = url.username ? `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}` : "";
      const auth = credentials ? `Proxy-Authorization: Basic ${Buffer.from(credentials).toString("base64")}\r\n` : "";
      socket.write(`CONNECT openrouter.ai:443 HTTP/1.1\r\nHost: openrouter.ai:443\r\n${auth}\r\n`);
    });
    socket.on("data", (chunk) => finish(/^HTTP\/1\.[01] 200/.test(chunk.toString("utf8"))));
  });
}

/** Опциональный HTTP(S)-прокси только для OpenRouter — не связан с Telegram. */
export function getOpenRouterProxyUrl(): string | null {
  const raw =
    process.env.OPENROUTER_PROXY?.trim() ||
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim();
  if (!raw) return null;

  if (raw.includes("@")) return raw.startsWith("http") ? raw : `http://${raw}`;

  const user = process.env.OPENROUTER_PROXY_USER?.trim();
  const pass = process.env.OPENROUTER_PROXY_PASSWORD?.trim();
  if (!user || !pass) return raw.startsWith("http") ? raw : `http://${raw}`;

  try {
    const u = new URL(raw.startsWith("http") ? raw : `http://${raw}`);
    u.username = encodeURIComponent(user);
    u.password = encodeURIComponent(pass);
    return u.toString();
  } catch {
    return raw;
  }
}

async function getOpenRouterProxyDispatcher(): Promise<UndiciProxyAgent | undefined> {
  if (proxyDispatcher !== undefined) return proxyDispatcher ?? undefined;

  const proxy = getOpenRouterProxyUrl();
  if (!proxy) {
    proxyDispatcher = null;
    return undefined;
  }

  const { ProxyAgent } = await import("undici");
  console.info("[openrouter] запросы через прокси");
  proxyDispatcher = new ProxyAgent({
    uri: proxy,
    connect: { timeout: 6_000 },
    requestTls: { rejectUnauthorized: true },
  });
  return proxyDispatcher;
}

export async function openRouterFetch(url: string, init: RequestInit): Promise<Response> {
  let dispatcher = Date.now() < proxyBadUntil ? undefined : await getOpenRouterProxyDispatcher();
  const proxyUrl = getOpenRouterProxyUrl();
  if (dispatcher && proxyUrl && Date.now() - proxyCheckedAt > PROXY_CHECK_EVERY_MS) {
    if (await proxyAnswers(proxyUrl)) proxyCheckedAt = Date.now();
    else {
      proxyBadUntil = Date.now() + PROXY_BAD_MS;
      console.warn("[openrouter] прокси не отвечает, запросы идут напрямую 5 минут");
      dispatcher = undefined;
    }
  }
  if (!dispatcher) return fetch(url, init);

  const { fetch: undiciFetch } = await import("undici");
  try {
    return (await undiciFetch(url, {
      method: init.method,
      headers: init.headers as Record<string, string> | undefined,
      body: init.body as string | undefined,
      signal: init.signal ?? undefined,
      dispatcher,
    })) as unknown as Response;
  } catch (e) {
    // Прокси не принял соединение: запрос ещё не ушёл к модели, поэтому безопасно повторить его напрямую.
    if (init.signal?.aborted) throw e;
    proxyBadUntil = Date.now() + PROXY_BAD_MS;
    console.warn("[openrouter] прокси не отвечает, запросы идут напрямую 5 минут:", e instanceof Error ? e.message : String(e));
    return fetch(url, init);
  }
}
