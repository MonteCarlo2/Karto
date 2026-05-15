/**
 * WaveSpeed AI — REST v3 для свободного творчества (/api/generate-free).
 *
 * Nano Banana 2 Text-to-Image (без референсов): POST .../google/nano-banana-2/text-to-image
 * Nano Banana 2 Edit (есть изображения): POST .../google/nano-banana-2/edit
 *
 * По желанию `enable_sync_mode` (вкл.: WAVESPEED_ENABLE_SYNC_MODE=true — на коротком лимите хостинга возможен timeout).
 *
 * Док: submit-task / get-result, модели см. docs-api google nano-banana-2.*
 */

import { prepareEvolinkImageUrls } from "@/lib/services/evolink-images";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

const DEFAULT_ORIGIN = "https://api.wavespeed.ai";

const DEFAULT_TEXT_PATH = "google/nano-banana-2/text-to-image";
const DEFAULT_EDIT_PATH = "google/nano-banana-2/edit";

function getWsApiKey(): string {
  const k = process.env.WAVESPEED_API_KEY?.trim();
  if (!k) throw new Error("WAVESPEED_API_KEY не установлен в .env.local");
  return k;
}

function wsOrigin(): string {
  const raw = process.env.WAVESPEED_API_ORIGIN?.trim();
  const base =
    raw && /^https?:\/\//i.test(raw)
      ? raw.replace(/\/+$/, "")
      : DEFAULT_ORIGIN;
  return base;
}

/** Путь после /api/v3/ без слеша. */
function wsTextModelPath(): string {
  const p = process.env.WAVESPEED_SUBMIT_MODEL_PATH?.trim()?.replace(/^\/+|\/+$/g, "");
  return p && p.length > 0 ? p : DEFAULT_TEXT_PATH;
}

function wsEditModelPath(): string {
  const p = process.env.WAVESPEED_EDIT_MODEL_PATH?.trim()?.replace(/^\/+|\/+$/g, "");
  return p && p.length > 0 ? p : DEFAULT_EDIT_PATH;
}

function normalizeNanoResolution(raw: string | undefined, fallback: string): string {
  const fb = (() => {
    const f = fallback.trim().toLowerCase();
    return f === "0.5k" || f === "1k" || f === "2k" || f === "4k" ? f : "4k";
  })();

  const trimmed = raw?.trim().toLowerCase() ?? "";
  if (trimmed === "0.5k" || trimmed === "1k" || trimmed === "2k" || trimmed === "4k") {
    return trimmed;
  }
  const n = trimmed.replace(/\s+/g, "");
  if (["0.5k", "1k", "2k", "4k"].includes(n)) return n;
  if (!raw?.trim()) return fb;
  return fb;
}

function envBool(name: string, def: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (v === "false" || v === "0") return false;
  if (v === "true" || v === "1") return true;
  return def;
}

type WsEnvelope = {
  code?: number;
  message?: string;
  data?: Record<string, unknown>;
};

function getInnerData(json: Record<string, unknown>): Record<string, unknown> {
  const d = json.data;
  return d && typeof d === "object" ? (d as Record<string, unknown>) : json;
}

function readStatus(inner: Record<string, unknown>): string {
  const s = inner.status;
  return typeof s === "string" ? s : "";
}

