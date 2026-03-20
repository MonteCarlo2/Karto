import { createClient } from "@supabase/supabase-js";
import https from "https";
import sharp from "sharp";

/**
 * KIE AI — видео-генерация через bytedance/v1-pro-fast-image-to-video
 *
 * Поток:
 * 1. Фото товара (data URL / public URL) → Supabase Storage → публичный URL
 * 2. Публичный URL → KIE file-url-upload → KIE URL
 * 3. KIE URL + промпт → createTask → taskId
 * 4. Поллинг recordInfo → videoUrl когда state === "success"
 */

const KIE_TASK_BASE_URL = "https://api.kie.ai";
const KIE_UPLOAD_BASE_URL =
  process.env.KIE_UPLOAD_BASE_URL || "https://kieai.redpandaai.co";
const VIDEO_MODEL = "bytedance/v1-pro-fast-image-to-video";

const UPLOAD_TIMEOUT_MS = 25_000;
const UPLOAD_RETRIES = 3;
const UPLOAD_BACKOFF_MS = [1500, 3000, 5000];

function getApiKey(): string {
  const key = process.env.KIE_AI_API_KEY || process.env.KIE_API_KEY;
  if (!key) throw new Error("KIE_AI_API_KEY не установлен");
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** HTTPS POST через Node (обходим fetch-проблемы с kieai.redpandaai.co) */
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

/**
 * Загружает изображение из data URL → Supabase Storage → публичный URL.
 * Retry 3 попытки с backoff. При полном отказе — возвращает null.
 */
async function uploadDataUrlToSupabase(
  dataUrl: string,
  userId: string
): Promise<string | null> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.warn("[KIE VIDEO] Supabase не настроен — пропускаем загрузку фото");
    return null;
  }

  // Декодируем data URL
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return null;
  const base64 = dataUrl.slice(comma + 1);
  const rawBuffer = Buffer.from(base64, "base64");
  if (rawBuffer.length === 0) return null;

  // Конвертируем в JPEG — KIE Python-сервер ожидает JPEG
  let buffer: Buffer;
  try {
    buffer = await sharp(rawBuffer).jpeg({ quality: 90 }).toBuffer();
  } catch (sharpErr) {
    console.warn("[KIE VIDEO] sharp конвертация не удалась, используем оригинал:", sharpErr);
    buffer = rawBuffer;
  }

  const fileName = `kie-video-refs/${userId}/${Date.now()}.jpg`;
  const supabase = createClient(supabaseUrl, serviceKey);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { error } = await supabase.storage
        .from("generated-images")
        .upload(fileName, buffer, { contentType: "image/jpeg", upsert: true });

      if (!error) {
        const { data } = supabase.storage
          .from("generated-images")
          .getPublicUrl(fileName);
        console.log(`✅ [KIE VIDEO] Supabase upload OK (попытка ${attempt}):`, data.publicUrl.slice(0, 80));
        return data.publicUrl;
      }
      console.warn(`⚠️ [KIE VIDEO] Supabase upload ошибка (попытка ${attempt}/${3}):`, error.message);
    } catch (netErr) {
      console.warn(`⚠️ [KIE VIDEO] Supabase upload network error (попытка ${attempt}/3):`, netErr instanceof Error ? netErr.message : netErr);
    }
    if (attempt < 3) await sleep(1500 * attempt);
  }

  console.error("[KIE VIDEO] Все попытки Supabase upload провалились");
  return null;
}

/**
 * Загружает видео из data URL -> Supabase Storage -> public URL.
 * Используется для motion-control (видео очень большое, multipart в KIE часто рвёт соединение).
 */
