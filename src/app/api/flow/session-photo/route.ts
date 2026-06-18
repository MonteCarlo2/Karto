import { NextRequest, NextResponse } from "next/server";
import { setFlowSessionPhoto } from "@/lib/flow/flow-session-photo-store";

export const maxDuration = 60;

/**
 * Принимает сжатое фото товара и хранит в памяти сервера по session_id.
 * Batch-генерация читает фото отсюда — не нужно слать мегабайты в /api/generate-cards-batch.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    const photoUrl = typeof body.photoUrl === "string" ? body.photoUrl.trim() : "";

    if (!sessionId) {
      return NextResponse.json({ success: false, error: "sessionId обязателен" }, { status: 400 });
    }
    if (!photoUrl.startsWith("data:")) {
      return NextResponse.json(
        { success: false, error: "photoUrl должен быть data URL" },
        { status: 400 }
      );
    }

    setFlowSessionPhoto(sessionId, photoUrl);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("❌ [session-photo] Ошибка:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Не удалось сохранить фото для генерации",
        details: (error as { message?: string })?.message || String(error),
      },
      { status: 500 }
    );
  }
}
