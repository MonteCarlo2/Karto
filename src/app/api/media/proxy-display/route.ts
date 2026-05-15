import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { isAllowedRemoteMediaUrl } from "@/lib/media/allowed-remote-media-url";

/** Явный Node — стабильный stream/fetch для долгих ответов CDN. */
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_PROXY_BYTES = 250 * 1024 * 1024;

/** Описание см. Chromium CORS+PNA («public» vs «unknown» у img src с внешних CDN). Прокси same-origin решает. */
export async function GET(request: NextRequest) {
  const sameOrigin = request.nextUrl.origin;
  const rawU = request.nextUrl.searchParams.get("u");
  if (!rawU || typeof rawU !== "string") {
    return NextResponse.json({ error: "Параметр u обязателен" }, { status: 400 });
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(rawU.trim());
  } catch {
    return NextResponse.json({ error: "Некорректный параметр u" }, { status: 400 });
  }

  let target: URL;
  try {
    if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
      target = new URL(decoded);
    } else {
      return NextResponse.json({ error: "Только абсолютные http(s) URL" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Некорректный URL" }, { status: 400 });
  }

  if (!isAllowedRemoteMediaUrl(target, sameOrigin)) {
    return NextResponse.json({ error: "Хост недоступен для прокси" }, { status: 403 });
  }

  if (decoded.length > 15000) {
    return NextResponse.json({ error: "URL слишком длинный" }, { status: 400 });
  }

  const mwParam = request.nextUrl.searchParams.get("mw");
  let displayMaxWidth = 0;
  if (mwParam !== null && mwParam !== "") {
    const parsed = Number.parseInt(mwParam, 10);
    if (Number.isFinite(parsed)) {
      displayMaxWidth = Math.min(2048, Math.max(64, parsed));
    }
  }

  const upstreamFetchMs = Math.min(
    900_000,
    Math.max(60_000, Number(process.env.MEDIA_DOWNLOAD_UPSTREAM_MS) || 600_000)
  );
  const attemptTimeout = Math.min(upstreamFetchMs, 270_000);
  const maxUpstreamAttempts = 4;

  let upstream: Response | undefined;
  for (let attempt = 0; attempt < maxUpstreamAttempts; attempt++) {
    try {
      const res = await fetch(target.toString(), {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(attemptTimeout),
        headers: {
          Accept:
            "image/avif,image/webp,image/apng,image/*,video/mp4,video/webm,*/*",
          "User-Agent": "KartoMediaProxyDisplay/2.0",
        },
      });
      if (res.ok && res.body) {
        upstream = res.clone();
        break;
      }
      upstream = undefined;
    } catch {
      upstream = undefined;
    }
    if (attempt < maxUpstreamAttempts - 1) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, 600 + attempt * 550)
      );
    }
  }

  if (!upstream?.ok || !upstream.body) {
    return NextResponse.json({ error: "Не удалось получить файл" }, { status: 502 });
  }

  const upstreamCt =
    upstream.headers.get("content-type") || "application/octet-stream";
  const ctLower = upstreamCt.toLowerCase();
  if (
    ctLower.includes("text/html") ||
    ctLower.includes("application/json") ||
    ctLower.includes("text/plain")
  ) {
    await upstream.body.cancel().catch(() => {});
    return NextResponse.json({ error: "Недопустимый тип содержимого" }, { status: 415 });
  }

  const lenHeader = upstream.headers.get("content-length");
  if (lenHeader) {
    const n = Number(lenHeader);
    if (Number.isFinite(n) && n > MAX_PROXY_BYTES) {
      await upstream.body.cancel().catch(() => {});
      return NextResponse.json({ error: "Файл слишком большой" }, { status: 413 });
    }
  }

  /**
   * Картинки буферизуем целиком: chunked-stream к браузеру часто даёт
   * net::ERR_INCOMPLETE_CHUNKED_ENCODING при обрыве апстрима.
   * Некоторые CDN ставят octet-stream — ориентируемся также на расширение в URL.
   */
  const looksLikeImage = /\.(png|jpe?g|gif|webp|avif|bmp)(\?|$)/i.test(
    target.pathname
  );
  const isImageType = ctLower.startsWith("image/");
  const IMAGE_BUFFER_CAP = Math.min(MAX_PROXY_BYTES, 40 * 1024 * 1024);

  if (isImageType || looksLikeImage) {
    let buf: ArrayBuffer;
    try {
      buf = await upstream.arrayBuffer();
    } catch {
      return NextResponse.json({ error: "Не удалось прочитать файл" }, { status: 502 });
    }
    if (buf.byteLength > IMAGE_BUFFER_CAP) {
      return NextResponse.json({ error: "Файл слишком большой" }, { status: 413 });
    }

    let ctTrim = upstreamCt.split(";")[0].trim();
    let bytes: Uint8Array = new Uint8Array(buf);
    let cacheCtrl =
      displayMaxWidth > 0
        ? "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400"
        : "public, max-age=3600, s-maxage=3600";

    if (displayMaxWidth > 0) {
      const isGif = ctLower.includes("gif");
      const isSvg = ctLower.includes("svg");
      if (!isGif && !isSvg && buf.byteLength > 2048) {
        try {
          const meta = await sharp(Buffer.from(bytes)).metadata();
          const w = meta.width ?? 0;
          if (w > displayMaxWidth) {
            const resized = await sharp(Buffer.from(bytes))
              .resize({ width: displayMaxWidth, withoutEnlargement: true })
              .webp({ quality: 88, alphaQuality: 92, effort: 3 })
              .toBuffer();
            bytes = new Uint8Array(resized);
            ctTrim = "image/webp";
          }
        } catch (e) {
          console.warn("[proxy-display] sharp:", e);
          bytes = new Uint8Array(buf);
          ctTrim = upstreamCt.split(";")[0].trim();
          cacheCtrl = "public, max-age=3600, s-maxage=3600";
        }
      }
    }

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": ctTrim,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": cacheCtrl,
      },
    });
  }

  const ctTrim = upstreamCt.split(";")[0].trim();
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": ctTrim,
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      Vary: "Accept-Encoding",
    },
  });
}
