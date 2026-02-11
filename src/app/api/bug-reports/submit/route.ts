import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Отправка отчета о неполадке в Supabase
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { description, image_urls = [], user_email, user_name } = body;

    if (!description || !description.trim()) {
      return NextResponse.json(
        { success: false, error: "Описание проблемы обязательно" },
        { status: 400 }
      );
    }

    console.log("📥 [BUG REPORT] Получен отчет:", {
      user_email: user_email || "anonymous",
      description_length: description.length,
      images_count: image_urls.length,
    });

    // Создаем клиент Supabase с service_role для обхода RLS
    const supabase = createServerClient();

    // Вставляем запись в таблицу bug_reports
    const { data, error } = await supabase
      .from("bug_reports")
      .insert({
        description: description.trim(),
        image_urls: image_urls.length > 0 ? image_urls : [],
        user_email: user_email || "anonymous",
        user_name: user_name || "Пользователь",
        status: "new",
      })
      .select()
      .single();

    if (error) {
      console.error("❌ [BUG REPORT] Ошибка сохранения:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Ошибка сохранения отчета",
          details: error.message,
        },
        { status: 500 }
      );
    }

    console.log("✅ [BUG REPORT] Отчет успешно сохранен! ID:", data?.id);

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
      },
    });
  } catch (error: any) {
    console.error("❌ [BUG REPORT] Критическая ошибка:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Внутренняя ошибка сервера",
        details: error?.message,
      },
      { status: 500 }
    );
  }
}
