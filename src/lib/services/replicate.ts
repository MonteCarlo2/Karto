import Replicate from "replicate";

// Функция для получения клиента Replicate
function getReplicateClient(): Replicate {
  const token = process.env.REPLICATE_API_TOKEN;
  
  if (!token) {
    throw new Error("REPLICATE_API_TOKEN не установлен в .env.local");
  }
  
  console.log("🔑 Replicate токен найден:", token.substring(0, 10) + "...");
  
  return new Replicate({
    auth: token,
  });
}

// Утилита для задержки
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Утилита для retry с exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 5000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Если это rate limit (429), ждем и пробуем снова
      if (error.message?.includes("429") || error.message?.includes("throttled")) {
        const delay = baseDelay * Math.pow(2, attempt); // 5s, 10s, 20s
        console.log(`⏳ Rate limit, ждем ${delay/1000}s перед повтором (попытка ${attempt + 1}/${maxRetries})...`);
        await sleep(delay);
        continue;
      }
      
      // Другие ошибки - пробрасываем сразу
      throw error;
    }
  }
  
  throw lastError;
}

/**
 * Удаление фона с изображения (сегментация)
 * Использует модель rembg
 */
export async function removeBackground(imageUrl: string): Promise<string> {
  console.log("🔄 Начинаем удаление фона...");
  
  const replicate = getReplicateClient();
  
  const output = await withRetry(async () => {
    return await replicate.run(
      "cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003",
      {
        input: {
          image: imageUrl,
        },
      }
    );
  });

  console.log("✅ Фон удален успешно");
  return String(output);
}

/**
 * Улучшение качества изображения
 * Использует Real-ESRGAN для апскейла
 */
export async function enhanceImage(imageUrl: string, scale: number = 2): Promise<string> {
  console.log("🔄 Улучшаем качество изображения...");
  
  // Ждем 6 секунд перед следующим запросом (rate limit)
  console.log("⏳ Ждем 6 секунд (rate limit)...");
  await sleep(6000);
  
  const replicate = getReplicateClient();
  
  const output = await withRetry(async () => {
    return await replicate.run(
      "nightmareai/real-esrgan:f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa",
      {
        input: {
          image: imageUrl,
          scale: scale,
          face_enhance: false,
        },
      }
    );
  });

  console.log("✅ Качество улучшено");
  return String(output);
}

/**
 * Генерация фона для товара
 * Использует Stable Diffusion XL
 */
export async function generateBackground(
  prompt: string,
  width: number = 1024,
  height: number = 1024
): Promise<string> {
  console.log("🔄 Генерируем фон...");
  
  // Ждем 6 секунд перед запросом (rate limit для аккаунтов < $5)
  console.log("⏳ Ждем 6 секунд (rate limit)...");
  await sleep(6000);
  
  const replicate = getReplicateClient();
  
  const output = await withRetry(async () => {
    return await replicate.run(
      "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
      {
        input: {
          prompt: prompt,
          negative_prompt: "product, object, item, text, watermark, logo, blurry, distorted",
          width: width,
          height: height,
          num_outputs: 1,
          scheduler: "K_EULER",
          num_inference_steps: 25, // Уменьшил для скорости
          guidance_scale: 7.5,
        },
      }
    );
  });

  console.log("✅ Фон сгенерирован");
  
  // SDXL возвращает массив URL
  if (Array.isArray(output) && output.length > 0) {
    return String(output[0]);
  }
  return String(output);
}

/**
 * Распознавание товара на изображении
 * Использует LLaVA для анализа
 */
export async function recognizeProduct(imageUrl: string): Promise<string> {
  console.log("🔄 Распознаем товар...");
  
  // Ждем перед запросом
  console.log("⏳ Ждем 6 секунд (rate limit)...");
  await sleep(6000);
  
  const replicate = getReplicateClient();
  
  const output = await withRetry(async () => {
    return await replicate.run(
      "yorickvp/llava-13b:80537f9eead1a5bfa72d5ac6ea6414379be41d4d4f6679fd776e9535d1eb58bb",
      {
        input: {
          image: imageUrl,
          prompt: "Describe this product in detail. What is it? What are its main characteristics, materials, colors, and features? Answer in Russian language.",
          max_tokens: 500,
        },
      }
    );
  });

  console.log("✅ Товар распознан");
  
  if (Array.isArray(output)) {
    return output.join("");
  }
  return String(output);
}

/**
 * Inpainting - заменяем фон, оставляя продукт нетронутым
 * Использует SDXL Inpainting
 */
export async function inpaintBackground(
  imageUrl: string,
  maskUrl: string,
  prompt: string,
  width: number = 1024,
  height: number = 1024
): Promise<string> {
  console.log("🔄 Inpainting фона...");
  
  // Ждем 6 секунд перед запросом (rate limit)
  console.log("⏳ Ждем 6 секунд (rate limit)...");
  await sleep(6000);
  
  const replicate = getReplicateClient();
  
  const output = await withRetry(async () => {
    return await replicate.run(
      "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
      {
        input: {
          prompt: prompt,
          image: imageUrl,
          mask: maskUrl,
          negative_prompt: "product, object, item, text, watermark, logo, blurry, distorted, low quality, deformed",
          width: width,
          height: height,
          num_outputs: 1,
          scheduler: "K_EULER",
          num_inference_steps: 30,
          guidance_scale: 7.5,
          prompt_strength: 0.95, // Высокая сила для полной замены фона
        },
      }
    );
  });

  console.log("✅ Inpainting завершен");
  
  if (Array.isArray(output) && output.length > 0) {
    return String(output[0]);
  }
  return String(output);
}

/**
 * Генерация названия и описания товара
 */
export async function generateProductText(
  productDescription: string,
  category?: string
): Promise<{ title: string; description: string }> {
  console.log("🔄 Генерируем текст для товара...");
  
  // Ждем перед запросом
  console.log("⏳ Ждем 6 секунд (rate limit)...");
  await sleep(6000);
  
  const replicate = getReplicateClient();
  
  const prompt = `На основе описания товара создай:
1. SEO-оптимизированное название для маркетплейса (до 100 символов)
2. Продающее описание товара (200-500 символов)

Описание товара: ${productDescription}
${category ? `Категория: ${category}` : ""}

Ответь строго в формате JSON:
{
  "title": "название товара",
  "description": "описание товара"
}`;

  const output = await withRetry(async () => {
    return await replicate.run(
      "meta/llama-2-70b-chat:02e509c789964a7ea8736978a43525956ef40397be9033abf9fd2badfe68c9e3",
      {
        input: {
          prompt: prompt,
          max_tokens: 800,
          temperature: 0.7,
        },
      }
    );
  });

  // Объединяем ответ в строку
  let responseText: string;
  if (Array.isArray(output)) {
    responseText = output.join("");
  } else {
    responseText = String(output);
  }
  
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log("✅ Текст сгенерирован");
      return parsed;
    }
  } catch (e) {
    console.error("Ошибка парсинга JSON:", e);
  }

  return {
    title: "Товар",
    description: productDescription,
  };
}
