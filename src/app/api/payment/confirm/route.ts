import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isSupabaseNetworkError } from "@/lib/supabase/network-error";
import { FLOW_VOLUMES, CREATIVE_VOLUMES } from "@/lib/subscription";
import { creditSubscription } from "@/lib/payment-credit";

const YOOKASSA_API = "https://api.yookassa.ru/v3/payments";

/**
 * POST: подтверждение по возврату с ЮKassa. Берёт payment_id из pending_payment или cookie.
 */
export async function POST(request: NextRequest) {
  try {
    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;
    if (!shopId || !secretKey) {
      return NextResponse.json({ success: false, error: "Оплата не настроена" }, { status: 500 });
    }

    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")?.trim();
    if (!token) return NextResponse.json({ success: false, error: "Войдите в аккаунт" }, { status: 401 });

    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });

    let paymentId: string | null = null;
    try {
      const body = await request.json().catch(() => ({}));
      paymentId = typeof body?.payment_id === "string" ? body.payment_id.trim() : null;
      if (!paymentId) {
        const cookie = request.headers.get("cookie") || "";
        const m = cookie.match(/karto_pending_payment_id=([^;]+)/);
        if (m) paymentId = m[1].trim();
      }
    } catch {}
    if (!paymentId) {
      const { data: row } = await supabase.from("pending_payment").select("id, payment_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      paymentId = row?.payment_id ?? null;
    }

    if (!paymentId) return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });

    const auth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
    const res = await fetch(`${YOOKASSA_API}/${paymentId}`, { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      console.warn("[PAYMENT CONFIRM] YooKassa:", res.status);
      return NextResponse.json({ success: false, error: "Не удалось проверить платёж" }, { status: 200 });
    }

    const payment = (await res.json()) as { status?: string; metadata?: Record<string, unknown> };
    if (payment?.status !== "succeeded") return NextResponse.json({ success: false, error: "Платёж ещё не завершён" }, { status: 200 });

    const meta = payment.metadata || {};
    const userId = String(meta.user_id ?? meta.userId ?? "").trim();
    const mode = String(meta.mode) === "1" ? "1" : "0";
    const tariffIndex = Math.min(2, Math.max(0, Number(meta.tariffIndex) ?? 0));

    if (userId !== user.id || !userId) return NextResponse.json({ success: false, error: "Чужой платёж" }, { status: 200 });

    const planType = mode === "0" ? "flow" : "creative";
    const addVolume = mode === "0" ? FLOW_VOLUMES[tariffIndex] : CREATIVE_VOLUMES[tariffIndex];

    const { error: insErr } = await supabase.from("payment_processed").insert({ payment_id: paymentId });
    if (insErr?.code === "23505") {
      return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
    }

    const result = await creditSubscription(supabase, userId, planType, addVolume);
    if (!result.ok) {
      console.error("[PAYMENT CONFIRM] credit:", result.error);
      return NextResponse.json({ success: false, error: "Ошибка начисления" }, { status: 200 });
    }

    await supabase.from("pending_payment").delete().eq("user_id", user.id).eq("payment_id", paymentId);
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (isSupabaseNetworkError(err)) return NextResponse.json({ success: false, error: "Сервис временно недоступен" }, { status: 200 });
    console.error("[PAYMENT CONFIRM]", err);
    return NextResponse.json({ success: false, error: "Ошибка" }, { status: 500 });
  }
}
