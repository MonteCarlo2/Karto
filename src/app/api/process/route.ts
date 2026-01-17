import { NextRequest, NextResponse } from "next/server";
import { 
  generateWithNanobanana,
  buildProductCardPrompt,
  CARD_STYLES,
} from "@/lib/services/nanobanana";
import { 
  downloadImage, 
  getPublicUrl,
  saveBase64Image,
} from "@/lib/services/image-processing";

interface ProcessingStep {
  step: string;
  status: "pending" | "processing" | "completed" | "error";
  result?: string;
  error?: string;
  time?: number;
}

/**
 * Генерация карточки товара через Nanobanana Pro (Replicate)
 */
export async function POST(request: NextRequest) {
  const steps: ProcessingStep[] = [];
  const startTime = Date.now();
  
  // Проверяем наличие API ключа
  if (!process.env.REPLICATE_API_TOKEN) {
    return NextResponse.json({
      success: false,
      error: "REPLICATE_API_TOKEN не настроен",
      details: "Добавьте REPLICATE_API_TOKEN в файл .env.local",
    }, { status: 500 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("image") as File | null;
    const imageUrl = formData.get("imageUrl") as string | null;
    
    // Параметры от пользователя
    const title = (formData.get("title") as string) || "Товар";
    const subtitle = formData.get("subtitle") as string | null;
    const productDescription = (formData.get("description") as string) || "Качественный товар";
    const styleId = (formData.get("style") as string) || "minimal";
    const customPrompt = formData.get("customPrompt") as string | null;

    // Сохраняем оригинальное изображение
    let sourceUrl: string;
    let imageForApi: string; // Изображение для отправки в API (base64)
    
    if (file) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;
      const localPath = await saveBase64Image(base64);
      sourceUrl = getPublicUrl(localPath);
      imageForApi = base64; // Передаём base64 в API
      
      console.log("📁 Файл загружен:", file.name);
      
      steps.push({
        step: "upload",
        status: "completed",
        result: sourceUrl,
        time: Date.now() - startTime,
      });
    } else if (imageUrl) {
      const localPath = await downloadImage(imageUrl);
      sourceUrl = getPublicUrl(localPath);
      imageForApi = imageUrl; // Передаём URL в API
      
      steps.push({
        step: "upload",
        status: "completed",
        result: sourceUrl,
        time: Date.now() - startTime,
      });
    } else {
      return NextResponse.json(
        { success: false, error: "Требуется изображение" },
        { status: 400 }
      );
    }

    console.log("🚀 Генерация карточки через Nanobanana Pro");
    console.log("📋 Заголовок:", title);
    console.log("📋 Стиль:", styleId);

    // Получаем стиль
    const style = CARD_STYLES[styleId] || CARD_STYLES.minimal;

    // ГЕНЕРАЦИЯ
    console.log("--- Генерация карточки ---");
    steps.push({ step: "generate", status: "processing" });
    
    let generatedImageUrl: string;
    let generatedLocalUrl: string;
    
    try {
      // Строим промпт
      let finalPrompt: string;
      
      if (customPrompt && customPrompt.trim()) {
        // Пользовательский промпт
        finalPrompt = customPrompt.trim();
        console.log("📝 Используем кастомный промпт");
      } else {
        // Автоматический промпт
        finalPrompt = buildProductCardPrompt({
          productDescription: productDescription,
          title: title,
          subtitle: subtitle || undefined,
          style: style.prompt,
        });
      }
      
      console.log("═══════════════════════════════════════");
      console.log("📝 ИТОГОВЫЙ ПРОМПТ:");
      console.log(finalPrompt);
      console.log("═══════════════════════════════════════");
      
      // Генерируем через Nanobanana Pro с референсным изображением
      generatedImageUrl = await generateWithNanobanana(
        finalPrompt,
        imageForApi, // Передаём референсное изображение!
        "1:1",
        "png"
      );
      
      // Скачиваем результат
      const generatedPath = await downloadImage(generatedImageUrl);
      generatedLocalUrl = getPublicUrl(generatedPath);
      
      const genTime = Date.now() - startTime;
      steps[steps.length - 1] = {
        step: "generate",
        status: "completed",
        result: generatedLocalUrl,
        time: genTime,
      };
      
      console.log(`✅ Карточка сгенерирована за ${(genTime / 1000).toFixed(1)}s`);
      
    } catch (error) {
      console.error("❌ Ошибка генерации:", error);
      steps[steps.length - 1] = {
        step: "generate",
        status: "error",
        error: String(error),
      };
      throw new Error(`Ошибка генерации: ${error}`);
    }

    const totalTime = Date.now() - startTime;
    console.log(`✅ Готово за ${(totalTime / 1000).toFixed(1)}s`);

    return NextResponse.json({
      success: true,
      steps: steps,
      result: {
        originalImage: sourceUrl,
        finalImage: generatedLocalUrl,
      },
      timing: {
        total: totalTime,
      },
      message: "Карточка товара создана!",
    });

  } catch (error) {
    console.error("❌ Критическая ошибка:", error);
    
    let errorMessage = "Ошибка генерации";
    const errorString = String(error);
    
    if (errorString.includes("401") || errorString.includes("Unauthorized")) {
      errorMessage = "Ошибка авторизации. Проверьте REPLICATE_API_TOKEN";
    } else if (errorString.includes("429")) {
      errorMessage = "Превышен лимит запросов. Подождите минуту.";
    } else if (errorString.includes("insufficient") || errorString.includes("402")) {
      errorMessage = "Недостаточно средств на Replicate";
    }
    
    return NextResponse.json({
      success: false,
      steps: steps,
      error: errorMessage,
      details: errorString,
    }, { status: 500 });
  }
}
