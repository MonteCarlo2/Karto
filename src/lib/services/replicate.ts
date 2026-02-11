import Replicate from "replicate";

// Функция для получения клиента Replicate
export function getReplicateClient(): Replicate {
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

// Утилита для retry с exponential backoff и обработкой rate limiting
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
      
      // Проверяем, является ли это rate limit (429)
      const isRateLimit = error.status === 429 || 
                          error.message?.includes("429") || 
                          error.message?.includes("throttled") ||
                          error.message?.includes("Too Many Requests");
      
      if (isRateLimit) {
        // Извлекаем retry_after из ответа, если есть
        let retryAfter = baseDelay;
        try {
          if (error.body && typeof error.body === 'string') {
            const body = JSON.parse(error.body);
            if (body.retry_after) {
              retryAfter = body.retry_after * 1000; // конвертируем секунды в миллисекунды
            }
          } else if (error.body?.retry_after) {
            retryAfter = error.body.retry_after * 1000;
          } else if (error.response?.headers?.['retry-after']) {
            retryAfter = parseInt(error.response.headers['retry-after']) * 1000;
          }
        } catch (e) {
          // Если не удалось распарсить, используем exponential backoff
          retryAfter = baseDelay * Math.pow(2, attempt);
        }
        
        // Добавляем небольшую случайную задержку, чтобы избежать одновременных запросов
        const jitter = Math.random() * 2000; // 0-2 секунды
        retryAfter += jitter;
        
        console.log(`⏳ Rate limit (429), ждем ${(retryAfter/1000).toFixed(1)}s перед повтором (попытка ${attempt + 1}/${maxRetries})...`);
        await sleep(retryAfter);
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
 * Получение названий товара через GPT-4o-mini на Replicate (vision)
 * Использует Replicate API вместо прямого OpenAI API (может работать, если OpenAI заблокирован)
 * 
 * ВАЖНО: GPT-4o-mini на Replicate возвращает объект с полем `items` (массив строк)
 */
export async function getProductNamesFromReplicateGPT4oMini(
  imageUrl: string
): Promise<string[]> {
  console.log("🔄 Распознаем товар через GPT-4o-mini (Replicate)...");
  
  const replicate = getReplicateClient();
  
  const userPrompt = `Посмотри на фото товара и напиши 5-7 коротких названий для маркетплейса (Ozon, Wildberries).

КРИТИЧЕСКИ ВАЖНО:
- Только названия товаров, БЕЗ предложений
- Каждое название с новой строки
- БЕЗ нумерации, тире, буллетов
- Максимум 6 слов в названии
- Формат: [Тип товара] [Материал/Цвет/Бренд/Особенность]
- Русский язык

ПРИМЕРЫ ПРАВИЛЬНЫХ НАЗВАНИЙ:
Кружка керамическая с принтом Brawl Stars
Кувшин глиняный декоративный коричневый
Блокнот с обложкой Joyful
Ведро пластиковое черное с ручкой

ЗАПРЕЩЕНО писать предложения типа:
- "Этот предмет - это..."
- "На фото изображен..."
- "Товар представляет собой..."
- "Кружка имеет черный цвет..."

Только названия!`;

  try {
    // Собираем стрим в полный текст
    let fullText = "";
    
    try {
      await withRetry(async () => {
        for await (const event of replicate.stream("openai/gpt-4o-mini" as any, {
          input: {
            messages: [
              {
                role: "system",
                content: "Ты помощник для маркетплейсов. Твоя задача - смотреть на фото товара и давать ТОЛЬКО короткие названия товаров (5-7 вариантов), каждое с новой строки. НИКАКИХ предложений, описаний или объяснений. Только названия в формате: [Тип] [Материал/Цвет/Бренд]. Максимум 6 слов."
              },
              {
                role: "user",
                content: [
                  {
                    type: "image_url",
                    image_url: {
                      url: imageUrl,
                      detail: "auto"
                    }
                  },
                  {
                    type: "text",
                    text: userPrompt
                  }
                ]
              }
            ],
            temperature: 0.2,
            max_completion_tokens: 300,
          },
        })) {
          // Собираем все части стрима
          if (typeof event === "string") {
            fullText += event;
          } else if (Array.isArray(event)) {
            fullText += event.join("");
          } else if (event && typeof event === "object") {
            // Если это объект, пытаемся извлечь текст
            if ("text" in event) fullText += String(event.text);
            else if ("content" in event) fullText += String(event.content);
            else if ("delta" in event && event.delta && typeof event.delta === "object" && "content" in event.delta) {
              fullText += String(event.delta.content);
            } else {
              fullText += String(event);
            }
          }
        }
      });
    } catch (error: any) {
      // Обрабатываем ошибку квоты - возвращаем пустой массив для fallback на другие модели
      const errorMessage = String(error?.message || error || "");
      const errorString = JSON.stringify(error || {});
      
      if (
        errorMessage.includes("insufficient_quota") ||
        errorMessage.includes("quota") ||
        errorString.includes("insufficient_quota") ||
        error?.error?.code === "insufficient_quota" ||
        error?.code === "insufficient_quota"
      ) {
        console.warn("⚠️ GPT-4o-mini (Replicate): закончилась квота, переключаемся на альтернативные модели");
        return [];
      }
      
      // Для других ошибок - пробрасываем дальше
      throw error;
    }

    console.log("📝 Полный текст ответа GPT-4o-mini:", fullText);

    if (!fullText || fullText.trim().length === 0) {
      console.warn("⚠️ Пустой ответ от GPT-4o-mini");
      return [];
    }

    // Строгий парсинг: разбиваем по строкам и фильтруем
    const reject = (line: string): boolean => {
      if (!line || line.length < 3 || line.length > 60) return true;
      
      // Отсекаем предложения (начинаются с типичных фраз)
      if (/^(Этот|Данный|Он|Она|Оно|На фото|На изображении|Кубок имеет|Продукт|Товар|Изображен|Показан|Виден|Это|Этот предмет|Данный товар)\s/i.test(line)) return true;
      
      // Отсекаем предложения (содержат глаголы описания)
      if (/(представляет собой|является|имеет черный|имеет логотип|сделан из|предназначен|также имеет| и изображение| и логотип|украшена|украшен|стоит|которая|который|— это|это )/i.test(line)) return true;
      
      // Отсекаем обрывки предложений
      if (/^[а-яА-ЯёЁ]+ [а-яА-ЯёЁ]+ — (это|это )/i.test(line)) return true;
      
      // Отсекаем если содержит "красивая", "красивый" в начале (часть предложения)
      if (/^(красивая|красивый|красивое)\s/i.test(line)) return true;
      
      return false;
    };

    const lines = fullText
      .split(/\n+/)
      .map(line => {
        // Убираем нумерацию, тире, буллеты в начале
        return line.replace(/^[\d.\-•*)\]\s]+/, "").trim();
      })
      .filter(line => {
        if (reject(line)) return false;
        return true;
      })
      .slice(0, 7); // Берём максимум 7

    console.log("✅ Извлечённые названия:", lines);
    
    if (lines.length === 0) {
      console.warn("⚠️ Не удалось извлечь названия из ответа GPT-4o-mini");
      return [];
    }
    
    return lines;
  } catch (e: any) {
    // Обрабатываем ошибку квоты - возвращаем пустой массив для fallback
    const errorMessage = String(e?.message || e || "");
    const errorString = JSON.stringify(e || {});
    
    if (
      errorMessage.includes("insufficient_quota") ||
      errorMessage.includes("quota") ||
      errorString.includes("insufficient_quota") ||
      e?.error?.code === "insufficient_quota" ||
      e?.code === "insufficient_quota"
    ) {
      console.warn("⚠️ GPT-4o-mini (Replicate): закончилась квота, переключаемся на альтернативные модели");
      return [];
    }
    
    console.error("❌ GPT-4o-mini (Replicate) failed:", e);
    return [];
  }
}

