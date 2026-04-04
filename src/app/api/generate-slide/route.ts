import { NextRequest, NextResponse } from "next/server";
import { generateWithKieAi } from "@/lib/services/kie-ai";
import { KieAiContentFilteredError, kieErrorToClient } from "@/lib/services/kie-ai-errors";
import { 
  downloadImage, 
  getPublicUrl,
} from "@/lib/services/image-processing";
import path from "path";
import fs from "fs/promises";
import { createServerClient } from "@/lib/supabase/server";
import { getVisualQuota, incrementVisualQuota } from "@/lib/services/visual-generation-quota";

/**
 * Генерация слайда для серии карточек
 * Использует тот же товар (референс из первого слайда), но с новой обстановкой/сценарием
 */
export async function POST(request: NextRequest) {
  // Проверяем наличие API ключа
  if (!process.env.KIE_AI_API_KEY && !process.env.KIE_API_KEY) {
    return NextResponse.json({
      success: false,
      error: "KIE_AI_API_KEY не настроен",
      details: "Добавьте KIE_AI_API_KEY (или KIE_API_KEY) в файл .env.local",
    }, { status: 500 });
  }

  try {
    const body = await request.json();
    
    const {
      sessionId,
      productName,
      referenceImageUrl, // Референсное изображение товара из первого слайда
      environmentImageUrl, // Референсное изображение обстановки из первого слайда (опционально)
      userPrompt, // Описание обстановки от пользователя
      scenario, // Сценарий: "studio", "living-space", "macro", "in-hands"
      aspectRatio, // "3:4" | "4:3" | "9:16" | "1:1"
    } = body;

    // Проверяем обязательные поля
    if (!productName) {
      return NextResponse.json(
        { success: false, error: "Требуется название товара" },
        { status: 400 }
      );
    }

    if (!referenceImageUrl) {
      return NextResponse.json(
        { success: false, error: "Требуется референсное изображение" },
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

    // Подготовка изображений для API (товар + обстановка)
    // Для KIE можно передавать base64 или URL, сервис сам загрузит их в file upload endpoint.
    let imagesForApi: string[] = [];
    
    // Функция для конвертации изображения в data URL (KIE получает только data URL или публичный https — без localhost)
    const convertImageToBase64 = async (imageUrl: string): Promise<string | null> => {
      try {
        // Если это base64, используем как есть
        if (imageUrl.startsWith("data:")) {
          const base64Size = imageUrl.length;
          const maxSize = 10 * 1024 * 1024; // 10MB
          if (base64Size > maxSize) {
            console.warn("⚠️ Base64 изображение слишком большое");
            return null;
          }
          return imageUrl;
        }
        
        // Если это http(s) localhost — читаем с диска и отдаём data URL (KIE не дергает localhost)
        if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
          try {
            const u = new URL(imageUrl);
            if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
              const localPath = path.join(process.cwd(), "public", u.pathname);
              await fs.access(localPath);
              const buffer = await fs.readFile(localPath);
              if (buffer.length > 10 * 1024 * 1024) return null;
              let mimeType = "image/jpeg";
              const header = buffer.slice(0, 4);
              if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) mimeType = "image/png";
              else if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) mimeType = "image/jpeg";
              else {
                const ext = path.extname(u.pathname).toLowerCase();
                if (ext === ".png") mimeType = "image/png";
                else if (ext === ".webp") mimeType = "image/webp";
              }
              return `data:${mimeType};base64,${buffer.toString("base64")}`;
            }
          } catch (_) { /* fallback: use URL as is */ }
          return imageUrl;
        }
        
        // Если это локальный путь, конвертируем в base64
        const localPath = imageUrl.startsWith("/") 
          ? path.join(process.cwd(), "public", imageUrl)
          : imageUrl;
        
        await fs.access(localPath);
        const buffer = await fs.readFile(localPath);
        const fileSize = buffer.length;
        
        if (fileSize > 10 * 1024 * 1024) {
          console.warn("⚠️ Изображение слишком большое");
          return null;
        }
        
        // Определяем MIME-тип
        let mimeType = "image/jpeg";
        const header = buffer.slice(0, 4);
        
        if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) {
          mimeType = "image/png";
        } else if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) {
          mimeType = "image/jpeg";
        } else {
          const ext = path.extname(imageUrl).toLowerCase();
          if (ext === ".png") mimeType = "image/png";
          else if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
          else if (ext === ".webp") mimeType = "image/webp";
        }
        
        const base64 = buffer.toString("base64");
        return `data:${mimeType};base64,${base64}`;
      } catch (error) {
        console.warn("⚠️ Не удалось загрузить изображение:", error);
        return null;
      }
    };
    
    // Добавляем референс товара
    if (referenceImageUrl) {
      const productRef = await convertImageToBase64(referenceImageUrl);
      if (productRef) {
        imagesForApi.push(productRef);
        console.log("📷 Референс товара добавлен");
      }
    }
    
    // Добавляем референс обстановки (если указан)
    if (environmentImageUrl) {
      const envRef = await convertImageToBase64(environmentImageUrl);
      if (envRef) {
        imagesForApi.push(envRef);
        console.log("📷 Референс обстановки добавлен");
      }
    }

    // Обстановка: либо референс второго изображения, либо явный запрет копировать фон с первого
    let environmentReference = "";
    if (environmentImageUrl) {
      environmentReference = `\n\n=== РЕФЕРЕНС ОБСТАНОВКИ ===
СТРОГО ВАЖНО: Используй предоставленное второе изображение как референс обстановки/фона.
- Сохрани ТУ ЖЕ обстановку, фон, освещение, стиль, что на референсном изображении обстановки
- Товар должен быть размещен в ТОЙ ЖЕ обстановке, что на референсном изображении
- Используй те же предметы интерьера, декор, фон, если это уместно
- Сохрани общий стиль и атмосферу референсного изображения обстановки`;
    } else {
      environmentReference = `\n\n=== НЕ ИСПОЛЬЗОВАТЬ ОБСТАНОВКУ С РЕФЕРЕНСА ===
КРИТИЧЕСКИ ВАЖНО: На референсе передан только ОДИН снимок (товар на фоне). НЕ копируй с него обстановку, фон, декор или окружение. Игнорируй фон на референсе полностью. Создай НОВУЮ обстановку СТРОГО по сценарию съемки ниже.`;
    }

    // Формируем промпт на основе сценария (обязательное применение выбранного сценария)
    let scenarioPrompt = "";
    
    switch (scenario) {
      case "studio":
        scenarioPrompt = `СТУДИЙНЫЙ ПОДИУМ: Товар "${productName}" находится на профессиональном студийном подиуме или стенде. Фон - чистый студийный фон (белый, серый или черный). Профессиональное студийное освещение с мягкими тенями. Товар один, без дополнительных предметов. Стиль профессиональной студийной съемки для каталога.`;
        break;
      case "living-space":
        scenarioPrompt = `ЖИЛОЕ ПРОСТРАНСТВО: Товар "${productName}" находится в домашней обстановке, в жилом пространстве. Реалистичная домашняя обстановка с соответствующими предметами интерьера, мебелью, декором. Естественное освещение, уютная атмосфера. Товар органично вписан в интерьер, выглядит естественно в домашней обстановке.`;
        break;
      case "macro":
        scenarioPrompt = `МАКРО-ДЕТАЛЬ: Товар "${productName}" сфотографирован крупным планом (макро-съемка). Детали товара видны очень четко, крупно. Фокус на деталях товара. Профессиональная макро-фотография с четкими деталями.`;
        break;
      case "with-person":
        scenarioPrompt = `С ЧЕЛОВЕКОМ: Товар "${productName}" находится в кадре с человеком. Человек присутствует в кадре естественно, может держать товар, использовать его или просто находиться рядом. Если это одежда - человек примеряет её. Реалистичный человек, естественная поза. Естественное освещение, реалистичная обстановка.`;
        break;
      default:
        scenarioPrompt = `Товар "${productName}" в реалистичной обстановке, соответствующей его назначению.`;
    }

    // Добавляем описание пользователя, если есть
    let userDescription = "";
    let requestedText = "";
    if (userPrompt && userPrompt.trim()) {
      // Извлекаем запрошенный текст, если пользователь явно просит добавить текст
      // Ищем явные указания на текст: "добавь текст", "напиши", "надпись", "подпись", "название", "заголовок"
      const textKeywords = /(?:добавь|напиши|текст|надпись|подпись|название|заголовок|сделай\s+надпись|сделай\s+текст)/i;
      const hasTextRequest = textKeywords.test(userPrompt);
      
      if (hasTextRequest) {
        // Извлекаем текст из кавычек или после ключевых слов
        const textMatch = userPrompt.match(/(?:добавь|напиши|текст|надпись|подпись|название|заголовок|сделай\s+надпись|сделай\s+текст)[\s:]+["']?([^"']+)["']?/i);
        if (textMatch && textMatch[1]) {
          requestedText = textMatch[1].trim();
        } else {
          // Если текст не найден в кавычках, ищем после двоеточия или просто берем часть после ключевого слова
          const afterKeyword = userPrompt.replace(textKeywords, "").trim();
          if (afterKeyword) {
            requestedText = afterKeyword.split(/[.,;!?]/)[0].trim(); // Берем первое предложение
          }
        }
        userDescription = `\n\nДОПОЛНИТЕЛЬНЫЕ ТРЕБОВАНИЯ ПОЛЬЗОВАТЕЛЯ:\n${userPrompt.trim()}\n\nВАЖНО: Реализуй эти требования, но сохрани основной сценарий выше.`;
      } else {
        // Если пользователь НЕ просит текст явно, подчеркиваем, что текст НЕ нужен
        userDescription = `\n\nДОПОЛНИТЕЛЬНЫЕ ТРЕБОВАНИЯ ПОЛЬЗОВАТЕЛЯ:\n${userPrompt.trim()}\n\nВАЖНО: Реализуй эти требования, но сохрани основной сценарий выше. НЕ добавляй никакого текста, надписей, логотипов - это должна быть чистая фотография без текста.`;
      }
    }

    // Строим промпт для генерации
    const finalPrompt = `Создай РЕАЛИСТИЧНУЮ ФОТОГРАФИЮ товара "${productName}".

🚫 КРИТИЧЕСКИ ВАЖНО - ЭТО ФОТОГРАФИЯ, НЕ КАРТОЧКА:
- НЕ создавай карточку с дизайном, инфографикой или текстом
- НЕ добавляй никакого текста, надписей, логотипов, характеристик, размеров
- Это должна быть РЕАЛИСТИЧНАЯ ФОТОГРАФИЯ, как будто снятая камерой
- Высокий реализм: естественное освещение, реалистичные тени, отражения, текстуры, небольшие естественные дефекты
- Должно выглядеть как реальная фотография, а НЕ как сгенерированное изображение

=== РЕФЕРЕНСНОЕ ИЗОБРАЖЕНИЕ ТОВАРА ===
СТРОГО ВАЖНО: Используй предоставленное изображение товара как референс.
- Товар должен выглядеть ТОЧНО ТАК ЖЕ, как на исходном изображении
- НЕ искажай его форму, размер, пропорции, ОРИЕНТАЦИЮ, РАКУРС
- Товар должен быть в ТОМ ЖЕ положении и с ТОГО ЖЕ ракурса, что и на исходном изображении:
  * Если на исходном изображении товар показан сбоку - покажи его сбоку, НЕ сверху и НЕ сзади!
  * Если на исходном изображении товар показан спереди - покажи его спереди, НЕ сбоку и НЕ сверху!
  * Если на исходном изображении товар показан сверху - покажи его сверху, НЕ сбоку и НЕ сзади!
  * НЕ меняй ракурс съемки - используй ТОТ ЖЕ ракурс, что на исходном изображении!
- НЕ делай товар мультяшным, нереалистичным или фантастическим - он должен выглядеть РЕАЛЬНО
- НЕ наклоняй товар, НЕ поворачивай его - сохрани ТОЧНО ту же ориентацию, что на исходном изображении!
- Товар должен быть узнаваемым и соответствовать исходному изображению и названию "${productName}"

=== СЦЕНАРИЙ СЪЕМКИ (ОБЯЗАТЕЛЬНО ПРИМЕНИ) ===
КРИТИЧЕСКИ ВАЖНО: Сценарий ниже ОБЯЗАТЕЛЕН к применению. Не игнорируй его. Результат должен строго соответствовать сценарию.
${scenarioPrompt}${environmentReference}${userDescription}
ФИНАЛЬНОЕ НАПОМИНАНИЕ: Итоговая фотография должна строго соответствовать выбранному сценарию съемки выше.

=== КРИТИЧЕСКИ ВАЖНЫЕ ПРАВИЛА ===
1. ТОВАР:
   - СТРОГО: Товар должен выглядеть ТОЧНО ТАК ЖЕ, как на исходном изображении
   - СТРОГО: НЕ меняй ракурс, ориентацию, положение товара
   - СТРОГО: НЕ наклоняй товар, НЕ поворачивай его
   - Размести товар ЛОГИЧНО и ПРАВИЛЬНО в соответствии со сценарием
   - Товар должен занимать значительную часть кадра (50-70%)
   - Высокое качество изображения, четкость, реалистичность

2. ТЕКСТ:
   ${requestedText 
     ? `- ✅ ПОЛЬЗОВАТЕЛЬ ЯВНО ПОПРОСИЛ ДОБАВИТЬ ТЕКСТ: "${requestedText}"
   - Добавь ТОЛЬКО этот текст, НИЧЕГО БОЛЬШЕ
   - Текст должен быть на русском языке кириллицей, четко и читаемо
   - Текст должен быть органично вписан в фотографию, не выглядеть как наклейка
   - 🚫 ЗАПРЕЩЕНО добавлять любой другой текст, кроме "${requestedText}"`
     : `- 🚫 КРИТИЧЕСКИ ВАЖНО: НЕ добавляй НИКАКОГО текста, надписей, логотипов, характеристик, размеров, названий, подписей
   - Это ФОТОГРАФИЯ, а не карточка с текстом
   - НЕ добавляй текст даже если он был на референсном изображении
   - НЕ добавляй текст даже если он кажется уместным
   - Это должна быть ЧИСТАЯ ФОТОГРАФИЯ без текста`}

3. РЕАЛИСТИЧНОСТЬ:
   - Должно выглядеть как РЕАЛЬНАЯ ФОТОГРАФИЯ, снятая камерой
   - Естественное освещение, реалистичные тени, отражения, текстуры
   - Небольшие естественные дефекты (пыль, царапины, отпечатки пальцев) для реализма
   - Избегай "идеальности" - сделай так, чтобы выглядело как реальная фотография

4. КАЧЕСТВО:
   - Высокое разрешение, готово для использования
   - Профессиональное качество съемки
   - Четкие края, без размытия
   - Правильные пропорции товара`;

    console.log("═══════════════════════════════════════");
    console.log("📝 ПРОМПТ ДЛЯ ГЕНЕРАЦИИ СЛАЙДА:");
    console.log(finalPrompt);
    console.log("═══════════════════════════════════════");
    console.log("📋 Параметры генерации:");
    console.log("  - Название товара:", productName);
    console.log("  - Сценарий:", scenario || "не выбран");
    console.log("  - Описание пользователя:", userPrompt || "нет");
    console.log("  - Aspect Ratio:", aspectRatio || "3:4");
    console.log("  - Референсных изображений:", imagesForApi.length);
    console.log("  - Референс товара:", referenceImageUrl ? "да" : "нет");
    console.log("  - Референс обстановки:", environmentImageUrl ? "да" : "нет");
    console.log("═══════════════════════════════════════");
    
    // Генерируем через KIE (nano-banana-2)
    const finalAspectRatio = aspectRatio || "3:4";
    
    console.log("📐 Final Aspect Ratio:", finalAspectRatio);
    console.log("🖼️ Image Inputs:", imagesForApi.length);
    console.log("📏 Длина промпта:", finalPrompt.length, "символов");
    
    // Генерируем через KIE с изображением(ями)
    let generatedImageUrl: string;
    
    try {
      const result = await generateWithKieAi(
        finalPrompt,
        imagesForApi.length > 0 ? (imagesForApi.length === 1 ? imagesForApi[0] : imagesForApi) : undefined,
        finalAspectRatio,
        "png"
      );
      generatedImageUrl = result.imageUrl;
      console.log("✅ Генерация успешна");
    } catch (error: any) {
      console.error("❌ Ошибка в generateWithKieAi:", error);
      if (error instanceof KieAiContentFilteredError) throw error;
      throw new Error(
        `Модель не смогла сгенерировать изображение. Ошибка: ${error.message || "Неизвестная ошибка"}`
      );
    }
    
    // Скачиваем результат
    const generatedPath = await downloadImage(generatedImageUrl);
    const generatedLocalUrl = getPublicUrl(generatedPath);

    console.log(`✅ Слайд сгенерирован: ${generatedLocalUrl}`);

    const quotaAfter = await incrementVisualQuota(supabase as any, sessionId, 1);

    return NextResponse.json({
      success: true,
      imageUrl: generatedLocalUrl,
      message: "Слайд создан!",
      generationUsed: quotaAfter.used,
      generationRemaining: quotaAfter.remaining,
      generationLimit: quotaAfter.limit,
    });

  } catch (error: any) {
    console.error("❌ Ошибка генерации слайда:", error);
    const errorString = String(error?.message ?? error);
    let status = 500;

    if (errorString.includes("401") || errorString.includes("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: "Ошибка авторизации сервиса генерации." },
        { status: 500 }
      );
    }
    if (errorString.includes("429")) {
      return NextResponse.json(
        { success: false, error: "Превышен лимит запросов. Подождите минуту." },
        { status: 429 }
      );
    }
    if (errorString.includes("insufficient") || errorString.includes("402")) {
      return NextResponse.json(
        { success: false, error: "Временная недоступность сервиса генерации." },
        { status: 503 }
      );
    }

    const payload = kieErrorToClient(error);
    if (payload.code === "CONTENT_FILTER") status = 422;
    return NextResponse.json(
      { success: false, error: payload.message, ...(payload.code ? { code: payload.code } : {}) },
      { status }
    );
  }
}
