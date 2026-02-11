import { NextRequest, NextResponse } from "next/server";
import { generateWithNanobanana } from "@/lib/services/nanobanana";

/**
 * Свободная генерация изображений через Replicate (nano-banana-pro)
 * Просто генерация по промпту без системных промптов
 */
export async function POST(request: NextRequest) {
  // Проверяем наличие API ключа Replicate
  if (!process.env.REPLICATE_API_TOKEN) {
    return NextResponse.json({
      success: false,
      error: "REPLICATE_API_TOKEN не настроен",
      details: "Добавьте REPLICATE_API_TOKEN в файл .env.local",
    }, { status: 500 });
  }

  try {
    const body = await request.json();
    
    const {
      prompt,
      aspectRatio = "3:4", // "3:4" | "4:3" | "9:16" | "1:1"
      referenceImages,
    } = body;

    // Проверяем обязательные поля
    if (!prompt || !prompt.trim()) {
      return NextResponse.json(
        { success: false, error: "Требуется промпт для генерации" },
        { status: 400 }
      );
    }

    console.log("🎨 [FREE GENERATION] Начинаем свободную генерацию...");
    console.log("📝 Промпт:", prompt);
    console.log("📐 Соотношение сторон:", aspectRatio);
    console.log(
      "🖼️ Количество референсов:",
      Array.isArray(referenceImages) ? referenceImages.length : 0
    );

    // Готовим референсы (Replicate принимает base64 или URL)
    let imageInput: string | string[] | undefined = undefined;
    if (Array.isArray(referenceImages) && referenceImages.length > 0) {
      imageInput = referenceImages.slice(0, 4); // ограничимся 4, как в UI
    }

    // Генерируем через Replicate (nano-banana-pro) без системных промптов
    const generatedImageUrl = await generateWithNanobanana(
      prompt.trim(), // Просто промпт пользователя, без дополнений
      imageInput,
      aspectRatio,
      "png"
    );

    console.log("✅ [FREE GENERATION] Генерация завершена");
    console.log("🔗 URL:", generatedImageUrl);

    return NextResponse.json({
      success: true,
      imageUrl: generatedImageUrl,
    });

  } catch (error: any) {
    console.error("❌ [FREE GENERATION] Ошибка:", error);
    return NextResponse.json(
      {
        success: false,
        // Пользователю показываем мягкое сообщение, технические детали — в логах
        error:
          "Ошибка генерации изображения. Пожалуйста, попробуйте ещё раз чуть позже.",
        details: error.toString(),
      },
      { status: 500 }
    );
  }
}
