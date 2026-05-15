import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

function emptyOkResponse(details?: { degraded?: boolean; message?: string }) {
  return NextResponse.json({
    success: true,
    data: [] as unknown[],
    ...details,
  });
}

/**
 * Загрузка ленты свободной генерации пользователя
 */
export async function GET(request: NextRequest) {
  let supabase: ReturnType<typeof createServerClient>;
  try {
    supabase = createServerClient();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[free-feed/list] Серверный Supabase не настроен:", msg);
    return emptyOkResponse({
      degraded: true,
      message: "База недоступна (проверьте .env.local). Лента из localStorage.",
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const onlyFavorites = searchParams.get("favorites") === "true";

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
      console.error("❌ Ошибка загрузки ленты free_generation_feed:", error);
      return emptyOkResponse({
        degraded: true,
        message: error.message ?? "Ошибка БД при чтении ленты",
      });
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error: unknown) {
    console.error("Ошибка API (list free feed):", error);
    const msg = error instanceof Error ? error.message : String(error);
    return emptyOkResponse({
      degraded: true,
      message: msg || "Внутренняя ошибка сервера",
    });
  }
}
