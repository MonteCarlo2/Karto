import { randomUUID } from "crypto";
import { spawn } from "child_process";
import https from "https";
import { URL } from "url";

/**
 * SaluteSpeech (Сбер): OAuth по докам/кабинету + синхронное REST speech:recognize.
 *
 * OAuth (как в личном кабинете):
 * POST https://ngw.devices.sberbank.ru:9443/api/v2/oauth
 * - Authorization: Basic <ключ> (из раздела «Ключ авторизации» или base64(Client ID:Client Secret))
 * - RqUID: UUID запроса
 * - Content-Type: application/x-www-form-urlencoded
 * - body: scope=SALUTE_SPEECH_PERS
 *
 * Распознавание:
 * POST https://smartspeech.sber.ru/rest/v1/speech:recognize?...
 * - Authorization: Bearer <access_token>
 *
 * Переменные окружения:
 * - SALUTE_SPEECH_AUTHORIZATION_KEY — готовая Base64-строка для Basic (из кабинета «Получить ключ»)
 *   ИЛИ пара SALUTE_SPEECH_CLIENT_ID + SALUTE_SPEECH_CLIENT_SECRET (склеиваем как Basic base64(id:secret))
 * - SALUTE_SPEECH_SCOPE — по умолчанию SALUTE_SPEECH_PERS
 * - SALUTE_SPEECH_LANGUAGE — по умолчанию ru-RU
 * - SALUTE_SPEECH_MODEL — general | callcenter | media | ivr (по умолчанию general)
 * - SALUTE_SPEECH_TRANSCODE_FORMAT — wav | opus (по умолчанию wav; opus давал у Сбера 400 «invalid opus packet»)
 * - SALUTE_SPEECH_TRANSCODE_HZ — частота WAV после конвертации (8000–96000), по умолчанию 16000 (длинные записи: не поднимайте без нужды — лимит 2 МБ)
 * - FFMPEG_PATH — опционально, полный путь к ffmpeg.exe (если без npm-пакета)
 * - SALUTE_SPEECH_TLS_INSECURE=1 или SALUTE_SPEECH_TRUST_RU_CHAIN=1 — отключить проверку TLS (только если нужно; прод лучше через NODE_EXTRA_CA_CERTS)
 * - NODE_ENV=production и без флагов выше — строгая проверка сертификатов
 *
 * В development по умолчанию TLS к Salute ослаблен (rejectUnauthorized: false), иначе типичная ошибка в РФ:
 * SELF_SIGNED_CERT_IN_CHAIN. Отключить поведение: SALUTE_SPEECH_STRICT_TLS=1
 */

const HTTPS_TIMEOUT_OAUTH_MS = parseInt(process.env.SALUTE_SPEECH_OAUTH_TIMEOUT_MS ?? "25000", 10);
const HTTPS_TIMEOUT_RECOGNIZE_MS = parseInt(
  process.env.SALUTE_SPEECH_RECOGNIZE_TIMEOUT_MS ?? "120000",
  10
);

/** В РФ цепочка до Сбера часто не проходит стандартную проверку Node → SELF_SIGNED_CERT_IN_CHAIN. */
function shouldRelaxSaluteTls(): boolean {
  if (process.env.SALUTE_SPEECH_STRICT_TLS?.trim() === "1") return false;
  const v = (s: string | undefined) => /^(1|true|yes)$/i.test(s?.trim() ?? "");
  if (v(process.env.SALUTE_SPEECH_TLS_INSECURE)) return true;
  if (v(process.env.SALUTE_SPEECH_TRUST_RU_CHAIN)) return true;
  return process.env.NODE_ENV === "development";
}

