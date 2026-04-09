import { NextRequest, NextResponse } from "next/server";
import { generateProductDescription } from "@/lib/services/openrouter-description";

// Допускаем долгий ответ (4 параллельных запроса к OpenRouter), чтобы не обрывать по таймауту
export const maxDuration = 120;

function messageWhenAllOpenRouterVariantsFailed(reason: unknown): {
  error: string;
  hint?: string;
} {
  const msg = String((reason as Error)?.message || reason || "");
  if (/403/.test(msg) && /Terms Of Service/i.test(msg)) {
    return {
      error:
        "OpenRouter отклонил основную модель описаний (403, чаще у anthropic/*). В актуальной версии должен сработать автоматический fallback на другую модель; если видите это сообщение — обновите деплой или задайте OPENROUTER_DESCRIPTION_MODEL / OPENROUTER_DESCRIPTION_FALLBACK_MODEL.",
      hint:
        "Старого ключа в репозитории нет: используется только OPENROUTER_API_KEY с сервера. Проверьте кабинет openrouter.ai и при необходимости поддержку (user_id в логах).",
    };
  }
  if (/401/.test(msg)) {
    return {
      error:
        "Ключ OpenRouter не принят (401). Проверьте OPENROUTER_API_KEY на хостинге: полная строка sk-or-v1-… без кавычек и пробелов по краям.",
    };
  }
  return {
    error: "OpenRouter временно недоступен или вернул ошибку. Описания не сгенерированы.",
    hint: msg.length > 0 ? msg.slice(0, 280) : undefined,
  };
}

