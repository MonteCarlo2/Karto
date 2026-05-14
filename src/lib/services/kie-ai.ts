import sharp from "sharp";
import https from "https";
import { createClient } from "@supabase/supabase-js";
import { KieAiContentFilteredError, isKieContentPolicyError } from "./kie-ai-errors";

/**
 * KIE AI API Service
 * image_input — только URL. Референс сначала грузим в Supabase Storage (публичный URL),
 * затем передаём этот URL в KIE file-url-upload (маленький JSON) — KIE сам скачивает файл.
 * Так избегаем ECONNRESET при прямой загрузке большого тела на kieai.redpandaai.co.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

const KIE_TASK_BASE_URL = "https://api.kie.ai";
const KIE_UPLOAD_BASE_URLS = [
  process.env.KIE_UPLOAD_BASE_URL,
  "https://kieai.redpandaai.co",
].filter((u): u is string => typeof u === "string" && !u.includes("api.kie.ai"));
const UPLOAD_TIMEOUT_MS = 20000;
const UPLOAD_RETRIES = 3;
const UPLOAD_BACKOFF_MS = [1500, 3000, 5000];
const KIE_REF_BUCKET = "generated-images";
const KIE_REF_PREFIX = "kie-refs";

/** Идентификаторы моделей KIE createTask (документация KIE). */
export const KIE_MODEL_GPT_IMAGE_2 = "gpt-image-2-text-to-image";
export const KIE_MODEL_NANO_BANANA_2 = "nano-banana-2";

/**
 * Единая модель изображений для всей платформы (свободное творчество, поток, товар, карточки, логотип, правки).
 * В .env: `KIE_IMAGE_MODEL=gpt-image-2-text-to-image` (по умолчанию в коде то же).
 * Откат на nano-banana-2 без правки кода: `KIE_IMAGE_MODEL=nano-banana-2`
 */
export function getDefaultKieImageModel(): string {
  return process.env.KIE_IMAGE_MODEL ?? KIE_MODEL_GPT_IMAGE_2;
}

/** У gpt-image-2-text-to-image для 1:1 в KIE максимум 2K, не 4K. */
export function effectiveKieResolutionForModel(
  modelId: string,
  aspectRatio: string,
  resolution: string
): string {
  if (modelId === KIE_MODEL_GPT_IMAGE_2 && aspectRatio === "1:1") {
    const up = resolution.trim().toUpperCase();
    if (up === "4K") return "2K";
  }
  return resolution;
}

/**
 * Получение API ключа KIE AI
 */
function getKieAiApiKey(): string {
  const apiKey = process.env.KIE_AI_API_KEY || process.env.KIE_API_KEY;
  if (!apiKey) {
    throw new Error("KIE_AI_API_KEY (или KIE_API_KEY) не установлен в .env.local");
  }
  return apiKey;
}

/**
 * Создание задачи генерации через KIE AI
 */