/**
 * Получение названий товара через Claude 4 Sonnet на Replicate (vision)
 * Используется как вторая попытка после GPT-4o-mini
 */
export async function getProductNamesFromReplicateClaude(
  imageUrl: string
): Promise<string[]> {
  console.log("🔄 Распознаем товар через Claude 4 Sonnet (Replicate)...");
  console.log("📸 URL изображения:", imageUrl.substring(0, 50) + "...");
  
  const replicate = getReplicateClient();
  
  const userPrompt = `Посмотри на фото товара и напиши 5-7 коротких названий для маркетплейса (Ozon, Wildberries).

КРИТИЧЕСКИ ВАЖНО:
- Только названия товаров, БЕЗ предложений
- Каждое название с новой строки
- БЕЗ нумерации, тире, буллетов
- Максимум 6 слов в названии
- Формат: [Тип товара] [Материал/Цвет/Бренд/Особенность]
- Русский язык

ПРИМЕРЫ ПРАВИЛЬНЫХ НАЗВАНИЙ:
Кружка керамическая с принтом Brawl Stars
Кувшин глиняный декоративный коричневый
Блокнот с обложкой Joyful
Ведро пластиковое черное с ручкой

ЗАПРЕЩЕНО писать предложения типа:
- "Этот предмет - это..."
- "На фото изображен..."
- "Товар представляет собой..."
- "Кружка имеет черный цвет..."

Только названия!`;

  const systemPrompt = "Ты помощник для маркетплейсов. Твоя задача - смотреть на фото товара и давать ТОЛЬКО короткие названия товаров (5-7 вариантов), каждое с новой строки. НИКАКИХ предложений, описаний или объяснений. Только названия в формате: [Тип] [Материал/Цвет/Бренд]. Максимум 6 слов.";

  try {
    // Собираем стрим в полный текст
    let fullText = "";
    
    try {
      console.log("🚀 Начинаем вызов Claude 4 Sonnet через Replicate...");
      console.log("📋 Промпт:", userPrompt.substring(0, 100) + "...");
      console.log("🖼️ Изображение:", imageUrl.substring(0, 80) + "...");
      
      await withRetry(async () => {
        for await (const event of replicate.stream("anthropic/claude-4-sonnet" as any, {
          input: {
            prompt: userPrompt,
            system_prompt: systemPrompt,
            image: imageUrl,
          },
        })) {
          // Собираем все части стрима
          if (typeof event === "string") {
            fullText += event;
          } else if (Array.isArray(event)) {
            fullText += event.join("");
          } else if (event && typeof event === "object") {
            // Если это объект, пытаемся извлечь текст
            if ("text" in event) fullText += String(event.text);
            else if ("content" in event) fullText += String(event.content);
            else if ("delta" in event && event.delta && typeof event.delta === "object" && "content" in event.delta) {
              fullText += String(event.delta.content);
            } else if ("type" in event && event.type === "content_block_delta" && "delta" in event && event.delta && typeof event.delta === "object" && "text" in event.delta) {
              fullText += String(event.delta.text);
            } else {
              fullText += String(event);
            }
          }
        }
      });
      console.log("✅ Стрим от Claude завершён успешно");
    } catch (error: any) {
      // Обрабатываем ошибку - возвращаем пустой массив для fallback на другие модели
      const errorMessage = String(error?.message || error || "");
      const errorString = JSON.stringify(error || {});
      
      console.error("❌ Claude 4 Sonnet (Replicate) failed:", errorMessage);
      console.error("📋 Детали ошибки:", errorString);
      return [];
    }

    console.log("📝 Полный текст ответа Claude 4 Sonnet:", fullText);

    if (!fullText || fullText.trim().length === 0) {
      console.warn("⚠️ Пустой ответ от Claude 4 Sonnet");
      return [];
    }

    // Строгий парсинг: разбиваем по строкам и фильтруем (такой же как у GPT-4o-mini)
    const reject = (line: string): boolean => {
      if (!line || line.length < 3 || line.length > 60) return true;
      
      // Отсекаем предложения (начинаются с типичных фраз)
      if (/^(Этот|Данный|Он|Она|Оно|На фото|На изображении|Кубок имеет|Продукт|Товар|Изображен|Показан|Виден|Это|Этот предмет|Данный товар)\s/i.test(line)) return true;
      
      // Отсекаем предложения (содержат глаголы описания)
      if (/(представляет собой|является|имеет черный|имеет логотип|сделан из|предназначен|также имеет| и изображение| и логотип|украшена|украшен|стоит|которая|который|— это|это )/i.test(line)) return true;
      
      // Отсекаем обрывки предложений
      if (/^[а-яА-ЯёЁ]+ [а-яА-ЯёЁ]+ — (это|это )/i.test(line)) return true;
      
      // Отсекаем если содержит "красивая", "красивый" в начале (часть предложения)
      if (/^(красивая|красивый|красивое)\s/i.test(line)) return true;
      
      return false;
    };

    const lines = fullText
      .split(/\n+/)
      .map(line => {
        // Убираем нумерацию, тире, буллеты в начале
        return line.replace(/^[\d.\-•*)\]\s]+/, "").trim();
      })
      .filter(line => {
        if (reject(line)) return false;
        return true;
      })
      .slice(0, 7); // Берём максимум 7

    console.log("✅ Извлечённые названия от Claude:", lines);
    
    if (lines.length === 0) {
      console.warn("⚠️ Не удалось извлечь названия из ответа Claude 4 Sonnet");
      return [];
    }
    
    return lines;
  } catch (e: any) {
    console.error("❌ Claude 4 Sonnet (Replicate) failed:", e);
    return [];
  }
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
 * Генерация 5–7 коротких названий для маркетплейса по текстовому описанию товара.
 * Использует Llama 3 70B (Replicate) — лучше следует инструкциям, чем Mistral 7B.
 */
