"use client";

import { createBrowserClient } from "@/lib/supabase/client";

function resolveAbsoluteMediaUrl(url: string): string {
  const t = url.trim();
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  if (typeof window === "undefined") return t;
  if (t.startsWith("/")) return `${window.location.origin}${t}`;
  return `${window.location.origin}/${t}`;
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

/**
 * Скачивание медиа через `/api/media/download`.
 * Видео: сервер отдаёт прямую ссылку — качает браузер с CDN (не грузим VPS потоком).
 * Картинки: прокси с сервера (CORS).
 */
export async function triggerDownloadFromRemoteUrl(params: {
  url: string;
  mediaType: "image" | "video";
  /** без расширения, например karto-slide-123 */
  filenameBase: string;
}): Promise<void> {
  const { url, mediaType, filenameBase } = params;
  const ext = mediaType === "video" ? "mp4" : "png";
  const suggestedName = `${filenameBase}.${ext}`;
  const trimmed = url.trim();

  // data URL — прокси не нужен, браузер отдаст файл сам
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

  const response = await fetch("/api/media/download", {
    method: "POST",
    headers,
    body: JSON.stringify({
      url: absoluteUrl,
      mediaType,
      filename: suggestedName,
    }),
  });

  if (!response.ok) {
    let msg = "Не удалось скачать файл";
    try {
      const j = await response.json();
      if (j?.error && typeof j.error === "string") msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  const ctHeader = response.headers.get("content-type") || "";
  if (ctHeader.includes("application/json")) {
    const data = (await response.json()) as {
      mode?: string;
      url?: string;
      filename?: string;
    };
    if (data?.mode === "direct" && typeof data.url === "string" && data.url.length > 0) {
      const name =
        typeof data.filename === "string" && data.filename.trim()
          ? data.filename.trim()
          : suggestedName;
      const a = document.createElement("a");
      a.href = data.url;
      a.download = name;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
  }

  const blob = await response.blob();
  const ct = response.headers.get("content-type") || "";
  let outExt = ext;
  if (ct.includes("jpeg")) outExt = "jpg";
  else if (ct.includes("png")) outExt = "png";
  else if (ct.includes("webp")) outExt = "webp";
  else if (ct.includes("gif")) outExt = "gif";
  else if (ct.includes("mp4")) outExt = "mp4";

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
