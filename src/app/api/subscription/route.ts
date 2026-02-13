import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getSubscriptionByUserId, subscriptionToState } from "@/lib/subscription";

/**
 * GET: текущая подписка пользователя (по Authorization: Bearer <token>).
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

    const row = await getSubscriptionByUserId(supabase as any, user.id);

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