function readOutputs(inner: Record<string, unknown>): string[] {
  const o = inner.outputs;
  if (!Array.isArray(o)) return [];
  const out: string[] = [];
  for (const x of o) {
    if (typeof x === "string" && /^https?:\/\//i.test(x.trim())) out.push(x.trim());
  }
  return out;
}

function isCompletedLike(st: string): boolean {
  const x = st.toLowerCase();
  return x === "completed" || x === "success" || x === "succeeded";
}

function commonNanoBody(prompt: string, aspect_ratio: string): Record<string, unknown> {
  const resolution = normalizeNanoResolution(
    process.env.WAVESPEED_NANO_RESOLUTION,
    "4k"
  );

  /** Sync дожидается результата на стороне WaveSpeed в одном HTTP; на Vercel / хостах с лимитом 60s может дать 504. Включить явно: WAVESPEED_ENABLE_SYNC_MODE=true */
  const syncDefault = envBool("WAVESPEED_ENABLE_SYNC_MODE", false);

  return {
    prompt: prompt.trim(),
    aspect_ratio,
    resolution,
    enable_web_search: envBool("WAVESPEED_ENABLE_WEB_SEARCH", false),
    enable_image_search: envBool("WAVESPEED_ENABLE_IMAGE_SEARCH", false),
    output_format: (process.env.WAVESPEED_OUTPUT_FORMAT?.trim().toLowerCase() === "jpeg"
      ? "jpeg"
      : "png") as "png" | "jpeg",
    enable_sync_mode: syncDefault,
    enable_base64_output: envBool("WAVESPEED_ENABLE_BASE64_OUTPUT", false),
  };
}

async function submitWsPrediction(
  apiPathRelative: string,
  body: Record<string, unknown>
): Promise<{ taskId: string; pollUrlHint: string | null; immediateUrl: string | null }> {
  const apiKey = getWsApiKey();
  const origin = wsOrigin();

  const sync = body.enable_sync_mode === true;
  const defaultTimeout = sync ? "390000" : "90000";
  const timeoutMs = parseInt(
    process.env.WAVESPEED_SUBMIT_TIMEOUT_MS ?? defaultTimeout,
    10
  );

  const submitUrl = `${origin}/api/v3/${apiPathRelative}`;

  console.log(`🌊 [WaveSpeed] POST ${submitUrl} sync=${sync}`);

  const response = await fetchWithTimeout(
    submitUrl,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    timeoutMs
  );

  const text = await response.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      `WaveSpeed: некорректный JSON (${response.status}): ${text.slice(0, 400)}`
    );
  }

  if (!response.ok) {
    const msg =
      typeof (json as WsEnvelope).message === "string"
        ? (json as WsEnvelope).message
        : text.slice(0, 600);
    throw new Error(`WaveSpeed POST ${response.status}: ${msg}`);
  }

  const code = (json as WsEnvelope).code;
  if (typeof code === "number" && code !== 200 && code !== 0) {
    throw new Error(
      `WaveSpeed: code=${code}: ${String((json as WsEnvelope).message ?? text).slice(0, 500)}`
    );
  }

  const inner = getInnerData(json);
  const taskId = typeof inner.id === "string" ? inner.id.trim() : "";
  if (!taskId) {
    console.error("[WaveSpeed] нет data.id:", JSON.stringify(json).slice(0, 2500));
    throw new Error("WaveSpeed не вернул id задачи");
  }

  const urls = inner.urls;
  let pollHint: string | null = null;
  if (urls && typeof urls === "object" && "get" in urls) {
    const g = (urls as { get?: unknown }).get;
    if (typeof g === "string" && g.startsWith("http")) pollHint = g.trim();
  }

  const outsNow = readOutputs(inner);
  const statusNow = readStatus(inner);

  /** Sync держит соединение — результат может быть сразу в POST; асинхронно только если статус финальный. */
  let immediateUrl: string | null = null;
  if (
    outsNow.length > 0 &&
    (sync || isCompletedLike(statusNow))
  ) {
    immediateUrl = outsNow[0];
  }

  if (immediateUrl) {
    console.log("✅ [WaveSpeed] URL в ответе POST (sync или completed):", immediateUrl);
    return { taskId, pollUrlHint: pollHint, immediateUrl };
  }

  console.log("✅ [WaveSpeed] Задача создана:", taskId);
  return { taskId, pollUrlHint: pollHint, immediateUrl: null };
}

/** Соответствует UI студии при Nano Banana. */
export function wavespeedNanoAspectRatio(ar: string): string {
  const a = ar.trim();
  const allowed = new Set([
    "1:1",
    "3:2",
    "2:3",
    "3:4",
    "4:3",
    "4:5",
    "5:4",
    "9:16",
    "16:9",
    "21:9",
    "1:4",
    "4:1",
    "1:8",
    "8:1",
  ]);
  if (allowed.has(a)) return a;
  return "3:4";
}

