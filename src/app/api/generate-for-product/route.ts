import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { generateWithKieAi } from "@/lib/services/kie-ai";
import { getSubscriptionByUserId } from "@/lib/subscription";
import { getPublicUrl, saveBase64Image } from "@/lib/services/image-processing";

/**
 * Генерация изображения для режима "Для товара" в свободной генерации.
 * Требуется подписка «Свободное творчество» и лимит генераций.
 */
export async function POST(request: NextRequest) {
  if (!process.env.KIE_AI_API_KEY && !process.env.KIE_API_KEY) {
    return NextResponse.json(
      { success: false, error: "KIE_AI_API_KEY не настроен" },
      { status: 500 }
    );
  }

  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Войдите в аккаунт для генерации" },
        { status: 401 }
      );
    }
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Войдите в аккаунт для генерации" },
        { status: 401 }
      );
    }
    const sub = await getSubscriptionByUserId(supabase as any, user.id);
    if (!sub) {
      return NextResponse.json(
        { success: false, error: "Выберите тариф «Свободное творчество» на главной" },
        { status: 403 }
      );
    }
    if (sub.plan_type === "flow") {
      return NextResponse.json(
        {
          success: false,
          error: "У вас подключён тариф «Поток», а не «Свободное творчество». Для генерации изображений здесь выберите тариф «Свободное творчество» на главной странице.",
          code: "NO_CREATIVE_PLAN",
        },
        { status: 403 }
      );
    }
    if (sub.creative_used >= sub.plan_volume) {
      return NextResponse.json(
        {
          success: false,
          error: "У вас не осталось генераций. Доступно: 0. Выберите тариф «Свободное творчество» на главной странице, чтобы получить генерации.",
          code: "NO_GENERATIONS_LEFT",
        },
        { status: 403 }
      );
    }

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
      const maxSize = 10 * 1024 * 1024; // 10MB
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
      const appUrlIsPublic =
        !!appUrl &&
        !appUrl.includes("localhost") &&
        !appUrl.includes("127.0.0.1");

      if (productImage.startsWith("data:image")) {
        // Предпочтительно конвертируем data URL в публичный URL файла.
        // Если домен не публичный, оставляем data URL — сервис KIE сделает безопасный fallback без референса.
        if (productImage.length <= maxSize) {
          try {
            if (appUrlIsPublic) {
              const localPath = await saveBase64Image(productImage);
              const publicPath = getPublicUrl(localPath);
              imageForApi = `${appUrl}${publicPath}`;
            } else {
              imageForApi = productImage;
            }
          } catch {
            imageForApi = productImage;
          }
        } else {
          console.warn("[generate-for-product] Изображение слишком большое, продолжаем без него");
        }
      } else if (productImage.startsWith("http://") || productImage.startsWith("https://")) {
        imageForApi = productImage;
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

    const { imageUrl } = await generateWithKieAi(
      finalPrompt,
      imageForApi,
      aspectRatio,
      "png"
    );

    const { error: updErr } = await supabase
      .from("user_subscriptions")
      .update({ creative_used: sub.creative_used + 1 })
      .eq("user_id", user.id);
    if (updErr) console.error("Ошибка учёта генерации:", updErr);

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