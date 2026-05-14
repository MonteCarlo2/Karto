import https from "https";
import { uploadAudioToPublicUrl } from "@/lib/services/replicate-transcribe";

/**
 * Речь → текст через KIE (ElevenLabs Scribe / elevenlabs/speech-to-text).
 * Загрузка: сначала /api/file-base64-upload (актуально по докам KIE), затем multipart /api/upload; при необходимости Supabase temp + file-url-upload.
 */

const KIE_TASK_BASE_URL = "https://api.kie.ai";
/** Загрузка файлов: в доках также api.kie.ai (старый /api/upload на redpanda часто 404). */
const KIE_UPLOAD_BASE_URLS = [
  process.env.KIE_UPLOAD_BASE_URL,
  "https://api.kie.ai",
  "https://kieai.redpandaai.co",
].filter((u): u is string => typeof u === "string" && u.startsWith("http"));

const DEFAULT_MODEL = "elevenlabs/speech-to-text";
const UPLOAD_TIMEOUT_MS = 45_000;
const UPLOAD_RETRIES = 3;
const UPLOAD_BACKOFF_MS = [1500, 3000, 5000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getApiKey(): string {
  const key = process.env.KIE_AI_API_KEY?.trim() || process.env.KIE_API_KEY?.trim();
  if (!key) throw new Error("KIE_AI_API_KEY (или KIE_API_KEY) не установлен");
  return key;
}

function normalizeAudioMime(mime: string): string {
  const base = mime.trim().split(";")[0]?.trim().toLowerCase() || "audio/webm";
  if (base.startsWith("audio/webm")) return "audio/webm";
  if (base.startsWith("audio/mp4") || base === "audio/x-m4a") return "audio/mp4";
  if (base.startsWith("audio/mpeg") || base === "audio/mp3") return "audio/mpeg";
  if (base.startsWith("audio/wav") || base === "audio/x-wav") return "audio/wav";
  if (base.startsWith("audio/ogg")) return "audio/ogg";
  if (base.startsWith("audio/aac")) return "audio/aac";
  if (base.startsWith("audio/")) return base;
  return "audio/webm";
}

function extForAudioMime(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("aac")) return "aac";
  return "webm";
}

