import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Обновление статуса избранного для изображения
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, isFavorite, userId = null } = body;

    if (!imageUrl || typeof isFavorite !== "boolean") {
      return NextResponse.json(
        { success: false, error: "imageUrl и isFavorite обязательны" },
        { status: 400 }
      );
    }

    // Обновляем в Supabase через серверный клиент (service_role)
    const supabase = createServerClient();
    const { error } = await supabase
      .from("free_generation_feed")
      .update({ is_favorite: isFavorite })
      .eq("user_id", userId)
      .eq("image_url", imageUrl);

    if (error) {
      console.error("❌ Ошибка обновления избранного:", error);
      return NextResponse.json(
        { success: false, error: "Ошибка обновления в базе данных" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error("Ошибка API (update favorite):", error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