async function createTask(params: {
  prompt: string;
  aspectRatio?: string;
  outputFormat?: string;
  resolution?: string;
  imageInput?: string[];
  /** Если не задан — см. getDefaultKieImageModel() / env KIE_IMAGE_MODEL */
  model?: string;
}): Promise<{ taskId: string; referenceCount: number }> {
  const apiKey = getKieAiApiKey();

  const modelId = params.model ?? getDefaultKieImageModel();
  
  const requestBody: any = {
    model: modelId,
    input: {
      prompt: params.prompt,
    },
  };

  // Добавляем опциональные параметры
  if (params.aspectRatio) {
    requestBody.input.aspect_ratio = params.aspectRatio;
  }
  
  if (params.outputFormat) {
    requestBody.input.output_format = params.outputFormat;
  }
  
  if (params.resolution) {
    requestBody.input.resolution = params.resolution;
  }

  let referenceCount = 0;
  if (params.imageInput && params.imageInput.length > 0) {
    const imageUrls = await uploadReferencesToKie(params.imageInput.slice(0, 8));
    if (imageUrls.length > 0) {
      requestBody.input.image_input = imageUrls;
      referenceCount = imageUrls.length;
      console.log(`✅ [KIE AI] Добавлено ${imageUrls.length} референсов в image_input`);
    } else {
      console.warn("⚠️ [KIE AI] Референсы недоступны, продолжаем генерацию без image_input");
    }
  }

  console.log("🚀 [KIE AI] Создаём задачу генерации...");
  console.log("🤖 Модель:", modelId);
  console.log("📝 Промпт:", params.prompt.substring(0, 150) + "...");
  console.log("🔧 Параметры:", {
    aspect_ratio: params.aspectRatio,
    output_format: params.outputFormat,
    resolution: params.resolution,
    has_images: params.imageInput ? params.imageInput.length : 0,
  });

  const response = await fetch(`${KIE_TASK_BASE_URL}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("❌ [KIE AI] Ошибка создания задачи:", errorText);
    throw new Error(`KIE AI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  if (data.code !== 200) {
    throw new Error(`KIE AI API error: ${data.msg || "Unknown error"}`);
  }

  const taskId = data.data?.taskId;
  if (!taskId) {
    throw new Error("KIE AI не вернул taskId");
  }

  console.log("✅ [KIE AI] Задача создана, taskId:", taskId);
  return { taskId, referenceCount };
}

/**
 * Получение информации о задаче и ожидание результата
 */
async function getTaskResult(taskId: string, maxWaitTime: number = 300000): Promise<string> {
  const apiKey = getKieAiApiKey();
  const startTime = Date.now();
  const pollInterval = parseInt(process.env.KIE_POLL_INTERVAL_MS ?? "1000", 10); // опрос реже/чаще без правки кода
  const recordInfoTimeoutMs = parseInt(process.env.KIE_RECORDINFO_TIMEOUT_MS ?? "15000", 10); // таймаут именно на HTTP запрос к recordInfo

  console.log("⏳ [KIE AI] Ожидаем результат задачи:", taskId);

  while (Date.now() - startTime < maxWaitTime) {
    const response = await fetchWithTimeout(
      `${KIE_TASK_BASE_URL}/api/v1/jobs/recordInfo?taskId=${taskId}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
        },
      },
      recordInfoTimeoutMs
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`KIE AI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (data.code !== 200) {
      throw new Error(`KIE AI API error: ${data.msg || "Unknown error"}`);
    }

    const taskData = data.data;
    const state = taskData?.state;

    if (state === "success") {
      // Парсим resultJson чтобы получить URL изображения
      let resultJson: any;
      try {
        resultJson = typeof taskData.resultJson === "string" 
          ? JSON.parse(taskData.resultJson) 
          : taskData.resultJson;
      } catch (e) {
        console.error("❌ [KIE AI] Ошибка парсинга resultJson:", e);
        throw new Error("Не удалось распарсить результат задачи");
      }

      const resultUrls = resultJson?.resultUrls;
      if (Array.isArray(resultUrls) && resultUrls.length > 0) {
        const imageUrl = resultUrls[0];
        console.log("✅ [KIE AI] Генерация завершена, URL:", imageUrl);
        return imageUrl;
      } else {
        throw new Error("Результат не содержит URL изображения");
      }
    } else if (state === "fail" || state === "failed") {
      const failMsg = taskData?.failMsg || "Неизвестная ошибка";
      throw new Error(`KIE AI генерация не удалась: ${failMsg}`);
    }

    // Задача ещё выполняется, ждём
    await sleep(pollInterval);
  }

  throw new Error("Превышено время ожидания результата генерации");
}

export type GenerateWithKieAiResult = { imageUrl: string; referenceUsed: boolean };

export type GenerateWithKieAiOptions = {
  /** Переопределить модель для одиночного вызова; иначе используется KIE_IMAGE_MODEL / getDefaultKieImageModel. */
  model?: string;
};

/**
 * Генерация изображения через KIE AI. Модель по умолчанию — `KIE_IMAGE_MODEL` (см. getDefaultKieImageModel).
 * По умолчанию resolution 4K; для gpt-image-2 при 1:1 принудительно не выше 2K.
 */
export async function generateWithKieAi(
  prompt: string,
  imageInput?: string | string[], // URL или data URL; в createTask в image_input уходят только URL
  aspectRatio: string = "3:4",
  outputFormat: string = "png",
  resolution: string = "4K",
  options?: GenerateWithKieAiOptions
): Promise<GenerateWithKieAiResult> {
  const modelId = options?.model ?? getDefaultKieImageModel();
  const resolutionEffective = effectiveKieResolutionForModel(modelId, aspectRatio, resolution);

  console.log("🍌 [KIE AI] Начинаем генерацию через KIE AI...");
  console.log("📝 Промпт:", prompt.substring(0, 150) + "...");
  
  if (imageInput) {
    const count = Array.isArray(imageInput) ? imageInput.length : 1;
    console.log(`🖼️ Референсное изображение: добавлено (${count} шт.)`);
  }

  if (options?.model) {
    console.log("🤖 Модель (override):", options.model);
  } else {
    console.log("🤖 Модель:", modelId);
  }
  if (resolutionEffective !== resolution) {
    console.log("📐 Разрешение скорректировано для модели:", resolution, "→", resolutionEffective);
  }

  const maxWaitTimeMs = parseInt(process.env.KIE_TASK_MAX_WAIT_MS ?? "300000", 10);
  const maxAttempts = parseInt(process.env.KIE_GENERATION_ATTEMPTS ?? "2", 10);
  const retryBackoffMs = parseInt(process.env.KIE_GENERATION_RETRY_BACKOFF_MS ?? "2500", 10);

  // ВАЖНО: если пользователь дал референсы — используем их во ВСЕХ попытках.
  // Никогда не "урезаем" референсы ради успеха: либо успешно с референсом, либо ошибка.
  const imageArray = imageInput
    ? (Array.isArray(imageInput) ? imageInput : [imageInput])
    : undefined;

  let lastError: any = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { taskId, referenceCount } = await createTask({
        prompt: prompt.trim(),
        aspectRatio,
        outputFormat,
        resolution: resolutionEffective,
        imageInput: imageArray,
        model: modelId,
      });

      const imageUrl = await getTaskResult(taskId, maxWaitTimeMs);

      console.log("✅ [KIE AI] Генерация завершена успешно (attempt", attempt + 1, "/", maxAttempts, ")");
      return { imageUrl, referenceUsed: referenceCount > 0 };
    } catch (error: any) {
      lastError = error;

      console.error("❌ [KIE AI] Ошибка (attempt", attempt + 1, "/", maxAttempts, "):", error);
      console.error("📋 Детали ошибки:", {
        message: error?.message,
        stack: error?.stack?.substring?.(0, 500),
      });

      const errorMessage = error?.message || String(error);

      if (isKieContentPolicyError(errorMessage)) {
        throw new KieAiContentFilteredError();
      }

      // Эти ошибки не ретраим — они требуют внешнего вмешательства/другой стратегии.
      if (errorMessage.includes("401") || errorMessage.includes("access")) {
        throw new Error("Ошибка авторизации KIE AI. Проверьте KIE_AI_API_KEY в .env.local");
      }
      if (errorMessage.includes("429") || errorMessage.includes("rate limit")) {
        throw new Error("Превышен лимит запросов KIE AI. Подождите немного и попробуйте снова.");
      }

      const isRetryable =
        errorMessage.includes("Internal Error") ||
        errorMessage.includes("Please try again later") ||
        errorMessage.includes("превышено время ожидания") ||
        errorMessage.includes("Превышено время ожидания") ||
        errorMessage.toLowerCase().includes("timeout") ||
        errorMessage.toLowerCase().includes("timed out");

      if (!isRetryable || attempt >= maxAttempts - 1) {
        throw new Error(`KIE AI ошибка: ${errorMessage}`);
      }

      // Временная просадка: ждём и пробуем заново (с упрощением референсов в следующих попытках)
      const backoff = retryBackoffMs * (attempt + 1);
      console.warn(`⚠️ [KIE AI] Ретраим генерации через ${backoff}ms (attempt ${attempt + 2}/${maxAttempts})`);
      await sleep(backoff);
    }
  }

  throw new Error(`KIE AI ошибка: ${lastError?.message || String(lastError)}`);
}

