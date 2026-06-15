export function getTelegramBotToken(): string | null {
  const t = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return t || null;
}

/** Базовый URL Bot API (по умолчанию api.telegram.org; для локального Bot API — свой хост). */
export function getTelegramApiBase(): string {
  const base = process.env.TELEGRAM_API_BASE?.trim();
  return base?.replace(/\/$/, "") || "https://api.telegram.org";
}

export function getTelegramWebhookSecret(): string | null {
  const s = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  return s || null;
}

export function getTelegramBotUsername(): string {
  return process.env.TELEGRAM_BOT_USERNAME?.trim() || "KartoProBot";
}

export function isTelegramConfigured(): boolean {
  return Boolean(getTelegramBotToken());
}

/** URL прокси для Node.js (браузерный Zero Omega на это не влияет). */
export function getTelegramProxyUrl(): string | null {
  const raw =
    process.env.TELEGRAM_PROXY?.trim() ||
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim();
  if (!raw) return null;

  if (raw.includes("@")) return raw;

  const user = process.env.TELEGRAM_PROXY_USER?.trim();
  const pass = process.env.TELEGRAM_PROXY_PASSWORD?.trim();
  if (!user || !pass) return raw;

  try {
    const u = new URL(raw.startsWith("http") ? raw : `http://${raw}`);
    u.username = encodeURIComponent(user);
    u.password = encodeURIComponent(pass);
    return u.toString();
  } catch {
    return raw;
  }
}

/** Для логов — без пароля. */
export function getTelegramProxyLabel(): string | null {
  const url = getTelegramProxyUrl();
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `http://${url}`);
    const auth = u.username ? `${u.username}@` : "";
    return `${u.protocol}//${auth}${u.hostname}:${u.port || "80"}`;
  } catch {
    return "proxy configured";
  }
}
