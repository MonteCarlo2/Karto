import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/supabase/with-timeout";

const GET_RESULTS_TIMEOUT_MS = 25_000;

/**
 * Загрузка результатов потока (визуальные слайды и анализ цены) из Supabase
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { session_id } = body;

    if (!session_id) {
      return NextResponse.json(
        { success: false, error: "session_id обязателен" },
        { status: 400 }
      );
    }

    console.log("📥 [GET RESULTS] Загрузка результатов для session_id:", session_id);

    // Создаем клиент Supabase
    const supabase = createServerClient();

    // Загружаем визуальные данные (включая состояние)
    const { data: visualData, error: visualError } = await withTimeout(
      supabase
        .from("visual_data")
        .select("slides, visual_state")
        .eq("session_id", session_id)
        .single(),
      GET_RESULTS_TIMEOUT_MS,
      "visual_data"
    );

    if (visualError && visualError.code !== "PGRST116") {
      console.error("❌ [GET RESULTS] Ошибка загрузки визуальных данных:", visualError);
    }

    // Загружаем данные цены
    let priceData: { price_analysis?: unknown } | null = null;
    let priceError: { code?: string; message?: string } | null = null;
    try {
      const priceResult = await withTimeout(
        supabase
          .from("price_data")
          .select("price_analysis")
          .eq("session_id", session_id)
          .single(),
        GET_RESULTS_TIMEOUT_MS,
        "price_data"
      );
      priceData = priceResult.data;
      priceError = priceResult.error;
    } catch (e) {
      console.error("❌ [GET RESULTS] Ошибка загрузки данных цены:", e);
    }

    const result = {
      success: true,
      visual_slides: visualData?.slides || null,
      visual_state: visualData?.visual_state || null,
      price_analysis: priceData?.price_analysis || null,
    };

    console.log("✅ [GET RESULTS] Результаты загружены:", {
      hasVisual: !!result.visual_slides,
      hasVisualState: !!(result.visual_state as { generatedCards?: unknown } | null)?.generatedCards,
      hasPrice: !!result.price_analysis,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("❌ [GET RESULTS] Критическая ошибка:", error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера", details: error?.message },
      { status: 500 }
    );
  }
}
