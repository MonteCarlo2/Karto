"use client";

import { createBrowserClient } from "@/lib/supabase/client";

function resolveAbsoluteMediaUrl(url: string): string {
  const t = url.trim();
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  if (typeof window === "undefined") return t;
  if (t.startsWith("/")) return `${window.location.origin}${t}`;
  return `${window.location.origin}/${t}`;
}

function triggerBlobDownload(blob: Blob, filenameBase: string, defaultExt: string): void {
  const ct = blob.type || "";
  let outExt = defaultExt;
  if (ct.includes("jpeg")) outExt = "jpg";
  else if (ct.includes("png")) outExt = "png";
  else if (ct.includes("webp")) outExt = "webp";
  else if (ct.includes("gif")) outExt = "gif";
  else if (ct.includes("mp4")) outExt = "mp4";
  else if (ct.includes("webm")) outExt = "webm";

  const downloadName = `${filenameBase}.${outExt}`;
  const objectUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = downloadName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(objectUrl);
}

/**
 * Файлы с нашего же origin (`/api/serve-file`, локальные выдачи) — один GET без тяжёлого POST pipeline.
 */
async function trySameOriginDownload(
  absUrl: string,
  filenameBase: string,
  defaultExt: string
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    if (!absUrl.startsWith(window.location.origin)) return false;

    const ctrl = new AbortController();
    const tid = window.setTimeout(() => ctrl.abort(), 120_000);
    let res: Response;
    try {
      res = await fetch(absUrl, {
        credentials: "same-origin",
        cache: "default",
        signal: ctrl.signal,
      });
    } finally {
      window.clearTimeout(tid);
    }
    if (!res.ok || !res.body) return false;

    const blob = await Promise.race([
      res.blob(),
      new Promise<never>((_, rej) => {
        window.setTimeout(() => rej(new Error("sameorigin_blob_timeout")), 110_000);
      }),
    ]);
    if (!blob?.size) return false;

    triggerBlobDownload(blob, filenameBase, defaultExt);
    return true;
  } catch {
    return false;
  }
}

/**
 * Прямое скачивание с CDN (минуя наш прокси), если хост отдаёт CORS.
 */
async function tryDirectDownloadImage(absUrl: string, filenameBase: string, defaultExt: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const u = new URL(absUrl);
    if (u.protocol === "http:" && window.location.protocol === "https:") return false;

    const ctrl = new AbortController();
    const tid = window.setTimeout(() => ctrl.abort(), 95_000);
    let res: Response;
    try {
      res = await fetch(absUrl, {
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        signal: ctrl.signal,
      });
    } finally {
      window.clearTimeout(tid);
    }
    if (!res.ok || !res.body) return false;

    const blob = await Promise.race([
      res.blob(),
      new Promise<never>((_, rej) => {
        window.setTimeout(() => rej(new Error("direct_blob_timeout")), 85_000);
      }),
    ]);
    if (!blob?.size) return false;

    const ct = res.headers.get("content-type") || "";
    let outExt = defaultExt;
    if (ct.includes("jpeg")) outExt = "jpg";
    else if (ct.includes("png")) outExt = "png";
    else if (ct.includes("webp")) outExt = "webp";
    else if (ct.includes("gif")) outExt = "gif";

    triggerBlobDownload(blob, filenameBase, outExt);
    return true;
  } catch {
    return false;
  }
}

/** localhost / 127.0.0.1 / ::1 — приводим к текущему host страницы, чтобы origin совпадал с API. */
function alignLoopbackToPageOrigin(abs: string): string {
  if (typeof window === "undefined") return abs;
  try {
    const u = new URL(abs);
    const h = u.hostname.toLowerCase();
    if (h === "127.0.0.1" || h === "[::1]" || h === "localhost") {
      u.protocol = window.location.protocol;
      u.hostname = window.location.hostname;
      u.port = window.location.port;
      return u.toString();
    }
  } catch {
    /* ignore */
  }
  return abs;
}

export type TriggerDownloadFromRemoteUrlParams = {
  url: string;
  mediaType: "image" | "video";
  /** без расширения, например karto-slide-123 */
  filenameBase: string;
  /** Сразу при нажатии (показать спиннер / тост). */
  onStart?: () => void;
  /** Всегда в конце — убрать спиннер. */
  onFinally?: () => void;
};

/**
 * Скачивание медиа: same-origin → прямой CDN (картинки) → POST `/api/media/download`.
 */
export async function triggerDownloadFromRemoteUrl(
  params: TriggerDownloadFromRemoteUrlParams
): Promise<void> {
  const { onStart, onFinally, url, mediaType, filenameBase } = params;
  onStart?.();
  try {
    await runDownload(url, mediaType, filenameBase);
  } finally {
    onFinally?.();
  }
}

async function runDownload(url: string, mediaType: "image" | "video", filenameBase: string): Promise<void> {
  const ext = mediaType === "video" ? "mp4" : "png";
  const suggestedName = `${filenameBase}.${ext}`;
  const trimmed = url.trim();

  if (trimmed.startsWith("data:")) {
    const a = document.createElement("a");
    a.href = trimmed;
    a.download = suggestedName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }

  const absoluteUrl = alignLoopbackToPageOrigin(resolveAbsoluteMediaUrl(url));

  const okSame = await trySameOriginDownload(absoluteUrl, filenameBase, ext);
  if (okSame) return;

  if (mediaType === "image") {
    const ok = await tryDirectDownloadImage(absoluteUrl, filenameBase, ext);
    if (ok) return;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const supabase = createBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  } catch {
    /* сессия недоступна — сервер проверит только белый список URL */
  }

  const payload = JSON.stringify({
    url: absoluteUrl,
    mediaType,
    filename: suggestedName,
  });

  const proxyFetchMs = mediaType === "video" ? 420_000 : 400_000;
  const blobReadMs = mediaType === "video" ? 420_000 : 140_000;
  const maxAttempts = 2;

  let response: Response | undefined;
  let lastMsg = "Не удалось скачать файл";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), proxyFetchMs);
    try {
      response = await fetch("/api/media/download", {
        method: "POST",
        credentials: "same-origin",
        headers,
        body: payload,
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(tid);
      lastMsg =
        e instanceof Error && (e.name === "AbortError" || /abort/i.test(e.message))
          ? "Превышено время ожидания сервера"
          : e instanceof Error
            ? e.message
            : lastMsg;
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 550 + attempt * 300));
      }
      continue;
    }
    clearTimeout(tid);

    if (response.ok) break;

    try {
      const j = (await response.json()) as { error?: string };
      if (j?.error && typeof j.error === "string") lastMsg = j.error;
    } catch {
      lastMsg = response.statusText || lastMsg;
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 550 + attempt * 300));
    }
  }

  if (!response?.ok) {
    throw new Error(lastMsg);
  }

  const blob = await Promise.race([
    response.blob(),
    new Promise<never>((_, rej) => {
      setTimeout(() => rej(new Error("Таймаут чтения файла")), blobReadMs);
    }),
  ]);
  const ct = response.headers.get("content-type") || "";
  let outExt = ext;
  if (ct.includes("jpeg")) outExt = "jpg";
  else if (ct.includes("png")) outExt = "png";
  else if (ct.includes("webp")) outExt = "webp";
  else if (ct.includes("gif")) outExt = "gif";
  else if (ct.includes("mp4")) outExt = "mp4";

  triggerBlobDownload(blob, filenameBase, outExt);
}
