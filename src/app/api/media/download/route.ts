import { randomUUID } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable, Transform } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  isBlockedSsrfHost,
  isSameAppOrigin,
  isAllowedRemoteMediaUrl,
} from "@/lib/media/allowed-remote-media-url";

export const dynamic = "force-dynamic";
/** Долгие апстрим-ответы tempfile CDN (до нескольких минут на сумму попыток). */
export const maxDuration = 300;

/** Сливаем тело ответа CDN во временный файл (без pipe CDN→клиент), затем отдаём с диска. */
async function spoolWebStreamToTempFile(
  webStream: ReadableStream<Uint8Array>,
  maxBytes: number
): Promise<{ path: string } | { error: string; status: number }> {
  const tmpPath = path.join(os.tmpdir(), `karto-media-${randomUUID()}.bin`);
  let total = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      total += chunk.length;
      if (total > maxBytes) {
        cb(new Error("FILE_TOO_LARGE"));
        return;
      }
      cb(null, chunk);
    },
  });
  const out = createWriteStream(tmpPath);
  const nodeReadable = Readable.fromWeb(webStream as Parameters<typeof Readable.fromWeb>[0]);
  try {
    await pipeline(nodeReadable, limiter, out);
  } catch (e) {
    await fsp.unlink(tmpPath).catch(() => {});
    if (e instanceof Error && e.message === "FILE_TOO_LARGE") {
      return { error: "Файл слишком большой", status: 413 };
    }
    return { error: "Не удалось получить файл с хранилища", status: 502 };
  }
  return { path: tmpPath };
}

/** Чтение потока с дедлайном — `arrayBuffer()` на chunk-кодировании без длины может висеть бесконечно. */
async function bufferFromWebStreamWithDeadline(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  deadlineMs: number
): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string; status: number }> {
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  const deadline = Date.now() + deadlineMs;
  try {
    for (;;) {
      if (Date.now() > deadline) {
        await reader.cancel().catch(() => {});
        return {
          ok: false,
          error: "Превышено время загрузки файла с хранилища",
          status: 504,
        };
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.byteLength) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          return { ok: false, error: "Файл слишком большой", status: 413 };
        }
        chunks.push(Buffer.from(value));
      }
    }
    const buffer = chunks.length === 0 ? Buffer.alloc(0) : Buffer.concat(chunks);
    if (buffer.byteLength === 0) {
      return { ok: false, error: "Пустой файл с хранилища", status: 502 };
    }
    return { ok: true, buffer };
  } catch {
    await reader.cancel().catch(() => {});
    return { ok: false, error: "Не удалось получить файл с хранилища", status: 502 };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

const MAX_BYTES = 250 * 1024 * 1024; // 250 MB — защита от злоупотреблений

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

function sanitizeFilename(name: string): string {
  const trimmed = name.trim().slice(0, 180);
  return trimmed.replace(/[^\w.\-()\s\u0400-\u04FF]/g, "_").replace(/\s+/g, "-") || "karto-download";
}

/**
 * POST { url, filename?, mediaType? }
 * — **video**: сначала полностью сливаем ответ CDN во временный файл на диск, затем отдаём клиенту
 *   с диска (тот же UX — скачивание с вашего API), без pipe «CDN → сокет клиента».
 * — **image**: как раньше — потоковый прокси (файлы обычно небольшие).
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

  const onWhitelist = isAllowedRemoteMediaUrl(target, sameOrigin);
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

  const upstreamFetchMs = Math.min(
    900_000,
    Math.max(60_000, Number(process.env.MEDIA_DOWNLOAD_UPSTREAM_MS) || 600_000)
  );

  /** Картинки с tempfile CDN часто отвечают медленнее 45s — иначе клиент видит «502» из обрыва соединения. */
  const attemptTimeout =
    body.mediaType === "video"
      ? Math.min(upstreamFetchMs, 300_000)
      : Math.min(upstreamFetchMs, 120_000);

  const maxUpstreamAttempts = body.mediaType === "video" ? 3 : 2;

  let upstream: Response | undefined;
  let lastNetworkError: unknown;

  for (let attempt = 0; attempt < maxUpstreamAttempts; attempt++) {
    try {
      const res = await fetch(target.toString(), {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(attemptTimeout),
        headers: {
          Accept: body.mediaType === "video" ? "*/*" : "image/*,*/*",
          "User-Agent": "KartoMediaDownload/1.0",
        },
      });
      if (res.ok && res.body) {
        upstream = res;
        lastNetworkError = undefined;
        break;
      }
      lastNetworkError = new Error(`upstream_status_${res.status}`);
    } catch (e) {
      lastNetworkError = e;
      upstream = undefined;
    }
    if (attempt < maxUpstreamAttempts - 1) {
      await new Promise((r) => setTimeout(r, 450 + attempt * 400));
    }
  }

  if (!upstream?.ok || !upstream.body) {
    const err = lastNetworkError instanceof Error ? lastNetworkError : null;
    const name = err?.name ?? "";
    const causeName =
      err && "cause" in err && err.cause instanceof Error ? err.cause.name : "";
    const msg = err?.message ?? "";
    const timedOut =
      name === "TimeoutError" ||
      name === "AbortError" ||
      causeName === "TimeoutError" ||
      causeName === "AbortError" ||
      /timeout|aborted/i.test(msg);
    if (timedOut) {
      return NextResponse.json(
        { error: "Превышено время ожидания файла с хранилища. Попробуйте ещё раз." },
        { status: 504 }
      );
    }
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

  const attachmentHeaders = {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    "Cache-Control": "private, no-store",
  };

  if (body.mediaType === "video" && upstream.body) {
    const tmp = await spoolWebStreamToTempFile(upstream.body, MAX_BYTES);
    if ("error" in tmp) {
      return NextResponse.json({ error: tmp.error }, { status: tmp.status });
    }
    const readStream = createReadStream(tmp.path);
    const cleanup = () => fsp.unlink(tmp.path).catch(() => {});
    readStream.once("close", cleanup);
    readStream.once("error", cleanup);
    return new NextResponse(Readable.toWeb(readStream) as unknown as BodyInit, {
      status: 200,
      headers: attachmentHeaders,
    });
  }

  /** Изображения: поchunk с дедлайном — иначе `arrayBuffer()` может висеть на CDN без Content-Length. */
  if (upstream.body) {
    const imageCapBytes = Math.min(MAX_BYTES, 45 * 1024 * 1024);
    const readDeadlineMs = 130_000;
    const result = await bufferFromWebStreamWithDeadline(upstream.body, imageCapBytes, readDeadlineMs);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: attachmentHeaders,
    });
  }

  return NextResponse.json({ error: "Пустое тело ответа" }, { status: 502 });
}
