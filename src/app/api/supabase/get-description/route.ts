import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Загрузка данных этапа "Описание" из Supabase
 * Используется для восстановления состояния страницы после перезагрузки
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

    // Сначала проверяем данные "Понимание" для этого session_id
    const { data: understandingData } = await supabase
      .from("understanding_data")
      .select("product_name")
      .eq("session_id", session_id)
      .single();

    if (!understandingData) {
      // Если нет данных "Понимание", значит это новый товар - не загружаем описание
      return NextResponse.json({
        success: false,
        data: null,
      });
    }

    // Загружаем данные описания
    const { data, error } = await supabase
      .from("description_data")
      .select("*")
      .eq("session_id", session_id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // Запись не найдена - это нормально для нового товара
        return NextResponse.json({
          success: false,
          data: null,
        });
      }

      console.error("Ошибка загрузки данных описания:", error);
      return NextResponse.json(
        { error: "Ошибка загрузки данных описания" },
        { status: 500 }
      );
    }

    // Проверяем соответствие: если в description_data есть сохраненное product_name,
    // сравниваем его с текущим из understanding_data
    // (пока не сохраняем product_name в description_data, но на будущее)
    // Пока просто возвращаем данные, если они есть

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error("Ошибка API (get-description):", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

