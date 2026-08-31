import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { generateWithKieAi } from "@/lib/services/kie-ai";
import { kieErrorToClient } from "@/lib/services/kie-ai-errors";
import { getFreeGenImageProvider } from "@/lib/services/free-gen-provider";
import { generateWithEvolinkGemini } from "@/lib/services/evolink-images";
import { generateWithWaveSpeedNanoBanana2 } from "@/lib/services/wavespeed-images";
import { getPublicUrl, saveBase64Image } from "@/lib/services/image-processing";
import { CREDIT_PHOTO_4K } from "@/lib/credits-pricing";
import { addCredits, consumeCredits, getCreditBalance, migrateLegacyCreativeToCredits } from "@/lib/credits";

/**
 * Генерация «Для товара» в Креативе — списание CREDIT_PHOTO_4K кредитов.
 * Провайдер фото: WaveSpeed (как /api/generate-free). KIE — только логотип и видео.
 */
export async function POST(request: NextRequest) {
  const provider = getFreeGenImageProvider();

  if (provider === "wavespeed") {
    if (!process.env.WAVESPEED_API_KEY?.trim()) {
      return NextResponse.json(
        { success: false, error: "WAVESPEED_API_KEY не настроен" },
        { status: 500 }
      );
    }
  } else if (provider === "evolink") {
    const evoKey =
      process.env.EVOLINK_API_KEY?.trim() || process.env.WAVESPEED_API_KEY?.trim();
    if (!evoKey) {
      return NextResponse.json(
        { success: false, error: "EVOLINK_API_KEY не настроен" },
        { status: 500 }
      );
    }
  } else if (!process.env.KIE_AI_API_KEY && !process.env.KIE_API_KEY) {
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

    await migrateLegacyCreativeToCredits(supabase as any, user.id);
    const balance = await getCreditBalance(supabase as any, user.id);
    if (balance < CREDIT_PHOTO_4K) {
      return NextResponse.json(
        {
          success: false,
          error: `Недостаточно кредитов. Нужно ${CREDIT_PHOTO_4K}, доступно: ${balance}. Купите пакет на главной.`,
          code: "INSUFFICIENT_CREDITS",
          creditBalance: balance,
          creditsRequired: CREDIT_PHOTO_4K,
        },
        { status: 403 }
      );
    }

    const { ok: debited, error: debitErr } = await consumeCredits(
      supabase as any,
      user.id,
      CREDIT_PHOTO_4K
    );
    if (!debited) {
      return NextResponse.json(
        {
          success: false,
          error:
            debitErr === "insufficient_balance"
              ? "Недостаточно кредитов. Купите пакет на главной."
              : "Не удалось списать кредиты. Попробуйте ещё раз.",
          code: "INSUFFICIENT_CREDITS",
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
      await addCredits(supabase as any, user.id, CREDIT_PHOTO_4K);
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

    const providerLabel =
      provider === "evolink"
        ? "EvoLink"
        : provider === "wavespeed"
          ? "WaveSpeed"
          : "KIE";
    console.log(`🎨 [FOR-PRODUCT] Старт (провайдер: ${providerLabel})`);

    let imageUrl: string;
    try {
      if (provider === "evolink") {
        const out = await generateWithEvolinkGemini(
          finalPrompt,
          imageForApi ? [imageForApi] : undefined,
          aspectRatio
        );
        imageUrl = out.imageUrl;
      } else if (provider === "wavespeed") {
        const out = await generateWithWaveSpeedNanoBanana2(
          finalPrompt,
          imageForApi ? [imageForApi] : undefined,
          aspectRatio,
          "4k"
        );
        imageUrl = out.imageUrl;
      } else {
        const out = await generateWithKieAi(
          finalPrompt,
          imageForApi,
          aspectRatio,
          "png",
          "4K"
        );
        imageUrl = out.imageUrl;
      }
    } catch (genErr) {
      await addCredits(supabase as any, user.id, CREDIT_PHOTO_4K);
      throw genErr;
    }

    const newBalance = await getCreditBalance(supabase as any, user.id);

    return NextResponse.json({
      success: true,
      imageUrl,
      creditsCharged: CREDIT_PHOTO_4K,
      creditBalance: newBalance,
    });
  } catch (error: unknown) {
    console.error("[generate-for-product] Ошибка:", error);
    if (provider === "evolink" || provider === "wavespeed") {
      const msg = error instanceof Error ? error.message : String(error);
      const providerName = provider === "wavespeed" ? "WaveSpeed" : "EvoLink";
      return NextResponse.json(
        {
          success: false,
          error: msg || `Ошибка генерации (${providerName})`,
        },
        { status: 500 }
      );
    }
    const { message, code } = kieErrorToClient(error);
    const status = code === "CONTENT_FILTER" ? 422 : 500;
    return NextResponse.json(
      {
        success: false,
        error: message,
        ...(code ? { code } : {}),
      },
      { status }
    );
  }
}
