import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  createFreeVideoTask,
  createKlingProVideoTask,
  createKlingMotionControlVideoTask,
} from "@/lib/services/kie-ai-video";
import { computeFreeVideoTokenCost } from "@/lib/video-token-pricing";
import { consumeVideoTokens, addVideoTokens } from "@/lib/video-tokens";

/**
 * Создание задачи генерации видео для режима «Свободная генерация».
 * Использует модель bytedance/seedance-1.5-pro.
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
      prompt = "",
      aspectRatio = "1:1",
      resolution = "1080p",
      duration,
      fixedLens = false,
      generateAudio = false,
      /** Optional base64 data-URLs (max 2) */
      referenceImageDataUrls = [],
      videoMode = "standard",
      referenceVideoDataUrl = null,
      characterOrientation = "image",
      /** Для sync: длительность эталонного видео (сек), с клиента */
      referenceVideoDurationSec: rawRefDuration,
    } = body;

    if (!prompt || prompt.trim().length < 3) {
      return NextResponse.json(
        { success: false, error: "Промпт слишком короткий (минимум 3 символа)" },
        { status: 400 }
      );
    }

    const validAspectRatios = ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9"];
    if (!validAspectRatios.includes(aspectRatio)) {
      return NextResponse.json(
        { success: false, error: `Некорректное соотношение сторон. Допустимые: ${validAspectRatios.join(", ")}` },
        { status: 400 }
      );
    }

    const validResolutions = ["480p", "720p", "1080p"];
    if (!validResolutions.includes(resolution)) {
      return NextResponse.json(
        { success: false, error: "Некорректное разрешение (480p, 720p или 1080p)" },
        { status: 400 }
      );
    }

    const refMax = videoMode === "standard" ? 2 : 1;

    if (!Array.isArray(referenceImageDataUrls) || referenceImageDataUrls.length > refMax) {
      return NextResponse.json(
        { success: false, error: `Модель поддерживает только ${refMax} изображения!` },
        { status: 400 }
      );
    }

    // Длительность нужна только для standard/pro (seedance/seedance-pro).
    // Для sync (motion-control) длительность берётся из загруженного motion видео.
    if (videoMode !== "sync") {
      const allowedDurations = videoMode === "pro" ? [5, 10] : [4, 8, 12];
      if (!allowedDurations.includes(duration)) {
        return NextResponse.json(
          {
            success: false,
            error:
              videoMode === "pro"
                ? "Длительность должна быть 5 или 10 секунд"
                : "Длительность должна быть 4, 8 или 12 секунд",
          },
          { status: 400 }
        );
      }
    }

    if (videoMode === "sync") {
      if (!referenceImageDataUrls || referenceImageDataUrls.length < 1) {
        return NextResponse.json(
          { success: false, error: "Для sync нужна 1 input-изображение" },
          { status: 400 }
        );
      }
      if (!referenceVideoDataUrl) {
        return NextResponse.json(
          { success: false, error: "Для sync нужна reference video" },
          { status: 400 }
        );
      }
      if (typeof referenceVideoDataUrl !== "string" || !referenceVideoDataUrl.startsWith("data:")) {
        return NextResponse.json(
          { success: false, error: "referenceVideoDataUrl для sync должен быть data URL (base64)" },
          { status: 400 }
        );
      }
      const allowedOrientations = ["image", "video"];
      if (!allowedOrientations.includes(characterOrientation)) {
        return NextResponse.json(
          { success: false, error: "Некорректный character_orientation" },
          { status: 400 }
        );
      }
      if (resolution !== "720p" && resolution !== "1080p") {
        return NextResponse.json(
          { success: false, error: "Для sync разрешено только 720p или 1080p" },
          { status: 400 }
        );
      }
      const refDur = Math.ceil(Number(rawRefDuration) || 0);
      if (refDur < 1 || refDur > 300) {
        return NextResponse.json(
          {
            success: false,
            error: "Укажите длительность эталонного видео (1–300 сек). Перезагрузите клип или обновите страницу.",
          },
          { status: 400 }
        );
      }
    }

    const tokenCost = computeFreeVideoTokenCost({
      videoMode: videoMode as "standard" | "pro" | "sync",
      resolution: resolution as "480p" | "720p" | "1080p",
      durationSec: videoMode === "sync" ? 0 : Number(duration) || 0,
      generateAudio: Boolean(generateAudio),
      referenceVideoDurationSec:
        videoMode === "sync" ? Math.ceil(Number(rawRefDuration) || 0) : undefined,
    });

    if (!tokenCost || tokenCost < 1) {
      return NextResponse.json(
        { success: false, error: "Не удалось рассчитать стоимость генерации. Проверьте режим, качество и длительность." },
        { status: 400 }
      );
    }

    const { ok: debited, error: debitErr } = await consumeVideoTokens(
      supabase as never,
      user.id,
      tokenCost
    );
    if (!debited) {
      return NextResponse.json(
        {
          success: false,
          error:
            debitErr === "insufficient_balance"
              ? "Недостаточно видео-кредитов. Пополните баланс на главной странице (раздел цен → свободное творчество → видео-кредиты)."
              : "Не удалось списать видео-кредиты. Попробуйте позже.",
          code: "INSUFFICIENT_VIDEO_TOKENS",
        },
        { status: 403 }
      );
    }

    console.log("🎬 [generate-video-free] Пользователь:", user.id, { videoMode, tokenCost });
    console.log("📝 Промпт:", prompt.trim().slice(0, 120));
    console.log("🔧 Параметры:", { aspectRatio, resolution, duration, fixedLens, generateAudio, refs: referenceImageDataUrls.length });

    // ── Создаём задачу KIE (при ошибке возвращаем токены) ─────────────────────
    let taskId: string;
    try {
    if (videoMode === "pro") {
      taskId = await createKlingProVideoTask({
        prompt: prompt.trim(),
        aspectRatio: aspectRatio as "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9",
        resolution: resolution as "480p" | "720p" | "1080p",
        duration: duration as 5 | 10,
        generateAudio: Boolean(generateAudio),
        referenceImageDataUrls: Array.isArray(referenceImageDataUrls)
          ? referenceImageDataUrls.slice(0, 1)
          : [],
        userId: user.id,
      });
    } else if (videoMode === "standard") {
      taskId = await createFreeVideoTask({
        prompt: prompt.trim(),
        aspectRatio: aspectRatio as "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9",
        resolution: resolution as "480p" | "720p" | "1080p",
        duration: duration as 4 | 8 | 12,
        fixedLens: Boolean(fixedLens),
        generateAudio: Boolean(generateAudio),
        referenceImageDataUrls: Array.isArray(referenceImageDataUrls)
          ? referenceImageDataUrls.slice(0, 2)
          : [],
        userId: user.id,
      });
    } else if (videoMode === "sync") {
      taskId = await createKlingMotionControlVideoTask({
        prompt: prompt.trim(),
        aspectRatio: aspectRatio as "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9",
        resolution: resolution as "720p" | "1080p",
        generateAudio: Boolean(generateAudio),
        characterOrientation: characterOrientation as "image" | "video",
        inputImageDataUrl: referenceImageDataUrls[0],
        referenceVideoDataUrl: String(referenceVideoDataUrl),
        userId: user.id,
      });
    } else {
      await addVideoTokens(supabase as never, user.id, tokenCost);
      return NextResponse.json(
        { success: false, error: `videoMode '${videoMode}' пока не поддерживается для free video` },
        { status: 400 }
      );
    }
    } catch (taskErr: unknown) {
      await addVideoTokens(supabase as never, user.id, tokenCost);
      throw taskErr;
    }

    console.log("✅ [generate-video-free] Задача создана:", taskId, "tokens:", tokenCost);

    return NextResponse.json({ success: true, taskId, tokensCharged: tokenCost });
  } catch (error: any) {
    console.error("❌ [generate-video-free] Ошибка:", error);
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