/** Node https вместо fetch: на части Windows/сетей undici даёт «fetch failed» до хостов Сбера. */
function httpsPostBinary(
  fullUrl: string,
  body: Buffer,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(fullUrl);
    if (u.protocol !== "https:") {
      reject(new Error(`SaluteSpeech: ожидался https URL, получено ${u.protocol}`));
      return;
    }

    const insecure = shouldRelaxSaluteTls();
    const reqHeaders: Record<string, string> = {
      ...headers,
      "Content-Length": String(body.length),
    };

    const port = u.port ? Number(u.port) : 443;
    const req = https.request(
      {
        hostname: u.hostname,
        port,
        path: u.pathname + u.search,
        method: "POST",
        headers: reqHeaders,
        servername: u.hostname,
        ...(insecure ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          })
        );
        res.on("error", reject);
      }
    );

    req.on("error", (err: NodeJS.ErrnoException) => {
      const detail =
        err.code != null && err.code !== "" ? ` (${err.code})` : "";
      reject(new Error(`${err.message || String(err)}${detail}`));
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`SaluteSpeech: таймаут HTTPS после ${timeoutMs} мс`));
    });
    req.write(body);
    req.end();
  });
}

function getFfmpegExecutable(): string {
  const manual = process.env.FFMPEG_PATH?.trim();
  if (manual) return manual;
  try {
    // Не импортировать на верхнем уровне — Turbopack пытается разрешить вложенные package.json.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@ffmpeg-installer/ffmpeg") as { path?: string };
    if (typeof mod?.path === "string" && mod.path.length > 0) return mod.path;
  } catch {
    /* ниже общая ошибка */
  }
  throw new Error(
    "Не найден ffmpeg: задайте FFMPEG_PATH или выполните npm install (пакет @ffmpeg-installer/ffmpeg)."
  );
}

const OAUTH_URL =
  process.env.SALUTE_SPEECH_OAUTH_URL?.trim() ||
  "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
const RECOGNIZE_BASE =
  process.env.SALUTE_SPEECH_API_URL?.trim() || "https://smartspeech.sber.ru/rest/v1/speech:recognize";

const SYNC_MAX_BYTES = 2 * 1024 * 1024;

let tokenCache: { token: string; expiresAtMs: number } | null = null;

function getBasicCredential(): string | null {
  let rawKey = process.env.SALUTE_SPEECH_AUTHORIZATION_KEY?.trim();
  if (rawKey) {
    if (/^basic\s+/i.test(rawKey)) rawKey = rawKey.replace(/^basic\s+/i, "").trim();
    return rawKey;
  }
  const id = process.env.SALUTE_SPEECH_CLIENT_ID?.trim();
  const secret = process.env.SALUTE_SPEECH_CLIENT_SECRET?.trim();
  if (id && secret) {
    return Buffer.from(`${id}:${secret}`, "utf8").toString("base64");
  }
  return null;
}

export function hasSaluteSpeechCredentials(): boolean {
  return getBasicCredential() !== null;
}

