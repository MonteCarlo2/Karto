import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServerClientWithAuth } from "@/lib/supabase/server-auth";
import {
  getFlowSessionCredits,
  mergeVisualStatePreservingCredits,
} from "@/lib/flow/flow-session-credits";

/**
 * Сохранение результатов потока (визуальные слайды и анализ цены)
 */
export async function POST(request: NextRequest) {
  try {
    console.log("🔄 Сохранение результатов потока...");
    
    // Создаем клиент Supabase с обработкой ошибок
    let supabase;
    try {
      supabase = createServerClient();
    } catch (error: any) {
      console.error("❌ Ошибка создания Supabase клиента:", error);
      return NextResponse.json(
        { 
          error: error.message || "Ошибка конфигурации сервера. Проверьте переменные окружения SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env.local и перезапустите сервер.",
          details: error.message || String(error),
          hint: "Убедитесь, что сервер перезапущен после изменения .env.local"
        },
        { status: 500 }
      );
    }
    
    const body = await request.json();
    const { session_id, visual_slides, price_analysis, visual_state } = body;

    if (!session_id) {
      return NextResponse.json(
        { error: "session_id обязателен" },
        { status: 400 }
      );
    }

    // Обновляем user_id для сессии, если он был null
    try {
      const supabaseAuth = await createServerClientWithAuth();
      if (supabaseAuth) {
        const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
        if (!userError && user?.id) {
          const { data: sessionData, error: sessionError } = await supabase
            .from("product_sessions")
            .select("user_id")
            .eq("id", session_id)
            .single();
          
          if (!sessionError && sessionData && !sessionData.user_id) {
            const { error: updateError } = await supabase
              .from("product_sessions")
              .update({ user_id: user.id })
              .eq("id", session_id);
            
            if (updateError) {
              console.error("⚠️ Ошибка обновления user_id:", updateError);
            } else {
              console.log("✅ Обновлен user_id для сессии при сохранении результатов:", session_id);
            }
          }
        } else {
          console.log("⚠️ Пользователь не авторизован, сохраняем без user_id");
        }
      }
    } catch (error) {
      console.error("⚠️ Ошибка при обновлении user_id:", error);
      // Продолжаем выполнение, это не критично
    }

    // Сохраняем визуальные слайды и состояние, если они есть
    if (visual_slides || visual_state) {
      const updateData: any = {
        session_id: session_id,
      };
      
      if (visual_slides && Array.isArray(visual_slides) && visual_slides.length > 0) {
        updateData.slides = visual_slides;
      }
      
      if (visual_state) {
        const { data: existingVisualRow } = await supabase
          .from("visual_data")
          .select("visual_state")
          .eq("session_id", session_id)
          .maybeSingle();
        const existing = (existingVisualRow?.visual_state || {}) as Record<string, unknown>;
        const patch = visual_state as Record<string, unknown>;
        const freshCredits = await getFlowSessionCredits(supabase, session_id);
        updateData.visual_state = mergeVisualStatePreservingCredits(
          existing,
          patch,
          freshCredits
        );
      }
      
      const { error: visualError } = await supabase
        .from("visual_data")
        .upsert(
          updateData,
          {
            onConflict: "session_id",
          }
        );

      if (visualError) {
        console.error("❌ Ошибка сохранения визуальных данных:", visualError);
      } else {
        console.log("✅ Визуальные данные сохранены");
      }
    }

    // Сохраняем анализ цены, если он есть
    if (price_analysis) {
      const { error: priceError } = await supabase
        .from("price_data")
        .upsert(
          {
            session_id: session_id,
            price_analysis: price_analysis,
          },
          {
            onConflict: "session_id",
          }
        );

      if (priceError) {
        console.error("❌ Ошибка сохранения данных цены:", priceError);
      } else {
        console.log("✅ Данные цены сохранены");
      }
    }

    return NextResponse.json({
      success: true,
      session_id: session_id,
    });
  } catch (error: any) {
    console.error("Ошибка API:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
