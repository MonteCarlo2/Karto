import { proxiedHttpsMediaUrl } from "@/lib/client/proxied-display-url";

/**
 * URL логотипа для <img>: same-origin прокси для Supabase/CDN,
 * чтобы превью работало без VPN (браузер тянет karto.pro, сервер — origin).
 */
export function brandLogoDisplayUrl(
  raw: string,
  opts?: { maxDisplayWidth?: number }
): string {
  const url = raw.trim();
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;

  if (url.startsWith("/")) {
    if (typeof window !== "undefined") {
      return `${window.location.origin}${url}`;
    }
    return url;
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return proxiedHttpsMediaUrl(url, opts);
  }

  return url;
}
