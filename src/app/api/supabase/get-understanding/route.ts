import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Загрузка данных этапа "Понимание" из Supabase
 * ВАЖНО: Все операции через серверный API route для безопасности
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await request.json();

    const { session_id } = body;

    if (!session_id) {
      return NextResponse.json(
        { error: "session_id обязателен" },
        { status: 400 }
      );
    }

    // Если session_id не UUID, возвращаем "данных нет" без 500
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(session_id)
    );
    if (!isUuid) {
      return NextResponse.json({
        success: false,
        data: null,
      });
    }

    const { data, error } = await supabase
      .from("understanding_data")
      .select("*")
      .eq("session_id", session_id)
      .maybeSingle();

    if (error) {
      console.error("Ошибка загрузки данных:", error);
      return NextResponse.json({
        success: false,
        data: null,
        error: error.message,
      });
    }

    if (!data) {
      return NextResponse.json({
        success: false,
        data: null,
      });
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error("Ошибка API:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
