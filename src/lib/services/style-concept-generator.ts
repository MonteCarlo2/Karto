/**
 * Сервис для генерации дизайн-концепций через OpenRouter API
 * Использует GPT-5-mini для создания уникальных стилей и композиций
 *
 * ВАЖНО: OpenRouter часто возвращает JSON с ошибками (trailing comma, обрезанный ответ).
 * Парсинг ответа должен оставаться устойчивым: repair (trailing comma), извлечение
 * по скобкам, разбиение по "},\s*{", дополнение до 4 концепций через createFallbackConcept.
 * Не удалять эти слои восстановления и не бросать ошибку при частично валидном ответе.
 */

import {
  getNormalizedOpenRouterApiKey,
  getOpenRouterRequestHeaders,
} from "@/lib/openrouter-headers";

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
  if (!getNormalizedOpenRouterApiKey()) {
    throw new Error("OPENROUTER_API_KEY не настроен или пустой после нормализации");
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

Верни ТОЛЬКО валидный JSON: один массив ровно из 4 объектов. У каждого объекта поля: style, composition, colors, mood, textPresentation (все строки). Обязательно закрой каждый объект фигурной скобкой }, массив — квадратной ]. Никакого markdown и никакого текста до или после JSON. Ответ должен парситься JSON.parse от начала до конца.`;

  const userMessage = `Товар: ${safeProductName}${safeUserPrompt ? `\nПожелания: ${safeUserPrompt}` : ""}\n\nОтветь только валидным JSON-массивом из 4 объектов с полями style, composition, colors, mood, textPresentation. Без markdown.`;

  console.log("🔵 [OpenRouter] ========== НАЧАЛО ГЕНЕРАЦИИ КОНЦЕПЦИЙ ==========");
  console.log("🔵 [OpenRouter] Товар:", productName);
  console.log("🔵 [OpenRouter] Пожелания:", userPrompt || "нет");
  console.log("🔵 [OpenRouter] System Prompt (первые 300 символов):", systemPrompt.substring(0, 300) + "...");
  console.log("🔵 [OpenRouter] User Message (первые 300 символов):", userMessage.substring(0, 300) + "...");
  console.log("🔵 [OpenRouter] API URL:", OPENROUTER_API_URL);
  
  try {
    const responseFormat = {
      type: "json_schema",
      json_schema: {
        name: "design_concepts",
        strict: true,
        schema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              style: { type: "string" },
              composition: { type: "string" },
              colors: { type: "string" },
              mood: { type: "string" },
              textPresentation: { type: "string" },
            },
            required: ["style", "composition", "colors", "mood"],
            additionalProperties: false,
          },
          minItems: 4,
          maxItems: 4,
        },
      },
    };

    const buildBody = (withSchema: boolean): Record<string, unknown> => ({
      model: "openai/gpt-5-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.9,
      max_tokens: 4096, // 4 детальные концепции — при 2000 ответ обрезался, JSON был невалидный
      ...(withSchema ? { response_format: responseFormat } : {}),
    });

    const headers = getOpenRouterRequestHeaders("KARTO - Product Card Generator");

    let response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(buildBody(true)),
    });

    if (response.status === 400) {
      const errText = await response.text();
      const retryWithoutSchema = /response_format|json_schema|structured|schema/i.test(errText);
      if (retryWithoutSchema) {
        console.warn("⚠️ [OpenRouter] Модель не поддерживает response_format, повтор без схемы");
        response = await fetch(OPENROUTER_API_URL, {
          method: "POST",
          headers,
          body: JSON.stringify(buildBody(false)),
        });
      }
      if (!response.ok) {
        throw new Error(`OpenRouter API error (400): ${errText.substring(0, 300)}`);
      }
    } else if (!response.ok) {
      const errorText = await response.text().catch(() => "не удалось прочитать");
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
    
    let content: string;
    const rawContent = data.choices[0]?.message?.content;
    if (rawContent == null) {
      console.warn("⚠️ [OpenRouter] Нет контента в ответе — используем fallback-концепции");
      return createFallbackConcepts(safeProductName, safeUserPrompt);
    }
    if (typeof rawContent === "string") {
      content = rawContent;
    } else if (Array.isArray(rawContent)) {
      content = rawContent.map((p: any) => p?.text ?? p?.content ?? "").join("");
    } else {
      content = String(rawContent);
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
      
      // Пытаемся починить типичные ошибки LLM (trailing comma, лишние запятые)
      const tryRepairJson = (raw: string): string => {
        return raw
          .replace(/,(\s*)}/g, "$1}")  // trailing comma перед }
          .replace(/,(\s*)]/g, "$1]"); // trailing comma перед ]
      };
      let jsonToParse = jsonContent;
      
      // Пробуем распарсить как JSON
      let parsed: any;
      try {
        parsed = JSON.parse(jsonToParse);
      } catch (_) {
        jsonToParse = tryRepairJson(jsonContent);
        try {
          parsed = JSON.parse(jsonToParse);
          console.log("🔵 [OpenRouter] JSON распарсен после исправления trailing comma");
        } catch (__) {
          // оставляем jsonToParse для восстановления ниже
        }
      }
      
      if (parsed === undefined) {
        // Если парсинг так и не удался, пробуем восстановить по объектам
        console.warn("⚠️ [OpenRouter] Первая попытка парсинга не удалась, пытаемся восстановить JSON...");
        jsonToParse = jsonToParse || jsonContent;
        
        // Пытаемся найти все валидные объекты в массиве
        const objects: string[] = [];
        let currentObject = "";
        let braceCount = 0;
        let inString = false;
        let escapeNext = false;
        
        for (let i = 0; i < jsonToParse.length; i++) {
          const char = jsonToParse[i];
          
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
          // Альтернатива: разбить по "},\s*{" и попытаться распарсить каждый фрагмент
          const arrayStart = jsonToParse.indexOf("[");
          const arrayEnd = jsonToParse.lastIndexOf("]");
          const inner = arrayStart >= 0 && arrayEnd > arrayStart
            ? jsonToParse.slice(arrayStart + 1, arrayEnd)
            : jsonToParse;
          const parts = inner.split(/\}\s*,\s*\{/);
          const repaired: string[] = [];
          for (let i = 0; i < parts.length; i++) {
            let block = parts[i].trim();
            if (!block.startsWith("{")) block = "{" + block;
            if (!block.endsWith("}")) block = block + "}";
            try {
              JSON.parse(block);
              repaired.push(block);
            } catch {
              // пропускаем битый фрагмент
            }
          }
          if (repaired.length > 0) {
            console.log(`🔵 [OpenRouter] Восстановлено ${repaired.length} объектов через разбиение по запятым`);
            parsed = repaired.map(s => JSON.parse(s));
          } else {
            console.warn("⚠️ [OpenRouter] Не найдено ни одного валидного объекта — используем fallback-концепции");
            concepts = createFallbackConcepts(safeProductName, safeUserPrompt);
            return concepts.slice(0, 4);
          }
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
        console.warn("⚠️ [OpenRouter] Неожиданный формат ответа — используем fallback-концепции");
        concepts = createFallbackConcepts(safeProductName, safeUserPrompt);
      }
    } catch (parseError: any) {
      console.warn("⚠️ [OpenRouter] Ошибка парсинга JSON — используем fallback-концепции. Ошибка:", parseError?.message);
      concepts = createFallbackConcepts(safeProductName, safeUserPrompt);
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
    console.warn("⚠️ [OpenRouter] Ошибка при генерации концепций — возвращаем fallback. Причина:", error?.message || String(error));
    return createFallbackConcepts(safeProductName, safeUserPrompt);
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
