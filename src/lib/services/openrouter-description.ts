/**
 * Сервис для генерации описаний товаров через OpenRouter API
 * Использует Qwen 2.5 72B Instruct через OpenRouter для генерации качественных описаний
 */

// Используем только ключ из окружения (без fallback), чтобы не маскировать проблемы конфигурации
import {
  getNormalizedOpenRouterApiKey,
  getOpenRouterRequestHeaders,
} from "@/lib/openrouter-headers";
import { normalizeDescriptionLayout } from "@/lib/utils/marketplace-formatter";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Основная модель для описаний (OpenRouter id). */
function getPrimaryDescriptionModel(): string {
  return (process.env.OPENROUTER_DESCRIPTION_MODEL || "").trim() || "qwen/qwen-2.5-72b-instruct";
}

/**
 * При 403 «Terms of Service» через OpenRouter — вторая попытка с этой моделью.
 * Пустая строка в env = отключить fallback.
 */
function getFallbackDescriptionModel(primary: string): string | null {
  const raw = process.env.OPENROUTER_DESCRIPTION_FALLBACK_MODEL;
  if (raw !== undefined && raw.trim() === "") return null;
  const fb = (raw || "").trim() || primary;
  return fb === primary ? null : fb;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Удаляем markdown-заголовки (#, ##, ###...), которые иногда возвращает модель
 * несмотря на инструкции в промпте.
 */
function sanitizeDescriptionOutput(text: string): string {
  return normalizeDescriptionLayout(text);
}

async function readDescriptionFromOpenRouterResponse(
  response: Response,
  style: number
): Promise<string> {
  const data = await response.json();
  let content = data?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    content = content
      .map((part: { text?: string }) => (typeof part?.text === "string" ? part.text : ""))
      .join("");
  }
  const description = typeof content === "string" ? content.trim() : "";
  if (!description || description.length < 80) {
    throw new Error("OpenRouter вернул пустой/слишком короткий ответ");
  }
  return sanitizeDescriptionOutput(description);
}

/**
 * Генерация описания товара через OpenRouter
 * Полностью сохраняет функционал и промпты из Replicate версии
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
  const primaryModel = getPrimaryDescriptionModel();
  console.log(
    `🔄 [СТИЛЬ ${style}] Генерируем описание через OpenRouter, модель ${primaryModel} (${styleNames[style]})...`
  );
  console.log(`🔄 [СТИЛЬ ${style}] Товар: "${productName}"`);
  
  // Определяем стиль описания (ТОЧНО ТАК ЖЕ, как в Replicate версии)
  const stylePrompts = {
    1: "Официальный/технический: фокус на фактах и характеристиках, но без сухости. Естественный язык, как будто эксперт рассказывает о товаре.",
    2: "Продающий/эмоциональный: покажи выгоды и преимущества, но без инфоцыганства. Честно и убедительно, как хороший продавец в магазине.",
    3: "Структурированный: четкая организация, списки и акценты, но не шаблонно. Как профессиональный обзор от реального пользователя.",
    4: "Сбалансированный: комбинация всех элементов. Естественный рассказ о товаре, как будто друг рекомендует что-то хорошее.",
  };
  
  const styleDescription = stylePrompts[style];
  
  // Формируем список выбранных блоков (ТОЧНО ТАК ЖЕ)
  const blocksText = selectedBlocks.length > 0
    ? `\nОбязательно включи в описание:\n${selectedBlocks.map(b => `- ${b}`).join("\n")}`
    : "";
  
  // Системный промпт (ТОЧНО ТАК ЖЕ, как в Replicate версии)
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

  // Формируем промпт для пользователя (ТОЧНО ТАК ЖЕ)
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
    if (!getNormalizedOpenRouterApiKey()) {
      throw new Error("OPENROUTER_API_KEY не настроен или пустой после нормализации");
    }
    console.log(`🔄 [СТИЛЬ ${style}] Запускаем запрос к OpenRouter...`);
    console.log(`🔄 [СТИЛЬ ${style}] Длина промпта: ${userPrompt.length} символов`);
    
    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ];

    const requestBodyBase = {
      messages,
      stream: false,
      temperature: 0.7,
      max_tokens: 2000,
    };

    // Делаем запрос с retry логикой
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
      try {
        console.log(`🔄 [СТИЛЬ ${style}] Запрос к OpenRouter (попытка ${attempts + 1}/${maxAttempts})...`);
        
        const response = await fetch(OPENROUTER_API_URL, {
          method: "POST",
          headers: getOpenRouterRequestHeaders("KARTO - Product Description Generator"),
          body: JSON.stringify({ ...requestBodyBase, model: primaryModel }),
        });

        if (!response.ok) {
          let errorText = await response.text();
          let lastStatus = response.status;
          let lastResponse = response;
          const is403Tos =
            lastStatus === 403 && /Terms Of Service|violation/i.test(errorText);
          const fallbackModel = getFallbackDescriptionModel(primaryModel);

          if (is403Tos && fallbackModel) {
            console.warn(
              `⚠️ [СТИЛЬ ${style}] Модель ${primaryModel} отклонена (403 ToS). Повтор с fallback: ${fallbackModel}`
            );
            const responseFb = await fetch(OPENROUTER_API_URL, {
              method: "POST",
              headers: getOpenRouterRequestHeaders("KARTO - Product Description Generator"),
              body: JSON.stringify({ ...requestBodyBase, model: fallbackModel }),
            });
            if (responseFb.ok) {
              const description = await readDescriptionFromOpenRouterResponse(responseFb, style);
              console.log(
                `✅ [СТИЛЬ ${style}] Описание через fallback ${fallbackModel} (${description.length} символов)`
              );
              return description;
            }
            errorText = await responseFb.text();
            lastStatus = responseFb.status;
            lastResponse = responseFb;
            console.error(
              `❌ [СТИЛЬ ${style}] Fallback ${fallbackModel}: ${responseFb.status} - ${errorText}`
            );
          }

          console.error(`❌ [СТИЛЬ ${style}] OpenRouter API error: ${lastStatus} - ${errorText}`);
          if (lastStatus === 403 && /Terms Of Service|violation/i.test(errorText)) {
            console.error(
              `[СТИЛЬ ${style}] 403 ToS: задайте OPENROUTER_DESCRIPTION_MODEL или проверьте кабинет OpenRouter.`
            );
          }

          if (lastStatus === 429) {
            attempts++;
            const retryAfter = lastResponse.headers.get("retry-after");
            const delay = retryAfter ? parseInt(retryAfter) * 1000 : 10000;
            console.log(`⏳ [СТИЛЬ ${style}] Rate limit (429), ждем ${delay / 1000}s перед повтором...`);
            await sleep(delay);
            continue;
          }

          throw new Error(`OpenRouter API error: ${lastStatus} - ${errorText}`);
        }

        const description = await readDescriptionFromOpenRouterResponse(response, style);
        console.log(
          `✅ [СТИЛЬ ${style}] Описание сгенерировано (${primaryModel}, ${description.length} символов)`
        );
        return description;
      } catch (requestError: any) {
        attempts++;
        const isRateLimit = String(requestError?.message || "").includes("429");
        const isLastAttempt = attempts >= maxAttempts;
        if (!isLastAttempt && isRateLimit) {
          const delay = 5000 * attempts;
          console.log(`⏳ [СТИЛЬ ${style}] Повтор после rate limit через ${delay/1000}с...`);
          await sleep(delay);
          continue;
        }
        if (!isLastAttempt) {
          const delay = 1500 * attempts;
          console.log(`⏳ [СТИЛЬ ${style}] Повтор через ${delay/1000}с из-за ошибки...`);
          await sleep(delay);
          continue;
        }
        throw requestError;
      }
    }

    throw new Error(`[СТИЛЬ ${style}] Не удалось получить ответ от OpenRouter после ${maxAttempts} попыток`);

  } catch (error: any) {
    const errorMessage = String(error?.message || error || "");
    console.error(`❌ [СТИЛЬ ${style}] Ошибка генерации через OpenRouter:`, errorMessage);
    console.error(`❌ [СТИЛЬ ${style}] Stack trace:`, error?.stack);
    throw error;
  }
}
