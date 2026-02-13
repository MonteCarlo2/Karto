import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { FLOW_VOLUMES, CREATIVE_VOLUMES } from "@/lib/subscription";

/**
 * POST: бета — «выбрать тариф» без оплаты.
 * Body: { mode: "0" | "1", tariffIndex: 0 | 1 | 2 }
 * mode 0 = Поток, 1 = Свободное творчество
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Войдите в аккаунт, чтобы выбрать тариф" },
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
        { success: false, error: "Войдите в аккаунт, чтобы выбрать тариф" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const mode = body?.mode === "1" ? "1" : "0";
    const tariffIndex = Math.min(2, Math.max(0, Number(body?.tariffIndex) || 0));

    const planType = mode === "0" ? "flow" : "creative";
    const planVolume = mode === "0" ? FLOW_VOLUMES[tariffIndex] : CREATIVE_VOLUMES[tariffIndex];

    const { error: upsertError } = await supabase
      .from("user_subscriptions")
      .upsert(
        {
          user_id: user.id,
          plan_type: planType,
          plan_volume: planVolume,
          period_start: new Date().toISOString(),
          flows_used: 0,
          creative_used: 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      console.error("❌ [SUBSCRIPTION SELECT] upsert error:", upsertError);
      return NextResponse.json(
        { success: false, error: "Не удалось сохранить тариф" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      planType,
      planVolume,
      redirectTo: "/profile",
    });
  } catch (err: unknown) {
    console.error("❌ [SUBSCRIPTION SELECT]:", err);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка" },
      { status: 500 }
    );
  }
}
