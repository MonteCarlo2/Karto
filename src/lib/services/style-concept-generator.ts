/**
 * Сервис для генерации дизайн-концепций через OpenRouter API
 * Использует GPT-5-mini для создания уникальных стилей и композиций
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface DesignConcept {
  style: string;           // Описание стиля фона и общего дизайна
  composition: string;     // Концепция композиции (размещение товара и текста)
  colors: string;          // Цветовая гамма
  mood: string;            // Настроение и атмосфера
  textPresentation?: string; // Креативный способ отображения текста и преимуществ
}

/**
 * Генерация 4 уникальных дизайн-концепций для карточек товара
 * 
 * @param productName - Название товара
 * @param userPrompt - Пожелания пользователя к стилю (если есть)
 * @returns Массив из 4 уникальных концепций
 */
export async function generateDesignConcepts(
  productName: string,
  userPrompt?: string
): Promise<DesignConcept[]> {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY не настроен в .env.local");
  }
  console.log("🔵 [OpenRouter] ========== ФУНКЦИЯ ВЫЗВАНА ==========");
  
  // Ограничиваем длину параметров для избежания ошибок
  const safeProductName = productName.substring(0, 200);
  const safeUserPrompt = userPrompt ? userPrompt.substring(0, 200) : undefined;
  
  console.log("🔵 [OpenRouter] productName:", safeProductName);
  console.log("🔵 [OpenRouter] userPrompt:", safeUserPrompt || "нет");
  
  const systemPrompt = `Ты — дизайнер карточек товаров для маркетплейсов. Создай 4 уникальных дизайн-концепции для товара. Все 4 должны ПОДХОДИТЬ товару по тематике и месту использования.

Правила:
- Определи категорию товара и где он используется. Размещение товара — логичное (гладильная доска — пол/подставка; ведро — пол/полка; кашпо — подоконник/полка/стол). В composition НЕ указывай наклон/ориентацию товара.
- Поля: style (материалы фона, текстуры, освещение), composition (где товар и текст, перспектива), colors (конкретная палитра), mood (атмосфера), textPresentation (как показать преимущества — бейджи, плашки, иконки; не добавляй новый текст).
- Концепции различаются: разный стиль, композиция, цвета, mood, подача текста. Каждая — профессиональная и детализированная.
${safeUserPrompt ? " Учти пожелания пользователя в 4 вариациях." : ""}

Верни ТОЛЬКО JSON-массив из 4 объектов с полями: style, composition, colors, mood, textPresentation. Без markdown.`;

  const userMessage = `Товар: ${safeProductName}${safeUserPrompt ? `\nПожелания: ${safeUserPrompt}` : ""}\n\nВерни JSON-массив ровно из 4 объектов: style, composition, colors, mood, textPresentation. Без markdown.`;

  console.log("🔵 [OpenRouter] ========== НАЧАЛО ГЕНЕРАЦИИ КОНЦЕПЦИЙ ==========");
  console.log("🔵 [OpenRouter] Товар:", productName);
  console.log("🔵 [OpenRouter] Пожелания:", userPrompt || "нет");
  console.log("🔵 [OpenRouter] System Prompt (первые 300 символов):", systemPrompt.substring(0, 300) + "...");
  console.log("🔵 [OpenRouter] User Message (первые 300 символов):", userMessage.substring(0, 300) + "...");
  console.log("🔵 [OpenRouter] API Key (первые 20 символов):", OPENROUTER_API_KEY?.substring(0, 20) + "...");
  console.log("🔵 [OpenRouter] API URL:", OPENROUTER_API_URL);
  
  try {
    const requestBody = {
      model: "openai/gpt-5-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
      temperature: 0.9,
      max_tokens: 2000, // Достаточно для 4 концепций; меньше — быстрее ответ OpenRouter
    };

    console.log("🔵 [OpenRouter] Отправляю запрос к OpenRouter API...");
    console.log("🔵 [OpenRouter] URL:", OPENROUTER_API_URL);
    console.log("🔵 [OpenRouter] Model:", requestBody.model);
    console.log("🔵 [OpenRouter] Request body keys:", Object.keys(requestBody));
    console.log("🔵 [OpenRouter] System prompt length:", systemPrompt.length);
    console.log("🔵 [OpenRouter] User message length:", userMessage.length);

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://karto.app",
        "X-Title": "KARTO - Product Card Generator", // Только ASCII символы
      },
      body: JSON.stringify(requestBody),
    });

    console.log("🔵 [OpenRouter] Получен ответ, статус:", response.status);

    if (!response.ok) {
      let errorText: string;
      try {
        errorText = await response.text();
      } catch (e) {
        errorText = `Не удалось прочитать ответ: ${e}`;
      }
      console.error("❌ [OpenRouter] API Error:", response.status);
      console.error("❌ [OpenRouter] Error details:", errorText);
      console.error("❌ [OpenRouter] Request body (первые 500 символов):", JSON.stringify(requestBody).substring(0, 500));
      
      // Если это ошибка 400, возможно проблема с промптом
      if (response.status === 400) {
        throw new Error(`OpenRouter API error (400): Возможно проблема с промптом или параметрами запроса. Детали: ${errorText.substring(0, 200)}`);
      }
      
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText.substring(0, 500)}`);
    }

    let data: any;
    try {
      const responseText = await response.text();
      console.log("🔵 [OpenRouter] Сырой ответ (первые 500 символов):", responseText.substring(0, 500));
      
      try {
        data = JSON.parse(responseText);
        console.log("🔵 [OpenRouter] Ответ распарсен, структура:", Object.keys(data));
        console.log("🔵 [OpenRouter] Полный ответ:", JSON.stringify(data, null, 2));
      } catch (parseError: any) {
        console.error("❌ [OpenRouter] Ошибка парсинга JSON ответа:", parseError);
        console.error("❌ [OpenRouter] Полный текстовый ответ:", responseText);
        throw new Error(`OpenRouter вернул невалидный JSON: ${parseError.message}. Ответ: ${responseText.substring(0, 500)}`);
      }
    } catch (textError: any) {
      console.error("❌ [OpenRouter] Ошибка чтения ответа:", textError);
      throw new Error(`Не удалось прочитать ответ от OpenRouter: ${textError.message}`);
    }
    
    // Проверяем структуру ответа
    if (!data) {
      console.error("❌ [OpenRouter] Ответ пустой");
      throw new Error("OpenRouter вернул пустой ответ");
    }
    
    console.log("🔵 [OpenRouter] Проверка структуры ответа...");
    console.log("🔵 [OpenRouter] data.choices существует?", !!data.choices);
    console.log("🔵 [OpenRouter] data.choices - массив?", Array.isArray(data.choices));
    console.log("🔵 [OpenRouter] data.choices.length:", data.choices?.length);
    
    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      console.error("❌ [OpenRouter] Неожиданная структура ответа. Полный ответ:", JSON.stringify(data, null, 2));
      throw new Error(`OpenRouter вернул неожиданную структуру ответа. Ожидается data.choices[]. Структура: ${JSON.stringify(Object.keys(data))}`);
    }
    
    console.log("🔵 [OpenRouter] data.choices[0]:", data.choices[0]);
    console.log("🔵 [OpenRouter] data.choices[0].message:", data.choices[0]?.message);
    console.log("🔵 [OpenRouter] data.choices[0].message.content:", data.choices[0]?.message?.content);
    
    const content = data.choices[0]?.message?.content;

    if (!content) {
      console.error("❌ [OpenRouter] Нет контента в ответе. Полный ответ:", JSON.stringify(data, null, 2));
      throw new Error(`OpenRouter не вернул контент. Проверьте модель и параметры запроса. Структура ответа: ${JSON.stringify(Object.keys(data))}`);
    }

    console.log("🔵 [OpenRouter] Контент получен, длина:", content.length);
    console.log("🔵 [OpenRouter] Первые 200 символов:", content.substring(0, 200));

    // Парсим JSON ответ
    let concepts: DesignConcept[];
    
    try {
      // Извлекаем JSON из ответа (может быть обернут в markdown код)
      let jsonContent = content.trim();
      
      // Убираем markdown код блоки, если есть
      if (jsonContent.startsWith("```")) {
        const lines = jsonContent.split("\n");
        jsonContent = lines.slice(1, -1).join("\n").trim();
      }
      
      // Убираем "json" из начала, если есть
      if (jsonContent.startsWith("json")) {
        jsonContent = jsonContent.substring(4).trim();
      }
      
      // Проверяем, не обрезан ли JSON (неполный ответ)
      if (!jsonContent.endsWith("}") && !jsonContent.endsWith("]")) {
        console.warn("⚠️ [OpenRouter] JSON ответ может быть обрезан (не заканчивается на } или ])");
        console.warn("⚠️ [OpenRouter] Последние 200 символов:", jsonContent.substring(Math.max(0, jsonContent.length - 200)));
        
        // Пытаемся найти последний валидный JSON объект в массиве
        // Ищем последнюю закрывающую скобку массива
        const lastBracketIndex = jsonContent.lastIndexOf("]");
        if (lastBracketIndex > 0) {
          jsonContent = jsonContent.substring(0, lastBracketIndex + 1);
          console.log("🔵 [OpenRouter] Обрезан JSON до последней закрывающей скобки массива");
        } else {
          // Если нет закрывающей скобки, пытаемся найти последний валидный объект
          const lastBraceIndex = jsonContent.lastIndexOf("}");
          if (lastBraceIndex > 0) {
            // Ищем начало массива
            const arrayStart = jsonContent.indexOf("[");
            if (arrayStart >= 0) {
              jsonContent = jsonContent.substring(arrayStart, lastBraceIndex + 1) + "]";
              console.log("🔵 [OpenRouter] Восстановлен JSON массив из последнего объекта");
            }
          }
        }
      }
      
      // Пробуем распарсить как JSON
      let parsed: any;
      try {
        parsed = JSON.parse(jsonContent);
      } catch (firstParseError: any) {
        // Если первая попытка не удалась, пробуем восстановить JSON
        console.warn("⚠️ [OpenRouter] Первая попытка парсинга не удалась, пытаемся восстановить JSON...");
        
        // Пытаемся найти все валидные объекты в массиве
        const objects: string[] = [];
        let currentObject = "";
        let braceCount = 0;
        let inString = false;
        let escapeNext = false;
        
        for (let i = 0; i < jsonContent.length; i++) {
          const char = jsonContent[i];
          
          if (escapeNext) {
            escapeNext = false;
            currentObject += char;
            continue;
          }
          
          if (char === "\\") {
            escapeNext = true;
            currentObject += char;
            continue;
          }
          
          if (char === '"') {
            inString = !inString;
            currentObject += char;
            continue;
          }
          
          if (!inString) {
            if (char === "{") {
              braceCount++;
              currentObject += char;
            } else if (char === "}") {
              braceCount--;
              currentObject += char;
              if (braceCount === 0 && currentObject.trim()) {
                // Проверяем, валиден ли объект
                try {
                  JSON.parse(currentObject);
                  objects.push(currentObject);
                } catch (e) {
                  // Игнорируем невалидные объекты
                }
                currentObject = "";
              }
            } else {
              currentObject += char;
            }
          } else {
            currentObject += char;
          }
        }
        
        if (objects.length > 0) {
          console.log(`🔵 [OpenRouter] Найдено ${objects.length} валидных объектов, создаем массив`);
          parsed = objects.map(obj => JSON.parse(obj));
        } else {
          throw firstParseError;
        }
      }
      
      // Если это объект с ключом "concepts" или массив
      if (Array.isArray(parsed)) {
        concepts = parsed;
      } else if (parsed.concepts && Array.isArray(parsed.concepts)) {
        concepts = parsed.concepts;
      } else if (parsed.concept1 && parsed.concept2) {
        // Если концепции в отдельных ключах
        concepts = [
          parsed.concept1,
          parsed.concept2,
          parsed.concept3,
          parsed.concept4,
        ].filter(Boolean);
      } else {
        throw new Error("Неожиданный формат ответа");
      }
    } catch (parseError: any) {
      console.error("❌ [OpenRouter] Ошибка парсинга JSON!");
      console.error("❌ [OpenRouter] Полный контент (первые 1000 символов):", content.substring(0, 1000));
      console.error("❌ [OpenRouter] Полный контент (последние 500 символов):", content.substring(Math.max(0, content.length - 500)));
      console.error("❌ [OpenRouter] Parse error:", parseError);
      // НЕ используем fallback - пробрасываем ошибку дальше
      throw new Error(`Не удалось распарсить ответ от OpenRouter: ${parseError.message}. Контент (первые 500 символов): ${content.substring(0, 500)}`);
    }

    // Проверяем, что получили 4 концепции
    if (concepts.length < 4) {
      console.warn(`⚠️ [OpenRouter] Получено только ${concepts.length} концепций, дополняем до 4`);
      while (concepts.length < 4) {
        concepts.push(createFallbackConcept(productName, concepts.length, userPrompt));
      }
    }

    console.log("✅ [OpenRouter] Успешно сгенерировано", concepts.length, "концепций");
    concepts.forEach((c, i) => {
      console.log(`  Концепция ${i + 1}:`, {
        style: c.style.substring(0, 60) + "...",
        mood: c.mood,
      });
    });

    // Ограничиваем до 4
    return concepts.slice(0, 4);

  } catch (error: any) {
    console.error("❌ [OpenRouter] КРИТИЧЕСКАЯ ОШИБКА генерации концепций!");
    console.error("❌ [OpenRouter] Error:", error);
    console.error("❌ [OpenRouter] Error message:", error.message);
    console.error("❌ [OpenRouter] Error stack:", error.stack);
    // НЕ используем fallback - пробрасываем ошибку, чтобы было видно проблему
    throw new Error(`Ошибка генерации концепций через OpenRouter: ${error.message || String(error)}`);
  }
}

