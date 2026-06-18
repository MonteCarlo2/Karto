import sharp from "sharp";
import { createServerClient } from "@/lib/supabase/server";
import { hasWaveSpeedApiKey } from "@/lib/image-provider-keys";
import { uploadBufferToWaveSpeedMedia } from "@/lib/services/wavespeed-images";
const REF_BUCKET = "generated-images";
const REF_PREFIX = "flow-product-photos";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dataUrlToBuffer(dataUrl: string): Promise<Buffer> {
  if (!dataUrl.startsWith("data:image")) throw new Error("Invalid data URL");
  const comma = dataUrl.indexOf(",");
  if (comma === -1) throw new Error("Invalid data URL");
  const raw = Buffer.from(dataUrl.slice(comma + 1), "base64");
  return raw.length > 400_000
    ? sharp(raw).rotate().resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()
    : sharp(raw).rotate().jpeg({ quality: 85 }).toBuffer();
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error(`${label}: таймаут ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(tid);
        resolve(v);
      },
      (e) => {
        clearTimeout(tid);
        reject(e);
      }
    );
  });
}

/**
 * Загружает буфер в Supabase Storage (2 попытки, таймаут на каждую).
 */
export async function uploadFlowProductPhotoBuffer(
  buffer: Buffer,
  sessionId: string
): Promise<string> {
  const supabase = createServerClient();
  const safeSession = sessionId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64) || "session";
  const fileName = `${REF_PREFIX}/${safeSession}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const uploadPromise = supabase.storage.from(REF_BUCKET).upload(fileName, buffer, {
        contentType: "image/jpeg",
        upsert: true,
        cacheControl: "3600",
      });
      const { error } = await withTimeout(uploadPromise, 12_000, "Supabase upload");
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from(REF_BUCKET).getPublicUrl(fileName);
      if (!data.publicUrl) throw new Error("Не получен publicUrl");
      return data.publicUrl;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.warn(`⚠️ [flow-photo] upload attempt ${attempt}/2:`, lastError.message);
      if (attempt < 2) await sleep(500);
    }
  }
  throw lastError ?? new Error("Не удалось загрузить фото в Supabase Storage");
}

export async function uploadFlowProductPhotoFromDataUrl(
  dataUrl: string,
  sessionId: string
): Promise<string> {
  const buffer = await dataUrlToBuffer(dataUrl);
  return uploadFlowProductPhotoBuffer(buffer, sessionId);
}

/**
 * Для WaveSpeed/EvoLink нужен публичный https URL. data: URL конвертируем один раз.
 */
export async function ensurePublicProductPhotoUrl(
  source: string,
  sessionId: string
): Promise<string> {
  const trimmed = source?.trim() ?? "";
  if (!trimmed) return "";
  if (trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("http://") && !trimmed.includes("localhost") && !trimmed.includes("127.0.0.1")) {
    return trimmed;
  }
  if (trimmed.startsWith("data:image")) {
    const buffer = await dataUrlToBuffer(trimmed);
    if (hasWaveSpeedApiKey()) {
      try {
        return await uploadBufferToWaveSpeedMedia(buffer, `flow-${sessionId}.jpg`);
      } catch (e) {
        console.warn("⚠️ [flow-photo] WaveSpeed upload failed, пробуем Supabase:", e);
      }
    }
    return uploadFlowProductPhotoBuffer(buffer, sessionId);
  }  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const res = await fetch(trimmed);
    if (!res.ok) throw new Error(`Не удалось скачать фото: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return uploadFlowProductPhotoBuffer(buf, sessionId);
  }
  return "";
}
