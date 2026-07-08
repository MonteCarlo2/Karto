type UndiciProxyAgent = import("undici").ProxyAgent;

let proxyDispatcher: UndiciProxyAgent | null | undefined;

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
    connect: { timeout: 30_000 },
    requestTls: { rejectUnauthorized: true },
  });
  return proxyDispatcher;
}

export async function openRouterFetch(url: string, init: RequestInit): Promise<Response> {
  const dispatcher = await getOpenRouterProxyDispatcher();
  if (!dispatcher) return fetch(url, init);

  const { fetch: undiciFetch } = await import("undici");
  return undiciFetch(url, {
    method: init.method,
    headers: init.headers as Record<string, string> | undefined,
    body: init.body as string | undefined,
    signal: init.signal ?? undefined,
    dispatcher,
  }) as unknown as Promise<Response>;
}