/**
 * Генерация 4 вариантов описания товара через OpenRouter (Claude)
 * ВАЖНО: Все операции через серверный API route для безопасности
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      product_name,
      photo_url,
      user_preferences = "",
      selected_blocks = [],
      wants_stickers = false,
    } = body;

    // Валидация
    if (!product_name) {
      return NextResponse.json(
        { error: "product_name обязателен" },
        { status: 400 }
      );
    }

    console.log("🔄 Генерируем 4 варианта описания для:", product_name);
    console.log("⚡ Запускаем все 4 запроса ПАРАЛЛЕЛЬНО через OpenRouter (без задержек!)...");

    // Генерируем 4 варианта ПАРАЛЛЕЛЬНО через OpenRouter
    // OpenRouter поддерживает параллельные запросы без проблем с rate limiting
    const generateVariant = async (style: number, styleName: string) => {
      const startTime = Date.now();
      console.log(`🔄 [${style}/4] ⚡ ЗАПУСК генерации варианта "${styleName}" (параллельно с другими через OpenRouter)...`);
      try {
        const result = await generateProductDescription(
          product_name,
          user_preferences,
          selected_blocks,
          photo_url,
          style as 1 | 2 | 3 | 4,
          wants_stickers,
          undefined
        );
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ [${style}/4] Вариант "${styleName}" успешно сгенерирован за ${duration}с (${result.length} символов)`);
        return result;
      } catch (error: any) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.error(`❌ [${style}/4] Ошибка генерации варианта "${styleName}" после ${duration}с:`, error?.message || error);
        console.error(`❌ [${style}/4] Stack trace:`, error?.stack);
        // Пробрасываем ошибку дальше, чтобы Promise.allSettled мог её обработать
        throw error;
      }
    };

    // Запускаем все 4 варианта ПАРАЛЛЕЛЬНО — быстрее в ~4 раза, качество то же (промпты не трогаем)
    const startTime = Date.now();
    console.log(`⚡ Запускаем 4 запроса ПАРАЛЛЕЛЬНО через OpenRouter...`);

    const descriptionTasks: Array<[1 | 2 | 3 | 4, string]> = [
      [1, "Официальный"],
      [2, "Продающий"],
      [3, "Структурированный"],
      [4, "Сбалансированный"],
    ];
    const results = await Promise.allSettled(
      descriptionTasks.map(([style, styleName]) => generateVariant(style, styleName))
    );
    const descriptions: PromiseSettledResult<string>[] = results;

    console.log(`📊 Promise.allSettled завершен. Получено результатов: ${descriptions.length}`);
    descriptions.forEach((result, index) => {
      if (result.status === "fulfilled") {
        console.log(`✅ Результат ${index + 1}: fulfilled, длина: ${result.value?.length || 0}`);
      } else {
        console.log(`❌ Результат ${index + 1}: rejected, ошибка: ${result.reason?.message || result.reason}`);
      }
    });

    const rejectedCount = descriptions.filter((r) => r.status === "rejected").length;
    if (rejectedCount === descriptions.length) {
      const firstError = descriptions.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      const { error: errText, hint } = messageWhenAllOpenRouterVariantsFailed(firstError?.reason);
      return NextResponse.json(
        {
          error: errText,
          hint,
          details:
            process.env.NODE_ENV === "development"
              ? String(firstError?.reason?.message || firstError?.reason || "")
              : undefined,
        },
        { status: 502 }
      );
    }
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`📊 Все 4 запроса завершены за ${totalTime}с. Обрабатываем результаты...`);

    // Обрабатываем результаты
    const processedDescriptions = descriptions.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        const error = result.reason;
        console.error(`❌ Обработка ошибки для варианта ${index + 1}:`, error);
        console.error(`❌ Детали ошибки:`, error?.message, error?.stack);
        
        // Возвращаем fallback описание
        const fallbacks = [
          `Описание товара "${product_name}". Официальный стиль с акцентом на характеристики и технические детали.`,
          `Описание товара "${product_name}". Продающий стиль с акцентом на преимущества и выгоды для покупателя.`,
          `Описание товара "${product_name}". Структурированный стиль с четкой организацией информации.`,
          `Описание товара "${product_name}". Сбалансированный стиль, сочетающий все элементы описания.`,
        ];
        console.warn(`⚠️ Используем fallback для варианта ${index + 1}`);
        return fallbacks[index];
      }
    });

    // Проверяем, что все описания сгенерированы
    const validDescriptions = processedDescriptions.filter(d => d && d.trim().length > 0);
    console.log(`📊 Сгенерировано ${validDescriptions.length} из 4 описаний`);
    
    if (validDescriptions.length < 4) {
      console.warn(`⚠️ Не все описания сгенерированы! Получено: ${validDescriptions.length}, ожидалось: 4`);
      processedDescriptions.forEach((desc, index) => {
        if (!desc || desc.trim().length === 0) {
          console.error(`❌ Описание ${index + 1} пустое или не сгенерировано`);
        }
      });
    }

    const variants = [
      {
        id: 1,
        style: "Официальный",
        description: processedDescriptions[0] || `Описание товара "${product_name}". Официальный стиль с акцентом на характеристики и технические детали.`,
        preview: (processedDescriptions[0] || "").substring(0, 150) + (processedDescriptions[0]?.length > 150 ? "..." : ""),
      },
      {
        id: 2,
        style: "Продающий",
        description: processedDescriptions[1] || `Описание товара "${product_name}". Продающий стиль с акцентом на преимущества и выгоды для покупателя.`,
        preview: (processedDescriptions[1] || "").substring(0, 150) + (processedDescriptions[1]?.length > 150 ? "..." : ""),
      },
      {
        id: 3,
        style: "Структурированный",
        description: processedDescriptions[2] || `Описание товара "${product_name}". Структурированный стиль с четкой организацией информации.`,
        preview: (processedDescriptions[2] || "").substring(0, 150) + (processedDescriptions[2]?.length > 150 ? "..." : ""),
      },
      {
        id: 4,
        style: "Сбалансированный",
        description: processedDescriptions[3] || `Описание товара "${product_name}". Сбалансированный стиль, сочетающий все элементы описания.`,
        preview: (processedDescriptions[3] || "").substring(0, 150) + (processedDescriptions[3]?.length > 150 ? "..." : ""),
      },
    ];

    console.log("✅ Все 4 варианта описания готовы (включая fallback при необходимости)");

    return NextResponse.json({
      success: true,
      variants,
    });
  } catch (error: any) {
    console.error("Ошибка API:", error);
    console.error("Детали ошибки:", error?.message, error?.stack);
    return NextResponse.json(
      { 
        error: "Ошибка генерации описаний",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * Перегенерация одного варианта описания с учетом правок
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      product_name,
      photo_url,
      user_preferences = "",
      selected_blocks = [],
      current_description,
      edit_instructions,
      wants_stickers = false,
      selected_style = 4, // Стиль выбранного варианта
    } = body;

    if (!product_name || !current_description || !edit_instructions) {
      return NextResponse.json(
        { error: "product_name, current_description и edit_instructions обязательны" },
        { status: 400 }
      );
    }

    console.log("🔄 Перегенерируем описание с учетом правок");

    // Объединяем текущие пожелания с новыми правками и даём модели исходный текст
    const editsBlock = `Конкретные правки: ${edit_instructions}. Если нужно сократить, сделай текст заметно короче.`;
    const combinedPreferences = user_preferences
      ? `${user_preferences}. ${editsBlock}`
      : editsBlock;

    // Генерируем улучшенное описание (используем стиль выбранного варианта + исходный текст)
    const improvedDescription = await generateProductDescription(
      product_name,
      combinedPreferences,
      selected_blocks,
      photo_url,
      selected_style as 1 | 2 | 3 | 4, // Используем стиль выбранного варианта
      wants_stickers,
      current_description
    ).catch((e) => {
      console.error("Ошибка перегенерации:", e);
      return current_description; // Возвращаем исходное при ошибке
    });

    return NextResponse.json({
      success: true,
      description: improvedDescription,
    });
  } catch (error: any) {
    console.error("Ошибка API:", error);
    console.error("Детали ошибки:", error?.message, error?.stack);
    return NextResponse.json(
      { 
        error: "Ошибка перегенерации описания",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      },
      { status: 500 }
    );
  }
}
