import { NextRequest, NextResponse } from "next/server";
import { generateDesignConcepts } from "@/lib/services/style-concept-generator";
import { getProductNamesFromReplicateGPT4oMini } from "@/lib/services/replicate";

/**
 * Генерация 4 карточек одновременно с уникальными концепциями
 */
export async function POST(request: NextRequest) {
  console.log("🚀 [BATCH] ========== НАЧАЛО BATCH ГЕНЕРАЦИИ ==========");
  
  // Проверяем наличие API ключа
  if (!process.env.REPLICATE_API_TOKEN) {
    console.error("❌ [BATCH] REPLICATE_API_TOKEN не настроен!");
    return NextResponse.json({
      success: false,
      error: "REPLICATE_API_TOKEN не настроен",
      details: "Добавьте REPLICATE_API_TOKEN в файл .env.local",
    }, { status: 500 });
  }

  try {
    console.log("📥 [BATCH] Получаю body запроса...");
    const body = await request.json();
    console.log("📥 [BATCH] Body получен, ключи:", Object.keys(body));
    
    const {
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

    // Проверка соответствия товара на фото и названия (защита от злоупотребления)
    // Используем Replicate для распознавания, так как у нас есть REPLICATE_API_TOKEN
    if (photoUrl) {
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
    const cardsToGenerate = Math.min(count, 4, concepts.length);
    console.log(`🎯 [BATCH] Генерируем ${cardsToGenerate} карточек с уникальными концепциями`);
    const cardPromises = concepts.slice(0, cardsToGenerate).map(async (concept, index) => {
      try {
        console.log(`🖼️ [BATCH] Генерация карточки ${index + 1}/${cardsToGenerate}...`);
        
        const response = await fetch(`${request.nextUrl.origin}/api/generate-card`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            productName,
            photoUrl,
            customPrompt,
            addText,
            title,
            bullets,
            aspectRatio,
            variation: index,
            designConcept: concept, // Передаем готовую концепцию
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || `Ошибка генерации карточки ${index + 1}`);
        }

        console.log(`✅ [BATCH] Карточка ${index + 1}/${cardsToGenerate} сгенерирована`);
        return data.imageUrl;
      } catch (error: any) {
        console.error(`❌ Ошибка генерации карточки ${index + 1}:`, error);
        return null; // Возвращаем null для неудачных генераций
      }
    });

    // Ждем все карточки
    const cardUrls = await Promise.all(cardPromises);
    
    // Фильтруем null (неудачные генерации)
    const successfulCards = cardUrls.filter((url): url is string => url !== null);

    if (successfulCards.length === 0) {
      return NextResponse.json({
        success: false,
        error: "Не удалось сгенерировать ни одной карточки",
      }, { status: 500 });
    }

    console.log(`✅ Успешно сгенерировано ${successfulCards.length}/${cardsToGenerate} карточек`);

    return NextResponse.json({
      success: true,
      imageUrls: successfulCards,
      concepts: concepts.slice(0, cardsToGenerate).map(c => ({
        style: c.style,
        composition: c.composition,
        colors: c.colors,
        mood: c.mood,
      })),
      message: `Сгенерировано ${successfulCards.length} карточек`,
    });

  } catch (error: any) {
    console.error("❌ Ошибка batch генерации:", error);
    
    return NextResponse.json({
      success: false,
      error: "Ошибка генерации карточек",
      details: error.message || String(error),
    }, { status: 500 });
  }
}
