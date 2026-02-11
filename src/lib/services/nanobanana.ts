/**
 * Nanobanana Pro API Service (через Replicate)
 * Модель: google/nano-banana-pro
 * Генерация продуктовых карточек с идеальным русским текстом
 */

import Replicate from "replicate";

// Утилита для задержки
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Получение клиента Replicate
 */
function getReplicateClient(): Replicate {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error("REPLICATE_API_TOKEN не установлен в .env.local");
  }
  return new Replicate({ auth: token });
}

/**
 * Генерация карточки через Nanobanana Pro на Replicate
 */
export async function generateWithNanobanana(
  prompt: string,
  imageInput?: string | string[], // Референсное изображение (URL или base64) или массив изображений
  aspectRatio: string = "1:1",
  outputFormat: string = "png"
): Promise<string> {
  console.log("🍌 Nanobanana Pro: Начинаем генерацию...");
  console.log("📝 Промпт:", prompt.substring(0, 150) + "...");
  if (imageInput) {
    const count = Array.isArray(imageInput) ? imageInput.length : 1;
    console.log(`🖼️ Референсное изображение: добавлено (${count} шт.)`);
  }
  
  const replicate = getReplicateClient();
  
  const input: Record<string, any> = {
    prompt: prompt,
    aspect_ratio: aspectRatio,
    output_format: outputFormat,
    resolution: "2K",
    safety_filter_level: "block_only_high",
  };
  
  // Добавляем референсное изображение(я) если есть
  if (imageInput) {
    if (Array.isArray(imageInput)) {
      input.image_input = imageInput;
    } else {
      input.image_input = [imageInput];
    }
  }
  
  try {
    console.log("🔧 Параметры запроса:", {
      aspect_ratio: aspectRatio,
      output_format: outputFormat,
      resolution: "2K",
      has_image: !!imageInput,
      prompt_length: prompt.length,
    });
    
    const output = await replicate.run("google/nano-banana-pro", { input });
    
    console.log("✅ Nanobanana Pro: Генерация завершена");
    console.log("📦 Тип output:", typeof output);
    
    // output может быть объектом с url() методом или строкой
    if (output && typeof output === "object") {
      if ("url" in output && typeof (output as any).url === "function") {
        const url = (output as any).url();
        console.log("🔗 URL результата получен");
        return url;
      }
      if ("url" in output && typeof (output as any).url === "string") {
        console.log("🔗 URL результата (строка)");
        return (output as any).url;
      }
    }
    
    // Если это строка (URL)
    if (typeof output === "string") {
      console.log("🔗 URL результата (прямая строка)");
      return output;
    }
    
    console.warn("⚠️ Неожиданный формат output:", output);
    return String(output);
    
  } catch (error: any) {
    console.error("❌ Nanobanana Pro ошибка:", error);
    console.error("📋 Детали ошибки:", {
      message: error.message,
      status: error.status,
      statusText: error.statusText,
      body: error.body,
      stack: error.stack?.substring(0, 500),
    });
    
    // Retry при rate limit
    if (error.message?.includes("429") || error.status === 429) {
      console.log("⏳ Rate limit, ждём 10 секунд...");
      await sleep(10000);
      return generateWithNanobanana(prompt, imageInput, aspectRatio, outputFormat);
    }
    
    // Более информативная ошибка
    const errorMessage = error.message || String(error);
    if (errorMessage.includes("Failed to generate") || errorMessage.includes("multiple retries")) {
      const detailedError = `Модель google/nano-banana-pro временно недоступна или имеет проблемы на стороне Replicate. 
      
Попробуйте:
1. Подождать несколько минут и повторить попытку
2. Проверить статус модели на Replicate
3. Использовать другую модель для генерации

Ошибка от Replicate: ${errorMessage}`;
      throw new Error(detailedError);
    }
    
    throw error;
  }
}

/**
 * Создание промпта для карточки товара
 */
export function buildProductCardPrompt(params: {
  productDescription: string;
  title: string;
  subtitle?: string;
  style?: string;
}): string {
  const { productDescription, title, subtitle, style } = params;
  
  let prompt = `Создай профессиональную карточку товара для маркетплейса.

ТОВАР: ${productDescription}

ТЕКСТ НА ИЗОБРАЖЕНИИ (СТРОГО НА РУССКОМ ЯЗЫКЕ):
- Главный заголовок: "${title}"`;

  if (subtitle) {
    prompt += `
- Подзаголовок: "${subtitle}"`;
  }

  prompt += `

КРИТИЧЕСКИ ВАЖНЫЕ ТРЕБОВАНИЯ К ТЕКСТУ:
- ВСЕ надписи ДОЛЖНЫ быть написаны НА РУССКОМ ЯЗЫКЕ
- Используй КИРИЛЛИЦУ, не латиницу
- Текст "${title}" должен быть виден чётко
- Шрифт крупный, читаемый, профессиональный
- Текст размещён сверху или сбоку, НЕ перекрывает товар

ТРЕБОВАНИЯ К ТОВАРУ:
- Товар изображён точно, без искажений формы
- Пропорции и детали сохранены
- Товар занимает центральное место
- Качественное студийное освещение

СТИЛЬ ОФОРМЛЕНИЯ: ${style || "Чистый профессиональный фон, подходящий для маркетплейса"}

КАЧЕСТВО: Высокое разрешение, готово для Ozon, Wildberries, Яндекс Маркет`;

  return prompt;
}

/**
 * Предустановленные стили
 */
export const CARD_STYLES: Record<string, { name: string; description: string; prompt: string }> = {
  minimal: {
    name: "Минималистичный",
    description: "Чистый фон, акцент на товар",
    prompt: "Минималистичный чистый фон, мягкий градиент от белого к светло-серому, студийное освещение, современный профессиональный вид",
  },
  premium: {
    name: "Премиум",
    description: "Элегантный тёмный стиль",
    prompt: "Премиальный тёмный фон, элегантное драматическое освещение, лёгкие золотистые акценты, люксовый вид",
  },
  lifestyle: {
    name: "Лайфстайл", 
    description: "Натуральная обстановка",
    prompt: "Натуральная деревянная поверхность стола, тёплое мягкое освещение, уютная домашняя атмосфера, лёгкий размытый фон",
  },
  vibrant: {
    name: "Яркий",
    description: "Насыщенные цвета",
    prompt: "Яркий насыщенный градиентный фон (зелёный, синий или фиолетовый), энергичный современный дизайн, динамичное освещение",
  },
  eco: {
    name: "Эко",
    description: "Природные мотивы",
    prompt: "Экологичный стиль, зелёные растения и листья на фоне, натуральные материалы, свежий природный вид",
  },
};
