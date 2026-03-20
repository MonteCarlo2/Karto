import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { checkVideoTaskStatus, saveVideoToSupabase } from "@/lib/services/kie-ai-video";

/**
 * Проверка статуса задачи видео-генерации.
 * GET /api/video-status/:taskId
 *
 * Ответ:
 *   { status: "processing" }
 *   { status: "success", videoUrl: "https://..." }
 *   { status: "failed", error: "..." }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    // ── Авторизация (лёгкая проверка токена) ─────────────────────────────────
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Требуется авторизация" },
        { status: 401 }
      );
    }

    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Неверный токен" },
        { status: 401 }
      );
    }

    const { taskId } = await params;
    if (!taskId) {
      return NextResponse.json(
        { success: false, error: "taskId обязателен" },
        { status: 400 }
      );
    }

    // ── Запрашиваем статус у KIE ──────────────────────────────────────────────
    const result = await checkVideoTaskStatus(taskId);

    if (result.status === "success" && result.videoUrl) {
      // Сохраняем видео в Supabase Storage для постоянного хранения
      const permanentUrl = await saveVideoToSupabase(result.videoUrl, user.id);
      return NextResponse.json({
        success: true,
        status: "success",
        videoUrl: permanentUrl,
      });
    }

    if (result.status === "failed") {
      const raw = result.failMsg || "";
      const normalized = raw.toLowerCase();

      // KIE иногда отвечает "internal error, please try again later" (500) без деталей.
      // Для пользователя это должно выглядеть как временная недоступность модели.
      let userMessage = raw || "Видео-генерация не удалась";
      if (
        normalized.includes("internal error") ||
        normalized.includes("please try again later") ||
        normalized.includes("temporarily") ||
        normalized.includes("try again later")
      ) {
        userMessage =
          "Модель временно недоступна или идёт техническое обслуживание. Попробуйте повторить позже.";
      }

      if (normalized.includes("rate") || normalized.includes("too many")) {
        userMessage = "Слишком много запросов к модели. Попробуйте повторить позже.";
      }

      return NextResponse.json({
        success: true,
        status: "failed",
        error: userMessage,
      });
    }

    // processing
    return NextResponse.json({ success: true, status: "processing" });
  } catch (error: any) {
    console.error("❌ [video-status] Ошибка:", error);
    return NextResponse.json(
      {
        success: false,
        status: "failed",
        error: "Ошибка проверки статуса. Попробуйте снова.",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
