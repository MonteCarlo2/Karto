import { NextRequest, NextResponse } from "next/server";
import { generateDesignConcepts } from "@/lib/services/style-concept-generator";
import { getProductNamesFromReplicateGPT4oMini } from "@/lib/services/replicate";
import { createServerClient } from "@/lib/supabase/server";
import { getVisualQuota, incrementVisualQuota } from "@/lib/services/visual-generation-quota";
import { isSupabaseNetworkError } from "@/lib/supabase/network-error";

// 4K через KIE часто >100s; 100s давали массовый Abort → несколько слотов «упали» сразу
// и повтор запускал столько же лишних generate-card (двойной расход токенов KIE).
// По умолчанию 3 мин на слот; переопределение: KIE_BATCH_CARD_TIMEOUT_MS (миллисекунды).
const CARD_GENERATE_TIMEOUT_MS = Number(process.env.KIE_BATCH_CARD_TIMEOUT_MS) || 180_000; // 3 мин на карточку

/** Сессии, для которых уже выполняется батч — не запускаем второй параллельный батч. */
const batchLockBySession = new Set<string>();

/**
 * Генерация 4 карточек одновременно с уникальными концепциями
 */
export async function POST(request: NextRequest) {
  console.log("🚀 [BATCH] ========== НАЧАЛО BATCH ГЕНЕРАЦИИ ==========");

  let sessionIdForLock: string | null = null;

  try {
    console.log("📥 [BATCH] Получаю body запроса...");
    const body = await request.json();
    console.log("📥 [BATCH] Body получен, ключи:", Object.keys(body));
    
    const {
      sessionId,
      productName,
      photoUrl,
      customPrompt, // Пожелания к стилю
      addText, // Включен ли текст на карточке
      title, // Заголовок
      bullets, // Буллиты (массив)
      aspectRatio, // "3:4" или "1:1"
      count = 4, // Количество карточек для генерации (по умолчанию 4)
    } = body;

    // Проверяем обязательные поля
    if (!productName) {
      return NextResponse.json(
        { success: false, error: "Требуется название товара" },
        { status: 400 }
      );
    }
    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "sessionId обязателен для генерации визуала" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Защита от повторного запуска батча для той же сессии (лишние расходы KIE)
    if (batchLockBySession.has(sessionId)) {
      console.warn("⚠️ [BATCH] Сессия уже в процессе генерации, повторный запрос:", sessionId);

      // Если результат уже успели сохранить — отдаем его сразу, чтобы фронт не «терял» карточки.
      const { data: visualRow } = await supabase
        .from("visual_data")
        .select("visual_state")
        .eq("session_id", sessionId)
        .maybeSingle();

      const generatedCards = (visualRow?.visual_state as any)?.generatedCards;
      if (Array.isArray(generatedCards) && generatedCards.length > 0) {
        console.log("✅ [BATCH] Найдены сохранённые generatedCards, возвращаем без новой генерации");
        return NextResponse.json(
          { success: true, imageUrls: generatedCards, code: "BATCH_CACHED_RESULT" },
          { status: 200 }
        );
      }

      // Иначе сообщаем «в процессе» — фронт может подождать и забрать результат из Supabase.
      return NextResponse.json(
        {
          success: false,
          error: "Генерация уже выполняется для этой сессии. Дождитесь завершения.",
          code: "BATCH_ALREADY_RUNNING",
        },
        { status: 202 }
      );
    }
    batchLockBySession.add(sessionId);
    sessionIdForLock = sessionId;
    const quotaBefore = await getVisualQuota(supabase as any, sessionId);
    if (quotaBefore.remaining <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Лимит генераций в Потоке исчерпан (0 из 12).",
          code: "VISUAL_LIMIT_REACHED",
          generationUsed: quotaBefore.used,
          generationRemaining: quotaBefore.remaining,
          generationLimit: quotaBefore.limit,
        },
        { status: 403 }
      );
    }

    // Проверка соответствия товара на фото и названия (защита от злоупотребления)
    // Если ключ Replicate отсутствует — просто пропускаем этот защитный шаг.
    if (photoUrl && process.env.REPLICATE_API_TOKEN) {
      try {
        console.log("🔍 [BATCH] Проверяю соответствие товара на фото и названия через Replicate...");
        
        // Конвертируем base64 в URL, если нужно
        let imageUrlForRecognition = photoUrl;
        if (photoUrl.startsWith("data:")) {
          // Для Replicate нужен URL, но можно попробовать использовать base64 напрямую
          // Или пропустить проверку для base64 (так как Replicate может не принять base64)
          console.log("⚠️ [BATCH] Base64 изображение - пропускаем проверку (Replicate требует URL)");
        } else {
          const recognizedNames = await getProductNamesFromReplicateGPT4oMini(photoUrl);
          
          if (recognizedNames.length > 0) {
            // Нормализуем названия для сравнения (убираем регистр, лишние символы)
            const normalize = (str: string) => str.toLowerCase().replace(/[^\w\s]/g, '').trim();
            const normalizedProductName = normalize(productName);
            
            // Проверяем, есть ли совпадение хотя бы с одним распознанным названием
            const hasMatch = recognizedNames.some(recognized => {
              const normalizedRecognized = normalize(recognized);
              // Проверяем совпадение ключевых слов (хотя бы 2 слова должны совпадать)
              const productWords = normalizedProductName.split(/\s+/).filter(w => w.length > 2);
              const recognizedWords = normalizedRecognized.split(/\s+/).filter(w => w.length > 2);
              const commonWords = productWords.filter(w => recognizedWords.includes(w));
              
              // Также проверяем частичное совпадение (если одно название содержит другое)
              return commonWords.length >= 2 || 
                     normalizedProductName.includes(normalizedRecognized.substring(0, 10)) ||
                     normalizedRecognized.includes(normalizedProductName.substring(0, 10));
            });
            
            if (!hasMatch) {
              console.warn("⚠️ [BATCH] Товар на фото не соответствует названию!");
              console.warn("⚠️ [BATCH] Название:", productName);
              console.warn("⚠️ [BATCH] Распознано на фото:", recognizedNames.slice(0, 3).join(", "));
              
              return NextResponse.json({
                success: false,
                error: "Товар на фотографии не соответствует указанному названию",
                details: `На фотографии распознан товар: "${recognizedNames[0] || 'неизвестно'}", а указано название: "${productName}". Пожалуйста, загрузите фотографию соответствующего товара или измените название товара.`,
              }, { status: 400 });
            }
            
            console.log("✅ [BATCH] Соответствие товара подтверждено");
          }
        }
      } catch (error: any) {
        // Если проверка не удалась, продолжаем генерацию (не блокируем пользователя)
        console.warn("⚠️ [BATCH] Не удалось проверить соответствие товара:", error.message);
        console.warn("⚠️ [BATCH] Продолжаем генерацию без проверки...");
      }
    } else if (photoUrl) {
      console.log("ℹ️ [BATCH] Проверка соответствия через Replicate пропущена: REPLICATE_API_TOKEN не настроен");
    }

    console.log("🎨 [BATCH] Генерация 4 дизайн-концепций через OpenRouter...");
    console.log("🎨 [BATCH] Товар:", productName);
    console.log("🎨 [BATCH] Пожелания:", customPrompt || "нет");
    
    // Генерируем 4 уникальные концепции через OpenRouter
    let concepts;
    try {
      concepts = await generateDesignConcepts(productName, customPrompt);
      console.log("✅ [BATCH] Получено концепций:", concepts.length);
      console.log("📋 [BATCH] ========== ПОЛНЫЕ КОНЦЕПЦИИ ОТ GPT ==========");
      concepts.forEach((concept, index) => {
        console.log(`\n📋 [BATCH] КОНЦЕПЦИЯ ${index + 1}:`);
        console.log(`  Style: ${concept.style}`);
        console.log(`  Composition: ${concept.composition}`);
        console.log(`  Colors: ${concept.colors}`);
        console.log(`  Mood: ${concept.mood}`);
        console.log(`  TextPresentation: ${concept.textPresentation}`);
      });
      console.log("📋 [BATCH] ============================================\n");
    } catch (error: any) {
      console.error("❌ [BATCH] ОШИБКА генерации концепций!");
      console.error("❌ [BATCH] Error:", error);
      // Пробрасываем ошибку, чтобы пользователь видел проблему
      return NextResponse.json({
        success: false,
        error: "Ошибка генерации концепций через OpenRouter",
        details: error.message || String(error),
      }, { status: 500 });
    }

    // Генерируем карточки (максимум 4, используем все доступные концепции)
    const cardsToGenerate = Math.min(count, 4, concepts.length, quotaBefore.remaining);
    if (cardsToGenerate <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Нет доступных генераций в Потоке.",
          code: "VISUAL_LIMIT_REACHED",
          generationUsed: quotaBefore.used,
          generationRemaining: quotaBefore.remaining,
          generationLimit: quotaBefore.limit,
        },
        { status: 403 }
      );
    }
    console.log(`🎯 [BATCH] Генерируем ${cardsToGenerate} карточек с уникальными концепциями`);

    const port = process.env.PORT || "3000";
    const host = process.env.VERCEL ? request.nextUrl.origin : `http://127.0.0.1:${port}`;
    const generateOne = async (index: number): Promise<string | null> => {
      const concept = concepts[index];
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CARD_GENERATE_TIMEOUT_MS);
      try {
        const response = await fetch(`${host}/api/generate-card`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productName,
            photoUrl,
            customPrompt,
            addText,
            title,
            bullets,
            aspectRatio,
            variation: index,
            designConcept: concept,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || `Ошибка карточки ${index + 1}`);
        return data.imageUrl;
      } catch (error: unknown) {
        clearTimeout(timeoutId);
        const msg = (error as { message?: string })?.message ?? String(error);
        console.error(`❌ Ошибка генерации карточки ${index + 1}:`, msg);
        return null;
      }
    };

    let cardUrls: (string | null)[] = await Promise.all(
      concepts.slice(0, cardsToGenerate).map((_, index) => generateOne(index))
    );

    // Ровно один повторный раунд — только для слотов, где по-прежнему null (не дублируем успешные).
    const failedIndices = cardUrls
      .map((url, i) => (url === null ? i : -1))
      .filter((i) => i >= 0);
    if (failedIndices.length > 0) {
      console.log(
        `🔄 [BATCH] Повтор только для ${failedIndices.length} слот(ов) без результата:`,
        failedIndices.map((i) => i + 1)
      );
      const retries = await Promise.all(failedIndices.map((index) => generateOne(index)));
      failedIndices.forEach((origIndex, i) => {
        if (retries[i] !== null) cardUrls[origIndex] = retries[i];
      });
    }

    const successfulCards = cardUrls.filter((url): url is string => url !== null);

    // UI всегда 4 слота вариантов — дополняем null, если квота/концепций меньше четырёх.
    while (cardUrls.length < 4) {
      cardUrls.push(null);
    }

    if (successfulCards.length === 0) {
      return NextResponse.json({
        success: false,
        error: "Сервис генерации временно недоступен. Попробуйте позже или проверьте подключение.",
        code: "SERVICE_UNAVAILABLE",
      }, { status: 503 });
    }

    console.log(`✅ Успешно сгенерировано ${successfulCards.length}/${cardsToGenerate} карточек`);
    const quotaAfter = await incrementVisualQuota(supabase as any, sessionId, successfulCards.length);

    // Сохраняем generatedCards в Supabase, чтобы фронт мог восстановить результат даже при обрыве/повторе запроса.
    try {
      const { data: existingVisualRow } = await supabase
        .from("visual_data")
        .select("visual_state")
        .eq("session_id", sessionId)
        .maybeSingle();

      const existingState = (existingVisualRow?.visual_state || {}) as Record<string, unknown>;
      const nextState = {
        ...existingState,
        // Фиксированные слоты 0..cardsToGenerate-1 (null = нет картинки) — UI и ретраи по индексу варианта.
        generatedCards: cardUrls,
        selectedCardIndex: null,
        isSeriesMode: false,
        generation_used: quotaAfter.used,
        generation_limit: quotaAfter.limit,
        lastGeneratedAt: new Date().toISOString(),
      };

      const { error: saveErr } = await supabase
        .from("visual_data")
        .upsert(
          {
            session_id: sessionId,
            visual_state: nextState,
          },
          { onConflict: "session_id" }
        );
      if (saveErr) console.error("❌ [BATCH] Не удалось сохранить generatedCards в Supabase:", saveErr);
      else console.log("💾 [BATCH] generatedCards сохранены в Supabase");
    } catch (e) {
      console.error("❌ [BATCH] Ошибка сохранения generatedCards:", e);
    }

    return NextResponse.json({
      success: true,
      // Параллельно с слотами вариантов (1..4); не сжимаем — иначе сетка путает «Вариант 4» с пустым слотом.
      imageUrls: cardUrls,
      concepts: concepts.slice(0, cardsToGenerate).map(c => ({
        style: c.style,
        composition: c.composition,
        colors: c.colors,
        mood: c.mood,
      })),
      message: `Сгенерировано ${successfulCards.length} карточек`,
      generationUsed: quotaAfter.used,
      generationRemaining: quotaAfter.remaining,
      generationLimit: quotaAfter.limit,
    });

  } catch (error: unknown) {
    if (isSupabaseNetworkError(error)) {
      console.warn("⚠️ [BATCH] Supabase/сеть недоступны при генерации карточек");
      return NextResponse.json({
        success: false,
        error: "Сервис генерации временно недоступен. Попробуйте позже.",
        code: "SERVICE_UNAVAILABLE",
      }, { status: 503 });
    }
    console.error("❌ Ошибка batch генерации:", error);
    return NextResponse.json({
      success: false,
      error: "Ошибка генерации карточек",
      details: (error as { message?: string })?.message || String(error),
    }, { status: 500 });
  } finally {
    if (sessionIdForLock) {
      batchLockBySession.delete(sessionIdForLock);
      console.log("🔓 [BATCH] Снята блокировка сессии:", sessionIdForLock);
    }
  }
}
