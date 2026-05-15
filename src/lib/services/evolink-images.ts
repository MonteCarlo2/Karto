/**
 * EvoLink AI — генерация через Nano Banana 2 (`gemini-3.1-flash-image-preview`).
 * Док: https://docs.evolink.ai — POST /v1/images/generations, GET /v1/tasks/{task_id}
 * Bearer: Authorization: Bearer <EVOLINK_API_KEY>
 */

import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULT_ORIGIN = "https://api.evolink.ai";
const REF_BUCKET = "generated-images";
const REF_PREFIX = "evolink-refs";

/** Поддержка старых имён переменных (ошибочно названных «wavespeed»). */
function envStr(primary: string, legacy?: string): string | undefined {
  const a = process.env[primary]?.trim();
  if (a) return a;
  const b = legacy ? process.env[legacy]?.trim() : undefined;
  return b || undefined;
}

export function getEvolinkApiKey(): string {
  const key = envStr("EVOLINK_API_KEY", "WAVESPEED_API_KEY");
  if (!key) {
    throw new Error(
      "EVOLINK_API_KEY не установлен (.env.local). Временная совместимость: WAVESPEED_API_KEY."
    );
  }
  return key;
}

function evolinkOrigin(): string {
  const o = envStr("EVOLINK_API_ORIGIN", "WAVESPEED_API_ORIGIN") ?? DEFAULT_ORIGIN;
  return o.replace(/\/+$/, "");
}

function defaultQuality(): string {
  return envStr("EVOLINK_IMAGE_QUALITY", "WAVESPEED_IMAGE_QUALITY") || "2K";
}

export function evolinkDefaultImageModel(): string {
  return (
    envStr("EVOLINK_IMAGE_MODEL", "WAVESPEED_IMAGE_MODEL") || "gemini-3.1-flash-image-preview"
  );
}

/** См. enum `size` в OpenAPI Nanobanana 2.EvoLink. */
export function evolinkAspectToSize(aspectRatio: string): string {
  const a = aspectRatio.trim();
  switch (a) {
    case "3:4":
    case "4:3":
    case "9:16":
    case "1:1":
    case "auto":
      return a;
    default:
      return "auto";
  }
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(tid);
  }
}

function pickFirstHttpsUrlDeep(v: unknown, depth = 0): string | null {
  if (depth > 10 || v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t.startsWith("https://") || t.startsWith("http://")) return t;
    return null;
  }
  if (Array.isArray(v)) {
    for (const x of v) {
      const u = pickFirstHttpsUrlDeep(x, depth + 1);
      if (u) return u;
    }
    return null;
  }
  if (typeof v === "object") {
    for (const x of Object.values(v as Record<string, unknown>)) {
      const u = pickFirstHttpsUrlDeep(x, depth + 1);
      if (u) return u;
    }
  }
  return null;
}

function extractTaskId(json: Record<string, unknown>): string | null {
  const direct = json.task_id ?? json.taskId ?? json.id ?? json.request_id ?? json.requestId;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const data = json.data;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    const inner = d.task_id ?? d.taskId ?? d.id;
    if (typeof inner === "string" && inner.trim()) return inner.trim();
  }
  return null;
}

function extractResultsFirstUrl(json: Record<string, unknown>): string | null {
  const results = json.results;
  if (Array.isArray(results) && results.length > 0) {
    const u = results[0];
    if (typeof u === "string" && /^https?:/i.test(u.trim())) return u.trim();
    if (u && typeof u === "object" && "url" in u && typeof (u as { url: unknown }).url === "string") {
      const url = ((u as { url: string }).url).trim();
      if (/^https?:/i.test(url)) return url;
    }
  }
  return null;
}

function isDoneStatus(s: string): boolean {
  const x = s.toLowerCase();
  return (
    x === "completed" ||
    x === "success" ||
    x === "succeeded" ||
    x === "done" ||
    x === "finished"
  );
}

function isFailedStatus(s: string): boolean {
  const x = s.toLowerCase();
  return (
    x === "failed" ||
    x === "fail" ||
    x === "error" ||
    x === "cancelled" ||
    x === "canceled"
  );
}

function readStatus(obj: Record<string, unknown>): string {
  const data = obj.data;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    const st = d.status ?? d.task_status ?? d.state;
    if (typeof st === "string") return st;
  }
  const st = obj.status ?? obj.state ?? obj.task_status;
  return typeof st === "string" ? st : "";
}

function formatEvolinkPostError(status: number, raw: string): string {
  try {
    const j = JSON.parse(raw) as {
      error?: { message?: string; code?: string };
      message?: string;
    };
    const nested = typeof j?.error?.message === "string" ? j.error.message.trim() : "";
    if (nested) return nested;
    if (typeof j?.message === "string" && j.message.trim()) return j.message.trim();
  } catch {
    /* ignore */
  }
  return raw.slice(0, 800);
}

