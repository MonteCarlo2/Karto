/**
 * Сервис для генерации описаний товаров через OpenRouter API
 * Использует Claude 4.5 Sonnet через OpenRouter для генерации качественных описаний
 */

// Используем только ключ из окружения (без fallback), чтобы не маскировать проблемы конфигурации
import {
  getNormalizedOpenRouterApiKey,
  getOpenRouterRequestHeaders,
} from "@/lib/openrouter-headers";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Возвращаем исходную рабочую модель
const MODEL = "anthropic/claude-sonnet-4.5";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Генерация описания товара через Claude 3.5 Sonnet на OpenRouter
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
  console.log(`🔄 [СТИЛЬ ${style}] Генерируем описание товара через Claude 4.5 Sonnet на OpenRouter (${styleNames[style]})...`);
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
  
  // Системный промпт для Claude (ТОЧНО ТАК ЖЕ, как в Replicate версии)
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
    
    // Формируем запрос для OpenRouter (совместимый с OpenAI API)
    const requestBody = {
      model: MODEL,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
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
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ [СТИЛЬ ${style}] OpenRouter API error: ${response.status} - ${errorText}`);
          if (response.status === 403 && /Terms Of Service|violation/i.test(errorText)) {
            console.error(
              `[СТИЛЬ ${style}] OpenRouter 403 ToS: проверьте кабинет OpenRouter (лимиты, статус аккаунта), ` +
                `что OPENROUTER_HTTP_REFERER или NEXT_PUBLIC_APP_URL совпадают с URL приложения в настройках OpenRouter; ` +
                `при сохранении ошибки — напишите в поддержку OpenRouter, приложив user_id из ответа.`
            );
          }
          
          // Если это rate limit, пробуем снова
          if (response.status === 429) {
            attempts++;
            const retryAfter = response.headers.get("retry-after");
            const delay = retryAfter ? parseInt(retryAfter) * 1000 : 10000;
            console.log(`⏳ [СТИЛЬ ${style}] Rate limit (429), ждем ${delay/1000}s перед повтором...`);
            await sleep(delay);
            continue;
          }
          
          throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        let content = data?.choices?.[0]?.message?.content;

        // Некоторые модели могут вернуть content массивом частей
        if (Array.isArray(content)) {
          content = content
            .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
            .join("");
        }

        const description = typeof content === "string" ? content.trim() : "";
        if (!description || description.length < 80) {
          throw new Error("OpenRouter вернул пустой/слишком короткий ответ");
        }
        console.log(`✅ [СТИЛЬ ${style}] Описание сгенерировано через Claude 4.5 Sonnet на OpenRouter (${description.length} символов)`);
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
