import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Обновление имени пользователя
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    
    // Получаем текущего пользователя
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const { name } = await request.json();

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Имя не может быть пустым" },
        { status: 400 }
      );
    }

    // Обновляем метаданные пользователя
    const { data, error } = await supabase.auth.updateUser({
      data: {
        name: name.trim(),
      },
    });

    if (error) {
      console.error("Ошибка обновления имени:", error);
      return NextResponse.json(
        { error: "Ошибка обновления имени" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      user: data.user,
    });
  } catch (error: any) {
    console.error("Ошибка API:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
