import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServerClientWithAuth } from "@/lib/supabase/server-auth";
import { isSupabaseNetworkError } from "@/lib/supabase/network-error";
import { isSupabaseFailure, withTimeout } from "@/lib/supabase/with-timeout";
import { getSubscriptionByUserId, getSubscriptionRowsByUserId } from "@/lib/subscription";

/** Получить user id: сначала из Authorization, затем из cookies */
async function getUserIdFromRequest(request: NextRequest, supabase: ReturnType<typeof createServerClient>): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (token) {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user?.id) return user.id;
  }
  try {
    const supabaseAuth = await createServerClientWithAuth();
    if (supabaseAuth) {
      const { data: { user } } = await supabaseAuth.auth.getUser();
      if (user?.id) return user.id;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Base64-фото храним в localStorage на клиенте; в БД — только https URL или null. */
function sanitizePhotoUrlForDb(photoUrl: unknown): string | null {
  if (typeof photoUrl !== "string") return null;
  const trimmed = photoUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:")) return null;
  if (trimmed.length > 2048) return null;
  return trimmed;
}

function flowQuotaBypassEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.FLOW_DEV_BYPASS === "1";
}

async function chargeFlowAndCreateSession(
  supabase: ReturnType<typeof createServerClient>,
  userId: string
): Promise<{ sessionId: string } | { error: string; status: number }> {
  if (flowQuotaBypassEnabled()) {
    const { data: newSession, error: sessionError } = await supabase
      .from("product_sessions")
      .insert({ user_id: userId })
      .select("id")
      .single();
    if (sessionError || !newSession?.id) {
      console.error("Ошибка создания сессии (dev bypass):", sessionError);
      return { error: "Ошибка создания сессии", status: 500 };
    }
    return { sessionId: newSession.id as string };
  }

  const sub = await getSubscriptionByUserId(supabase as any, userId);
  if (!sub) {
    return { error: "Выберите тариф «Поток» на главной странице", status: 403 };
  }
  if (sub.flowsLimit <= 0) {
    return { error: "Поток не куплен. Выберите тариф «Поток» на главной.", status: 403 };
  }
  if (sub.flowsUsed >= sub.flowsLimit) {
    const flowsLeft = Math.max(0, sub.flowsLimit - sub.flowsUsed);
    return {
      error: `Лимит потоков исчерпан. Доступно: ${flowsLeft}.`,
      status: 403,
    };
  }
  const flowRows = await getSubscriptionRowsByUserId(supabase as any, userId);
  const flowRow = flowRows.find((r) => r.plan_type === "flow");
  if (!flowRow) {
    return { error: "Запись подписки «Поток» не найдена.", status: 403 };
  }
  const { error: updErr } = await supabase
    .from("user_subscriptions")
    .update({ flows_used: flowRow.flows_used + 1 })
    .eq("user_id", userId)
    .eq("plan_type", "flow");
  if (updErr) {
    console.error("Ошибка списания потока:", updErr);
    return { error: "Ошибка списания потока", status: 500 };
  }
  const { data: newSession, error: sessionError } = await supabase
    .from("product_sessions")
    .insert({ user_id: userId })
    .select("id")
    .single();
  if (sessionError || !newSession?.id) {
    console.error("Ошибка создания сессии:", sessionError);
    return { error: "Ошибка создания сессии", status: 500 };
  }
  return { sessionId: newSession.id as string };
}

/**
 * Сохранение данных этапа "Понимание" в Supabase
 * ВАЖНО: Все операции через серверный API route для безопасности
 */
export async function POST(request: NextRequest) {
  let resolvedSessionId: string | null = null;

  try {
    console.log("🔄 Сохранение данных этапа 'Понимание'...");
    
    // Создаем клиент Supabase с обработкой ошибок
    let supabase;
    try {
      supabase = createServerClient();
    } catch (error: any) {
      console.error("❌ Ошибка создания Supabase клиента:", error);
      console.error("💡 Проверьте:");
      console.error("   1. Файл .env.local существует в корне проекта (рядом с package.json)");
      console.error("   2. Переменные SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY указаны в .env.local");
      console.error("   3. Сервер разработки перезапущен после изменения .env.local");
      console.error("   4. Нет пробелов вокруг знака = в .env.local");
      console.error("   5. Ключи не обрезаны и находятся на одной строке");
      
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
    console.log("📋 Получены данные:", { 
      session_id: body.session_id ? "есть" : "нет",
      product_name: body.product_name?.substring(0, 30) + "...",
      selected_method: body.selected_method 
    });

    const { session_id, product_name, photo_url, selected_method } = body;
    const safePhotoUrl = sanitizePhotoUrlForDb(photo_url);
    const method = String(selected_method || "photo").trim() || "photo";

    // Валидация входных данных
    if (!product_name || !method) {
      return NextResponse.json(
        { error: "product_name и selected_method обязательны" },
        { status: 400 }
      );
    }

    // Если session_id передан, сначала валидируем, что такая сессия реально существует.
    // Иначе считаем это новым запуском Потока.
    let finalSessionId = session_id;
    if (finalSessionId) {
      const { data: existingSession, error: sessionCheckError } = await supabase
        .from("product_sessions")
        .select("id")
        .eq("id", finalSessionId)
        .maybeSingle();

      if (sessionCheckError || !existingSession) {
        finalSessionId = null;
      }
    }

    // Если session_id валиден и передан, проверяем, совпадает ли товар
    if (finalSessionId) {
      const { data: existingData, error: fetchError } = await supabase
        .from("understanding_data")
        .select("product_name")
        .eq("session_id", finalSessionId)
        .single();
      
      // Если ошибка при получении данных (например, запись не найдена), продолжаем
      if (fetchError && fetchError.code !== "PGRST116") {
        console.warn("⚠️ Ошибка при получении существующих данных:", fetchError.message || fetchError);
      }

      // Если товар изменился (название отличается), создаем новую сессию
      if (existingData && existingData.product_name !== product_name.trim()) {
        console.log("🔄 Товар изменился, создаем новую сессию...");
        const userId = await getUserIdFromRequest(request, supabase);
        if (!userId) {
          return NextResponse.json(
            { error: "Войдите в аккаунт, чтобы начать Поток" },
            { status: 403 }
          );
        }
        const charged = await chargeFlowAndCreateSession(supabase, userId);
        if ("error" in charged) {
          return NextResponse.json({ error: charged.error }, { status: charged.status });
        }
        finalSessionId = charged.sessionId;
        console.log("✅ Создана новая сессия:", finalSessionId);
        await supabase.from("description_data").delete().eq("session_id", session_id);
      }
      // Если товар тот же, обновляем user_id если он был null
      if (finalSessionId) {
        try {
          // Получаем пользователя из cookies
          const supabaseAuth = await createServerClientWithAuth();
          if (supabaseAuth) {
            const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
            
            if (userError) {
              console.log("⚠️ Пользователь не авторизован, продолжаем без user_id");
            } else if (user?.id) {
              // Проверяем, есть ли user_id у сессии
              const { data: sessionData, error: sessionError } = await supabase
                .from("product_sessions")
                .select("user_id")
                .eq("id", finalSessionId)
                .single();
              
              if (sessionError) {
                console.error("⚠️ Ошибка проверки сессии:", sessionError);
              } else if (sessionData && !sessionData.user_id) {
                const { error: updateError } = await supabase
                  .from("product_sessions")
                  .update({ user_id: user.id })
                  .eq("id", finalSessionId);
                
                if (updateError) {
                  console.error("⚠️ Ошибка обновления user_id:", updateError);
                } else {
                  console.log("✅ Обновлен user_id для существующей сессии:", finalSessionId);
                }
              }
            }
          } else {
            console.log("⚠️ Не удалось создать клиент с авторизацией, продолжаем без user_id");
          }
        } catch (error) {
          console.error("⚠️ Ошибка при обновлении user_id:", error);
          // Продолжаем выполнение, это не критично
        }
      }
      // Если товар тот же, не трогаем данные описания (они должны сохраниться при обновлении страницы)
    } else {
      const userId = await getUserIdFromRequest(request, supabase);
      if (!userId) {
        return NextResponse.json(
          { error: "Войдите в аккаунт, чтобы начать Поток" },
          { status: 403 }
        );
      }
      const charged = await chargeFlowAndCreateSession(supabase, userId);
      if ("error" in charged) {
        return NextResponse.json({ error: charged.error }, { status: charged.status });
      }
      finalSessionId = charged.sessionId;
    }

    resolvedSessionId = finalSessionId;

    const { data, error } = await withTimeout(
      supabase
        .from("understanding_data")
        .upsert(
          {
            session_id: finalSessionId,
            product_name: product_name.trim(),
            photo_url: safePhotoUrl,
            selected_method: method,
          },
          { onConflict: "session_id" }
        )
        .select()
        .single(),
      12_000,
      "understanding_data upsert"
    );

    if (error) {
      if (isSupabaseFailure(error) && finalSessionId) {
        console.warn("⚠️ [save-understanding] Сеть/Supabase — отдаём offline success:", finalSessionId);
        return NextResponse.json({
          success: true,
          session_id: finalSessionId,
          offline: true,
        });
      }
      console.error("❌ Ошибка сохранения данных:", error);
      console.error("Детали ошибки:", JSON.stringify(error, null, 2));
      console.error("Код ошибки:", error.code);
      console.error("Сообщение:", error.message);
      console.error("Детали:", error.details);
      console.error("Подсказка:", error.hint);
      
      // Более понятное сообщение об ошибке
      let errorMessage = "Ошибка сохранения данных";
      
      // Обработка специфических ошибок
      if (error.message && error.message.includes("Invalid API key")) {
        errorMessage = "Ошибка конфигурации: неверный API ключ Supabase. Проверьте переменные окружения.";
      } else if (error.code === "23503") {
        errorMessage = "Ошибка: сессия не найдена. Попробуйте обновить страницу.";
      } else if (error.code === "23505") {
        errorMessage = "Ошибка: дублирование данных. Попробуйте обновить страницу.";
      } else if (error.message) {
        errorMessage = `Ошибка: ${error.message}`;
      }
      
      return NextResponse.json(
        { 
          error: errorMessage,
          details: error.message || String(error),
          code: error.code
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      session_id: finalSessionId,
      data,
    });
  } catch (error: unknown) {
    if (isSupabaseNetworkError(error) || isSupabaseFailure(error)) {
      console.warn("⚠️ [save-understanding] Supabase недоступен (сеть/таймаут)");
      if (resolvedSessionId) {
        return NextResponse.json({ success: true, session_id: resolvedSessionId, offline: true });
      }
      return NextResponse.json(
        { error: "Сервис временно недоступен. Попробуйте позже." },
        { status: 503 }
      );
    }
    console.error("Ошибка API:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
