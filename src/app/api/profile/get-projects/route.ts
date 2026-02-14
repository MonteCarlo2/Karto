import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { createServerClientWithAuth } from "@/lib/supabase/server-auth";
import { isSupabaseNetworkError } from "@/lib/supabase/network-error";

/**
 * Получение всех проектов пользователя
 */
export async function GET(request: NextRequest) {
  try {
    // Пытаемся получить токен из заголовка Authorization
    const authHeader = request.headers.get("Authorization");
    let user = null;
    
    if (authHeader && authHeader.startsWith("Bearer ")) {
      // Если токен передан в заголовке, используем его
      const token = authHeader.substring(7);
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      if (supabaseUrl && supabaseAnonKey) {
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          global: {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        });
        
        const { data: { user: userData }, error: userError } = await supabase.auth.getUser(token);
        
        if (!userError && userData) {
          user = userData;
        }
      }
    }
    
    // Если не получилось через заголовок, пробуем через cookies
    if (!user) {
      const supabaseAuth = await createServerClientWithAuth();
      if (supabaseAuth) {
        const { data: { user: userData }, error: userError } = await supabaseAuth.auth.getUser();
        if (!userError && userData) {
          user = userData;
        }
      }
    }
    
    if (!user) {
      console.warn("⚠️ [get-projects] Пользователь не найден (ни в заголовке, ни в cookies)");
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }
    
    // Используем service_role клиент для запросов к БД
    const supabase = createServerClient();

    // Сначала обновляем user_id для всех сессий, где он null, но есть данные понимания
    // Это нужно для случаев, когда пользователь создал проект до авторизации
    const { data: allSessions } = await supabase
      .from("product_sessions")
      .select("id, user_id")
      .is("user_id", null)
      .limit(100);
    
    if (allSessions && allSessions.length > 0) {
      for (const session of allSessions) {
        // Проверяем, есть ли данные понимания для этой сессии
        const { data: understanding } = await supabase
          .from("understanding_data")
          .select("id")
          .eq("session_id", session.id)
          .single();
        
        if (understanding) {
          // Обновляем user_id для этой сессии
          await supabase
            .from("product_sessions")
            .update({ user_id: user.id })
            .eq("id", session.id);
        }
      }
    }

    // Получаем все сессии пользователя
    const { data: sessions, error: sessionsError } = await supabase
      .from("product_sessions")
      .select("id, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (sessionsError) {
      console.error("Ошибка получения проектов:", sessionsError);
      return NextResponse.json(
        { error: "Ошибка получения проектов" },
        { status: 500 }
      );
    }

    // Для каждой сессии получаем данные
    const projects = await Promise.all(
      sessions.map(async (session) => {
        // Получаем данные понимания
        const { data: understanding } = await supabase
          .from("understanding_data")
          .select("product_name, photo_url, selected_method")
          .eq("session_id", session.id)
          .single();

        // Получаем данные описания
        const { data: description } = await supabase
          .from("description_data")
          .select("final_description")
          .eq("session_id", session.id)
          .single();

        // Получаем визуальные данные (проверяем, есть ли завершенные результаты)
        const { data: visual } = await supabase
          .from("visual_data")
          .select("slides")
          .eq("session_id", session.id)
          .single();

        // Получаем данные цены (проверяем, есть ли завершенные результаты)
        const { data: price } = await supabase
          .from("price_data")
          .select("price_analysis")
          .eq("session_id", session.id)
          .single();

        // Определяем прогресс потока
        const hasUnderstanding = !!understanding;
        const hasDescription = !!(description?.final_description);
        const hasVisual = !!(visual?.slides && Array.isArray(visual.slides) && visual.slides.length > 0);
        const hasPrice = !!price?.price_analysis;
        
        // Проект считается завершенным ТОЛЬКО если есть И визуальные данные, И данные цены
        // Это означает, что пользователь прошел все этапы до конца
        const isCompleted = hasVisual && hasPrice;
        
        // Определяем следующий этап для продолжения
        let nextStage: "understanding" | "description" | "visual" | "price" | "results" | null = null;
        if (!hasUnderstanding) {
          nextStage = "understanding";
        } else if (!hasDescription) {
          nextStage = "description";
        } else if (!hasVisual) {
          nextStage = "visual";
        } else if (!hasPrice) {
          nextStage = "price";
        } else {
          nextStage = "results";
        }

        return {
          id: session.id,
          createdAt: session.created_at,
          updatedAt: session.updated_at,
          productName: understanding?.product_name || "Без названия",
          photoUrl: understanding?.photo_url || null,
          method: understanding?.selected_method || null,
          description: description?.final_description || null,
          isCompleted: isCompleted,
          hasVisual: hasVisual,
          hasPrice: hasPrice,
          // Информация о прогрессе
          progress: {
            hasUnderstanding,
            hasDescription,
            hasVisual,
            hasPrice,
            nextStage,
          },
        };
      })
    );

    return NextResponse.json({
      success: true,
      projects,
    });
  } catch (error: unknown) {
    if (isSupabaseNetworkError(error)) {
      console.warn("⚠️ [get-projects] Supabase недоступен (сеть/таймаут), отдаём пустой список");
      return NextResponse.json({ success: true, projects: [] });
    }
    console.error("Ошибка API:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
