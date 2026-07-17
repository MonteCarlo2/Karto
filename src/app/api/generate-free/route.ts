import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { generateWithKieAi } from "@/lib/services/kie-ai";
import { kieErrorToClient } from "@/lib/services/kie-ai-errors";
import { getFreeGenImageProvider } from "@/lib/services/free-gen-provider";
import { generateWithEvolinkGemini } from "@/lib/services/evolink-images";
import { generateWithWaveSpeedNanoBanana2 } from "@/lib/services/wavespeed-images";
import { CREDIT_PHOTO_4K } from "@/lib/credits-pricing";
import { addCredits, consumeCredits, getCreditBalance, migrateLegacyCreativeToCredits } from "@/lib/credits";

/**
 * Свободная генерация изображений — списание CREDIT_PHOTO_4K кредитов.
 */
export async function POST(request: NextRequest) {
  const tRequest = Date.now();
  const provider = getFreeGenImageProvider();

  if (provider === "kie") {
    if (!process.env.KIE_AI_API_KEY && !process.env.KIE_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: "KIE_AI_API_KEY не настроен",
          details: "Добавьте KIE_AI_API_KEY (или KIE_API_KEY) в файл .env.local",
        },
        { status: 500 }
      );
    }
  } else if (provider === "wavespeed") {
    if (!process.env.WAVESPEED_API_KEY?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "WAVESPEED_API_KEY не настроен",
          details:
            "WaveSpeed включён для свободного творчества: добавьте WAVESPEED_API_KEY (кабинет WaveSpeed). Вернуть KIE без ключа можно так: удалите WAVESPEED_API_KEY или задайте FREE_GEN_IMAGE_PROVIDER=kie.",
        },
        { status: 500 }
      );
    }
  } else {
    const evoKey =
      process.env.EVOLINK_API_KEY?.trim() || process.env.WAVESPEED_API_KEY?.trim();
    if (!evoKey) {
      return NextResponse.json(
        {
          success: false,
          error: "EVOLINK_API_KEY не настроен",
          details:
            "Для FREE_GEN_IMAGE_PROVIDER=evolink добавьте EVOLINK_API_KEY в .env.local (временно можно WAVESPEED_API_KEY, если так назван ключ EvoLink).",
        },
        { status: 500 }
      );
    }
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
      aspectRatio = "3:4", // "3:4" | "4:3" | "9:16" | "1:1"
      referenceImages,
    } = body;

    if (!prompt || !prompt.trim()) {
      await addCredits(supabase as any, user.id, CREDIT_PHOTO_4K);
      return NextResponse.json(
        { success: false, error: "Требуется промпт для генерации" },
        { status: 400 }
      );
    }

    const providerLabel =
      provider === "evolink"
        ? "EvoLink"
        : provider === "wavespeed"
          ? "WaveSpeed (Nano Banana 2)"
          : "KIE";
    console.log(`🎨 [FREE GENERATION] Старт (провайдер: ${providerLabel})…`);
    console.log("📝 Промпт:", prompt);
    console.log("📐 Соотношение сторон:", aspectRatio);
    console.log(
      "🖼️ Количество референсов:",
      Array.isArray(referenceImages) ? referenceImages.length : 0
    );

    // Готовим референсы (передаем до 4, как в UI)
    let imageInput: string | string[] | undefined = undefined;
    if (Array.isArray(referenceImages) && referenceImages.length > 0) {
      imageInput = referenceImages.slice(0, 4); // ограничимся 4, как в UI
    }

    console.log(`⏱️ [FREE] до вызова провайдера (${provider}), с начала запроса: ${Date.now() - tRequest} ms`);

    let generatedImageUrl: string;
    let referenceUsed: boolean;

    try {
      if (provider === "evolink") {
        const out = await generateWithEvolinkGemini(
          prompt.trim(),
          imageInput as string[] | undefined,
          aspectRatio
        );
        generatedImageUrl = out.imageUrl;
        referenceUsed = out.referenceUsed;
      } else if (provider === "wavespeed") {
        const out = await generateWithWaveSpeedNanoBanana2(
          prompt.trim(),
          imageInput as string[] | undefined,
          aspectRatio
        );
        generatedImageUrl = out.imageUrl;
        referenceUsed = out.referenceUsed;
      } else {
        const out = await generateWithKieAi(prompt.trim(), imageInput, aspectRatio, "png", "4K");
        generatedImageUrl = out.imageUrl;
        referenceUsed = out.referenceUsed;
      }
    } catch (genErr) {
      await addCredits(supabase as any, user.id, CREDIT_PHOTO_4K);
      throw genErr;
    }

    console.log("✅ [FREE GENERATION] Генерация завершена");
    console.log("🔗 URL:", generatedImageUrl);

    const newBalance = await getCreditBalance(supabase as any, user.id);

    return NextResponse.json({
      success: true,
      imageUrl: generatedImageUrl,
      referenceUsed: !!referenceUsed,
      creditsCharged: CREDIT_PHOTO_4K,
      creditBalance: newBalance,
    });

  } catch (error: any) {
    console.error("❌ [FREE GENERATION] Ошибка:", error);
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
