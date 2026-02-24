import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isSupabaseNetworkError } from "@/lib/supabase/network-error";
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
    let user: { id: string } | null = null;
    let authError: Error | null = null;
    try {
      const result = await supabase.auth.getUser(token);
      user = result.data?.user ?? null;
      authError = result.error as Error | null;
    } catch (e) {
      if (isSupabaseNetworkError(e)) {
        console.warn("⚠️ [SUBSCRIPTION SELECT] Supabase недоступен");
        return NextResponse.json(
          { success: false, error: "Сервис временно недоступен. Попробуйте позже." },
          { status: 200 }
        );
      }
      throw e;
    }
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
    const now = new Date().toISOString();

    const { data: existing } = await supabase
      .from("user_subscriptions")
      .select("id, flows_used, creative_used")
      .eq("user_id", user.id)
      .eq("plan_type", planType)
      .maybeSingle();

    if (existing) {
      const { error: updateError } = await supabase
        .from("user_subscriptions")
        .update({ plan_volume: planVolume, period_start: now })
        .eq("user_id", user.id)
        .eq("plan_type", planType);
      if (updateError) {
        console.error("❌ [SUBSCRIPTION SELECT] update error:", updateError);
        return NextResponse.json(
          { success: false, error: "Не удалось сохранить тариф" },
          { status: 500 }
        );
      }
    } else {
      const { error: insertError } = await supabase.from("user_subscriptions").insert({
        user_id: user.id,
        plan_type: planType,
        plan_volume: planVolume,
        period_start: now,
        flows_used: 0,
        creative_used: 0,
      });
      if (insertError) {
        console.error("❌ [SUBSCRIPTION SELECT] insert error:", insertError);
        return NextResponse.json(
          { success: false, error: "Не удалось сохранить тариф" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      planType,
      planVolume,
      redirectTo: "/profile",
    });
  } catch (err: unknown) {
    if (isSupabaseNetworkError(err)) {
      console.warn("⚠️ [SUBSCRIPTION SELECT] Supabase недоступен (сеть/таймаут)");
      return NextResponse.json(
        { success: false, error: "Сервис временно недоступен. Попробуйте позже." },
        { status: 200 }
      );
    }
    console.error("❌ [SUBSCRIPTION SELECT]:", err);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка" },
      { status: 500 }
    );
  }
}
