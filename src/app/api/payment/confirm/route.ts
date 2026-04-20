import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isSupabaseNetworkError } from "@/lib/supabase/network-error";
import { FLOW_VOLUMES, CREATIVE_VOLUMES } from "@/lib/subscription";
import { creditSubscription } from "@/lib/payment-credit";
import { VIDEO_TOKEN_PACKAGES } from "@/lib/video-token-pricing";
import { addVideoTokens } from "@/lib/video-tokens";
import { capturePayment } from "@/lib/yookassa-capture";
import { parsePromoFromPaymentMetadata, recordPromoRedemption } from "@/lib/promo/record-redemption";

const YOOKASSA_API = "https://api.yookassa.ru/v3/payments";

/**
 * POST: подтверждение по возврату с ЮKassa. Берёт payment_id из pending_payment или cookie.
 */
export async function POST(request: NextRequest) {
  console.log("[PAYMENT CONFIRM] === POST received ===");
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

    if (!paymentId) {
      console.warn("[PAYMENT CONFIRM] payment_id not found (cookie, body, pending_payment). user:", user.id);
      return NextResponse.json({ success: false, error: "Не найден идентификатор платежа. Обновите страницу или купите снова." }, { status: 200 });
    }
    console.log("[PAYMENT CONFIRM] payment_id:", paymentId.slice(0, 20) + "...");

    const auth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
    console.log("[PAYMENT CONFIRM] fetching YooKassa...");
    const res = await fetch(`${YOOKASSA_API}/${paymentId}`, { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      console.warn("[PAYMENT CONFIRM] YooKassa:", res.status);
      return NextResponse.json({ success: false, error: "Не удалось проверить платёж" }, { status: 200 });
    }

    const payment = (await res.json()) as {
      status?: string;
      metadata?: Record<string, unknown>;
      amount?: { value?: string; currency?: string };
    };
    if (payment?.status === "waiting_for_capture") {
      const amount = payment.amount;
      const value = amount?.value ?? "0";
      const currency = amount?.currency ?? "RUB";
      console.log("[PAYMENT CONFIRM] capturing waiting payment:", paymentId.slice(0, 20), value);
      const capture = await capturePayment(paymentId, value, currency, `confirm-cap-${paymentId}`);
      if (!capture.ok) {
        console.error("[PAYMENT CONFIRM] capture failed:", capture.error);
        return NextResponse.json({ success: false, error: "Не удалось подтвердить платёж" }, { status: 200 });
      }
      console.log("[PAYMENT CONFIRM] capture ok");
      (payment as { status: string }).status = "succeeded";
    }
    if (payment?.status !== "succeeded") {
      console.log("[PAYMENT CONFIRM] status not succeeded:", payment?.status);
      return NextResponse.json({ success: false, error: "Платёж ещё не завершён" }, { status: 200 });
    }

    const meta = payment.metadata || {};
    const userId = String(meta.user_id ?? meta.userId ?? "").trim();
    const mode = String(meta.mode) === "1" ? "1" : "0";
    const rawTariff = Number(meta.tariffIndex);
    const tariffIndex = Number.isFinite(rawTariff) ? rawTariff : 0;
    const paymentKind =
      String(meta.payment_kind ?? "").trim() || (mode === "0" ? "flow" : "creative");
    const bloggerCode = String(meta.blogger_code ?? "").trim().toLowerCase();
    const bloggerSource = String(meta.blogger_source ?? "").trim().toLowerCase() || "unknown";
    const amountRub = Number(payment.amount?.value ?? 0);

    if (userId !== user.id || !userId) return NextResponse.json({ success: false, error: "Чужой платёж" }, { status: 200 });

    console.log("[PAYMENT CONFIRM] crediting:", userId.slice(0, 8) + "...", paymentKind, "idx", tariffIndex);

    console.log("[PAYMENT CONFIRM] inserting payment_processed...");
    const { error: insErr } = await supabase.from("payment_processed").insert({ payment_id: paymentId });
    if (insErr?.code === "23505") {
      return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
    }
    if (insErr) {
      console.error("[PAYMENT CONFIRM] payment_processed insert:", insErr.message);
      return NextResponse.json({ success: false, error: "Ошибка записи платежа" }, { status: 200 });
    }
    const { error: evtErr } = await supabase.from("influencer_payment_events").upsert(
      {
        payment_id: paymentId,
        user_id: userId,
        blogger_code: bloggerCode || null,
        blogger_source: bloggerCode ? bloggerSource : null,
        payment_kind: paymentKind,
        amount_rub: Number.isFinite(amountRub) ? amountRub : null,
      },
      { onConflict: "payment_id" }
    );
    if (evtErr) {
      console.warn("[PAYMENT CONFIRM] influencer_payment_events upsert:", evtErr.message);
    }
    console.log("[PAYMENT CONFIRM] payment_processed ok, crediting...");
    let result: { ok: boolean; error?: string } = { ok: true };
    if (paymentKind === "video_tokens") {
      const idx = Math.min(
        VIDEO_TOKEN_PACKAGES.length - 1,
        Math.max(0, tariffIndex)
      );
      result = await addVideoTokens(supabase, userId, VIDEO_TOKEN_PACKAGES[idx].tokens);
    } else if (paymentKind === "flow") {
      const idx = Math.min(2, Math.max(0, tariffIndex));
      result = await creditSubscription(supabase, userId, "flow", FLOW_VOLUMES[idx]);
    } else {
      const idx = Math.min(2, Math.max(0, tariffIndex));
      result = await creditSubscription(supabase, userId, "creative", CREATIVE_VOLUMES[idx]);
    }
    if (!result.ok) {
      console.error("[PAYMENT CONFIRM] credit:", result.error);
      return NextResponse.json({ success: false, error: "Ошибка начисления" }, { status: 200 });
    }

    const promo = parsePromoFromPaymentMetadata(meta as Record<string, unknown>);
    if (promo && userId.length >= 30) {
      const pr = await recordPromoRedemption(supabase, {
        campaignId: promo.campaignId,
        userId,
        paymentId,
        amountPaidRub: amountRub,
        originalPriceRub: promo.originalRub,
        discountPercent: promo.discountPercent,
      });
      if (!pr.ok && !pr.duplicate) console.warn("[PAYMENT CONFIRM] promo redemption:", pr.error);
    }

    await supabase.from("pending_payment").delete().eq("user_id", user.id).eq("payment_id", paymentId);
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (isSupabaseNetworkError(err)) return NextResponse.json({ success: false, error: "Сервис временно недоступен" }, { status: 200 });
    console.error("[PAYMENT CONFIRM]", err);
    return NextResponse.json({ success: false, error: "Ошибка" }, { status: 500 });
  }
}
