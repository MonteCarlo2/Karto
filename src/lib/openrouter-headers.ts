/**
 * Общие заголовки для запросов к OpenRouter.
 * В кабинете OpenRouter для приложения указывают сайт — лучше, чтобы HTTP-Referer совпадал с публичным URL.
 * На Timeweb/Vercel явно задайте NEXT_PUBLIC_APP_URL=https://ваш-домен или OPENROUTER_HTTP_REFERER с тем же URL.
 */

/**
 * Убираем любые пробелы и переносы строк из ключа.
 * В панелях (Timeweb и др.) значение часто вставляют многострочным — тогда Bearer получается невалидным или OpenRouter отвечает ошибкой.
 */
export function getNormalizedOpenRouterApiKey(): string {
  return String(process.env.OPENROUTER_API_KEY ?? "").replace(/\s+/g, "");
}

export function getOpenRouterRequestHeaders(xTitle: string): Record<string, string> {
  const fromEnv = (process.env.OPENROUTER_HTTP_REFERER || "").trim();
  const fromPublic = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
  const vercel = (process.env.VERCEL_URL || "").trim();
  const referer =
    fromEnv ||
    fromPublic ||
    (vercel ? `https://${vercel.replace(/^https?:\/\//, "")}` : "") ||
    "https://karto.pro";

  const key = getNormalizedOpenRouterApiKey();

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    "HTTP-Referer": referer,
    "X-Title": xTitle,
  };
}
