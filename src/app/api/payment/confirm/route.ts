import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isSupabaseNetworkError } from "@/lib/supabase/network-error";
import { FLOW_VOLUMES, CREATIVE_VOLUMES } from "@/lib/subscription";

const YOOKASSA_API = "https://api.yookassa.ru/v3/payments";

/**
 * POST: подтверждение платежа по возврату с ЮKassa (fallback, если вебхук не сработал).
 * Body: { payment_id: string }. Требует Authorization: Bearer <token>.
 * Запрашивает платёж в ЮKassa, при status=succeeded начисляет подписку (та же логика, что в webhook).
 */
export async function POST(request: NextRequest) {
  try {
    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;
    if (!shopId || !secretKey) {
      return NextResponse.json({ success: false, error: "Оплата не настроена" }, { status: 500 });
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json({ success: false, error: "Войдите в аккаунт" }, { status: 401 });
    }

    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const paymentId = typeof body?.payment_id === "string" ? body.payment_id.trim() : null;
    if (!paymentId) {
      return NextResponse.json({ success: false, error: "Нужен payment_id" }, { status: 400 });
    }

    const auth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
    const res = await fetch(`${YOOKASSA_API}/${paymentId}`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.warn("⚠️ [PAYMENT CONFIRM] YooKassa GET payment failed:", res.status, errText);
      return NextResponse.json({ success: false, error: "Не удалось проверить платёж" }, { status: 200 });
    }

    const payment = (await res.json()) as {
      id?: string;
      status?: string;
      metadata?: Record<string, string>;
    };
    if (payment?.status !== "succeeded") {
      return NextResponse.json({ success: false, error: "Платёж ещё не завершён" }, { status: 200 });
    }

    const metadata = payment.metadata || {};
    const userId = metadata.user_id;
    const mode = metadata.mode === "1" ? "1" : "0";
    const tariffIndex = Math.min(2, Math.max(0, Number(metadata.tariffIndex) || 0));

    if (userId !== user.id) {
      return NextResponse.json({ success: false, error: "Чужой платёж" }, { status: 403 });
    }
    if (!userId) {
      return NextResponse.json({ success: false, error: "Нет данных платежа" }, { status: 200 });
    }

    const planType = mode === "0" ? "flow" : "creative";
    const purchasedVolume = mode === "0" ? FLOW_VOLUMES[tariffIndex] : CREATIVE_VOLUMES[tariffIndex];
    const now = new Date().toISOString();

    const { error: processedError } = await supabase.from("payment_processed").insert({ payment_id: paymentId });
    if (processedError) {
      if (processedError.code === "23505") {
        return NextResponse.json({ success: true });
      }
      if (processedError.code === "42P01") {
        console.warn("💡 [PAYMENT CONFIRM] Таблица payment_processed не найдена. Выполните supabase/migrations/20250219_payment_processed.sql для идемпотентности.");
      }
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
        .update({ plan_volume: newVolume, updated_at: now })
        .eq("user_id", userId)
        .eq("plan_type", planType);
      if (updateError) {
        console.error("❌ [PAYMENT CONFIRM] update error:", updateError);
        return NextResponse.json({ success: false, error: "Ошибка обновления подписки" }, { status: 200 });
      }
      console.log("✅ [PAYMENT CONFIRM] Добавлено (возврат с оплаты):", userId, planType, `+${purchasedVolume} → всего ${newVolume}`);
    } else {
      const { error: insertError } = await supabase.from("user_subscriptions").insert({
        user_id: userId,
        plan_type: planType,
        plan_volume: purchasedVolume,
        period_start: now,
        flows_used: 0,
        creative_used: 0,
        updated_at: now,
      });
      if (insertError) {
        console.error("❌ [PAYMENT CONFIRM] insert error:", insertError);
        return NextResponse.json({ success: false, error: "Ошибка создания подписки" }, { status: 200 });
      }
      console.log("✅ [PAYMENT CONFIRM] Создана подписка (возврат с оплаты):", userId, planType, purchasedVolume);
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if (isSupabaseNetworkError(err)) {
      return NextResponse.json({ success: false, error: "Сервис временно недоступен" }, { status: 200 });
    }
    console.error("❌ [PAYMENT CONFIRM]:", err);
    return NextResponse.json({ success: false, error: "Внутренняя ошибка" }, { status: 500 });
  }
}