async function pollUntilImageUrl(
  taskId: string,
  pollUrlHint: string | null
): Promise<string> {
  const apiKey = getWsApiKey();
  const origin = wsOrigin();

  const urlWithResult = `${origin}/api/v3/predictions/${encodeURIComponent(taskId)}/result`;
  const urlBare = `${origin}/api/v3/predictions/${encodeURIComponent(taskId)}`;

  let primary =
    pollUrlHint && /^https?:\/\//i.test(pollUrlHint.trim())
      ? pollUrlHint.trim()
      : urlWithResult;

  const pollMs = parseInt(process.env.WAVESPEED_POLL_INTERVAL_MS ?? "800", 10);
  const maxMs = parseInt(process.env.WAVESPEED_TASK_MAX_WAIT_MS ?? "340000", 10);
  const reqMs = parseInt(process.env.WAVESPEED_POLL_REQUEST_TIMEOUT_MS ?? "25000", 10);

  const started = Date.now();
  console.log("⏳ [WaveSpeed] fallback-опрос:", primary);

  let switchedFrom404 = false;

  while (Date.now() - started < maxMs) {
    const response = await fetchWithTimeout(
      primary,
      { headers: { Authorization: `Bearer ${apiKey}` } },
      reqMs
    );

    const text = await response.text();

    if (
      response.status === 404 &&
      !switchedFrom404 &&
      primary.includes("/result")
    ) {
      switchedFrom404 = true;
      primary = urlBare;
      console.warn("[WaveSpeed] 404 на /result — переключение на GET predictions/{id}");
      await sleep(Math.min(pollMs, 400));
      continue;
    }

    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      await sleep(pollMs);
      continue;
    }

    if (!response.ok) {
      await sleep(pollMs);
      continue;
    }

    const inner = getInnerData(json);
    const st = readStatus(inner).toLowerCase();

    if (st === "failed") {
      const err =
        typeof inner.error === "string"
          ? inner.error
          : JSON.stringify(inner.error ?? inner).slice(0, 800);
      throw new Error(`WaveSpeed задача failed: ${err}`);
    }

    if (st === "completed") {
      const outs = readOutputs(inner);
      if (outs.length > 0) {
        console.log("✅ [WaveSpeed] Готово:", outs[0]);
        return outs[0];
      }
    }

    const outsEarly = readOutputs(inner);
    if (
      outsEarly.length > 0 &&
      (st === "" || ["processing", "created", "pending", "running"].includes(st))
    ) {
      console.log("✅ [WaveSpeed] outputs есть при статусе", st || "?", outsEarly[0]);
      return outsEarly[0];
    }

    await sleep(pollMs);
  }

  throw new Error("Превышено время ожидания результата WaveSpeed");
}

export type WavespeedNanoGenerationResult = {
  imageUrl: string;
  referenceUsed: boolean;
};

/**
 * Nano Banana 2 на WaveSpeed: text-to-image или edit с референсами (публичные URL через Supabase).
 */
export async function generateWithWaveSpeedNanoBanana2(
  prompt: string,
  imageInput: string[] | undefined,
  aspectRatio: string
): Promise<WavespeedNanoGenerationResult> {
  const t0 = Date.now();
  const ar = wavespeedNanoAspectRatio(aspectRatio);

  let imageUrls: string[] | null = null;
  if (imageInput && imageInput.length > 0) {
    imageUrls = await prepareEvolinkImageUrls(imageInput.slice(0, 4));
  }

  let pathRel: string;
  let body: Record<string, unknown>;

  if (imageUrls && imageUrls.length > 0) {
    pathRel = wsEditModelPath();
    body = {
      images: imageUrls.slice(0, 14),
      ...commonNanoBody(prompt, ar),
    };
    console.log(
      `🍌 [WaveSpeed] Edit (${pathRel}), refs=${imageUrls.length}, aspect_ratio=${ar}`
    );
  } else {
    pathRel = wsTextModelPath();
    body = commonNanoBody(prompt, ar);
    console.log(`🍌 [WaveSpeed] Text-to-image (${pathRel}), aspect_ratio=${ar}`);
  }

  const { taskId, pollUrlHint, immediateUrl } = await submitWsPrediction(pathRel, body);
  console.log(`⏱️ [WaveSpeed] submit/handshake за ${Date.now() - t0} ms`);

  const imageUrl = immediateUrl
    ? immediateUrl
    : await pollUntilImageUrl(taskId, pollUrlHint);

  console.log(`⏱️ [WaveSpeed] всего до URL: ${Date.now() - t0} ms`);

  return {
    imageUrl,
    referenceUsed: Boolean(imageUrls && imageUrls.length > 0),
  };
}
