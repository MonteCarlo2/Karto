import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

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
    const { data: visualData, error: visualError } = await supabase
      .from("visual_data")
      .select("slides, visual_state")
      .eq("session_id", session_id)
      .single();

    if (visualError && visualError.code !== "PGRST116") {
      console.error("❌ [GET RESULTS] Ошибка загрузки визуальных данных:", visualError);
    }

    // Загружаем данные цены
    const { data: priceData, error: priceError } = await supabase
      .from("price_data")
      .select("price_analysis")
      .eq("session_id", session_id)
      .single();

    if (priceError && priceError.code !== "PGRST116") {
      console.error("❌ [GET RESULTS] Ошибка загрузки данных цены:", priceError);
    }

    const result = {
      success: true,
      visual_slides: visualData?.slides || null,
      visual_state: visualData?.visual_state || null,
      price_analysis: priceData?.price_analysis || null,
    };

    console.log("✅ [GET RESULTS] Результаты загружены:", {
      hasVisual: !!result.visual_slides,
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
