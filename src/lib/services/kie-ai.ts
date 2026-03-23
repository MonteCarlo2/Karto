import sharp from "sharp";
import https from "https";
import { createClient } from "@supabase/supabase-js";

/**
 * KIE AI API Service
 * image_input — только URL. Референс сначала грузим в Supabase Storage (публичный URL),
 * затем передаём этот URL в KIE file-url-upload (маленький JSON) — KIE сам скачивает файл.
 * Так избегаем ECONNRESET при прямой загрузке большого тела на kieai.redpandaai.co.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
}): Promise<{ taskId: string; referenceCount: number }> {
  const apiKey = getKieAiApiKey();
  
  const requestBody: any = {
    model: "nano-banana-2",
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
  const pollInterval = 1000; // Опрашиваем каждую секунду — быстрее узнаём о готовности (было 2 с)

  console.log("⏳ [KIE AI] Ожидаем результат задачи:", taskId);

  while (Date.now() - startTime < maxWaitTime) {
    const response = await fetch(
      `${KIE_TASK_BASE_URL}/api/v1/jobs/recordInfo?taskId=${taskId}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
        },
      }
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

/**
 * Генерация изображения через KIE AI (nano-banana-2), resolution 4K (свободное творчество, поток, товар, правки).
 */
export async function generateWithKieAi(
  prompt: string,
  imageInput?: string | string[], // URL или data URL; в createTask в image_input уходят только URL
  aspectRatio: string = "3:4",
  outputFormat: string = "png"
): Promise<GenerateWithKieAiResult> {
  console.log("🍌 [KIE AI] Начинаем генерацию через KIE AI...");
  console.log("📝 Промпт:", prompt.substring(0, 150) + "...");
  
  if (imageInput) {
    const count = Array.isArray(imageInput) ? imageInput.length : 1;
    console.log(`🖼️ Референсное изображение: добавлено (${count} шт.)`);
  }

  try {
    let imageArray: string[] | undefined;
    if (imageInput) {
      imageArray = Array.isArray(imageInput) ? imageInput : [imageInput];
    }

    const { taskId, referenceCount } = await createTask({
      prompt: prompt.trim(),
      aspectRatio,
      outputFormat,
      resolution: "4K",
      imageInput: imageArray,
    });

    const imageUrl = await getTaskResult(taskId);

    console.log("✅ [KIE AI] Генерация завершена успешно");
    return { imageUrl, referenceUsed: referenceCount > 0 };

  } catch (error: any) {
    console.error("❌ [KIE AI] Ошибка:", error);
    console.error("📋 Детали ошибки:", {
      message: error.message,
      stack: error.stack?.substring(0, 500),
    });

    // Более информативная ошибка
    const errorMessage = error.message || String(error);
    if (errorMessage.includes("401") || errorMessage.includes("access")) {
      throw new Error("Ошибка авторизации KIE AI. Проверьте KIE_AI_API_KEY в .env.local");
    }
    
    if (errorMessage.includes("429") || errorMessage.includes("rate limit")) {
      throw new Error("Превышен лимит запросов KIE AI. Подождите немного и попробуйте снова.");
    }

    throw new Error(`KIE AI ошибка: ${errorMessage}`);
  }
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