export async function generateProductNamesFromDescription(
  description: string
): Promise<string[]> {
  if (!description || description.length < 10) return [];

  const replicate = getReplicateClient();
  const prompt = `Задача: по описанию товара напиши от 5 до 7 коротких названий для Ozon или Wildberries.

ПРАВИЛА:
- СТРОГО только названия, каждое с новой строки
- Без нумерации, тире, буллетов, точек
- Максимум 6 слов в каждом названии
- Формат: тип товара + ключевые признаки (материал, цвет, бренд, назначение)
- Русский язык
- НЕ пиши предложения типа "Ваза имеет...", "Она стоит...", "Этот предмет..."

Примеры правильных названий:
Кружка керамическая с принтом Brawl Stars
Ваза декоративная керамическая коричневая
Кубок для кофе стеклянный черный

Описание товара: ${description.slice(0, 500)}

Названия (только названия, по одному на строку):`;

  // Пробуем модели по порядку: Llama 3 8B → Llama 3 70B → Mixtral 8x7B → Mistral 7B
  // Используем правильный формат API согласно документации Replicate
  const models: Array<{ 
    id: string; 
    tokens: number; 
    temp: number;
    usePromptTemplate?: boolean;
  }> = [
    { 
      id: "meta/meta-llama-3-8b-instruct", 
      tokens: 400, 
      temp: 0.1,
      usePromptTemplate: true // Llama 3 требует специальный формат
    },
    { 
      id: "meta/meta-llama-3-70b-instruct", 
      tokens: 400, 
      temp: 0.1,
      usePromptTemplate: true
    },
    { 
      id: "mistralai/mixtral-8x7b-instruct-v0.1", 
      tokens: 400, 
      temp: 0.15 
    },
    { 
      id: "mistralai/mistral-7b-instruct-v0.2", 
      tokens: 350, 
      temp: 0.2 
    },
  ];

  for (const model of models) {
    try {
      const systemPrompt = "Ты помощник для генерации коротких названий товаров для маркетплейсов. Отвечай только названиями, без предложений.";
      
      let input: any = {
        prompt: prompt,
        max_new_tokens: model.tokens,
        temperature: model.temp,
      };

      // Для Llama 3 нужен специальный prompt_template
      if (model.usePromptTemplate) {
        input.prompt_template = "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n{system_prompt}<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n{prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n";
        input.system_prompt = systemPrompt;
      }

      const out = await replicate.run(model.id as any, { input });
      
      // Обрабатываем результат (может быть строка или массив)
      let text: string;
      if (Array.isArray(out)) {
        text = out.join("");
      } else if (typeof out === "object" && out !== null) {
        // Если это стрим или объект, пытаемся извлечь текст
        text = String(out);
      } else {
        text = String(out);
      }
      
      const names = parseNamesFromText(text);
      if (names.length > 0) {
        console.log(`✅ Названия получены через ${model.id}`);
        return names;
      }
    } catch (e) {
      console.warn(`${model.id} failed:`, e);
      continue;
    }
  }
  return [];
}

