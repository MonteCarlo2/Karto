/**
 * Подменяет внешние HTTPS URL на same-origin `/api/media/proxy-display`,
 * чтобы избежать CORS / Private Network Access в Chromium при <img>/<video>.
 * Бэкенд отклонит не-whitelist хосты.
 */

function configuredAppOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  if (!raw) return null;
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return u.origin;
  } catch {
    return null;
  }
}

function proxyPathFor(encodedUrl: string, displayMaxWidth?: number): string {
  let path = `/api/media/proxy-display?u=${encodedUrl}`;
  if (typeof displayMaxWidth === "number" && displayMaxWidth > 0) {
    const mw = Math.min(2048, Math.max(64, Math.round(displayMaxWidth)));
    path += `&mw=${mw}`;
  }
  return path;
}

function isExistingProxy(displayUrl: string): boolean {
  if (displayUrl.startsWith("/api/media/proxy-display")) return true;
  try {
    if (typeof window !== "undefined" && displayUrl.startsWith(`${window.location.origin}/`)) {
      const p = displayUrl.slice(window.location.origin.length) || "";
      return p.startsWith("/api/media/proxy-display");
    }
    const app = configuredAppOrigin();
    if (app && displayUrl.startsWith(`${app}/`)) {
      const p = displayUrl.slice(app.length) || "";
      return p.startsWith("/api/media/proxy-display");
    }
  } catch {
    /* ignore */
  }
  return false;
}

export type ProxiedHttpsMediaUrlOptions = {
  /** Прокси уменьшает растровое изображение (меньше байт для галереи); лайтбокс без этого. */
  maxDisplayWidth?: number;
};

/** Абсолютный или относительный URL для отображения в UI (<img>/<video src>). */
export function proxiedHttpsMediaUrl(
  raw: string,
  opts?: ProxiedHttpsMediaUrlOptions
): string {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t || isExistingProxy(t)) return t;

  if (t.startsWith("data:") || t.startsWith("blob:")) return t;

  // Локальный путь с нашего приложения отдаём напрямую
  if (t.startsWith("/")) return t;

  try {
    if (!/^https?:\/\//i.test(t)) return t;
    const u = new URL(t);

    const origins = new Set<string>();
    if (typeof window !== "undefined") origins.add(window.location.origin);
    const cfg = configuredAppOrigin();
    if (cfg) origins.add(cfg);
    if (origins.has(u.origin)) return t;

    const encoded = encodeURIComponent(u.toString());
    /** Длинные signed URL; обрезка отключала бы прокси и ломала превью. */
    if (encoded.length > 12000) return t;

    /**
     * Относительный same-origin прокси: одинаково на SSR и в браузере (нет конфликта гидратации).
     * Раньше на сервере без NEXT_PUBLIC_APP_URL подставлялся прямой CDN URL — браузер
     * сначала грузил его (дубль + ошибки Chromium PNA/CORS), уже потом клиент мог перейти на прокси.
     */
    return proxyPathFor(encoded, opts?.maxDisplayWidth);
  } catch {
    return t;
  }
}
