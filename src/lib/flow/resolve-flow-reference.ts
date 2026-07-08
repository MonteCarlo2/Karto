import path from "path";
import fs from "fs/promises";
import sharp from "sharp";
import { getWritableFilePath } from "@/lib/services/image-processing";
import { hasWaveSpeedApiKey } from "@/lib/image-provider-keys";
import { uploadBufferToWaveSpeedMedia } from "@/lib/services/wavespeed-images";
import { uploadFlowProductPhotoBuffer } from "@/lib/flow/upload-flow-product-photo";

/** Уже публичный URL, который WaveSpeed может скачать без нашего origin. */
export function isWaveSpeedReadyReferenceUrl(url: string): boolean {
  const t = url.trim();
  if (!t.startsWith("https://")) return false;
  try {
    const h = new URL(t).hostname.toLowerCase();
    if (h.endsWith(".cloudfront.net")) return true;
    if (h.includes("supabase.co") || h.includes("supabase.in")) return true;
    if (h.includes("wavespeed.ai")) return true;
  } catch {
    return false;
  }
  return false;
}

/** Нужно скачать/прочитать с диска и залить на WaveSpeed CDN. */
export function flowReferenceNeedsUpload(url: string): boolean {
  const t = url.trim();
  if (!t) return false;
  if (t.startsWith("data:image")) return true;
  if (t.includes("/api/serve-file")) return true;
  if (t.startsWith("/temp/") || t.startsWith("/output/")) return true;
  if (t.startsWith("/") && !t.startsWith("//")) return true;
  if (t.startsWith("http://localhost") || t.includes("127.0.0.1")) return true;
  if (t.startsWith("https://") || t.startsWith("http://")) {
    try {
      const u = new URL(t);
      if (u.pathname.includes("/api/serve-file")) return true;
    } catch {
      return true;
    }
    return !isWaveSpeedReadyReferenceUrl(t);
  }
  return true;
}

export function isLocalServeFileMissing(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

async function readServeFileFromDisk(f: string, dir: "temp" | "output"): Promise<Buffer> {
  return fs.readFile(getWritableFilePath(f, dir));
}

export async function readFlowImageBuffer(imageUrl: string): Promise<Buffer> {
  const trimmed = imageUrl.trim();

  if (trimmed.includes("/api/serve-file")) {
    const u = new URL(trimmed, "http://local.invalid");
    const f = u.searchParams.get("f");
    const dir = u.searchParams.get("dir");
    if (!f || (dir !== "temp" && dir !== "output")) {
      throw new Error("Некорректный URL serve-file");
    }
    return readServeFileFromDisk(f, dir);
  }

  const publicRelative = trimmed.split("?")[0];
  if (
    publicRelative.startsWith("/temp/") ||
    publicRelative.startsWith("/output/")
  ) {
    return fs.readFile(path.join(process.cwd(), "public", publicRelative));
  }

  if (trimmed.startsWith("data:image")) {
    const comma = trimmed.indexOf(",");
    if (comma === -1) throw new Error("Некорректный data URL");
    const raw = Buffer.from(trimmed.slice(comma + 1), "base64");
    if (raw.length > 2_500_000) {
      return sharp(raw)
        .rotate()
        .resize({ width: 1600, withoutEnlargement: true })
        .png({ compressionLevel: 6 })
        .toBuffer();
    }
    if (raw.length > 900_000) {
      return sharp(raw).rotate().jpeg({ quality: 92 }).toBuffer();
    }
    return sharp(raw).rotate().toBuffer();
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const res = await fetch(trimmed);
    if (!res.ok) throw new Error(`Не удалось скачать изображение: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return fs.readFile(path.join(process.cwd(), "public", publicRelative));
  }

  throw new Error(`Неподдерживаемый URL изображения: ${trimmed.slice(0, 48)}`);
}

async function uploadBufferForWaveSpeed(
  buffer: Buffer,
  sessionId: string,
  label: string
): Promise<string> {
  if (buffer.length > 10 * 1024 * 1024) {
    throw new Error("Изображение слишком большое для референса");
  }
  if (hasWaveSpeedApiKey()) {
    try {
      const url = await uploadBufferToWaveSpeedMedia(buffer, `${label}.jpg`);
      console.log(`✅ [flow-ref] WaveSpeed CDN: ${url.slice(0, 96)}…`);
      return url;
    } catch (e) {
      console.warn(`⚠️ [flow-ref] WaveSpeed upload failed (${label}):`, e);
    }
  }
  const url = await uploadFlowProductPhotoBuffer(buffer, sessionId);
  console.log(`✅ [flow-ref] Supabase public: ${url.slice(0, 96)}…`);
  return url;
}

/**
 * Любой URL фото/карточки Потока → публичный https для WaveSpeed **edit** (как в батче).
 */
export async function ensureWaveSpeedReferenceUrl(
  imageUrl: string,
  sessionId: string,
  label = "flow-ref"
): Promise<string> {
  const trimmed = imageUrl?.trim() ?? "";
  if (!trimmed) return "";

  if (isWaveSpeedReadyReferenceUrl(trimmed) && !flowReferenceNeedsUpload(trimmed)) {
    return trimmed;
  }

  const buffer = await readFlowImageBuffer(trimmed);
  return uploadBufferForWaveSpeed(buffer, sessionId, label);
}

/** @deprecated Используйте ensureWaveSpeedReferenceUrl */
export async function resolveFlowReferenceForApi(
  imageUrl: string,
  sessionId: string,
  label = "flow-ref"
): Promise<string> {
  return ensureWaveSpeedReferenceUrl(imageUrl, sessionId, label);
}

/** Референс для слайда: при пропавшем файле карточки — фото с «Понимания». */
export async function ensureWaveSpeedReferenceUrlWithFallback(
  primary: string,
  fallback: string | undefined,
  sessionId: string,
  label: string
): Promise<string> {
  const primaryTrim = primary?.trim() ?? "";
  const fallbackTrim = fallback?.trim() ?? "";

  if (primaryTrim) {
    try {
      const url = await ensureWaveSpeedReferenceUrl(primaryTrim, sessionId, label);
      if (url) return url;
    } catch (e) {
      if (fallbackTrim && fallbackTrim !== primaryTrim) {
        console.warn(`⚠️ [flow-ref] ${label}: основной референс недоступен, fallback:`, e);
        return ensureWaveSpeedReferenceUrl(fallbackTrim, sessionId, `${label}-fb`);
      }
      throw e;
    }
  }

  if (fallbackTrim) {
    return ensureWaveSpeedReferenceUrl(fallbackTrim, sessionId, `${label}-fb`);
  }

  return "";
}
