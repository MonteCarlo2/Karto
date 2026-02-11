import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Сохранение данных этапа "Описание" в Supabase
 * ВАЖНО: Все операции через серверный API route для безопасности
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await request.json();

    const {
      session_id,
      user_preferences,
      selected_blocks,
      generated_descriptions,
      final_description,
    } = body;

    if (!session_id) {
      return NextResponse.json(
        { error: "session_id обязателен" },
        { status: 400 }
      );
    }

    // Обновляем user_id для сессии, если он был null
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      const { data: sessionData } = await supabase
        .from("product_sessions")
        .select("user_id")
        .eq("id", session_id)
        .single();
      
      if (sessionData && !sessionData.user_id) {
        await supabase
          .from("product_sessions")
          .update({ user_id: user.id })
          .eq("id", session_id);
        console.log("✅ Обновлен user_id для сессии при сохранении описания:", session_id);
      }
    }

    // Сохраняем или обновляем данные этапа "Описание"
    const { data, error } = await supabase
      .from("description_data")
      .upsert(
        {
          session_id,
          user_preferences: user_preferences || {},
          selected_blocks: selected_blocks || [],
          generated_descriptions: generated_descriptions || [],
          final_description: final_description || null,
        },
        {
          onConflict: "session_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Ошибка сохранения данных:", error);
      return NextResponse.json(
        { error: "Ошибка сохранения данных" },
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
