import { NextRequest, NextResponse } from "next/server";
import { generateProductDescription } from "@/lib/services/openrouter-description";
import { createServerClient } from "@/lib/supabase/server";
import {
  assertDemoDescriptionGenAllowed,
  consumeDemoDescriptionGeneration,
  isDemoProductSession,
} from "@/lib/demo-flow-server";
import {
  DEMO_FLOW_DESCRIPTION_STYLE_NAMES,
  DEMO_FLOW_DESCRIPTION_STYLES,
} from "@/lib/demo-flow";

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

async function gateDemoDescriptionPost(
  sessionId: unknown
): Promise<{ ok: true; isDemo: boolean; sessionId?: string } | { ok: false; response: NextResponse }> {
  if (typeof sessionId !== "string" || !sessionId.trim()) {
    return { ok: true, isDemo: false };
  }
  try {
    const supabase = createServerClient();
    const sid = sessionId.trim();
    const isDemo = await isDemoProductSession(supabase as any, sid);
    if (!isDemo) return { ok: true, isDemo: false };

    const gate = await assertDemoDescriptionGenAllowed(supabase as any, sid);
    if ("error" in gate) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: gate.error, code: "DEMO_DESCRIPTION_LIMIT" },
          { status: gate.status }
        ),
      };
    }
    return { ok: true, isDemo: true, sessionId: sid };
  } catch (e) {
    console.warn("[generate-description] demo gate failed:", e);
    return { ok: true, isDemo: false };
  }
}

/**
 * Генерация 4 вариантов описания товара через OpenRouter
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
      text_length = "medium",
      mark_highlights = false,
      session_id,
    } = body;

    const quotaGate = await gateDemoDescriptionPost(session_id);
    if (!quotaGate.ok) return quotaGate.response;
    const isDemo = quotaGate.isDemo;

    const textLength =
      text_length === "shorter" || text_length === "longer" || text_length === "medium"
        ? text_length
        : "medium";

    // Валидация
    if (!product_name) {
      return NextResponse.json(
        { error: "product_name обязателен" },
        { status: 400 }
      );
    }

    console.log(
      isDemo
        ? `🔄 Демо-поток: генерируем 2 стиля (Продающий + Структурированный) для: ${product_name}`
        : `🔄 Генерируем 4 варианта описания для: ${product_name}`
    );

    // Генерируем варианты ПАРАЛЛЕЛЬНО через OpenRouter
    const generateVariant = async (style: number, styleName: string, total: number) => {
      const startTime = Date.now();
      console.log(`🔄 [${style}/${total}] ⚡ ЗАПУСК генерации варианта "${styleName}"...`);
      try {
        const result = await generateProductDescription(
          product_name,
          user_preferences,
          selected_blocks,
          photo_url,
          style as 1 | 2 | 3 | 4,
          wants_stickers,
          undefined,
          {
            textLength,
            markHighlights: Boolean(mark_highlights),
          }
        );
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ [${style}/${total}] Вариант "${styleName}" успешно сгенерирован за ${duration}с (${result.length} символов)`);
        return result;
      } catch (error: any) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.error(`❌ [${style}/${total}] Ошибка генерации варианта "${styleName}" после ${duration}с:`, error?.message || error);
        throw error;
      }
    };

    const startTime = Date.now();

    const descriptionTasks: Array<[1 | 2 | 3 | 4, string]> = isDemo
      ? DEMO_FLOW_DESCRIPTION_STYLES.map((style) => [
          style,
          DEMO_FLOW_DESCRIPTION_STYLE_NAMES[style],
        ])
      : [
          [1, "Официальный"],
          [2, "Продающий"],
          [3, "Структурированный"],
          [4, "Сбалансированный"],
        ];
    const results = await Promise.allSettled(
      descriptionTasks.map(([style, styleName]) =>
        generateVariant(style, styleName, descriptionTasks.length)
      )
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
    console.log(`📊 Все ${descriptionTasks.length} запроса завершены за ${totalTime}с. Обрабатываем результаты...`);

    const processedDescriptions = descriptions.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      const [, styleName] = descriptionTasks[index];
      console.warn(`⚠️ Используем fallback для варианта "${styleName}"`);
      return `Описание товара "${product_name}". Стиль: ${styleName}.`;
    });

    const variants = descriptionTasks.map(([styleId, styleName], index) => {
      const text = processedDescriptions[index] || `Описание товара "${product_name}". Стиль: ${styleName}.`;
      return {
        id: styleId,
        style: styleName,
        description: text,
        preview: text.substring(0, 150) + (text.length > 150 ? "..." : ""),
      };
    });

    console.log(`✅ Готово вариантов описания: ${variants.length}`);

    if (isDemo && quotaGate.sessionId) {
      try {
        const supabase = createServerClient();
        await consumeDemoDescriptionGeneration(supabase as any, quotaGate.sessionId);
      } catch (e) {
        console.warn("[generate-description] demo consume after success:", e);
      }
    }

    return NextResponse.json({
      success: true,
      variants,
      is_demo: isDemo,
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
      text_length = "medium",
      mark_highlights = false,
      session_id,
    } = body;

    if (typeof session_id === "string" && session_id.trim()) {
      try {
        const supabase = createServerClient();
        const editGate = await assertDemoDescriptionGenAllowed(
          supabase as any,
          session_id.trim()
        );
        if ("error" in editGate) {
          return NextResponse.json(
            { error: editGate.error, code: "DEMO_DESCRIPTION_LIMIT" },
            { status: editGate.status }
          );
        }
      } catch (e) {
        console.warn("[generate-description] PUT demo gate:", e);
      }
    }

    const textLength =
      text_length === "shorter" || text_length === "longer" || text_length === "medium"
        ? text_length
        : "medium";

    if (!product_name || !current_description || !edit_instructions) {
      return NextResponse.json(
        { error: "product_name, current_description и edit_instructions обязательны" },
        { status: 400 }
      );
    }

    console.log("🔄 Перегенерируем описание с учетом правок");

    // Объединяем текущие пожелания с новыми правками и даём модели исходный текст
    const lengthHint =
      textLength === "shorter"
        ? "Обязательно сделай текст заметно короче (режим «Короче»)."
        : textLength === "longer"
          ? "Обязательно сделай текст заметно длиннее и подробнее (режим «Длиннее»)."
          : "Сохрани стандартный объём текста (режим «Авто»).";
    const editsBlock = `Конкретные правки пользователя: ${edit_instructions}. ${lengthHint}`;
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
      current_description,
      {
        textLength,
        markHighlights: Boolean(mark_highlights),
      }
    ).catch((e) => {
      console.error("Ошибка перегенерации:", e);
      return current_description; // Возвращаем исходное при ошибке
    });

    if (
      typeof session_id === "string" &&
      session_id.trim() &&
      improvedDescription &&
      improvedDescription !== current_description
    ) {
      try {
        const supabase = createServerClient();
        const isDemo = await isDemoProductSession(supabase as any, session_id.trim());
        if (isDemo) {
          await consumeDemoDescriptionGeneration(supabase as any, session_id.trim());
        }
      } catch (e) {
        console.warn("[generate-description] PUT demo consume:", e);
      }
    }

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
