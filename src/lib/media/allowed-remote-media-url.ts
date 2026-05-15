/**
 * Общее правило: с каких URL сервер имеет право подтягивать медиа (скачивание и прокси превью).
 * Держим синхронно с логикой потребителей (`/api/media/download`, `/api/media/proxy-display`).
 */

export function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
}

/**
 * Блокируем очевидные SSRF-цели для режима «любой https при авторизации».
 */
export function isBlockedSsrfHost(hostname: string): boolean {
  const raw = hostname.toLowerCase();
  const h = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;
  if (isLocalHost(h)) return true;
  if (h === "metadata.google.internal" || h.endsWith(".internal")) return true;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }

  if (h.includes(":")) {
    if (h.startsWith("fe80:")) return true;
    if (h === "::1" || h.startsWith("::ffff:")) {
      const tail = h.startsWith("::ffff:") ? h.slice(7) : "";
      if (tail && /^\d{1,3}(\.\d{1,3}){3}$/.test(tail)) {
        return isBlockedSsrfHost(tail);
      }
      return h === "::1";
    }
    if (h.startsWith("fc") || h.startsWith("fd")) return true;
  }
  return false;
}

/**
 * Считаем origin эквивалентным, если совпадает строка origin ИЛИ оба хоста — loopback
 * с одним и тем же портом (типичный кейс: localhost:3000 vs 127.0.0.1:3000).
 */
export function isSameAppOrigin(url: URL, sameOrigin: string): boolean {
  try {
    const base = new URL(sameOrigin);
    if (url.origin === base.origin) return true;
    if (url.protocol !== base.protocol) return false;
    const pA = url.port || (url.protocol === "https:" ? "443" : "80");
    const pB = base.port || (base.protocol === "https:" ? "443" : "80");
    if (pA !== pB) return false;
    const hA = url.hostname.toLowerCase();
    const hB = base.hostname.toLowerCase();
    if (isLocalHost(hA) && isLocalHost(hB)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function isAllowedRemoteMediaUrl(url: URL, sameOrigin: string): boolean {
  if (isSameAppOrigin(url, sameOrigin)) {
    return true;
  }

  const protoOk =
    url.protocol === "https:" ||
    (url.protocol === "http:" && isLocalHost(url.hostname));
  if (!protoOk) return false;

  const host = url.hostname.toLowerCase();

  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (supabase) {
    try {
      const allowedHost = new URL(supabase).hostname.toLowerCase();
      if (host === allowedHost) return true;
    } catch {
      /* ignore */
    }
  }

  if (host.endsWith(".supabase.co") || host.endsWith(".supabase.in")) {
    return true;
  }

  if (host.includes("redpandaai.co")) return true;
  if (host === "kie.ai" || host.endsWith(".kie.ai")) return true;
  if (host.includes("aiquickdraw.com")) return true;

  if (host === "replicate.delivery" || host.endsWith(".replicate.delivery")) {
    return true;
  }

  if (host.endsWith(".blob.vercel-storage.com")) return true;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (appUrl) {
    try {
      const ah = new URL(appUrl.startsWith("http") ? appUrl : `https://${appUrl}`);
      if (host === ah.hostname.toLowerCase()) return true;
    } catch {
      /* ignore */
    }
  }
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    try {
      const vh = new URL(
        vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`
      ).hostname.toLowerCase();
      if (host === vh) return true;
    } catch {
      /* ignore */
    }
  }

  const extra = process.env.MEDIA_DOWNLOAD_EXTRA_HOSTS;
  if (extra) {
    for (const part of extra.split(",")) {
      const h = part.trim().toLowerCase();
      if (h && host === h) return true;
    }
  }

  return false;
}
