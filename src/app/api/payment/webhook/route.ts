import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { FLOW_VOLUMES, CREATIVE_VOLUMES } from "@/lib/subscription";

/**
 * POST: webhook ЮKassa. Вызывается при смене статуса платежа.
 * Обрабатываем только payment.succeeded — записываем/обновляем user_subscriptions.
 * В кабинете ЮKassa укажи URL: https://ваш-домен/api/payment/webhook и событие payment.succeeded.
 */
export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    let body: {
      type?: string;
      event?: string;
      object?: {
        id?: string;
        status?: string;
        metadata?: Record<string, string>;
      };
    };
    try {
      body = JSON.parse(raw);
    } catch {
      return new NextResponse("Bad request", { status: 400 });
    }

    if (body?.type !== "notification" || body?.event !== "payment.succeeded") {
      return new NextResponse(null, { status: 200 });
    }

    const payment = body.object;
    if (!payment || payment.status !== "succeeded") {
      return new NextResponse(null, { status: 200 });
    }

    const metadata = payment.metadata || {};
    const userId = metadata.user_id;
    const mode = metadata.mode === "1" ? "1" : "0";
    const tariffIndex = Math.min(2, Math.max(0, Number(metadata.tariffIndex) || 0));

    if (!userId) {
      console.warn("⚠️ [PAYMENT WEBHOOK] No user_id in metadata, payment id:", payment.id);
      return new NextResponse(null, { status: 200 });
    }

    const planType = mode === "0" ? "flow" : "creative";
    const planVolume = mode === "0" ? FLOW_VOLUMES[tariffIndex] : CREATIVE_VOLUMES[tariffIndex];
    const now = new Date().toISOString();

    const supabase = createServerClient();
    const { data: existing } = await supabase
      .from("user_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("plan_type", planType)
      .maybeSingle();

    if (existing) {
      const { error: updateError } = await supabase
        .from("user_subscriptions")
        .update({
          plan_volume: planVolume,
          period_start: now,
          updated_at: now,
        })
        .eq("user_id", userId)
        .eq("plan_type", planType);
      if (updateError) {
        console.error("❌ [PAYMENT WEBHOOK] update error:", updateError);
        return new NextResponse(null, { status: 200 });
      }
    } else {
      const { error: insertError } = await supabase.from("user_subscriptions").insert({
        user_id: userId,
        plan_type: planType,
        plan_volume: planVolume,
        period_start: now,
        flows_used: 0,
        creative_used: 0,
        updated_at: now,
      });
      if (insertError) {
        console.error("❌ [PAYMENT WEBHOOK] insert error:", insertError);
        return new NextResponse(null, { status: 200 });
      }
    }

    return new NextResponse(null, { status: 200 });
  } catch (err) {
    console.error("❌ [PAYMENT WEBHOOK]:", err);
    return new NextResponse(null, { status: 200 });
  }
}