async function uploadDataUrlToSupabaseVideo(
  dataUrl: string,
  userId: string
): Promise<string | null> {
  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return null;

    if (typeof dataUrl !== "string") return null;
    const commaIdx = dataUrl.indexOf(",");
    if (commaIdx === -1) return null;

    const header = dataUrl.slice(0, commaIdx);
    const base64 = dataUrl.slice(commaIdx + 1);
    if (!header.startsWith("data:") || !header.includes(";base64")) return null;

    const mimeStart = "data:".length;
    const semiIdx = header.indexOf(";");
    const mime =
      header.slice(mimeStart, semiIdx !== -1 ? semiIdx : header.length) ||
      "video/mp4";

    const ext = mime.includes("webm")
      ? "webm"
      : mime.includes("quicktime") || mime.includes("mov")
        ? "mov"
        : "mp4";

    const rawBuffer = Buffer.from(base64, "base64");
    if (!rawBuffer || rawBuffer.length === 0) return null;

    const fileName = `generated-videos/${userId}/${Date.now()}.${ext}`;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Используем тот же bucket, что и saveVideoToSupabase
    const bucket = "generated-images";
    const { error } = await supabase.storage
      .from(bucket)
      .upload(fileName, rawBuffer, { contentType: mime, upsert: false });

    if (error) return null;

    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return data?.publicUrl ? String(data.publicUrl) : null;
  } catch {
    return null;
  }
}

/**
 * Загружает изображение из data URL напрямую на KIE через multipart form-data.
 * Используется как fallback когда Supabase Storage недоступен.
 * Возвращает KIE CDN URL или null при ошибке.
 */
