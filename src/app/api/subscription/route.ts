import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getSubscriptionByUserId, subscriptionToState, FREE_WELCOME_CREATIVE_LIMIT } from "@/lib/subscription";
import { sendWelcomeEmail } from "@/lib/send-welcome-email";

/**
 * GET: текущая подписка пользователя (по Authorization: Bearer <token>).
 * Если у пользователя ещё нет подписки — создаём приветственную: 3 бесплатные генерации «Свободное творчество» и отправляем приветственное письмо.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json(
        { success: false, subscription: null, error: "Не авторизован" },
        { status: 401 }
      );
    }

    const supabase = createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json(
        { success: false, subscription: null, error: "Не авторизован" },
        { status: 401 }
      );
    }

    let row = await getSubscriptionByUserId(supabase as any, user.id);

    if (!row) {
      const { error: insertError } = await supabase.from("user_subscriptions").insert({
        user_id: user.id,
        plan_type: "creative",
        plan_volume: FREE_WELCOME_CREATIVE_LIMIT,
        period_start: new Date().toISOString(),
        flows_used: 0,
        creative_used: 0,
      });

      if (insertError) {
        if (insertError.code === "23505") {
          row = await getSubscriptionByUserId(supabase as any, user.id) ?? null;
        } else {
          console.error("❌ [SUBSCRIPTION] Ошибка создания приветственной подписки:", insertError);
          return NextResponse.json({
            success: true,
            subscription: null,
          });
        }
      } else {
        row = await getSubscriptionByUserId(supabase as any, user.id) ?? null;
        sendWelcomeEmail({
          to: user.email ?? "",
          name: (user.user_metadata?.name as string) || undefined,
        }).catch(() => {});
      }
    }

    if (!row) {
      return NextResponse.json({
        success: true,
        subscription: null,
      });
    }

    return NextResponse.json({
      success: true,
      subscription: subscriptionToState(row as any),
    });
  } catch (err: unknown) {
    console.error("❌ [SUBSCRIPTION] GET:", err);
    return NextResponse.json(
      { success: false, subscription: null, error: "Внутренняя ошибка" },
      { status: 500 }
    );
  }
}
