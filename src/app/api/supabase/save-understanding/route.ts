import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Сохранение данных этапа "Понимание" в Supabase
 * ВАЖНО: Все операции через серверный API route для безопасности
 */
export async function POST(request: NextRequest) {
  try {
    console.log("🔄 Сохранение данных этапа 'Понимание'...");
    const supabase = createServerClient();
    const body = await request.json();
    console.log("📋 Получены данные:", { 
      session_id: body.session_id ? "есть" : "нет",
      product_name: body.product_name?.substring(0, 30) + "...",
      selected_method: body.selected_method 
    });

    const { session_id, product_name, photo_url, selected_method } = body;

    // Валидация входных данных
    if (!product_name || !selected_method) {
      return NextResponse.json(
        { error: "product_name и selected_method обязательны" },
        { status: 400 }
      );
    }

    // Если session_id передан, проверяем, совпадает ли товар
    let finalSessionId = session_id;
    if (finalSessionId) {
      const { data: existingData } = await supabase
        .from("understanding_data")
        .select("product_name")
        .eq("session_id", finalSessionId)
        .single();

      // Если товар изменился (название отличается), создаем новую сессию
      if (existingData && existingData.product_name !== product_name.trim()) {
        console.log("🔄 Товар изменился, создаем новую сессию...");
        // Создаем новую сессию для нового товара
        const { data: newSession, error: sessionError } = await supabase
          .from("product_sessions")
          .insert({})
          .select("id")
          .single();

        if (sessionError) {
          console.error("Ошибка создания новой сессии:", sessionError);
          // Продолжаем со старым session_id, но очистим данные описания
          await supabase
            .from("description_data")
            .delete()
            .eq("session_id", finalSessionId);
        } else {
          finalSessionId = newSession.id;
          console.log("✅ Создана новая сессия:", finalSessionId);
        }
      }
      // Если товар тот же, не трогаем данные описания (они должны сохраниться при обновлении страницы)
    } else {
      // Если session_id не передан, создаем новую сессию
      const { data: newSession, error: sessionError } = await supabase
        .from("product_sessions")
        .insert({})
        .select("id")
        .single();

      if (sessionError) {
        console.error("Ошибка создания сессии:", sessionError);
        return NextResponse.json(
          { error: "Ошибка создания сессии" },
          { status: 500 }
        );
      }

      finalSessionId = newSession.id;
    }

    // Сохраняем или обновляем данные этапа "Понимание"
    const { data, error } = await supabase
      .from("understanding_data")
      .upsert(
        {
          session_id: finalSessionId,
          product_name: product_name.trim(),
          photo_url: photo_url || null,
          selected_method: selected_method,
        },
        {
          onConflict: "session_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("❌ Ошибка сохранения данных:", error);
      console.error("Детали ошибки:", JSON.stringify(error, null, 2));
      return NextResponse.json(
        { 
          error: "Ошибка сохранения данных",
          details: error.message || String(error)
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      session_id: finalSessionId,
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