/**
 * Создание fallback концепций, если API не сработало
 */
function createFallbackConcepts(
  productName: string,
  userPrompt?: string
): DesignConcept[] {
  const baseStyle = userPrompt 
    ? `Стиль на основе пожеланий пользователя: ${userPrompt}. Дополни: градиенты, текстуры, декоративные элементы.`
    : "Современный профессиональный стиль с продуманным дизайном.";

  return [
    {
      style: `${baseStyle} Классическая композиция: товар по центру, текст сверху.`,
      composition: "Товар размещен по центру карточки, занимает 50-60% площади. Текст размещен сверху, не перекрывает товар.",
      colors: "Нейтральная палитра с акцентными цветами. Контрастные цвета для текста.",
      mood: "Профессиональный, надежный, премиальный",
    },
    {
      style: `${baseStyle} Асимметричная композиция: динамичное размещение элементов.`,
      composition: "Товар смещен в одну сторону (например, влево), занимает 40-50% площади. Текст размещен с противоположной стороны.",
      colors: "Смелая цветовая гамма с контрастами. Яркие акценты.",
      mood: "Динамичный, современный, энергичный",
      textPresentation: "Градиентные плашки с текстом, размещенные по диагонали",
    },
    {
      style: `${baseStyle} Минималистичная композиция: много свободного пространства.`,
      composition: "Товар аккуратно размещен, много свободного пространства вокруг. Текст размещен элегантно, не перегружает композицию.",
      colors: "Светлая палитра, пастельные тона. Мягкие контрасты.",
      mood: "Элегантный, минималистичный, утонченный",
      textPresentation: "Минималистичные текстовые блоки с декоративными элементами",
    },
    {
      style: `${baseStyle} Яркая композиция: смелое размещение, запоминающийся дизайн.`,
      composition: "Смелое размещение товара и текста. Экспериментальная композиция с интересными углами и расположением.",
      colors: "Яркая, насыщенная палитра. Смелые контрасты и акценты.",
      mood: "Яркий, запоминающийся, креативный",
      textPresentation: "Текстовые блоки с геометрическими формами и яркими акцентами",
    },
  ];
}

