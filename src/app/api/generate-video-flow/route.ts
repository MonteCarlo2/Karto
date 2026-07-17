import { NextRequest, NextResponse } from "next/server";

import { createServerClient } from "@/lib/supabase/server";
import {
  createFlowGrokImagineVideoTask,
  createFlowSeedanceVideoTask,
  flowAspectToGrokImagine,
} from "@/lib/services/kie-ai-video";
import { isDemoProductSession } from "@/lib/demo-flow-server";
import { isFlowDevBypassServerEnabled } from "@/lib/flow/flow-dev-skip";
import {
  CREDIT_FLOW_ANIMATE,
  estimateGrokImagine720CreditCost,
} from "@/lib/credits-pricing";
import {
  consumeFlowSessionCredits,
  refundFlowSessionCredits,
} from "@/lib/flow/flow-session-credits";

const DEFAULT_ANIMATE_PROMPT =
  "Subtle cinematic product animation, gentle natural movement, preserve all product text labels and infographic overlays clearly visible, static camera, professional commercial style, high quality";

const VALID_ASPECTS = ["1:1", "4:3", "3:4", "16:9", "9:16"] as const;
type FlowVideoAspect = (typeof VALID_ASPECTS)[number];

function normalizeAspect(raw: unknown): FlowVideoAspect {
  if (typeof raw === "string" && VALID_ASPECTS.includes(raw as FlowVideoAspect)) {
    return raw as FlowVideoAspect;
  }
  return "3:4";
}

function normalizeDuration(raw: unknown, mode: "animate" | "generate"): number {
  if (mode === "animate") return 4;
  const n = typeof raw === "number" ? Math.round(raw) : Number(raw);
  if (!Number.isFinite(n)) return 6;
  return Math.max(3, Math.min(10, n));
}

/**
 * Видео в платном Потоке:
 * - animate → Seedance 1.5 Pro (1080p, 4 с, без звука)
 * - generate → Grok Imagine Video 1.5 Preview (720p, 3–10 с, звук всегда)
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
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Войдите в аккаунт для генерации" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      sessionId,
      cardImageUrl,
      referenceImageUrls = [],
      mode = "generate",
      prompt = "",
      aspectRatio: rawAspect,
      duration: rawDuration,
    } = body as {
      sessionId?: string;
      cardImageUrl?: string;
      referenceImageUrls?: string[];
      mode?: "animate" | "generate";
      prompt?: string;
      aspectRatio?: string;
      duration?: number;
    };

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "sessionId обязателен" },
        { status: 400 }
      );
    }

    if (!cardImageUrl || typeof cardImageUrl !== "string") {
      return NextResponse.json(
        { success: false, error: "Необходимо изображение карточки" },
        { status: 400 }
      );
    }

    if (mode !== "animate" && mode !== "generate") {
      return NextResponse.json(
        { success: false, error: "Некорректный mode (animate или generate)" },
        { status: 400 }
      );
    }

    const { data: sessionRow, error: sessionError } = await supabase
      .from("product_sessions")
      .select("user_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError || !sessionRow) {
      return NextResponse.json(
        { success: false, error: "Сессия Потока не найдена" },
        { status: 404 }
      );
    }

    if (sessionRow.user_id !== user.id) {
      return NextResponse.json(
        { success: false, error: "Нет доступа к этой сессии" },
        { status: 403 }
      );
    }

    const isDemo = await isDemoProductSession(supabase as never, sessionId);
    if (isDemo && !isFlowDevBypassServerEnabled()) {
      return NextResponse.json(
        {
          success: false,
          error: "Видео доступно в полном Потоке. В демо — только фото.",
          code: "FLOW_VIDEO_DEMO_BLOCKED",
        },
        { status: 403 }
      );
    }

    const aspectRatio = normalizeAspect(rawAspect);
    const duration = normalizeDuration(rawDuration, mode);

    const customRefs = Array.isArray(referenceImageUrls)
      ? referenceImageUrls.filter((u): u is string => typeof u === "string" && u.length > 0).slice(0, 1)
      : [];

    const userPrompt = typeof prompt === "string" ? prompt.trim() : "";

    let finalPrompt: string;
    let fixedLens: boolean;
    let taskId: string;
    const creditsCharged =
      mode === "animate"
        ? CREDIT_FLOW_ANIMATE
        : estimateGrokImagine720CreditCost(duration);

    const consumed = await consumeFlowSessionCredits(supabase, sessionId, creditsCharged);
    if (!consumed.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            consumed.error === "insufficient_flow_credits"
              ? `Недостаточно кредитов Потока (нужно ${creditsCharged}, осталось ${consumed.state?.credits_remaining ?? 0}).`
              : "Не удалось списать кредиты Потока",
          code: consumed.error ?? "insufficient_flow_credits",
          credits_remaining: consumed.state?.credits_remaining ?? 0,
          credits_total: consumed.state?.credits_total ?? 0,
        },
        { status: 403 }
      );
    }

    try {
      if (mode === "animate") {
        const extraHints = [
          "static camera, no camera movement, fixed shot",
          "preserve all product text, labels, numbers and infographic overlays clearly visible",
        ];
        finalPrompt = userPrompt
          ? `${userPrompt}, ${extraHints.join(", ")}`
          : `${DEFAULT_ANIMATE_PROMPT}, ${extraHints.join(", ")}`;
        fixedLens = true;

        taskId = await createFlowSeedanceVideoTask({
          prompt: finalPrompt,
          referenceImageUrls: [cardImageUrl],
          aspectRatio,
          duration: 4,
          generateAudio: false,
          fixedLens,
          userId: user.id,
        });
      } else {
        if (userPrompt.length < 3) {
          await refundFlowSessionCredits(supabase, sessionId, creditsCharged);
          return NextResponse.json(
            { success: false, error: "Опишите видео в поле ниже (минимум 3 символа)" },
            { status: 400 }
          );
        }
        finalPrompt = userPrompt;
        fixedLens = false;

        const imageForGrok = customRefs[0] ?? cardImageUrl;
        const grokAspect = flowAspectToGrokImagine(aspectRatio);

        taskId = await createFlowGrokImagineVideoTask({
          prompt: finalPrompt,
          imageUrl: imageForGrok,
          aspectRatio: grokAspect,
          duration,
          userId: user.id,
        });
      }
    } catch (taskError) {
      await refundFlowSessionCredits(supabase, sessionId, creditsCharged);
      throw taskError;
    }

    return NextResponse.json({
      success: true,
      taskId,
      creditsCharged,
      credits_remaining: consumed.state?.credits_remaining ?? 0,
      duration,
      aspectRatio,
      model: mode === "animate" ? "seedance-1.5-pro" : "grok-imagine-video-1.5-preview",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("❌ [generate-video-flow] Ошибка:", message);
    return NextResponse.json(
      {
        success: false,
        error:
          message.includes("загрузить") || message.includes("референс")
            ? message
            : "Ошибка запуска видео-генерации. Попробуйте ещё раз.",
        details: message,
      },
      { status: 500 }
    );
  }
}
