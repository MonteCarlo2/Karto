"use client";

import type { ImgHTMLAttributes, SyntheticEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { proxiedHttpsMediaUrl } from "@/lib/client/proxied-display-url";

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

/** Совпадает с логикой free-generation для /api/serve-file */
function withServeFilePreviewParam(url: string): string {
  if (typeof url !== "string" || !url.includes("/api/serve-file")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}w=400`;
}

export type GalleryProxiedImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  remoteUrl: string;
};

/**
 * Галерея: сначала same-origin прокси (обход Chromium PNA/CORS на CDN),
 * при ошибке — прямой URL (локальный dev без VPN может тянуть прокси и CDN по-разному).
 */
export function GalleryProxiedImg({
  remoteUrl,
  alt = "",
  onError,
  ...rest
}: GalleryProxiedImgProps) {
  const prepared = useMemo(() => withServeFilePreviewParam(remoteUrl.trim()), [remoteUrl]);
  const proxied = useMemo(() => proxiedHttpsMediaUrl(prepared), [prepared]);

  const chain = useMemo(() => {
    const list: string[] = [];
    if (proxied) list.push(proxied);
    const directWouldBeBlockedByPna =
      isNonPublicDocumentHost() && isHttpsRemoteUrl(prepared);
    if (prepared && prepared !== proxied && !directWouldBeBlockedByPna) {
      list.push(prepared);
    }
    return [...new Set(list)];
  }, [proxied, prepared]);

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [remoteUrl]);

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