/** Очень жёсткий парсер: отсекает любые предложения, оставляет только названия. */
function parseNamesFromText(text: string): string[] {
  const reject = (s: string) => {
    if (!s || s.length < 3 || s.length > 55) return true;
    // Начинается с местоимений/описательных слов
    if (/^(Этот|Данный|Он|Она|Оно|На фото|Кубок имеет|Продукт|Товар —|Изображен|Показан|Виден)\s/i.test(s)) return true;
    // Содержит глаголы и описательные фразы (признак предложения)
    if (/(представляет собой|является|имеет (черный|коричневый|высоту|логотип|цвет|два|высокую)|стоит на|украшена|украшен|сделан из|предназначен|также имеет| и изображение| и логотип| и украшена| цвет и| столе, который| примерно| которая| который| которая|— это|— это )/i.test(s)) return true;
    // Заканчивается на запятую или начинается с "и" (часть предложения)
    if (/,$/.test(s) || /^и /i.test(s)) return true;
    return false;
  };
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^[\d.\-•*)\]]+\s*/, "").trim())
    .filter((l) => l && !reject(l))
    .slice(0, 7);
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

/**
 * Генерация описания товара через Claude 4.5 Sonnet на Replicate
 * Генерирует естественные, профессиональные описания как от копирайтера
 */