/**
 * Создание одной fallback концепции
 */
function createFallbackConcept(
  productName: string,
  index: number,
  userPrompt?: string
): DesignConcept {
  const variations = [
    {
      style: "Современный технологичный стиль с геометрическими элементами",
      composition: "Товар по центру, текст сверху",
      colors: "Темная палитра с неоновыми акцентами",
      mood: "Футуристический, технологичный",
      textPresentation: "Геометрические текстовые блоки с неоновыми акцентами",
    },
    {
      style: "Уютный домашний стиль с натуральными материалами",
      composition: "Товар слева, текст справа",
      colors: "Теплые тона, натуральные цвета",
      mood: "Уютный, домашний, теплый",
      textPresentation: "Текстовые плашки в стиле натуральных материалов",
    },
    {
      style: "Премиальный стиль с элегантным фоном",
      composition: "Товар по центру, текст внизу",
      colors: "Роскошная палитра, золотые акценты",
      mood: "Премиальный, роскошный, элегантный",
      textPresentation: "Элегантные бейджи с золотыми акцентами",
    },
    {
      style: "Динамичный стиль с энергичной композицией",
      composition: "Товар в прямом положении по центру, текст динамично размещен",
      colors: "Яркие, насыщенные цвета",
      mood: "Энергичный, динамичный, современный",
      textPresentation: "Яркие градиентные плашки с динамичным размещением",
    },
  ];

  const base = variations[index % variations.length];
  const userStyle = userPrompt ? ` С учетом пожеланий: ${userPrompt}.` : "";

  return {
    style: base.style + userStyle,
    composition: base.composition,
    colors: base.colors,
    mood: base.mood,
    textPresentation: base.textPresentation,
  };
}