async function uploadBufferToSupabase(buffer: Buffer, index: number): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase не настроен (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
  }
  const supabase = createClient(supabaseUrl, serviceKey);
  const fileName = `${REF_PREFIX}/${Date.now()}-${index}-${Math.random().toString(36).slice(2, 9)}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from(REF_BUCKET)
    .upload(fileName, buffer, { contentType: "image/jpeg", upsert: true });
  if (uploadError) throw new Error(`Supabase Storage: ${uploadError.message}`);
  const { data } = supabase.storage.from(REF_BUCKET).getPublicUrl(fileName);
  return data.publicUrl;
}

async function dataUrlToBuffer(dataUrl: string): Promise<Buffer> {
  if (!dataUrl.startsWith("data:image")) throw new Error("Invalid data URL");
  const comma = dataUrl.indexOf(",");
  if (comma === -1) throw new Error("Invalid data URL");
  const raw = Buffer.from(dataUrl.slice(comma + 1), "base64");
  return raw.length > 400_000
    ? await sharp(raw).rotate().resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()
    : await sharp(raw).rotate().jpeg({ quality: 85 }).toBuffer();
}

async function downloadAsBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Публичные URL для внешних API (EvoLink image_urls, WaveSpeed edit). Загрузки — параллельно. */
export async function prepareEvolinkImageUrls(inputs: string[]): Promise<string[]> {
  const max = Math.min(14, inputs.length);
  const slice = inputs.slice(0, max);
  const settled = await Promise.allSettled(
    slice.map((source, idx) => resolveOnePublicReferenceUrl(source, idx))
  );
  const out: string[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled" && s.value) out.push(s.value);
    else if (s.status === "rejected") {
      console.warn("⚠️ [refs] референс:", String(s.reason));
    }
  }
  return out;
}

async function resolveOnePublicReferenceUrl(source: string, index: number): Promise<string | null> {
  if (!source || typeof source !== "string") return null;
  if (source.startsWith("data:image")) {
    const buf = await dataUrlToBuffer(source);
    return uploadBufferToSupabase(buf, index);
  }
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const isLocal =
      source.includes("localhost") ||
      source.includes("127.0.0.1") ||
      source.includes("[::1]");
    if (isLocal) {
      const buf = await downloadAsBuffer(source);
      return uploadBufferToSupabase(buf, index);
    }
    return source;
  }
  return null;
}

function modelBool(primary: string, legacy: string): boolean {
  const v = process.env[primary]?.trim().toLowerCase();
  const v2 = process.env[legacy]?.trim().toLowerCase();
  const s = v ?? v2;
  if (s === "false" || s === "0") return false;
  if (s === "true" || s === "1") return true;
  return true;
}

async function createGenerationTask(params: {
  prompt: string;
  size: string;
  quality: string;
  image_urls?: string[];
}): Promise<string> {
  const origin = evolinkOrigin();
  const apiKey = getEvolinkApiKey();
  const webSearch = modelBool("EVOLINK_MODEL_WEB_SEARCH", "WAVESPEED_MODEL_WEB_SEARCH");
  const imageSearch = modelBool("EVOLINK_MODEL_IMAGE_SEARCH", "WAVESPEED_MODEL_IMAGE_SEARCH");
  const thinkingLevel =
    envStr("EVOLINK_MODEL_THINKING_LEVEL", "WAVESPEED_MODEL_THINKING_LEVEL") || "auto";

  const body: Record<string, unknown> = {
    model: evolinkDefaultImageModel(),
    prompt: params.prompt.trim(),
    size: params.size,
    quality: params.quality,
    model_params: {
      web_search: webSearch,
      image_search: imageSearch,
      thinking_level: thinkingLevel,
    },
  };
  if (params.image_urls && params.image_urls.length > 0) {
    body.image_urls = params.image_urls.slice(0, 14);
  }

  const cb = envStr("EVOLINK_CALLBACK_URL", "WAVESPEED_CALLBACK_URL");
  if (cb?.toLowerCase().startsWith("https://")) {
    body.callback_url = cb.slice(0, 2048);
  }

  const url = `${origin}/v1/images/generations`;
  console.log(`🚀 [EvoLink] POST ${url} model=${body.model}`);

  const createTimeoutMs = parseInt(
    envStr("EVOLINK_CREATE_TIMEOUT_MS", "WAVESPEED_CREATE_TIMEOUT_MS") ?? "60000",
    10
  );

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    createTimeoutMs
  );

  const text = await response.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      `EvoLink: некорректный JSON (${response.status}): ${text.slice(0, 400)}`
    );
  }

  if (!response.ok) {
    throw new Error(`EvoLink POST ${response.status}: ${formatEvolinkPostError(response.status, text)}`);
  }

  const taskId = extractTaskId(json);
  if (!taskId) {
    console.error("[EvoLink] ответ без id:", JSON.stringify(json).slice(0, 2000));
    throw new Error("EvoLink: в ответе нет id задачи");
  }
  console.log("✅ [EvoLink] Задача создана:", taskId);
  return taskId;
}

function formatTaskFailure(json: Record<string, unknown>): string {
  const e = json.error;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return ((e as { message: string }).message).slice(0, 900);
  }
  return JSON.stringify(json.error ?? json).slice(0, 900);
}

async function pollTaskUntilImage(taskId: string): Promise<string> {
  const origin = evolinkOrigin();
  const apiKey = getEvolinkApiKey();
  const pollMs = parseInt(
    envStr("EVOLINK_POLL_INTERVAL_MS", "WAVESPEED_POLL_INTERVAL_MS") ?? "2500",
    10
  );
  const maxMs = parseInt(
    envStr("EVOLINK_TASK_MAX_WAIT_MS", "WAVESPEED_TASK_MAX_WAIT_MS") ?? "320000",
    10
  );
  const reqTimeoutMs = parseInt(
    envStr("EVOLINK_POLL_REQUEST_TIMEOUT_MS", "WAVESPEED_POLL_REQUEST_TIMEOUT_MS") ??
      "20000",
    10
  );
  const started = Date.now();

  console.log("⏳ [EvoLink] Опрос задачи:", taskId);

  while (Date.now() - started < maxMs) {
    const pollUrl = `${origin}/v1/tasks/${encodeURIComponent(taskId)}`;
    const response = await fetchWithTimeout(
      pollUrl,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
      reqTimeoutMs
    );

    const text = await response.text();
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      console.warn("[EvoLink] poll не JSON:", text.slice(0, 200));
      await sleep(pollMs);
      continue;
    }

    if (!response.ok) {
      console.warn("[EvoLink] poll HTTP", response.status, text.slice(0, 300));
      await sleep(pollMs);
      continue;
    }

    const status = readStatus(json);
    if (isFailedStatus(status)) {
      throw new Error(`EvoLink задача ${status}: ${formatTaskFailure(json)}`);
    }

    const fromResults = extractResultsFirstUrl(json);
    if (fromResults && isDoneStatus(status)) {
      console.log("✅ [EvoLink] Готово (results):", fromResults);
      return fromResults;
    }

    const shallow =
      typeof json.image_url === "string"
        ? json.image_url.trim()
        : typeof (json.data as Record<string, unknown> | undefined)?.image_url === "string"
          ? String((json.data as Record<string, unknown>).image_url).trim()
          : "";
    const picked = shallow.startsWith("http") ? shallow : pickFirstHttpsUrlDeep(json);
    const candidate = picked && /^https?:\/\//i.test(picked) ? picked : "";

    if (candidate && isDoneStatus(status)) {
      console.log("✅ [EvoLink] Готово:", candidate);
      return candidate;
    }

    const st = status.toLowerCase();
    const stillQueued =
      st === "" ||
      st.includes("pending") ||
      st.includes("process") ||
      st.includes("queue") ||
      st.includes("run") ||
      st.includes("wait") ||
      st === "started" ||
      st === "created";

    if (fromResults && fromResults.startsWith("http") && (!stillQueued || isDoneStatus(status))) {
      console.log("✅ [EvoLink] Получены results до явного завершения:", fromResults);
      return fromResults;
    }

    if (candidate && !stillQueued && !isFailedStatus(status)) {
      console.log(`✅ [EvoLink] Готово (статус: ${status || "done"}):`, candidate);
      return candidate;
    }

    await sleep(pollMs);
  }

  throw new Error("Превышено время ожидания результата EvoLink");
}

export type EvoLinkImageGenerationResult = { imageUrl: string; referenceUsed: boolean };

/**
 * Генерация до появления URL картинки (серверный длинный запрос через опрос).
 */
export async function generateWithEvolinkGemini(
  prompt: string,
  imageInput: string[] | undefined,
  aspectRatio: string
): Promise<EvoLinkImageGenerationResult> {
  const tStart = Date.now();
  console.log(
    `🍌 [EvoLink] Старт (модель ${evolinkDefaultImageModel()}), size=${evolinkAspectToSize(aspectRatio)}`
  );

  let image_urls: string[] | undefined;
  if (imageInput && imageInput.length > 0) {
    image_urls = await prepareEvolinkImageUrls(imageInput.slice(0, 4));
  }

  const taskId = await createGenerationTask({
    prompt,
    size: evolinkAspectToSize(aspectRatio),
    quality: defaultQuality(),
    ...(image_urls && image_urls.length > 0 ? { image_urls } : {}),
  });

  console.log(`⏱️ [EvoLink] задача создана за ${Date.now() - tStart} ms`);

  const imageUrl = await pollTaskUntilImage(taskId);
  console.log(`⏱️ [EvoLink] всего до URL: ${Date.now() - tStart} ms`);

  return {
    imageUrl,
    referenceUsed: !!image_urls && image_urls.length > 0,
  };
}
