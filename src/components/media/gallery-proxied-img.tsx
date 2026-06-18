"use client";

import type { ImgHTMLAttributes, SyntheticEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { proxiedHttpsMediaUrl } from "@/lib/client/proxied-display-url";
import { withServeFilePreviewParam } from "@/lib/client/gallery-display-url";

/** Документ с «частного» origin (localhost, LAN): прямой https к публичному CDN в Chromium ломается (PNA). */
function isNonPublicDocumentHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "[::1]" || h === "::1") return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isHttpsRemoteUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

export type GalleryProxiedImgProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src"
> & {
  remoteUrl: string;
  /**
   * > 0 — прокси уменьшает превью (меньше байт, быстрее сетка).
   * Не задавать или 0 — полное разрешение через прокси (лайтбокс).
   */
  previewMaxWidth?: number;
};

/**
 * Галерея: сначала same-origin прокси (обход Chromium PNA/CORS на CDN),
 * при ошибке — прямой URL там, где браузер это допускает.
 */
function isWaveSpeedCdnUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.endsWith(".cloudfront.net");
  } catch {
    return false;
  }
}

export function GalleryProxiedImg({
  remoteUrl,
  alt = "",
  onError,
  previewMaxWidth,
  ...rest
}: GalleryProxiedImgProps) {
  const prepared = useMemo(
    () => withServeFilePreviewParam(remoteUrl.trim()),
    [remoteUrl]
  );
  const proxied = useMemo(
    () =>
      proxiedHttpsMediaUrl(
        prepared,
        typeof previewMaxWidth === "number" && previewMaxWidth > 0
          ? { maxDisplayWidth: previewMaxWidth }
          : undefined
      ),
    [prepared, previewMaxWidth]
  );

  const chain = useMemo(() => {
    const list: string[] = [];
    if (prepared.startsWith("/")) {
      list.push(prepared);
      return [...new Set(list)];
    }
    // WaveSpeed CDN: сначала прямой URL (прокси на dev часто 502/71s), потом same-origin прокси
    if (isWaveSpeedCdnUrl(prepared)) {
      list.push(prepared);
    }
    if (proxied) list.push(proxied);
    const directWouldBeBlockedByPna =
      isNonPublicDocumentHost() && isHttpsRemoteUrl(prepared);
    if (
      prepared &&
      prepared !== proxied &&
      !list.includes(prepared) &&
      !directWouldBeBlockedByPna
    ) {
      list.push(prepared);
    }
    return [...new Set(list)];
  }, [proxied, prepared]);

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [remoteUrl, previewMaxWidth]);

  const src = chain[Math.min(idx, Math.max(chain.length - 1, 0))] ?? "";

  const handleError = useCallback(
    (e: SyntheticEvent<HTMLImageElement, Event>) => {
      onError?.(e);
      setIdx((prev) => (prev + 1 < chain.length ? prev + 1 : prev));
    },
    [chain.length, onError]
  );

  if (!remoteUrl.trim()) return null;

  return (
    <img
      referrerPolicy="no-referrer"
      {...rest}
      alt={alt}
      src={src}
      decoding="async"
      onError={handleError}
    />
  );
}
