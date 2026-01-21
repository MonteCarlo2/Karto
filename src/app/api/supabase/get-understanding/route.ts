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

    const { data, error } = await supabase
      .from("understanding_data")
      .select("*")
      .eq("session_id", session_id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // Запись не найдена
        return NextResponse.json({
          success: false,
          data: null,
        });
      }

      console.error("Ошибка загрузки данных:", error);
      return NextResponse.json(
        { error: "Ошибка загрузки данных" },
        { status: 500 }
      );
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
