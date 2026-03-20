import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createVideoProductTask } from "@/lib/services/kie-ai-video";
import { computeProductVideoTokenCost } from "@/lib/video-token-pricing";
import { consumeVideoTokens, addVideoTokens } from "@/lib/video-tokens";

/**
 * Создание задачи генерации видео для режима «Для товара».
 * Загружает фото товара на KIE и запускает модель bytedance/v1-pro-fast-image-to-video.
 * Возвращает taskId немедленно — фронтенд сам опрашивает /api/video-status/[taskId].
 */
export async function POST(request: NextRequest) {
  if (!process.env.KIE_AI_API_KEY && !process.env.KIE_API_KEY) {
    return NextResponse.json(
      { success: false, error: "KIE_AI_API_KEY не настроен" },
      { status: 500 }
    );
  }

  try {
    // ── Авторизация ───────────────────────────────────────────────────────────
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

    // ── Параметры запроса ─────────────────────────────────────────────────────
    const body = await request.json();
    const {
      productImageDataUrl,   // data URL (base64) фото товара
      prompt = "",
      resolution = "720p",   // "720p" | "1080p"
      duration = 5,          // 5 | 10
      staticCamera = true,   // влияет на системный промпт
      saveInfographics = false,
    } = body;

    if (!productImageDataUrl) {
      return NextResponse.json(
        { success: false, error: "Необходимо загрузить фото товара" },
        { status: 400 }
      );
    }

    if (!["720p", "1080p"].includes(resolution)) {
      return NextResponse.json(
        { success: false, error: "Некорректное разрешение (720p или 1080p)" },
        { status: 400 }
      );
    }

    if (![5, 10].includes(duration)) {
      return NextResponse.json(
        { success: false, error: "Длительность должна быть 5 или 10 секунд" },
        { status: 400 }
      );
    }

    // ── Формируем промпт ──────────────────────────────────────────────────────
    // Пользовательский промпт — главный. Настройки добавляют только своё дополнение.
    const extraHints: string[] = [];

    if (staticCamera) {
      extraHints.push("static camera, no camera movement, fixed shot");
    }

    if (saveInfographics) {
      extraHints.push("preserve all product text, labels, numbers and infographic overlays clearly visible");
    }

    const finalPrompt = prompt.trim()
      ? extraHints.length > 0
        ? `${prompt.trim()}, ${extraHints.join(", ")}`
        : prompt.trim()
      : extraHints.length > 0
        ? `professional product video, ${extraHints.join(", ")}, high quality, commercial style`
        : "professional product video, smooth camera movement, high quality, commercial style";

    console.log("🎬 [generate-video-product] Пользователь:", user.id);
    console.log("📝 Промпт:", finalPrompt.slice(0, 120));
    console.log("🔧 Параметры:", { resolution, duration, staticCamera, saveInfographics });

    const tokenCost = computeProductVideoTokenCost({
      resolution: resolution as "720p" | "1080p",
      durationSec: duration as 5 | 10,
      generateAudio: false,
    });

    if (!tokenCost || tokenCost < 1) {
      return NextResponse.json(
        { success: false, error: "Не удалось рассчитать стоимость видео." },
        { status: 400 }
      );
    }

    const { ok: debited, error: debitErr } = await consumeVideoTokens(
      supabase as never,
      user.id,
      tokenCost
    );
    if (!debited) {
      const isRpcFail = Boolean(debitErr && debitErr !== "insufficient_balance");
      console.error("[generate-video-product] consumeVideoTokens failed:", debitErr, "user:", user.id);
      return NextResponse.json(
        {
          success: false,
          error:
            debitErr === "insufficient_balance"
              ? "Недостаточно видео-кредитов или истёк период пакета. Пополните баланс на главной."
              : isRpcFail
                ? "Не удалось списать кредиты (ошибка сервера БД). Обновите страницу."
                : "Не удалось списать видео-кредиты.",
          code: "INSUFFICIENT_VIDEO_TOKENS",
          debitDetails: isRpcFail ? debitErr : undefined,
        },
        { status: 403 }
      );
    }

    let taskId: string;
    try {
      taskId = await createVideoProductTask({
        prompt: finalPrompt,
        productImageDataUrl,
        resolution: resolution as "720p" | "1080p",
        duration: duration as 5 | 10,
        userId: user.id,
      });
    } catch (e) {
      await addVideoTokens(supabase as never, user.id, tokenCost);
      throw e;
    }

    console.log("✅ [generate-video-product] Задача создана:", taskId, "tokens:", tokenCost);

    return NextResponse.json({ success: true, taskId, tokensCharged: tokenCost });
  } catch (error: any) {
    console.error("❌ [generate-video-product] Ошибка:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Ошибка запуска видео-генерации. Попробуйте ещё раз.",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
