import { proxiedHttpsMediaUrl } from "@/lib/client/proxied-display-url";

/** Для /api/serve-file — превью с диска; w=0 или fullResolution — без уменьшения (лайтбокс). */
export function withServeFilePreviewParam(url: string, previewWidth = 400): string {
  if (typeof url !== "string" || !url.includes("/api/serve-file")) return url;
  if (previewWidth <= 0) {
    const q = url.indexOf("?");
    return q >= 0 ? url.slice(0, q) : url;
  }
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}w=${previewWidth}`;
}

/** ~лайтбокс: чуть крупнее сетки (400 → 960) */
export const GALLERY_LIGHTBOX_SERVE_WIDTH = 960;

/** ~2× самая широкая карточка сетки на Retina — баланс скорость/качество на экране */
export const GALLERY_GRID_PROXY_MAX_WIDTH = 1152;

/** Мини-превью референсов в нижней панели */
export const GALLERY_REFERENCE_PROXY_MAX_WIDTH = 480;

/** Маленькие превью в шапке студии (цена, описание и т.п.) */
export const GALLERY_THUMB_PROXY_MAX_WIDTH = 256;

/** Быстрое превью в сетке: прокси уменьшает и отдаёт WebP (лайтбокс — без этого). */
export function galleryGridProxiedUrl(remoteUrl: string): string {
  const prepared = withServeFilePreviewParam(remoteUrl.trim());
  return proxiedHttpsMediaUrl(prepared, {
    maxDisplayWidth: GALLERY_GRID_PROXY_MAX_WIDTH,
  });
}
