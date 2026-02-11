import { NextRequest, NextResponse } from "next/server";
import { generateWithNanobanana } from "@/lib/services/nanobanana";

/**
 * Генерация изображения для режима "Для товара" в свободной генерации.
 * Использует фото товара как референс и короткий системный промпт с правилами.
 */
export async function POST(request: NextRequest) {
  if (!process.env.REPLICATE_API_TOKEN) {
    return NextResponse.json(
      {
        success: false,
        error: "REPLICATE_API_TOKEN не настроен",
      },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const {
      prompt,
      aspectRatio = "3:4",
      scenario,
      productImage,
    }: {
      prompt: string | null;
      aspectRatio?: "3:4" | "4:3" | "9:16" | "1:1";
      scenario?: "studio" | "lifestyle" | "macro" | "with-person" | null;
      productImage?: string | null;
    } = body;

    // Промпт обязателен только если не выбран сценарий
    if (!scenario && (!prompt || !prompt.trim())) {
      return NextResponse.json(
        { success: false, error: "Выберите сценарий или введите описание для генерации" },
        { status: 400 }
      );
    }

    // Подготовка изображения товара (base64 "data:" или URL)
    let imageForApi: string | undefined;
    if (productImage && typeof productImage === "string") {
      // Ограничиваем размер base64, чтобы не превысить условные 10MB
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (productImage.length <= maxSize) {
        imageForApi = productImage;
      } else {
        console.warn(
          "[generate-for-product] Изображение слишком большое, продолжаем без него"
        );
      }
    }

    // Короткое описание сцены в зависимости от выбранного режима
    let sceneDescription = "";
    switch (scenario) {
      case "studio":
        sceneDescription =
          "на аккуратном студийном подиуме с мягким профессиональным светом";
        break;
      case "lifestyle":
        sceneDescription =
          "в реалистичном жилом пространстве, где товар логично используется";
        break;
      case "macro":
        sceneDescription =
          "в макро-съёмке с акцентом на фактуру и ключевые детали товара";
        break;
      case "with-person":
        sceneDescription =
          "во взаимодействии с реальным человеком в естественной позе";
        break;
      default:
        sceneDescription = "в профессиональной сцене для маркетплейса";
    }

    const userPromptPart = prompt && prompt.trim() 
      ? `\nОписание пользователя: ${prompt.trim()}` 
      : "";

    const finalPrompt = `Создай реалистичную ФОТОГРАФИЮ ТОВАРА для маркетплейса.

Правила:
- Используй загруженное фото как основной референс товара (форма, пропорции и цвет должны сохраняться).
- Не искажай вид товара, не меняй его категорию и ключевые детали.
- Не добавляй текст и надписи, если пользователь сам явно не просит об этом.
- Любой текст (если он всё-таки нужен по запросу) должен быть только на русском языке.

Сцена: ${sceneDescription}.${userPromptPart}`;

    const imageUrl = await generateWithNanobanana(
      finalPrompt,
      imageForApi,
      aspectRatio,
      "png"
    );

    return NextResponse.json({
      success: true,
      imageUrl,
    });
  } catch (error: any) {
    console.error("[generate-for-product] Ошибка:", error);

    // Для пользователя вернём мягкое сообщение, детали оставим в логах
    return NextResponse.json(
      {
        success: false,
        error:
          "Ошибка генерации изображения. Пожалуйста, попробуйте ещё раз чуть позже.",
        details: String(error),
      },
      { status: 500 }
    );
  }
}