"use client";

import type { ImgHTMLAttributes, SyntheticEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { proxiedHttpsMediaUrl } from "@/lib/client/proxied-display-url";

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
    if (prepared && prepared !== proxied) list.push(prepared);
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