async function fetchAccessToken(): Promise<{ token: string; expiresInSec: number }> {
  const basic = getBasicCredential();
  if (!basic) throw new Error("Не задан SALUTE_SPEECH_AUTHORIZATION_KEY или CLIENT_ID+CLIENT_SECRET");

  const scope = process.env.SALUTE_SPEECH_SCOPE?.trim() || "SALUTE_SPEECH_PERS";
  const bodyStr = new URLSearchParams({ scope }).toString();
  const bodyBuf = Buffer.from(bodyStr, "utf8");

  const rqUid = randomUUID();
  const { statusCode, body: raw } = await httpsPostBinary(
    OAUTH_URL,
    bodyBuf,
    {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      RqUID: rqUid,
      Authorization: `Basic ${basic}`,
    },
    Number.isFinite(HTTPS_TIMEOUT_OAUTH_MS) && HTTPS_TIMEOUT_OAUTH_MS >= 5000
      ? HTTPS_TIMEOUT_OAUTH_MS
      : 25000
  );

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`Salute OAuth ${statusCode}: ${raw.slice(0, 400)}`);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Salute OAuth: не JSON: ${raw.slice(0, 200)}`);
  }

  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

  let token = str(data.access_token) || str(data.accessToken);
  if (!token) {
    const inner = data.data ?? data.result;
    if (inner && typeof inner === "object") {
      const o = inner as Record<string, unknown>;
      token = str(o.access_token) || str(o.accessToken);
    }
  }
  if (!token) throw new Error("Salute OAuth: нет access_token в ответе");

  const expiresRaw = data.expires_in ?? data.expiresIn;
  let expiresNested: unknown;
  const innerEx = data.data ?? data.result;
  if (innerEx && typeof innerEx === "object") {
    expiresNested = (innerEx as Record<string, unknown>).expires_in ?? (innerEx as Record<string, unknown>).expiresIn;
  }

  const expiresInSec =
    typeof expiresRaw === "number"
      ? expiresRaw
      : typeof expiresNested === "number"
        ? expiresNested
        : 30 * 60;

  return { token, expiresInSec };
}

async function getCachedAccessToken(): Promise<string> {
  const now = Date.now();
  const skewMs = 120_000;
  if (tokenCache && tokenCache.expiresAtMs > now + skewMs) {
    return tokenCache.token;
  }
  const { token, expiresInSec } = await fetchAccessToken();
  tokenCache = {
    token,
    expiresAtMs: now + Math.max(60, expiresInSec) * 1000,
  };
  return token;
}

function webmOrMp4Like(mime: string): boolean {
  const m = mime.toLowerCase();
  return m.includes("webm") || m.includes("mp4") || m.includes("m4a");
}

/** Частота после конвертации WebM → WAV для Salute (PCM S16LE, см. encodings в доках). */
const TRANSCODE_WAV_HZ = parseInt(process.env.SALUTE_SPEECH_TRANSCODE_HZ?.trim() || "16000", 10);

function resolveTranscodeHz(): number {
  return Number.isFinite(TRANSCODE_WAV_HZ) && TRANSCODE_WAV_HZ >= 8000 && TRANSCODE_WAV_HZ <= 96000
    ? TRANSCODE_WAV_HZ
    : 16000;
}

/** Salute REST не принимает audio/wav — только audio/x-pcm;bit=16;rate=… (см. ошибку API). */
function salutePcmS16ContentType(rateHz: number): string {
  return `audio/x-pcm;bit=16;rate=${rateHz}`;
}

/** Читает sampleRate и channels из WAV (chunk fmt). */
function readWavFmtInfo(buffer: Buffer): { sampleRate: number; channels: number } | null {
  if (buffer.length < 12 || buffer.subarray(0, 4).toString("ascii") !== "RIFF") return null;
  if (buffer.subarray(8, 12).toString("ascii") !== "WAVE") return null;
  let off = 12;
  while (off + 8 <= buffer.length) {
    const id = buffer.subarray(off, off + 4).toString("ascii");
    const size = buffer.readUInt32LE(off + 4);
    const dataOff = off + 8;
    if (id === "fmt " && size >= 16 && dataOff + 12 <= buffer.length) {
      const channels = buffer.readUInt16LE(dataOff + 2);
      const sampleRate = buffer.readUInt32LE(dataOff + 4);
      if (
        Number.isFinite(sampleRate) &&
        sampleRate >= 8000 &&
        sampleRate <= 96000 &&
        channels >= 1 &&
        channels <= 8
      ) {
        return { sampleRate, channels };
      }
      return null;
    }
    const pad = size % 2;
    const next = dataOff + size + pad;
    if (next <= off || next > buffer.length) break;
    off = next;
  }
  return null;
}

function pcmPreparedFromWavBytes(buffer: Buffer): { bytes: Buffer; contentType: string; saluteRecognizeParams: Record<string, string> } {
  const fmt = readWavFmtInfo(buffer);
  const rate = fmt?.sampleRate ?? resolveTranscodeHz();
  const channels = fmt?.channels ?? 1;
  return {
    bytes: buffer,
    contentType: salutePcmS16ContentType(rate),
    saluteRecognizeParams: {
      sample_rate: String(rate),
      channels_count: String(Math.min(8, Math.max(1, channels))),
    },
  };
}

/**
 * WebM из браузера → WAV PCM S16LE mono: Сбер стабильнее принимает, чем наш OGG/Opus из ffmpeg
 * (иначе периодический 400 «invalid opus packet»).
 */
async function transcodeToWavPcm16Mono(input: Buffer): Promise<Buffer> {
  const ffmpegPath = getFfmpegExecutable();
  const hz = resolveTranscodeHz();

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const ff = spawn(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-fflags",
        "+discardcorrupt+genpts",
        "-i",
        "pipe:0",
        "-vn",
        "-ac",
        "1",
        "-ar",
        String(hz),
        "-f",
        "wav",
        "-acodec",
        "pcm_s16le",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] }
    );

    const timer = setTimeout(() => {
      ff.kill("SIGKILL");
      reject(new Error("Перекодирование ffmpeg превысило таймаут"));
    }, 60_000);

    let stderr = "";
    ff.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    ff.stdout.on("data", (c: Buffer) => chunks.push(c));
    ff.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    ff.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && chunks.length) {
        resolve(Buffer.concat(chunks));
        return;
      }
      const hint = stderr.trim().slice(-500);
      reject(
        new Error(
          hint
            ? `ffmpeg: ${hint}`
            : `ffmpeg завершился с кодом ${code} (нужен корректный WebM/Opus или поддерживаемый формат)`
        )
      );
    });

    const ok = ff.stdin.write(input, (err) => {
      if (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
    if (!ok) {
      ff.stdin.once("drain", () => ff.stdin.end());
    } else {
      ff.stdin.end();
    }
  });
}

/** Резерв: Opus в OGG (если задано SALUTE_SPEECH_TRANSCODE_FORMAT=opus). */
async function transcodeToOggOpus(input: Buffer): Promise<Buffer> {
  const ffmpegPath = getFfmpegExecutable();
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const ff = spawn(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-fflags",
        "+discardcorrupt+genpts",
        "-i",
        "pipe:0",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-c:a",
        "libopus",
        "-application",
        "voip",
        "-frame_duration",
        "20",
        "-f",
        "ogg",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] }
    );

    const timer = setTimeout(() => {
      ff.kill("SIGKILL");
      reject(new Error("Перекодирование ffmpeg превысило таймаут"));
    }, 60_000);

    let stderr = "";
    ff.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    ff.stdout.on("data", (c: Buffer) => chunks.push(c));
    ff.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    ff.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && chunks.length) {
        resolve(Buffer.concat(chunks));
        return;
      }
      const hint = stderr.trim().slice(-500);
      reject(
        new Error(
          hint
            ? `ffmpeg: ${hint}`
            : `ffmpeg завершился с кодом ${code} (нужен корректный WebM/Opus или поддерживаемый формат)`
        )
      );
    });

    const ok = ff.stdin.write(input, (err) => {
      if (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
    if (!ok) {
      ff.stdin.once("drain", () => ff.stdin.end());
    } else {
      ff.stdin.end();
    }
  });
}

function transcodedFormat(): "wav" | "opus" {
  const raw = process.env.SALUTE_SPEECH_TRANSCODE_FORMAT?.trim().toLowerCase();
  return raw === "opus" ? "opus" : "wav";
}

type PreparedSaluteAudio = {
  bytes: Buffer;
  contentType: string;
  /** Доп. query-параметры speech:recognize (обязательны для PCM вместе с Content-Type). */
  saluteRecognizeParams?: Record<string, string>;
};

async function transcodeBrowserCapture(input: Buffer): Promise<PreparedSaluteAudio> {
  if (transcodedFormat() === "opus") {
    const bytes = await transcodeToOggOpus(input);
    return { bytes, contentType: "audio/ogg;codecs=opus" };
  }
  const hz = resolveTranscodeHz();
  const bytes = await transcodeToWavPcm16Mono(input);
  return {
    bytes,
    contentType: salutePcmS16ContentType(hz),
    saluteRecognizeParams: { sample_rate: String(hz), channels_count: "1" },
  };
}

/** Подготовка тела под допустимые форматы Salute (Opus в OGG, WAV PCM, MP3, FLAC). */
async function prepareAudioBody(buffer: Buffer, mimeType: string): Promise<PreparedSaluteAudio> {
  const mime = mimeType.trim().split(";")[0]?.trim().toLowerCase() || "audio/webm";

  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "RIFF") {
    return pcmPreparedFromWavBytes(buffer);
  }

  if (mime.includes("wav")) {
    return pcmPreparedFromWavBytes(buffer);
  }

  if (mime.includes("ogg")) {
    return { bytes: buffer, contentType: "audio/ogg;codecs=opus" };
  }

  if (mime.includes("mpeg") || mime.includes("mp3")) {
    return { bytes: buffer, contentType: "audio/mpeg" };
  }

  if (mime.includes("flac")) {
    return { bytes: buffer, contentType: "audio/flac" };
  }

  if (webmOrMp4Like(mime)) {
    return transcodeBrowserCapture(buffer);
  }

  return transcodeBrowserCapture(buffer);
}

function extractTextFromRecognizeJson(data: unknown): string {
  if (data == null) return "";
  if (typeof data === "string") return data.trim();

  if (typeof data !== "object") return "";
  const o = data as Record<string, unknown>;

  if (typeof o.text === "string" && o.text.trim()) return o.text.trim();
  if (typeof o.normalizedText === "string" && o.normalizedText.trim())
    return o.normalizedText.trim();
  if (typeof o.normalized_text === "string" && o.normalized_text.trim())
    return o.normalized_text.trim();

  const innerResult = o.result;
  if (typeof innerResult === "string" && innerResult.trim()) return innerResult.trim();

  if (Array.isArray(innerResult)) {
    for (const item of innerResult) {
      const t = extractTextFromRecognizeJson(item);
      if (t) return t;
    }
  }

  if (innerResult && typeof innerResult === "object") {
    const r = innerResult as Record<string, unknown>;
    if (typeof r.text === "string" && r.text.trim()) return r.text.trim();
    if (typeof r.normalizedText === "string" && r.normalizedText.trim())
      return r.normalizedText.trim();
    if (typeof r.normalized_text === "string" && r.normalized_text.trim())
      return r.normalized_text.trim();

    const hypotheses = r.hypotheses ?? r.Hypotheses;
    if (Array.isArray(hypotheses) && hypotheses[0] && typeof hypotheses[0] === "object") {
      const h0 = hypotheses[0] as Record<string, unknown>;
      if (typeof h0.normalizedText === "string" && h0.normalizedText.trim())
        return h0.normalizedText.trim();
      if (typeof h0.normalized_text === "string" && h0.normalized_text.trim())
        return h0.normalized_text.trim();
      if (typeof h0.text === "string" && h0.text.trim()) return h0.text.trim();
    }
  }

  const hypotheses = o.hypotheses;
  if (Array.isArray(hypotheses) && hypotheses[0]) {
    return extractTextFromRecognizeJson({ result: hypotheses[0] });
  }

  return "";
}

export async function transcribeAudioSalute(
  buffer: Buffer,
  mimeType: string
): Promise<{ text: string } | { error: string }> {
  try {
    if (!hasSaluteSpeechCredentials()) {
      return { error: "SaluteSpeech: не заданы учётные данные (см. SALUTE_SPEECH_*)" };
    }

    let prepared = await prepareAudioBody(buffer, mimeType);
    if (prepared.bytes.length > SYNC_MAX_BYTES) {
      return {
        error: `Аудио после подготовки больше ${SYNC_MAX_BYTES} байт — лимит синхронного SaluteSpeech (2 МБ). Запишите короче.`,
      };
    }

    const token = await getCachedAccessToken();

    const lang = process.env.SALUTE_SPEECH_LANGUAGE?.trim() || "ru-RU";
    const model = process.env.SALUTE_SPEECH_MODEL?.trim() || "general";
    const profanityRaw = process.env.SALUTE_SPEECH_ENABLE_PROFANITY_FILTER?.trim().toLowerCase();
    const enableProfanity =
      profanityRaw === "0" || profanityRaw === "false" ? false : profanityRaw === "1" || profanityRaw === "true" ? true : true;

    const mimeBase = mimeType.trim().split(";")[0]?.trim().toLowerCase() || "audio/webm";

    const recognizeTimeout =
      Number.isFinite(HTTPS_TIMEOUT_RECOGNIZE_MS) && HTTPS_TIMEOUT_RECOGNIZE_MS >= 15000
        ? HTTPS_TIMEOUT_RECOGNIZE_MS
        : 120000;

    const postRecognize = async (
      body: PreparedSaluteAudio,
      accessToken: string
    ): Promise<{ statusCode: number; body: string }> => {
      const params = new URLSearchParams({
        language: lang,
        model,
        enable_profanity_filter: String(enableProfanity),
      });
      const extra = body.saluteRecognizeParams;
      if (extra) {
        for (const [k, v] of Object.entries(extra)) params.set(k, v);
      } else if (body.contentType.includes("ogg")) {
        params.set("channels_count", "1");
        params.set("sample_rate", "48000");
      } else if (/audio\/x-pcm/i.test(body.contentType)) {
        const m = /(?:^|[;\s])rate\s*=\s*(\d+)/i.exec(body.contentType);
        params.set("sample_rate", m?.[1] ?? String(resolveTranscodeHz()));
        params.set("channels_count", "1");
      }
      const url = `${RECOGNIZE_BASE}?${params.toString()}`;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": body.contentType,
        Accept: "application/json",
        "X-Request-ID": randomUUID(),
      };
      let res = await httpsPostBinary(url, body.bytes, headers, recognizeTimeout);
      if (res.statusCode === 401) {
        tokenCache = null;
        const retryToken = await getCachedAccessToken();
        headers.Authorization = `Bearer ${retryToken}`;
        headers["X-Request-ID"] = randomUUID();
        res = await httpsPostBinary(url, body.bytes, headers, recognizeTimeout);
      }
      return res;
    };

    let { statusCode, body: raw } = await postRecognize(prepared, token);

    const tryWavAfterBadOpus =
      statusCode === 400 &&
      /invalid opus/i.test(raw) &&
      prepared.contentType.includes("ogg") &&
      webmOrMp4Like(mimeBase);

    if (tryWavAfterBadOpus) {
      const wavBytes = await transcodeToWavPcm16Mono(buffer);
      const hz = resolveTranscodeHz();
      prepared = {
        bytes: wavBytes,
        contentType: salutePcmS16ContentType(hz),
        saluteRecognizeParams: { sample_rate: String(hz), channels_count: "1" },
      };
      if (prepared.bytes.length > SYNC_MAX_BYTES) {
        return {
          error: `Аудио после подготовки больше ${SYNC_MAX_BYTES} байт — лимит синхронного SaluteSpeech (2 МБ). Запишите короче.`,
        };
      }
      const retry = await postRecognize(prepared, token);
      statusCode = retry.statusCode;
      raw = retry.body;
    }

    if (statusCode < 200 || statusCode >= 300) {
      return { error: `SaluteSpeech recognize ${statusCode}: ${raw.slice(0, 500)}` };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      const plain = raw.trim();
      if (plain) return { text: plain };
      return { error: "SaluteSpeech: пустой или не-JSON ответ" };
    }

    const text = extractTextFromRecognizeJson(parsed);
    if (!text) {
      return { error: `SaluteSpeech: не удалось извлечь текст из ответа: ${raw.slice(0, 400)}` };
    }

    return { text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `SaluteSpeech: ${msg}` };
  }
}
