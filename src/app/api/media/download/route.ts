import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_BYTES = 250 * 1024 * 1024; // 250 MB — защита от злоупотреблений

function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "[::1]" ||
    h === "::1"
  );
}

/**
 * Блокируем очевидные SSRF-цели для режима «любой https при авторизации».
 */
function isBlockedSsrfHost(hostname: string): boolean {
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

/** Для вошедшего пользователя: свой origin или любой публичный https (временные CDN KIE и т.д.). */
function isAllowedForAuthenticatedUser(url: URL, sameOrigin: string): boolean {
  if (isBlockedSsrfHost(url.hostname)) return false;
  if (isSameAppOrigin(url, sameOrigin)) return true;
  if (url.protocol === "https:") return true;
  return false;
}

async function getUserFromBearer(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return null;
  try {
    const supabase = createServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}

/**
 * Считаем origin эквивалентным, если совпадает строка origin ИЛИ оба хоста — loopback
 * с одним и тем же портом (типичный кейс: localhost:3000 vs 127.0.0.1:3000).
 */
function isSameAppOrigin(url: URL, sameOrigin: string): boolean {
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

function isAllowedRemoteUrl(url: URL, sameOrigin: string): boolean {
  if (isSameAppOrigin(url, sameOrigin)) {
    return true;
  }

  const protoOk =
    url.protocol === "https:" ||
    (url.protocol === "http:" && isLocalHost(url.hostname));
  if (!protoOk) return false;

  const host = url.hostname.toLowerCase();

  const supabase =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (supabase) {
    try {
      const allowedHost = new URL(supabase).hostname.toLowerCase();
      if (host === allowedHost) return true;
    } catch {
      /* ignore */
    }
  }

  // Публичные бакеты Supabase (если URL совпадает с типичным хостом)
  if (host.endsWith(".supabase.co") || host.endsWith(".supabase.in")) {
    return true;
  }

  // Временные файлы / CDN KIE (видео и иногда картинки)
  if (host.includes("redpandaai.co")) return true;
  if (host === "kie.ai" || host.endsWith(".kie.ai")) return true;
  if (host.includes("aiquickdraw.com")) return true;

  // Replicate (иногда остаётся временный URL в ленте / кэше)
  if (host === "replicate.delivery" || host.endsWith(".replicate.delivery")) {
    return true;
  }

  // Vercel Blob
  if (host.endsWith(".blob.vercel-storage.com")) return true;

  // Публичный URL приложения (картинки с прод-домена при локальной отладке и т.п.)
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

  // Доп. хосты из .env (через запятую), без схемы: cdn.example.com
  const extra = process.env.MEDIA_DOWNLOAD_EXTRA_HOSTS;
  if (extra) {
    for (const part of extra.split(",")) {
      const h = part.trim().toLowerCase();
      if (h && host === h) return true;
    }
  }

  return false;
}

function sanitizeFilename(name: string): string {
  const trimmed = name.trim().slice(0, 180);
  return trimmed.replace(/[^\w.\-()\s\u0400-\u04FF]/g, "_").replace(/\s+/g, "-") || "karto-download";
}

/**
 * POST { url, filename?, mediaType? }
 * — **video**: после проверки URL возвращаем JSON с прямой ссылкой — браузер качает с CDN,
 *   без потока через Node (нет «failed to pipe response» и нагрузки на VPS).
 * — **image**: по-прежнему прокси с разрешённого хоста (обход CORS, файлы обычно небольшие).
 */
export async function POST(request: NextRequest) {
  let body: { url?: string; filename?: string; mediaType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 });
  }

  const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
  if (!rawUrl) {
    return NextResponse.json({ error: "Параметр url обязателен" }, { status: 400 });
  }

  const sameOrigin = request.nextUrl.origin;

  let target: URL;
  try {
    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
      target = new URL(rawUrl);
    } else {
      target = new URL(rawUrl, sameOrigin);
    }
  } catch {
    return NextResponse.json({ error: "Некорректный URL" }, { status: 400 });
  }

  const onWhitelist = isAllowedRemoteUrl(target, sameOrigin);
  const user = await getUserFromBearer(request);
  const viaSession = user && isAllowedForAuthenticatedUser(target, sameOrigin);

  if (!onWhitelist && !viaSession) {
    return NextResponse.json(
      {
        error: user
          ? "Этот адрес нельзя скачать (недопустимый хост)."
          : "Войдите в аккаунт, чтобы скачать файл, или используйте ссылку с разрешённого хранилища.",
      },
      { status: 403 }
    );
  }

  if (body.mediaType === "video") {
    const defaultExt = "mp4";
    const baseName =
      typeof body.filename === "string" && body.filename.trim()
        ? sanitizeFilename(body.filename.trim())
        : `karto-video-${Date.now()}.${defaultExt}`;
    const safeName = baseName.includes(".") ? baseName : `${baseName}.${defaultExt}`;
    return NextResponse.json({
      mode: "direct",
      url: target.toString(),
      filename: safeName,
    });
  }

  const upstream = await fetch(target.toString(), {
    method: "GET",
    redirect: "follow",
    headers: {
      Accept: "*/*",
      "User-Agent": "KartoMediaDownload/1.0",
    },
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: "Не удалось получить файл с хранилища" },
      { status: 502 }
    );
  }

  const lenHeader = upstream.headers.get("content-length");
  if (lenHeader) {
    const n = Number(lenHeader);
    if (Number.isFinite(n) && n > MAX_BYTES) {
      return NextResponse.json({ error: "Файл слишком большой" }, { status: 413 });
    }
  }

  const contentType =
    upstream.headers.get("content-type") || "application/octet-stream";

  const defaultExt =
    body.mediaType === "video"
      ? "mp4"
      : contentType.includes("jpeg")
        ? "jpg"
        : contentType.includes("png")
          ? "png"
          : contentType.includes("webp")
            ? "webp"
            : contentType.includes("gif")
              ? "gif"
              : "bin";

  const baseName =
    typeof body.filename === "string" && body.filename.trim()
      ? sanitizeFilename(body.filename.trim())
      : `karto-${body.mediaType === "video" ? "video" : "media"}-${Date.now()}.${defaultExt}`;

  const safeName = baseName.includes(".") ? baseName : `${baseName}.${defaultExt}`;

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