async function uploadDataUrlToKieDirect(dataUrl: string): Promise<string | null> {
  try {
    const apiKey = getApiKey();
    const comma = dataUrl.indexOf(",");
    if (comma === -1) return null;
    const base64 = dataUrl.slice(comma + 1);
    const rawBuffer = Buffer.from(base64, "base64");

    let buffer: Buffer;
    try {
      buffer = await sharp(rawBuffer).jpeg({ quality: 90 }).toBuffer();
    } catch {
      buffer = rawBuffer;
    }

    // KIE принимает multipart upload через /api/upload
    const boundary = `----FormBoundary${Date.now().toString(16)}`;
    const filename = `product-${Date.now()}.jpg`;
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, buffer, footer]);

    const { statusCode, body: resBody } = await httpsPost(
      `${KIE_UPLOAD_BASE_URL}/api/upload`,
      body,
      {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      UPLOAD_TIMEOUT_MS
    );

    if (statusCode === 200) {
      const parsed = JSON.parse(resBody) as { success?: boolean; data?: { downloadUrl?: string; url?: string } };
      const url = parsed.data?.downloadUrl || parsed.data?.url;
      if (url) {
        console.log("✅ [KIE VIDEO] Direct KIE upload OK:", url.slice(0, 80));
        return String(url);
      }
    }
    console.warn("[KIE VIDEO] Direct KIE upload ответ:", statusCode, resBody.slice(0, 200));
    return null;
  } catch (e) {
    console.warn("[KIE VIDEO] Direct KIE upload ошибка:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Загружает видео из data URL напрямую на KIE через multipart form-data.
 * Используется для motion-control (video_urls).
 *
 * Важно: KIE ожидает публичные URL или загруженные файлы через их upload endpoint.
 * Этот метод имитирует загрузку файлов на KIE через /api/upload.
 */
async function uploadDataUrlToKieDirectVideo(
  dataUrl: string
): Promise<string | null> {
  try {
    const apiKey = getApiKey();
    if (typeof dataUrl !== "string") return null;

    // Более надёжный парсинг dataURL, чем regex (не ломается при больших строках)
    const commaIdx = dataUrl.indexOf(",");
    if (commaIdx === -1) return null;

    const dataHeaderStr = dataUrl.slice(0, commaIdx);
    const base64 = dataUrl.slice(commaIdx + 1);

    if (!dataHeaderStr.startsWith("data:")) return null;
    if (!dataHeaderStr.includes(";base64")) return null;

    const semiIdx = dataHeaderStr.indexOf(";");
    const mime =
      dataHeaderStr.slice(5, semiIdx !== -1 ? semiIdx : dataHeaderStr.length) || "video/mp4";

    const rawBuffer = Buffer.from(base64, "base64");
    if (!rawBuffer || rawBuffer.length === 0) return null;

    const ext =
      mime.includes("mp4") ? "mp4" : mime.includes("quicktime") ? "mov" : mime.includes("webm") ? "webm" : "mp4";
    const boundary = `----FormBoundary${Date.now().toString(16)}`;
    const filename = `motion-${Date.now()}.${ext}`;

    const headerBytes = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([headerBytes, rawBuffer, footer]);

    const { statusCode, body: resBody } = await httpsPost(
      `${KIE_UPLOAD_BASE_URL}/api/upload`,
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
      if (url) {
        console.log("✅ [KIE VIDEO] Direct KIE video upload OK:", url.slice(0, 80));
        return String(url);
      }
    }

    console.warn("[KIE VIDEO] Direct KIE video upload ответ:", statusCode, resBody.slice(0, 200));
    return null;
  } catch (e) {
    console.warn(
      "[KIE VIDEO] Direct KIE video upload ошибка:",
      e instanceof Error ? e.message : e
    );
    return null;
  }
}

/**
 * Отправляет публичный URL в KIE file-url-upload → возвращает KIE CDN URL.
 * При ошибке возвращает исходный публичный URL (KIE иногда принимает напрямую).
 */
async function uploadPublicUrlToKie(
  publicUrl: string,
  index = 0
): Promise<string> {
  const apiKey = getApiKey();
  const body = JSON.stringify({
    fileUrl: publicUrl,
    uploadPath: "kieai/market",
    fileName: `product-${Date.now()}-${index}.jpg`,
  });

  for (let attempt = 0; attempt <= UPLOAD_RETRIES; attempt++) {
    if (attempt > 0) await sleep(UPLOAD_BACKOFF_MS[attempt - 1] ?? 1500);
    try {
      const { statusCode, body: resBody } = await httpsPost(
        `${KIE_UPLOAD_BASE_URL}/api/file-url-upload`,
        Buffer.from(body, "utf8"),
        {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        UPLOAD_TIMEOUT_MS
      );
      if (statusCode !== 200)
        throw new Error(`HTTP ${statusCode}: ${resBody.slice(0, 200)}`);

      const parsed = JSON.parse(resBody) as {
        success?: boolean;
        code?: number;
        msg?: string;
        data?: { downloadUrl?: string; fileUrl?: string; url?: string };
      };
      if (!parsed.success || parsed.code !== 200)
        throw new Error(parsed.msg || "KIE URL upload error");

      const url =
        parsed.data?.downloadUrl || parsed.data?.fileUrl || parsed.data?.url;
      if (url) {
        console.log("✅ [KIE VIDEO] Изображение загружено на KIE:", url.slice(0, 80));
        return String(url);
      }
    } catch (e) {
      console.warn(
        `⚠️ [KIE VIDEO] file-url-upload attempt ${attempt + 1}/${UPLOAD_RETRIES + 1}:`,
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  // Fallback: передаём публичный URL напрямую
  console.warn("⚠️ [KIE VIDEO] Fallback: передаём publicUrl напрямую в KIE");
  return publicUrl;
}

async function uploadPublicUrlToKieFile(
  publicUrl: string,
  fileName: string
): Promise<string | null> {
  const apiKey = getApiKey();
  const body = JSON.stringify({
    fileUrl: publicUrl,
    uploadPath: "kieai/market",
    fileName,
  });

  try {
    const { statusCode, body: resBody } = await httpsPost(
      `${KIE_UPLOAD_BASE_URL}/api/file-url-upload`,
      Buffer.from(body, "utf8"),
      {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      UPLOAD_TIMEOUT_MS
    );

    if (statusCode !== 200) {
      return null;
    }

    const parsed = JSON.parse(resBody) as {
      success?: boolean;
      code?: number;
      msg?: string;
      data?: { downloadUrl?: string; fileUrl?: string; url?: string };
    };

    const url =
      parsed.data?.downloadUrl || parsed.data?.fileUrl || parsed.data?.url;

    if (!parsed.success || parsed.code !== 200 || !url) return null;
    return String(url);
  } catch {
    return null;
  }
}

/**
 * Сохраняет видео из KIE CDN в Supabase Storage и возвращает постоянный URL.
 * Если загрузка не удалась — возвращает исходный KIE URL.
 */
export async function saveVideoToSupabase(
  videoUrl: string,
  userId: string
): Promise<string> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return videoUrl;

  try {
    const supabase = createClient(supabaseUrl, serviceKey);
    const res = await fetch(videoUrl);
    if (!res.ok) return videoUrl;

    const buffer = Buffer.from(await res.arrayBuffer());
    const fileName = `generated-videos/${userId}/${Date.now()}.mp4`;

    const { error } = await supabase.storage
      .from("generated-images") // используем тот же bucket
      .upload(fileName, buffer, { contentType: "video/mp4", upsert: false });
    if (error) return videoUrl;

    const { data } = supabase.storage
      .from("generated-images")
      .getPublicUrl(fileName);
    return data.publicUrl || videoUrl;
  } catch {
    return videoUrl;
  }
}

/**
 * Главная функция: загружает фото товара и создаёт задачу видео-генерации.
 * Возвращает taskId (не ждёт завершения — оно займёт 1–3 мин).
 */
export async function createVideoProductTask(params: {
  prompt: string;
  productImageDataUrl: string; // data URL или публичный URL
  resolution: "720p" | "1080p";
  duration: 5 | 10;
  userId: string;
}): Promise<string> {
  const apiKey = getApiKey();

  console.log("🎬 [KIE VIDEO] Начинаем создание задачи видео-генерации...");

  // Шаг 1: Получаем публичный URL изображения
  let imageKieUrl: string | null = null;

  if (params.productImageDataUrl.startsWith("data:image")) {
    console.log("📤 [KIE VIDEO] Загружаем фото товара в Supabase Storage...");
    const supabaseUrl = await uploadDataUrlToSupabase(
      params.productImageDataUrl,
      params.userId
    );

    if (supabaseUrl) {
      // Шаг 2: Загружаем в KIE CDN
      console.log("📤 [KIE VIDEO] Загружаем на KIE CDN...");
      imageKieUrl = await uploadPublicUrlToKie(supabaseUrl);
    } else {
      // Supabase недоступен — пробуем загрузить data URL напрямую на KIE через base64
      console.warn("⚠️ [KIE VIDEO] Supabase недоступен, пробуем прямую загрузку на KIE...");
      imageKieUrl = await uploadDataUrlToKieDirect(params.productImageDataUrl);
    }
  } else if (params.productImageDataUrl.startsWith("http")) {
    console.log("📤 [KIE VIDEO] Загружаем публичный URL на KIE CDN...");
    imageKieUrl = await uploadPublicUrlToKie(params.productImageDataUrl);
  }

  if (!imageKieUrl) {
    throw new Error("Не удалось загрузить фото товара для генерации видео. Проверьте подключение и попробуйте снова.");
  }

  // Шаг 3: Создаём задачу
  const requestBody = {
    model: VIDEO_MODEL,
    input: {
      prompt: params.prompt,
      image_url: imageKieUrl,
      resolution: params.resolution,
      duration: String(params.duration), // KIE принимает строку "5" или "10"
      nsfw_checker: true,
    },
  };

  console.log("🚀 [KIE VIDEO] Создаём задачу...", {
    resolution: params.resolution,
    duration: params.duration,
    prompt: params.prompt.slice(0, 80),
  });

  const response = await fetch(
    `${KIE_TASK_BASE_URL}/api/v1/jobs/createTask`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`KIE createTask error ${response.status}: ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  if (data.code !== 200) {
    throw new Error(`KIE createTask error: ${data.msg || "unknown"}`);
  }

  const taskId: string = data.data?.taskId;
  if (!taskId) throw new Error("KIE не вернул taskId");

  console.log("✅ [KIE VIDEO] Задача создана, taskId:", taskId);
  return taskId;
}

/**
 * Проверяет статус задачи. Вызывается из polling-эндпоинта.
 */
export async function checkVideoTaskStatus(taskId: string): Promise<{
  status: "processing" | "success" | "failed";
  videoUrl?: string;
  failMsg?: string;
}> {
  const apiKey = getApiKey();

  const response = await fetch(
    `${KIE_TASK_BASE_URL}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`KIE recordInfo error ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  if (data.code !== 200) {
    throw new Error(`KIE recordInfo error: ${data.msg || "unknown"}`);
  }

  const taskData = data.data;
  const state: string = taskData?.state || "";

  if (state === "success") {
    let resultJson: any;
    try {
      resultJson =
        typeof taskData.resultJson === "string"
          ? JSON.parse(taskData.resultJson)
          : taskData.resultJson;
    } catch {
      throw new Error("Не удалось распарсить resultJson");
    }

    const resultUrls = resultJson?.resultUrls;
    const candidates: Array<string | undefined> = [
      Array.isArray(resultUrls) && resultUrls.length > 0 ? String(resultUrls[0]) : undefined,
      typeof resultJson?.resultUrl === "string" ? resultJson.resultUrl : undefined,
      typeof resultJson?.url === "string" ? resultJson.url : undefined,
      typeof resultJson?.videoUrl === "string" ? resultJson.videoUrl : undefined,
      Array.isArray(resultJson?.video_urls) && resultJson.video_urls.length > 0 ? String(resultJson.video_urls[0]) : undefined,
    ];

    const videoUrl = candidates.find((c) => typeof c === "string" && (c as string).startsWith("http"));
    if (videoUrl) {
      console.log("✅ [KIE VIDEO] Готово! URL:", videoUrl.slice(0, 80));
      return { status: "success", videoUrl };
    }

    throw new Error("Не удалось извлечь videoUrl из ответе KIE (нет resultUrls/resultUrl)");
  }

  if (state === "fail" || state === "failed") {
    const failMsg = taskData?.failMsg || "Неизвестная ошибка KIE";
    // Это ожидаемый сценарий (модель может временно не справиться) — не считаем критической ошибкой.
    console.warn("⚠️ [KIE VIDEO] Задача провалилась:", failMsg);
    return { status: "failed", failMsg };
  }

  // processing / pending / queued / etc.
  return { status: "processing" };
}

// ─────────────────────────────────────────────────────────────────────────────
// bytedance/seedance-1.5-pro  –  свободная генерация видео
// ─────────────────────────────────────────────────────────────────────────────

const FREE_VIDEO_MODEL = "bytedance/seedance-1.5-pro";
const KLING_IMAGE_TO_VIDEO_MODEL = "kling-2.6/image-to-video";
const KLING_TEXT_TO_VIDEO_MODEL = "kling-2.6/text-to-video";
const KLING_MOTION_CONTROL_MODEL = "kling-2.6/motion-control";

export interface FreeVideoTaskParams {
  prompt: string;
  aspectRatio: "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9";
  resolution?: "480p" | "720p" | "1080p";
  duration?: 4 | 8 | 12;
  fixedLens?: boolean;
  generateAudio?: boolean;
  /** Optional 0-2 reference image data-URLs */
  referenceImageDataUrls?: string[];
  userId: string;
}

export interface KlingVideoTaskParams {
  prompt: string;
  aspectRatio: "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9";
  resolution?: "480p" | "720p" | "1080p";
  /** Kling duration is sent as string in seconds (e.g. "5") */
  duration?: 5 | 10;
  generateAudio?: boolean;
  /**
   * If provided (max 1), we use image-to-video model.
   * If empty, we use text-to-video model.
   */
  referenceImageDataUrls?: string[];
  userId: string;
}

export interface KlingMotionControlTaskParams {
  prompt: string;
  aspectRatio: "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9";
  resolution: "720p" | "1080p";
  generateAudio?: boolean;
  characterOrientation: "image" | "video";
  /** Single character image (data url) */
  inputImageDataUrl: string;
  /** Reference motion video (data url) */
  referenceVideoDataUrl: string;
  userId: string;
}

/**
 * Создаёт задачу генерации видео через Seedance-1.5-pro.
 * Возвращает taskId — для поллинга используется тот же checkVideoTaskStatus().
 */
export async function createFreeVideoTask(
  params: FreeVideoTaskParams
): Promise<string> {
  const {
    prompt,
    aspectRatio,
    resolution = "1080p",
    duration = 8,
    fixedLens = false,
    generateAudio = false,
    referenceImageDataUrls = [],
    userId,
  } = params;

  // Загружаем опциональные reference-изображения в KIE (до 2 штук)
  const inputUrls: string[] = [];
  for (const dataUrl of referenceImageDataUrls.slice(0, 2)) {
    try {
      // Сначала пробуем через Supabase → KIE URL pipeline
      const supabaseUrl = await uploadDataUrlToSupabase(dataUrl, userId);
      if (supabaseUrl) {
        const kieUrl = await uploadPublicUrlToKie(supabaseUrl);
        if (kieUrl) {
          inputUrls.push(kieUrl);
          continue;
        }
      }
      // Fallback — прямая загрузка в KIE
      const directUrl = await uploadDataUrlToKieDirect(dataUrl);
      if (directUrl) inputUrls.push(directUrl);
    } catch (e) {
      console.warn("[seedance] Не удалось загрузить reference image:", e);
    }
  }

  const apiKey = getApiKey();

  const body = JSON.stringify({
    model: FREE_VIDEO_MODEL,
    input: {
      prompt,
      ...(inputUrls.length > 0 ? { input_urls: inputUrls } : {}),
      aspect_ratio: aspectRatio,
      resolution,
      duration: String(duration), // KIE требует строку, несмотря на документацию
      fixed_lens: fixedLens,
      generate_audio: generateAudio,
      nsfw_checker: false,
    },
  });

  console.log("[seedance] Создаём задачу:", {
    prompt: prompt.slice(0, 80),
    aspectRatio,
    resolution,
    duration,
    fixedLens,
    generateAudio,
    inputUrls: inputUrls.length,
  });

  const response = await fetch(`${KIE_TASK_BASE_URL}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.code !== 200) {
    const msg = data.msg || `HTTP ${response.status}`;
    console.error("[seedance] createTask error:", msg, JSON.stringify(data).slice(0, 300));
    throw new Error(`KIE seedance createTask failed: ${msg}`);
  }

  const taskId: string = data.data?.taskId;
  if (!taskId) throw new Error("KIE seedance: taskId не получен");

  console.log("[seedance] taskId:", taskId);
  return taskId;
}

/**
 * bytedance/seedance-1.5-pro (standard) использует "input_urls"/duration как string.
 * Kling (pro) требует:
 * - модель зависит от наличия image_urls
 * - duration передаётся строкой (например "5")
 */
export async function createKlingProVideoTask(
  params: KlingVideoTaskParams
): Promise<string> {
  const {
    prompt,
    aspectRatio,
    resolution = "1080p",
    duration = 5,
    generateAudio = false,
    referenceImageDataUrls = [],
    userId,
  } = params;

  const apiKey = getApiKey();

  // Для pro мы принимаем максимум 1 image
  const ref = referenceImageDataUrls[0];

  // Загружаем reference image в KIE (если есть)
  const inputUrls: string[] = [];
  if (ref) {
    // Если ref — обычный http(s) url, отправляем напрямую в KIE
    if (ref.startsWith("http")) {
      try {
        const kieUrl = await uploadPublicUrlToKie(ref);
        if (kieUrl) inputUrls.push(kieUrl);
      } catch {
        // ignore, fallback ниже
      }
    }

    // Пытаемся через Supabase Storage → public URL → KIE CDN URL
    try {
      const supabaseUrl = await uploadDataUrlToSupabase(ref, userId);
      if (supabaseUrl) {
        const kieUrl = await uploadPublicUrlToKie(supabaseUrl);
        if (kieUrl) inputUrls.push(kieUrl);
      }
    } catch {
      // ignore, fallback ниже
    }

    if (inputUrls.length === 0) {
      // fallback: прямой multipart в KIE
      const directUrl = await uploadDataUrlToKieDirect(ref);
      if (directUrl) inputUrls.push(directUrl);
    }
  }

  const hasRef = Boolean(ref);
  if (hasRef && inputUrls.length === 0) {
    throw new Error("KIE kling: не удалось загрузить reference image для image-to-video");
  }

  const model = hasRef ? KLING_IMAGE_TO_VIDEO_MODEL : KLING_TEXT_TO_VIDEO_MODEL;

  const baseInput: Record<string, any> = {
    prompt,
    ...(inputUrls.length > 0 ? { image_urls: inputUrls } : {}),
    aspect_ratio: aspectRatio,
    sound: generateAudio,
    duration: String(duration),
  };

  const attempt = async (includeResolution: boolean) => {
    const input = includeResolution ? { ...baseInput, resolution } : baseInput;
    const body = JSON.stringify({ model, input });

    console.log("[kling] createTask attempt:", {
      model,
      aspectRatio,
      resolution: includeResolution ? resolution : undefined,
      duration,
      sound: generateAudio,
      hasImage: inputUrls.length > 0,
    });

    const response = await fetch(`${KIE_TASK_BASE_URL}/api/v1/jobs/createTask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.code !== 200) {
      const msg = data.msg || `HTTP ${response.status}`;
      throw new Error(msg);
    }
    return data;
  };

  try {
    const data = await attempt(true);
    const taskId: string = data.data?.taskId;
    if (!taskId) throw new Error("KIE kling: taskId не получен");
    console.log("[kling] taskId:", taskId);
    return taskId;
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : String(e);
    const looksResolutionRelated = msg.toLowerCase().includes("resolution");

    if (looksResolutionRelated) {
      // retry без resolution
      const data = await attempt(false);
      const taskId: string = data.data?.taskId;
      if (!taskId) throw new Error("KIE kling: taskId не получен");
      console.log("[kling] taskId (retry no resolution):", taskId);
      return taskId;
    }

    console.error("[kling] createTask error:", msg);
    throw new Error(`KIE kling createTask failed: ${msg}`);
  }
}

/**
 * kling-2.6/motion-control — режим "Синхрон".
 * Логика:
 * - обязательно 1 image (input_urls)
 * - обязательно 1 video (video_urls)
 * - качество: mode (720p / 1080p)
 * - character_orientation: "image" | "video"
 * - sound: параметр опционален (попробуем с ним, при ошибке - без)
 */
export async function createKlingMotionControlVideoTask(
  params: KlingMotionControlTaskParams
): Promise<string> {
  const {
    prompt,
    resolution,
    generateAudio = false,
    characterOrientation,
    inputImageDataUrl,
    referenceVideoDataUrl,
    userId,
  } = params;

  const apiKey = getApiKey();

  // 1) upload image -> kie url
  let imageKieUrl: string | null = null;
  if (inputImageDataUrl.startsWith("http")) {
    try {
      imageKieUrl = await uploadPublicUrlToKie(inputImageDataUrl);
    } catch {
      imageKieUrl = null;
    }
  }
  if (!imageKieUrl) {
    imageKieUrl =
      (await uploadDataUrlToKieDirect(inputImageDataUrl)) ||
      (await (async () => {
        // fallback: supabase url -> kie url
        const supabaseUrl = await uploadDataUrlToSupabase(inputImageDataUrl, userId);
        if (!supabaseUrl) return null;
        return uploadPublicUrlToKie(supabaseUrl);
      })());
  }

  if (!imageKieUrl) {
    throw new Error("KIE kling motion-control: не удалось загрузить input image на KIE");
  }

  // 2) upload video -> kie url
  try {
    const prefix = referenceVideoDataUrl?.slice(0, 30) ?? "null";
    console.log("[kling motion-control] referenceVideoDataUrl prefix:", prefix, {
      isDataUrl:
        typeof referenceVideoDataUrl === "string" &&
        referenceVideoDataUrl.startsWith("data:"),
      hasBase64:
        typeof referenceVideoDataUrl === "string" &&
        referenceVideoDataUrl.includes(";base64,"),
      length:
        typeof referenceVideoDataUrl === "string" ? referenceVideoDataUrl.length : 0,
    });
  } catch {
    // ignore logging errors
  }

  // Основной путь: сначала зальём видео в Supabase Storage → возьмём public URL → отправим URL в KIE.
  // Это сильно надёжнее, чем отправлять mp4 multipart-ом из base64 (часто даёт ECONNRESET).
  let videoKieUrl: string | null = null;
  const supabaseVideoUrl = await uploadDataUrlToSupabaseVideo(referenceVideoDataUrl, userId);

  if (supabaseVideoUrl) {
    console.log("[kling motion-control] Supabase video public URL:", supabaseVideoUrl.slice(0, 80));
    const uploadedToKie = await uploadPublicUrlToKieFile(
      supabaseVideoUrl,
      `motion-${Date.now()}.mp4`
    );

    // Главная цель: чтобы createTask точно ушёл в KIE.
    // Если KIE upload не сработал — используем Supabase public URL напрямую.
    videoKieUrl = uploadedToKie || supabaseVideoUrl;
  } else {
    // Если вдруг Supabase не дал URL — это уже fallback на multipart.
    videoKieUrl = await uploadDataUrlToKieDirectVideo(referenceVideoDataUrl);
  }

  if (!videoKieUrl) {
    throw new Error("KIE kling motion-control: не удалось получить reference video URL");
  }

  const baseInput: Record<string, any> = {
    prompt,
    input_urls: [imageKieUrl],
    video_urls: [videoKieUrl],
    mode: resolution,
    character_orientation: characterOrientation,
  };

  const attempt = async (includeSound: boolean) => {
    const input = includeSound ? { ...baseInput, sound: generateAudio } : baseInput;
    const body = JSON.stringify({ model: KLING_MOTION_CONTROL_MODEL, input });

    console.log("[kling motion-control] createTask attempt:", {
      includeSound,
      resolution,
      characterOrientation,
    });

    const response = await fetch(`${KIE_TASK_BASE_URL}/api/v1/jobs/createTask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.code !== 200) {
      const msg = data.msg || `HTTP ${response.status}`;
      throw new Error(msg);
    }
    return data;
  };

  try {
    const data = await attempt(true);
    const taskId: string = data.data?.taskId;
    if (!taskId) throw new Error("KIE kling motion-control: taskId не получен");
    console.log("[kling motion-control] taskId:", taskId);
    return taskId;
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : String(e);
    const looksSoundRelated = msg.toLowerCase().includes("sound") || msg.toLowerCase().includes("audio");
    if (looksSoundRelated) {
      const data = await attempt(false);
      const taskId: string = data.data?.taskId;
      if (!taskId) throw new Error("KIE kling motion-control: taskId не получен");
      console.log("[kling motion-control] taskId (retry no sound):", taskId);
      return taskId;
    }
    throw e;
  }
}
