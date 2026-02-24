import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { FLOW_VOLUMES, CREATIVE_VOLUMES } from "@/lib/subscription";

/**
 * GET: проверка в браузере — возвращает 200 и текст (ЮKassa шлёт только POST).
 * POST: webhook ЮKassa. Вызывается при смене статуса платежа.
 * В кабинете ЮKassa URL: https://karto.pro/api/payment/webhook, событие payment.succeeded.
 */
export async function GET() {
  return new NextResponse("Webhook ЮKassa. Принимаем только POST от кассы.", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    console.log("📥 [PAYMENT WEBHOOK] Получен запрос, длина body:", raw?.length ?? 0);
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
    console.log("📥 [PAYMENT WEBHOOK] payment.succeeded, payment.id:", payment?.id);
    if (!payment || payment.status !== "succeeded") {
      return new NextResponse(null, { status: 200 });
    }

    const metadata = payment.metadata || {};
    const userId = typeof metadata.user_id === "string" ? metadata.user_id.trim() : (metadata.user_id ?? "");
    const mode = String(metadata.mode) === "1" ? "1" : "0";
    const tariffIndex = Math.min(2, Math.max(0, Number(metadata.tariffIndex) ?? 0));

    if (!userId) {
      console.warn("⚠️ [PAYMENT WEBHOOK] No user_id in metadata, payment id:", payment.id, "metadata:", JSON.stringify(metadata));
      return new NextResponse(null, { status: 200 });
    }

    const planType = mode === "0" ? "flow" : "creative";
    const purchasedVolume = mode === "0" ? FLOW_VOLUMES[tariffIndex] : CREATIVE_VOLUMES[tariffIndex];
    const now = new Date().toISOString();
    console.log("📥 [PAYMENT WEBHOOK] Обработка: userId=", userId, "planType=", planType, "purchasedVolume=", purchasedVolume);

    let supabase;
    try {
      supabase = createServerClient();
    } catch (e) {
      console.error("❌ [PAYMENT WEBHOOK] Не удалось создать Supabase-клиент (проверьте SUPABASE_SERVICE_ROLE_KEY):", e);
      return new NextResponse(null, { status: 200 });
    }

    const { data: alreadyProcessed } = await supabase
      .from("payment_processed")
      .select("payment_id")
      .eq("payment_id", payment.id)
      .maybeSingle();
    if (alreadyProcessed) {
      console.log("📥 [PAYMENT WEBHOOK] Платёж уже обработан (идемпотентность), payment_id:", payment.id);
      return new NextResponse(null, { status: 200 });
    }
    const { error: claimError } = await supabase.from("payment_processed").insert({ payment_id: payment.id });
    if (claimError?.code === "23505") {
      console.log("📥 [PAYMENT WEBHOOK] Платёж уже обработан (гонка), payment_id:", payment.id);
      return new NextResponse(null, { status: 200 });
    }
    if (claimError) {
      console.warn("⚠️ [PAYMENT WEBHOOK] payment_processed insert:", claimError.message);
    }

    const { data: existing } = await supabase
      .from("user_subscriptions")
      .select("id, plan_volume, period_start")
      .eq("user_id", userId)
      .eq("plan_type", planType)
      .maybeSingle();

    if (existing) {
      const newVolume = (existing.plan_volume ?? 0) + purchasedVolume;
      const { error: updateError } = await supabase
        .from("user_subscriptions")
        .update({ plan_volume: newVolume })
        .eq("user_id", userId)
        .eq("plan_type", planType);
      if (updateError) {
        console.error("❌ [PAYMENT WEBHOOK] update error:", updateError);
        return new NextResponse(null, { status: 200 });
      }
      console.log("✅ [PAYMENT WEBHOOK] Добавлено к подписке:", userId, planType, `+${purchasedVolume} → всего ${newVolume}`);
    } else {
      const { error: insertError } = await supabase.from("user_subscriptions").insert({
        user_id: userId,
        plan_type: planType,
        plan_volume: purchasedVolume,
        period_start: now,
        flows_used: 0,
        creative_used: 0,
      });
      if (insertError) {
        console.error("❌ [PAYMENT WEBHOOK] insert error:", insertError.code, insertError.message);
        if (insertError.code === "23505") {
          console.error("💡 [PAYMENT WEBHOOK] Ошибка уникальности. Убедитесь, что в Supabase выполнен скрипт: UNIQUE(user_id, plan_type) (файл supabase/migrations/20250210_user_subscriptions_flow_and_creative.sql)");
        }
        return new NextResponse(null, { status: 200 });
      }
      console.log("✅ [PAYMENT WEBHOOK] Создана подписка:", userId, planType, purchasedVolume);
    }

    console.log("✅ [PAYMENT WEBHOOK] Платёж обработан, payment_id:", payment.id);
    return new NextResponse(null, { status: 200 });
  } catch (err) {
    console.error("❌ [PAYMENT WEBHOOK]:", err);
    return new NextResponse(null, { status: 200 });
  }
}
