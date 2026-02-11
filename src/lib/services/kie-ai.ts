/**
 * KIE AI API Service
 * Модель: nano-banana-pro
 * Более дешевая альтернатива Replicate для свободной генерации
 */

// Утилита для задержки
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Получение API ключа KIE AI
 */
function getKieAiApiKey(): string {
  const apiKey = process.env.KIE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("KIE_AI_API_KEY не установлен в .env.local");
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
}): Promise<string> {
  const apiKey = getKieAiApiKey();
  const baseUrl = "https://api.kie.ai";
  
  const requestBody: any = {
    model: "nano-banana-pro",
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

  // Добавляем референсные изображения (до 8 штук)
  if (params.imageInput && params.imageInput.length > 0) {
    // KIE AI принимает только публичные URL (http/https), не base64 и не localhost
    const imageUrls = params.imageInput
      .filter(img => {
        // Принимаем только публичные HTTP/HTTPS URL
        if (img.startsWith("http://") || img.startsWith("https://")) {
          // Проверяем, что это не localhost (KIE AI не сможет получить доступ)
          if (img.includes("localhost") || img.includes("127.0.0.1")) {
            console.warn("⚠️ [KIE AI] Localhost URL не будет доступен для KIE AI:", img);
            return false;
          }
          return true;
        }
        // Отфильтровываем base64 и локальные пути
        if (img.startsWith("data:")) {
          console.warn("⚠️ [KIE AI] Base64 изображение отфильтровано (должно быть конвертировано в URL):", img.substring(0, 50) + "...");
          return false;
        }
        return false;
      })
      .slice(0, 8);
    
    if (imageUrls.length > 0) {
      requestBody.input.image_input = imageUrls;
      console.log(`✅ [KIE AI] Добавлено ${imageUrls.length} референсных изображений (URL):`, imageUrls);
    } else {
      console.warn("⚠️ [KIE AI] Нет доступных URL изображений для отправки в KIE AI");
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

  const response = await fetch(`${baseUrl}/api/v1/jobs/createTask`, {
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
  return taskId;
}

/**
 * Получение информации о задаче и ожидание результата
 */
async function getTaskResult(taskId: string, maxWaitTime: number = 300000): Promise<string> {
  const apiKey = getKieAiApiKey();
  const baseUrl = "https://api.kie.ai";
  const startTime = Date.now();
  const pollInterval = 2000; // Опрашиваем каждые 2 секунды

  console.log("⏳ [KIE AI] Ожидаем результат задачи:", taskId);

  while (Date.now() - startTime < maxWaitTime) {
    const response = await fetch(
      `${baseUrl}/api/v1/jobs/recordInfo?taskId=${taskId}`,
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

/**
 * Генерация изображения через KIE AI (nano-banana-pro)
 */
export async function generateWithKieAi(
  prompt: string,
  imageInput?: string | string[], // Референсное изображение (URL или base64) или массив изображений
  aspectRatio: string = "3:4",
  outputFormat: string = "png"
): Promise<string> {
  console.log("🍌 [KIE AI] Начинаем генерацию через KIE AI...");
  console.log("📝 Промпт:", prompt.substring(0, 150) + "...");
  
  if (imageInput) {
    const count = Array.isArray(imageInput) ? imageInput.length : 1;
    console.log(`🖼️ Референсное изображение: добавлено (${count} шт.)`);
  }

  try {
    // Преобразуем imageInput в массив если нужно
    let imageArray: string[] | undefined;
    if (imageInput) {
      imageArray = Array.isArray(imageInput) ? imageInput : [imageInput];
    }

    // Создаём задачу
    const taskId = await createTask({
      prompt: prompt.trim(),
      aspectRatio,
      outputFormat,
      resolution: "2K", // Используем 2K по умолчанию
      imageInput: imageArray,
    });

    // Ожидаем результат
    const imageUrl = await getTaskResult(taskId);

    console.log("✅ [KIE AI] Генерация завершена успешно");
    return imageUrl;

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
