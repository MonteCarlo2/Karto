import Replicate from "replicate";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Речь → текст через Replicate.
 * По умолчанию: openai/whisper (стабильнее, чем часто «пропадающий» whisperx без версии).
 * Своя версия: REPLICATE_WHISPER_MODEL=owner/name:hash или owner/name для latest.
 */
const DEFAULT_MODEL = "openai/whisper";

const TEMP_BUCKET = "replicate-voice-temp";

function whisperModelFromEnv(): string | null {
  const env = process.env.REPLICATE_WHISPER_MODEL?.trim();
  if (!env || !env.includes("/")) return null;
  return env;
}

function modelUsesAudioFileKey(modelRef: string): boolean {
  const m = modelRef.toLowerCase();
  return m.includes("whisperx") || m.includes("whisper-x");
}

function replicateFetchTimeoutMs(): number {
  const raw = process.env.REPLICATE_FETCH_TIMEOUT_MS?.trim();
  const n = raw ? Number(raw) : NaN;
  /** WhisperX может идти дольше 2 мин — короткий timeout даёт обрыв и «fetch failed». */
  return Number.isFinite(n) && n >= 15_000 ? n : 270_000;
}

function createReplicateClient(token: string): Replicate {
  const timeoutMs = replicateFetchTimeoutMs();
  return new Replicate({
    auth: token,
    fetch: (url, init) => {
      const existing = init?.signal as AbortSignal | undefined;
      const deadline = AbortSignal.timeout(timeoutMs);
      const signal =
        existing && typeof AbortSignal.any === "function"
          ? AbortSignal.any([existing, deadline])
          : existing ?? deadline;
      return fetch(url, { ...init, signal });
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === "string") {
    const cause = (error as Error & { cause?: { message?: string } }).cause;
    if (cause?.message) return `${error.message} (${cause.message})`;
    return error.message;
  }
  return String(error);
}

/**
 * Supabase Storage принимает только «простые» MIME из списка бакета.
 * Браузер отдаёт `audio/webm;codecs=opus` → без нормализации upload падает.
 */
function normalizeAudioMime(mime: string): string {
  const base = mime.trim().split(";")[0]?.trim().toLowerCase() || "audio/webm";
  if (base.startsWith("audio/webm")) return "audio/webm";
  if (base.startsWith("audio/mp4") || base === "audio/x-m4a") return "audio/mp4";
  if (base.startsWith("audio/mpeg") || base === "audio/mp3") return "audio/mpeg";
  if (base.startsWith("audio/wav") || base === "audio/x-wav") return "audio/wav";
  if (base.startsWith("audio/")) return base;
  return "audio/webm";
}

function isReplicateRateLimited(error: unknown): boolean {
  return /\b429\b|throttled|too many requests|rate limit/i.test(getErrorMessage(error));
}

function retryAfterMsFromError(error: unknown): number {
  const s = getErrorMessage(error);
  const m1 = s.match(/retry_after["':]\s*(\d+)/i);
  if (m1) return Math.min(120_000, Math.max(2_000, Number(m1[1]) * 1000));
  const m2 = s.match(/resets?\s+in\s+~?\s*(\d+)\s*s/i);
  if (m2) return Math.min(120_000, Math.max(3_000, Number(m2[1]) * 1000));
  return 8_000;
}

function isTransientNetworkFailure(error: unknown): boolean {
  const s = getErrorMessage(error).toLowerCase();
  return /econnreset|etimedout|econnrefused|fetch failed|socket hang up|network|epipe|und_err|aborted|write econnreset|read econnreset/.test(
    s
  );
}

function isConnectionResetLike(error: unknown): boolean {
  return isTransientNetworkFailure(error);
}

async function withNetworkRetries<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (
        i < attempts - 1 &&
        (isTransientNetworkFailure(e) || isReplicateRateLimited(e))
      ) {
        const wait = isReplicateRateLimited(e)
          ? retryAfterMsFromError(e)
          : 700 + i * 850;
        await sleep(wait);
        continue;
      }
      throw e;
    }
  }
  throw last;
}

function toDataUrl(bytes: Uint8Array, mimeType: string): string {
  const safe = normalizeAudioMime(mimeType);
  const b64 = Buffer.from(bytes).toString("base64");
  return `data:${safe};base64,${b64}`;
}

/**
 * По умолчанию — openai/whisper (или REPLICATE_WHISPER_MODEL из .env).
 */
async function resolveWhisperModelRef(replicate: Replicate): Promise<string> {
  void replicate;
  const fromEnv = whisperModelFromEnv();
  if (fromEnv) return fromEnv;
  return DEFAULT_MODEL;
}

function extractTranscription(raw: unknown): string {
  let v = raw;

  if (v && typeof v === "object" && v !== null && "output" in v) {
    v = (v as { output: unknown }).output;
  }

  if (v == null) return "";
  if (typeof v === "string") return v.trim();

  if (Array.isArray(v)) {
    const parts = v.map((item) => {
      if (item && typeof item === "object" && "text" in item) {
        const t = (item as { text?: unknown }).text;
        return typeof t === "string" ? t.trim() : "";
      }
      return extractTranscription(item);
    });
    return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  if (typeof v !== "object") return "";

  const o = v as Record<string, unknown>;

  if (typeof o.transcription === "string" && o.transcription.trim()) {
    return o.transcription.trim();
  }

  if (typeof o.text === "string" && o.text.trim()) {
    return o.text.trim();
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

  const chunks = o.chunks;
  if (Array.isArray(chunks)) {
    const parts = chunks
      .map((chunk) => {
        if (!chunk || typeof chunk !== "object") return "";
        const c = chunk as Record<string, unknown>;
        return typeof c.text === "string" ? c.text.trim() : "";
      })
      .filter(Boolean);
    if (parts.length) return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  return "";
}

async function runTranscriptionPrediction(
  replicate: Replicate,
  modelRef: string,
  audioUrl: string
): Promise<unknown> {
  const useAudioFile = modelUsesAudioFileKey(modelRef);

  if (useAudioFile) {
    try {
      return await replicate.run(modelRef as `${string}/${string}:${string}`, {
        input: {
          audio_file: audioUrl,
          batch_size: 64,
          diarization: false,
          debug: false,
          temperature: 0,
          align_output: false,
          vad_onset: 0.5,
          vad_offset: 0.363,
          language_detection_min_prob: 0,
          language_detection_max_tries: 5,
        },
      });
    } catch (e) {
      try {
        return await replicate.run(modelRef as `${string}/${string}:${string}`, {
          input: { audio_file: audioUrl },
        });
      } catch {
        throw e;
      }
    }
  }

  try {
    return await replicate.run(modelRef as `${string}/${string}:${string}`, {
      input: { audio: audioUrl },
    });
  } catch (e) {
    const fullInput: Record<string, unknown> = {
      audio: audioUrl,
      task: "transcribe",
      batch_size: 64,
      language: "None",
      diarise_audio: false,
    };

    if (process.env.REPLICATE_WHISPER_INITIAL_PROMPT?.trim()) {
      fullInput.initial_prompt = process.env.REPLICATE_WHISPER_INITIAL_PROMPT.trim();
    }

    try {
      return await replicate.run(modelRef as `${string}/${string}:${string}`, {
        input: fullInput,
      });
    } catch {
      throw e;
    }
  }
}

/**
 * Временный hosting через Replicate Files API — HTTPS URL для Whisper / WhisperX.
 */
async function uploadAudioViaReplicateFiles(
  replicate: Replicate,
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<{ url: string; fileId: string }> {
  return withNetworkRetries(async () => {
    const bytes = new Uint8Array(buffer);
    const blob = new Blob([bytes], { type: mimeType });
    const payload: Blob | File =
      typeof File !== "undefined"
        ? new File([blob], filename, { type: mimeType })
        : blob;

    const created = (await replicate.files.create(payload)) as {
      id?: string;
      urls?: { get?: string };
    };
    const fileId = typeof created?.id === "string" ? created.id : "";
    const url = created?.urls?.get;
    if (!url || typeof url !== "string") {
      throw new Error("Replicate files.create: нет urls.get");
    }
    return { url, fileId };
  });
}

const VOICE_BUCKET_ALLOWED_MIMES = [
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
];

async function ensureTempBucket() {
  const supabase = createServerClient();
  const opts = {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: VOICE_BUCKET_ALLOWED_MIMES,
  };
  const create = await supabase.storage.createBucket(TEMP_BUCKET, opts);
  if (create.error && !/already exists|duplicate/i.test(create.error.message)) {
    throw new Error(`Supabase storage bucket error: ${create.error.message}`);
  }
  await supabase.storage.updateBucket(TEMP_BUCKET, opts).catch(() => {});
}

/** Публичный URL во временном бакете (также для KIE ElevenLabs STT). */
export async function uploadAudioToPublicUrl(
  bytes: Uint8Array,
  filename: string,
  mimeType: string
): Promise<{ publicUrl: string; objectPath: string }> {
  const supabase = createServerClient();
  await ensureTempBucket();
  /** Браузер шлёт `audio/webm;codecs=opus`; для Storage всегда без параметров (совместимость бакета). */
  const contentType = normalizeAudioMime(mimeType.startsWith("audio/") ? mimeType : "audio/webm");
  const objectPath = `voice/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${filename}`;
  const upload = await supabase.storage.from(TEMP_BUCKET).upload(objectPath, Buffer.from(bytes), {
    contentType,
    upsert: false,
  });
  if (upload.error) {
    throw new Error(`Supabase storage upload error: ${upload.error.message}`);
  }
  const { data } = supabase.storage.from(TEMP_BUCKET).getPublicUrl(objectPath);
  if (!data?.publicUrl) {
    throw new Error("Supabase storage public URL is missing");
  }
  return { publicUrl: data.publicUrl, objectPath };
}

/**
 * Распознавание через Replicate (WhisperX по умолчанию).
 * 1) При классическом Whisper — опционально data URL.
 * 2) HTTPS URL через Replicate Files API.
 * 3) Fallback: публичный URL Supabase Storage.
 */
export async function transcribeAudioReplicate(
  buffer: Buffer,
  mimeType: string
): Promise<{ text: string } | { error: string }> {
  const token = process.env.REPLICATE_API_TOKEN?.trim();
  if (!token) {
    return { error: "REPLICATE_API_TOKEN не настроен" };
  }

  const replicate = createReplicateClient(token);

  const safeMime = normalizeAudioMime(mimeType.startsWith("audio/") ? mimeType : "audio/webm");
  const ext = safeMime === "audio/webm" ? "webm" : safeMime === "audio/mp4" ? "m4a" : "webm";
  const filename = `karto-brand.${ext}`;
  const bytes = new Uint8Array(buffer);
  let tempPath: string | null = null;
  let replicateFileId: string | null = null;

  try {
    const modelRef = await resolveWhisperModelRef(replicate);
    const skipDataUrl = modelUsesAudioFileKey(modelRef);
    let output: unknown;
    let predictionError: unknown = null;

    const canUseDataUrl = !skipDataUrl && bytes.byteLength <= 1_900_000;
    if (canUseDataUrl) {
      try {
        output = await withNetworkRetries(() =>
          runTranscriptionPrediction(replicate, modelRef, toDataUrl(bytes, safeMime))
        );
        predictionError = null;
      } catch (e) {
        predictionError = e;
      }
    }

    // Канал №2: загрузка файла в Replicate (не зависит от Supabase).
    if (output == null) {
      try {
        const uploaded = await uploadAudioViaReplicateFiles(
          replicate,
          buffer,
          safeMime,
          filename
        );
        replicateFileId = uploaded.fileId;
        output = await withNetworkRetries(() =>
          runTranscriptionPrediction(replicate, modelRef, uploaded.url)
        );
        predictionError = null;
      } catch (e) {
        predictionError = e;
      }
    }

    // Канал №3: публичный URL через временный Supabase Storage (если настроен).
    if (output == null) {
      let audioUrl = "";
      let uploadErr: unknown = null;
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
          const uploaded = await uploadAudioToPublicUrl(bytes, filename, safeMime);
          audioUrl = uploaded.publicUrl;
          tempPath = uploaded.objectPath;
          uploadErr = null;
          break;
        } catch (e) {
          uploadErr = e;
          if (!isTransientNetworkFailure(e) || attempt === 5) break;
          await sleep(500 * attempt);
        }
      }
      if (!audioUrl) {
        const pErr = predictionError ? `; prediction: ${getErrorMessage(predictionError)}` : "";
        return {
          error:
            (getErrorMessage(uploadErr) || "Не удалось передать аудио в сервис распознавания") + pErr,
        };
      }
      try {
        output = await withNetworkRetries(() =>
          runTranscriptionPrediction(replicate, modelRef, audioUrl)
        );
      } catch (e) {
        return {
          error: getErrorMessage(e) || "Ошибка распознавания после загрузки аудио",
        };
      }
    }

    const text = extractTranscription(output);
    if (!text) {
      return {
        error:
          "Пустой ответ модели. Проверьте REPLICATE_WHISPER_MODEL, REPLICATE_API_TOKEN или формат записи (webm/opus).",
      };
    }
    return { text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg || "Ошибка распознавания через Replicate" };
  } finally {
    if (replicateFileId) {
      await replicate.files.delete(replicateFileId).catch(() => {});
    }
    if (tempPath) {
      const supabase = createServerClient();
      await supabase.storage.from(TEMP_BUCKET).remove([tempPath]).catch(() => {});
    }
  }
}
