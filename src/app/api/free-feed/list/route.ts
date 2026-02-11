import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Загрузка ленты свободной генерации пользователя
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const onlyFavorites = searchParams.get("favorites") === "true";

    // Загружаем из Supabase через серверный клиент (service_role)
    const supabase = createServerClient();
    let query = supabase
      .from("free_generation_feed")
      .select("*")
      .order("created_at", { ascending: false });

    if (userId) {
      query = query.eq("user_id", userId);
    }

    if (onlyFavorites) {
      query = query.eq("is_favorite", true);
    }

    const { data, error } = await query;

    if (error) {
      console.error("❌ Ошибка загрузки ленты:", error);
      return NextResponse.json(
        { success: false, error: "Ошибка загрузки из базы данных" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error: any) {
    console.error("Ошибка API (list free feed):", error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