function httpsPost(
  fullUrl: string,
  body: Buffer,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(fullUrl);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: "POST",
        headers: { ...headers, "Content-Length": String(body.length) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          })
        );
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error("Upload timeout"));
    });
    req.write(body);
    req.end();
  });
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/** POST /api/file-base64-upload (актуальный метод из доков KIE). */
async function uploadAudioBufferToKieBase64(buffer: Buffer, mime: string): Promise<string | null> {
  try {
    const apiKey = getApiKey();
    const ext = extForAudioMime(mime);
    const fileName = `brand-voice-${Date.now()}.${ext}`;
    const base64Data = buffer.toString("base64");
    const payload = JSON.stringify({
      base64Data,
      uploadPath: "kieai/market",
      fileName,
    });

    for (const base of KIE_UPLOAD_BASE_URLS) {
      try {
        const { statusCode, body: resBody } = await httpsPost(
          `${base.replace(/\/$/, "")}/api/file-base64-upload`,
          Buffer.from(payload, "utf8"),
          {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          UPLOAD_TIMEOUT_MS
        );
        if (statusCode !== 200) {
          console.warn("[KIE STT] base64-upload:", base, statusCode, resBody.slice(0, 140));
          continue;
        }
        const parsed = JSON.parse(resBody) as {
          success?: boolean;
          code?: number;
          data?: { downloadUrl?: string; url?: string };
        };
        const url = parsed.data?.downloadUrl || parsed.data?.url;
        if (url && parsed.success !== false) return String(url);
      } catch (e) {
        console.warn("[KIE STT] base64-upload ошибка:", base, e instanceof Error ? e.message : e);
      }
    }
    return null;
  } catch (e) {
    console.warn("[KIE STT] base64-upload общая ошибка:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Устаревший multipart /api/upload — пробуем после base64. */
async function uploadAudioBufferToKieMultipart(buffer: Buffer, mime: string): Promise<string | null> {
  try {
    const apiKey = getApiKey();
    const ext = extForAudioMime(mime);
    const boundary = `----FormBoundary${Date.now().toString(16)}`;
    const filename = `brand-voice-${Date.now()}.${ext}`;
    const headerBytes = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([headerBytes, buffer, footer]);

    for (const base of KIE_UPLOAD_BASE_URLS) {
      const { statusCode, body: resBody } = await httpsPost(
        `${base.replace(/\/$/, "")}/api/upload`,
        body,
        {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        UPLOAD_TIMEOUT_MS
      );
      if (statusCode === 200) {
        const parsed = JSON.parse(resBody) as {
          success?: boolean;
          data?: { downloadUrl?: string; url?: string };
        };
        const url = parsed.data?.downloadUrl || parsed.data?.url;
        if (url) return String(url);
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function uploadAudioBufferToKieDirect(buffer: Buffer, mime: string): Promise<string | null> {
  const viaBase64 = await uploadAudioBufferToKieBase64(buffer, mime);
  if (viaBase64) return viaBase64;
  return uploadAudioBufferToKieMultipart(buffer, mime);
}

async function publicAudioUrlToKieUrl(publicUrl: string): Promise<string | null> {
  const apiKey = getApiKey();
  const ext = publicUrl.split(".").pop()?.split("?")[0] || "webm";
  const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext : "webm";
  const body = JSON.stringify({
    fileUrl: publicUrl,
    uploadPath: "kieai/market",
    fileName: `voice-${Date.now()}.${safeExt}`,
  });

  for (const baseUrl of KIE_UPLOAD_BASE_URLS) {
    for (let attempt = 0; attempt <= UPLOAD_RETRIES; attempt++) {
      if (attempt > 0) await sleep(UPLOAD_BACKOFF_MS[attempt - 1] ?? 1500);
      try {
        const { statusCode, body: resBody } = await httpsPost(
          `${baseUrl.replace(/\/$/, "")}/api/file-url-upload`,
          Buffer.from(body, "utf8"),
          {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          UPLOAD_TIMEOUT_MS
        );
        if (statusCode !== 200) continue;
        const data = JSON.parse(resBody) as {
          success?: boolean;
          code?: number;
          data?: { downloadUrl?: string; fileUrl?: string; url?: string };
        };
        const url = data?.data?.downloadUrl || data?.data?.fileUrl || data?.data?.url;
        if (data?.success && data?.code === 200 && url) return String(url);
      } catch {
        /* retry */
      }
    }
  }
  return null;
}

function sttModel(): string {
  const m = process.env.KIE_SPEECH_TO_TEXT_MODEL?.trim();
  return m || DEFAULT_MODEL;
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return fallback;
}

async function createSttTask(audioUrl: string): Promise<string> {
  const apiKey = getApiKey();
  const input: Record<string, unknown> = {
    audio_url: audioUrl,
    tag_audio_events: envBool("KIE_STT_TAG_AUDIO_EVENTS", false),
    diarize: envBool("KIE_STT_DIARIZE", false),
  };
  const lang = process.env.KIE_STT_LANGUAGE_CODE?.trim();
  if (lang) input.language_code = lang;

  const res = await fetch(`${KIE_TASK_BASE_URL}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: sttModel(),
      input,
    }),
  });

  const rawText = await res.text();
  let data: { code?: number; msg?: string; data?: { taskId?: string } };
  try {
    data = JSON.parse(rawText) as typeof data;
  } catch {
    throw new Error(`KIE createTask: не JSON (${res.status}) ${rawText.slice(0, 200)}`);
  }

  if (!res.ok || data.code !== 200) {
    throw new Error(data.msg || `KIE createTask ${res.status}: ${rawText.slice(0, 300)}`);
  }
  const taskId = data.data?.taskId;
  if (!taskId) throw new Error("KIE не вернул taskId");
  return taskId;
}

function extractTranscriptFromResult(parsed: unknown): string {
  if (parsed == null) return "";
  if (typeof parsed === "string") return parsed.trim();

  if (typeof parsed !== "object") return "";
  const o = parsed as Record<string, unknown>;

  if (typeof o.text === "string" && o.text.trim()) return o.text.trim();

  const words = o.words;
  if (Array.isArray(words) && words.length) {
    let out = "";
    for (const w of words) {
      if (!w || typeof w !== "object") continue;
      const t = (w as { text?: unknown }).text;
      if (typeof t === "string") out += t;
    }
    const joined = out.trim();
    if (joined) return joined.replace(/\s+/g, " ").trim();
  }

  const segments = o.segments;
  if (Array.isArray(segments)) {
    const parts = segments
      .map((seg) => {
        if (!seg || typeof seg !== "object") return "";
        const s = seg as Record<string, unknown>;
        return typeof s.text === "string" ? s.text.trim() : "";
      })
      .filter(Boolean);
    if (parts.length) return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  for (const key of ["result", "output", "data", "transcript"]) {
    if (key in o && o[key] != null) {
      const inner = extractTranscriptFromResult(o[key]);
      if (inner) return inner;
    }
  }

  return "";
}

async function waitForSttTask(taskId: string): Promise<string> {
  const apiKey = getApiKey();
  const maxWaitMs = parseInt(process.env.KIE_STT_MAX_WAIT_MS ?? "240000", 10);
  const pollMs = parseInt(process.env.KIE_POLL_INTERVAL_MS ?? "1200", 10);
  const recordTimeout = parseInt(process.env.KIE_RECORDINFO_TIMEOUT_MS ?? "20000", 10);
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const response = await fetchWithTimeout(
      `${KIE_TASK_BASE_URL}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } },
      recordTimeout
    );

    const raw = await response.text();
    let data: {
      code?: number;
      msg?: string;
      data?: { state?: string; failMsg?: string; resultJson?: string | unknown };
    };
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      throw new Error(`KIE recordInfo: некорректный JSON (${response.status})`);
    }

    if (!response.ok || data.code !== 200) {
      throw new Error(data.msg || `KIE recordInfo ${response.status}`);
    }

    const taskData = data.data;
    const state = taskData?.state;

    if (state === "success") {
      let resultJson: unknown = taskData?.resultJson;
      if (typeof resultJson === "string") {
        const rawStr = resultJson;
        try {
          resultJson = JSON.parse(rawStr) as unknown;
        } catch {
          const s = rawStr.trim();
          if (s) return s;
          throw new Error("Не удалось распарсить resultJson");
        }
      }
      const text = extractTranscriptFromResult(resultJson);
      if (!text) {
        throw new Error(
          "Пустой транскрипт в ответе KIE. Проверьте формат аудио (предпочтительно wav/mp3) или логи."
        );
      }
      return text;
    }

    if (state === "fail" || state === "failed") {
      throw new Error(taskData?.failMsg || "Задача транскрибации KIE завершилась с ошибкой");
    }

    await sleep(Number.isFinite(pollMs) && pollMs >= 400 ? pollMs : 1200);
  }

  throw new Error("Превышено время ожидания транскрибации KIE");
}

export async function transcribeAudioKie(
  buffer: Buffer,
  mimeType: string
): Promise<{ text: string } | { error: string }> {
  try {
    void getApiKey();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  const safeMime = normalizeAudioMime(mimeType.startsWith("audio/") ? mimeType : "audio/webm");
  const ext = extForAudioMime(safeMime);
  const filename = `karto-brand.${ext}`;
  const bytes = new Uint8Array(buffer);

  let tempPath: string | null = null;

  try {
    const directUrl = await uploadAudioBufferToKieDirect(buffer, safeMime);
    let audioUrl = directUrl;

    if (!audioUrl) {
      try {
        const uploaded = await uploadAudioToPublicUrl(bytes, filename, safeMime);
        tempPath = uploaded.objectPath;
        const viaKie = await publicAudioUrlToKieUrl(uploaded.publicUrl);
        audioUrl = viaKie || uploaded.publicUrl;
      } catch (e) {
        console.warn("[KIE STT] Supabase upload:", e instanceof Error ? e.message : e);
        audioUrl = null;
      }
    }

    if (!audioUrl) {
      return {
        error:
          "Не удалось получить публичный URL аудио для KIE (прямая загрузка и Supabase недоступны).",
      };
    }

    const taskId = await createSttTask(audioUrl);
    const text = await waitForSttTask(taskId);
    return { text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg || "Ошибка транскрибации через KIE" };
  } finally {
    if (tempPath) {
      try {
        const { createServerClient } = await import("@/lib/supabase/server");
        const supabase = createServerClient();
        await supabase.storage.from("replicate-voice-temp").remove([tempPath]).catch(() => {});
      } catch {
        /* ignore */
      }
    }
  }
}