export async function generateProductDescription(
  productName: string,
  userPreferences: string = "",
  selectedBlocks: string[] = [],
  photoUrl?: string,
  style: 1 | 2 | 3 | 4 = 1,
  wantsStickers: boolean = false,
  baseDescription?: string
): Promise<string> {
  const styleNames = { 1: "Официальный", 2: "Продающий", 3: "Структурированный", 4: "Сбалансированный" };
  console.log(`🔄 [СТИЛЬ ${style}] Генерируем описание товара через Claude 4.5 Sonnet (${styleNames[style]})...`);
  console.log(`🔄 [СТИЛЬ ${style}] Товар: "${productName}"`);
  
  const replicate = getReplicateClient();
  console.log(`🔄 [СТИЛЬ ${style}] Replicate клиент получен, начинаем streaming...`);
  
  // Определяем стиль описания
  const stylePrompts = {
    1: "Официальный/технический: фокус на фактах и характеристиках, но без сухости. Естественный язык, как будто эксперт рассказывает о товаре.",
    2: "Продающий/эмоциональный: покажи выгоды и преимущества, но без инфоцыганства. Честно и убедительно, как хороший продавец в магазине.",
    3: "Структурированный: четкая организация, списки и акценты, но не шаблонно. Как профессиональный обзор от реального пользователя.",
    4: "Сбалансированный: комбинация всех элементов. Естественный рассказ о товаре, как будто друг рекомендует что-то хорошее.",
  };
  
  const styleDescription = stylePrompts[style];
  
  // Формируем список выбранных блоков
  const blocksText = selectedBlocks.length > 0
    ? `\nОбязательно включи в описание:\n${selectedBlocks.map(b => `- ${b}`).join("\n")}`
    : "";
  
  // Системный промпт для Claude
  const systemPrompt = `Ты профессиональный копирайтер для маркетплейсов. Твоя задача - писать описания товаров так, как пишет опытный копирайтер-человек.

КРИТИЧЕСКИ ВАЖНО:
- Пиши как человек, а не как шаблон. Используй естественный язык, живые формулировки.
- Будь честным и убедительным, но НЕ инфоцыгань. Никаких "РЕВОЛЮЦИОННЫХ ПРОРЫВОВ", "ЕДИНСТВЕННЫХ В СВОЕМ РОДЕ", "МЕНЯЕТ ЖИЗНЬ".
- Не используй громкие слоганы и клише типа "качество премиум", "невероятная выгода", "лучшее предложение".
- Не пиши так, будто продаёшь плохой товар. Будь уверенным, но не навязчивым.
- Фокус на реальных преимуществах и характеристиках, поданных интересно.
- Используй конкретику, примеры использования, реальные сценарии.
- Структура должна быть естественной, не шаблонной "характеристики-преимущества-комплектация".
- Пиши так, чтобы покупатель захотел купить, но не чувствовал себя обманутым.

Стиль: профессиональный, но живой. Как хороший продавец, который знает товар и честно о нём рассказывает.`;

  // wantsStickers передается как параметр функции (из чипа "Стикеры/эмодзи" на первом экране)

  // Формируем промпт для пользователя
  const baseTextBlock = baseDescription
    ? `Исходный текст (перепиши его, строго учитывая все правки):\n\"\"\"\n${baseDescription}\n\"\"\"`
    : "";

  const userPrompt = `Напиши описание товара для маркетплейса (Ozon, Wildberries).

Товар: ${productName}
${userPreferences ? `Пожелания: ${userPreferences}` : ""}
${blocksText}
${baseTextBlock ? `\n${baseTextBlock}\n` : ""}

Стиль: ${styleDescription}

КРИТИЧЕСКИ ВАЖНО ПО ФОРМАТИРОВАНИЮ:
- НИКОГДА не используй markdown-хэштеги (# или ##) в тексте
- Для заголовков используй просто текст с двоеточием в конце (например: "Характеристики:" или "Для кого подойдёт:")
- Для списков используй простые символы: дефис (-) или точка с запятой (•)
- НЕ используй символы → или другие сложные символы в списках - они могут не отображаться в Ozon
- Между абзацами оставляй пустую строку для лучшей читаемости
- Используй естественные переносы строк

${wantsStickers ? `ВАЖНО: Добавь простые эмодзи (стикеры) в описание где это уместно. Используй: ✓, ★, 🎁, ❤️, 🔥, ✨\n- Используй их умеренно, но обязательно включи несколько в текст\n- Размещай их там, где это улучшает восприятие (например, ✓ перед преимуществами, ★ для акцентов, 🎁 для подарков)` : `- БЕЗ эмодзи и стикеров (если не указано иное в пожеланиях)`}

Требования:
- 200-500 слов
- Естественный язык, как от копирайтера-человека
- Без шаблонов и клише
- Без громких слоганов
- Честно и убедительно
- Русский язык
- Живой, интересный текст, не сухой

Напиши описание:`;

  try {
    let fullText = "";
    
    // Используем Claude 4.5 Sonnet через Replicate
    // Claude использует простой формат: prompt (без system_prompt отдельно)
    const finalPrompt = `${systemPrompt}\n\n${userPrompt}`;
    
    try {
      console.log(`🔄 [СТИЛЬ ${style}] Запускаем streaming запрос к Replicate...`);
      console.log(`🔄 [СТИЛЬ ${style}] Длина промпта: ${finalPrompt.length} символов`);
      
      // Claude 4.5 Sonnet через Replicate использует streaming
      // Оборачиваем создание стрима в withRetry для обработки rate limiting
      let stream: any;
      let streamAttempts = 0;
      const maxStreamAttempts = 5;
      
      while (streamAttempts < maxStreamAttempts) {
        try {
          console.log(`🔄 [СТИЛЬ ${style}] Создаем streaming объект (попытка ${streamAttempts + 1}/${maxStreamAttempts})...`);
          stream = replicate.stream("anthropic/claude-4.5-sonnet" as any, {
            input: {
              prompt: finalPrompt,
            },
          });
          console.log(`🔄 [СТИЛЬ ${style}] Streaming объект создан успешно!`);
          break; // Успешно создан
        } catch (streamError: any) {
          streamAttempts++;
          const isRateLimit = streamError.status === 429 || 
                              streamError.message?.includes("429") || 
                              streamError.message?.includes("throttled") ||
                              streamError.message?.includes("Too Many Requests");
          
          if (isRateLimit && streamAttempts < maxStreamAttempts) {
            // Извлекаем retry_after из ошибки
            let retryAfter = 10000; // 10 секунд по умолчанию
            try {
              if (streamError.body && typeof streamError.body === 'string') {
                const body = JSON.parse(streamError.body);
                if (body.retry_after) {
                  retryAfter = body.retry_after * 1000;
                }
              } else if (streamError.body?.retry_after) {
                retryAfter = streamError.body.retry_after * 1000;
              }
            } catch (e) {
              // Используем значение по умолчанию
            }
            
            // Добавляем jitter для разных стилей
            const jitter = (style - 1) * 1000 + Math.random() * 2000;
            retryAfter += jitter;
            
            console.log(`⏳ [СТИЛЬ ${style}] Rate limit (429), ждем ${(retryAfter/1000).toFixed(1)}s перед повтором (попытка ${streamAttempts}/${maxStreamAttempts})...`);
            await sleep(retryAfter);
            continue;
          }
          
          // Если не rate limit или попытки закончились - пробрасываем ошибку
          throw streamError;
        }
      }
      
      if (!stream) {
        throw new Error(`[СТИЛЬ ${style}] Не удалось создать streaming после ${maxStreamAttempts} попыток`);
      }
      
      console.log(`🔄 [СТИЛЬ ${style}] Streaming объект создан, начинаем итерацию...`);
      
      let eventCount = 0;
      try {
        for await (const event of stream) {
          eventCount++;
          if (eventCount === 1) {
            console.log(`🔄 [СТИЛЬ ${style}] ✅ Получено первое событие стрима!`);
          }
          if (eventCount % 10 === 0) {
            console.log(`🔄 [СТИЛЬ ${style}] Получено ${eventCount} событий, текущая длина текста: ${fullText.length}`);
          }
          // Собираем все части стрима
          if (typeof event === "string") {
            fullText += event;
          } else if (Array.isArray(event)) {
            fullText += event.join("");
          } else if (event && typeof event === "object") {
            if ("text" in event) fullText += String(event.text);
            else if ("content" in event) fullText += String(event.content);
            else if ("delta" in event && event.delta && typeof event.delta === "object" && "content" in event.delta) {
              fullText += String(event.delta.content);
            } else {
              fullText += String(event);
            }
          }
        }
      } catch (streamError: any) {
        console.error(`❌ [СТИЛЬ ${style}] Ошибка при обработке стрима (получено ${eventCount} событий):`, streamError?.message || streamError);
        console.error(`❌ [СТИЛЬ ${style}] Stack trace:`, streamError?.stack);
        throw streamError;
      }
      
      console.log(`🔄 [СТИЛЬ ${style}] Стрим завершен. Получено ${eventCount} событий. Обрабатываем результат...`);
      const description = fullText.trim();
      
      if (!description || description.length < 50) {
        console.warn(`⚠️ [СТИЛЬ ${style}] Описание слишком короткое (${description.length} символов), возвращаем базовое`);
        return `Описание товара "${productName}". Качественный товар для ваших нужд.`;
      }
      
      console.log(`✅ [СТИЛЬ ${style}] Описание сгенерировано через Claude 4.5 Sonnet (${description.length} символов)`);
      return description;
      
    } catch (error: any) {
      const errorMessage = String(error?.message || error || "");
      console.error("❌ Ошибка генерации через Claude:", errorMessage);
      console.error("❌ Stack trace:", error?.stack);
      throw error;
    }
    
  } catch (error: any) {
    const errorMessage = String(error?.message || error || "");
    console.error("❌ Ошибка генерации описания:", errorMessage);
    console.error("❌ Stack trace:", error?.stack);
    throw error;
  }
}
