"use client";

import type { ImgHTMLAttributes, SyntheticEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  proxiedHttpsMediaUrl,
  reliableProxiedHttpsMediaUrl,
} from "@/lib/client/proxied-display-url";
import { withServeFilePreviewParam } from "@/lib/client/gallery-display-url";

function isWaveSpeedCdnUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.endsWith(".cloudfront.net");
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
 * Галерея: CDN показываем напрямую. Same-origin proxy — только fallback.
 * Порядок одинаков на SSR и клиенте, поэтому гидратация стабильна.
 */
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
  const reliableProxied = useMemo(
    () =>
      reliableProxiedHttpsMediaUrl(
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

    if (isWaveSpeedCdnUrl(prepared)) {
      if (reliableProxied) list.push(reliableProxied);
      if (proxied) list.push(proxied);
      list.push(prepared);
    } else if (proxied) {
      list.push(proxied);
    }
    if (
      prepared &&
      prepared !== proxied &&
      !list.includes(prepared)
    ) {
      list.push(prepared);
    }
    return [...new Set(list)];
  }, [proxied, reliableProxied, prepared]);

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [remoteUrl, previewMaxWidth]);

  const src = chain[Math.min(idx, Math.max(chain.length - 1, 0))] ?? "";

  const handleError = useCallback(
    (e: SyntheticEvent<HTMLImageElement, Event>) => {
      onError?.(e);
      setIdx((prev) => {
        if (prev + 1 < chain.length) return prev + 1;
        return prev;
      });
    },
    [chain.length, onError]
  );

  if (!remoteUrl.trim()) return null;

  return (
    <img
      {...rest}
      alt={alt}
      src={src}
      loading="eager"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={handleError}
    />
  );
}