/** Загружает буфер в Supabase Storage и возвращает публичный URL (KIE сможет скачать по нему). */
async function uploadBufferToSupabase(buffer: Buffer, index: number): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase не настроен (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
  }
  const supabase = createClient(supabaseUrl, serviceKey);
  const fileName = `${KIE_REF_PREFIX}/${Date.now()}-${index}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from(KIE_REF_BUCKET)
    .upload(fileName, buffer, { contentType: "image/jpeg", upsert: true });
  if (uploadError) {
    throw new Error(`Supabase Storage: ${uploadError.message}`);
  }
  const { data } = supabase.storage.from(KIE_REF_BUCKET).getPublicUrl(fileName);
  return data.publicUrl;
}

async function uploadReferencesToKie(inputs: string[]): Promise<string[]> {
  const uploaded: string[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const source = inputs[i];
    try {
      if (source.startsWith("data:image")) {
        const buffer = await dataUrlToBuffer(source);
        const publicUrl = await uploadBufferToSupabase(buffer, i);
        const kieUrl = await publicUrlToKieUrl(publicUrl, i);
        if (kieUrl) uploaded.push(kieUrl);
        else uploaded.push(publicUrl);
        continue;
      }

      if (source.startsWith("http://") || source.startsWith("https://")) {
        const isLocalhost =
          source.includes("localhost") || source.includes("127.0.0.1");
        if (isLocalhost) {
          const buffer = await downloadAsBuffer(source);
          const publicUrl = await uploadBufferToSupabase(buffer, i);
          const kieUrl = await publicUrlToKieUrl(publicUrl, i);
          if (kieUrl) uploaded.push(kieUrl);
          else uploaded.push(publicUrl);
        } else {
          const kieUrl = await publicUrlToKieUrl(source, i);
          if (kieUrl) uploaded.push(kieUrl);
          else uploaded.push(source);
        }
        continue;
      }
    } catch (e) {
      console.warn("⚠️ [KIE AI] Не удалось подготовить референс:", String(e));
    }
  }
  return uploaded;
}

/**
 * Отдаём KIE публичный URL; они возвращают свой URL для image_input.
 * Если вызов к redpandaai сбрасывается (ECONNRESET), используем переданный publicUrl в image_input.
 */
async function publicUrlToKieUrl(publicUrl: string, index: number): Promise<string | null> {
  const apiKey = getKieAiApiKey();
  const body = JSON.stringify({
    fileUrl: publicUrl,
    uploadPath: "kieai/market",
    fileName: `ref-${Date.now()}-${index}.jpg`,
  });
  for (const baseUrl of KIE_UPLOAD_BASE_URLS) {
    for (let attempt = 0; attempt <= UPLOAD_RETRIES; attempt++) {
      try {
        if (attempt > 0) await sleep(UPLOAD_BACKOFF_MS[attempt - 1] ?? 1500);
        const { statusCode, body: resBody } = await httpsPost(
          `${baseUrl}/api/file-url-upload`,
          Buffer.from(body, "utf8"),
          {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          UPLOAD_TIMEOUT_MS
        );
        if (statusCode !== 200) throw new Error(`HTTP ${statusCode}: ${resBody.slice(0, 200)}`);
        const data = JSON.parse(resBody) as {
          success?: boolean;
          code?: number;
          data?: { downloadUrl?: string; fileUrl?: string; url?: string };
        };
        if (!data?.success || data?.code !== 200) throw new Error((data as { msg?: string })?.msg || "KIE URL upload error");
        const url = data?.data?.downloadUrl || data?.data?.fileUrl || data?.data?.url;
        if (url) return String(url);
      } catch (e) {
        console.warn(
          `⚠️ [KIE AI] file-url-upload attempt ${attempt + 1}/${UPLOAD_RETRIES + 1} via ${baseUrl}:`,
          e instanceof Error ? e.message : String(e)
        );
      }
    }
  }
  return null;
}

/** data URL → Buffer JPEG (KIE: image/jpeg, image/png, image/webp; всегда отдаём JPEG для единообразия). */
async function dataUrlToBuffer(dataUrl: string): Promise<Buffer> {
  if (!dataUrl.startsWith("data:image")) throw new Error("Invalid data URL");
  const comma = dataUrl.indexOf(",");
  if (comma === -1) throw new Error("Invalid data URL");
  const raw = Buffer.from(dataUrl.slice(comma + 1), "base64");
  const resized = raw.length > 400_000
    ? await sharp(raw).rotate().resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()
    : await sharp(raw).rotate().jpeg({ quality: 85 }).toBuffer();
  return resized;
}

/** Скачать URL в буфер (для localhost и т.п.) */
async function downloadAsBuffer(url: string): Promise<Buffer> {
  const response = await fetchWithRetry(url, {});
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/** POST тела через Node https.request (обходим "fetch failed" к kieai.redpandaai.co). */
function httpsPost(
  fullUrl: string,
  body: Buffer,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(fullUrl);
    const opts: https.RequestOptions = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: "POST",
      headers: {
        ...headers,
        "Content-Length": String(body.length),
      },
    };
    const req = https.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () =>
        resolve({
          statusCode: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
        })
      );
      res.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error("Upload timeout"));
    });
    req.write(body);
    req.end();
  });
}

async function fetchWithRetry(
  input: string,
  init: RequestInit,
  retries = 5
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(700 * (attempt + 1));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

