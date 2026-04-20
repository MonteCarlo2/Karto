import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isSupabaseNetworkError } from "@/lib/supabase/network-error";
import { validatePromoForCheckout, type PromoPaymentKind } from "@/lib/promo/checkout";
import { VIDEO_TOKEN_PACKAGES } from "@/lib/video-token-pricing";

/**
 * POST: проверить промокод для текущего выбора тарифа (без создания платежа).
 * Body: { promoCode, paymentKind?, mode?, tariffIndex?, videoTariff? }
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")?.trim();
    if (!token) {
      return NextResponse.json({ success: false, error: "Войдите в аккаунт" }, { status: 401 });
    }

    const supabase = createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Войдите в аккаунт" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const mode = body?.mode === "1" ? "1" : "0";
    const rawKind = String(body?.paymentKind ?? "").trim();
    const paymentKind: PromoPaymentKind =
      rawKind === "video_tokens"
        ? "video_tokens"
        : rawKind === "creative"
          ? "creative"
          : rawKind === "flow"
            ? "flow"
            : mode === "1"
              ? "creative"
              : "flow";

    const tariffCreativeOrFlow = Math.min(2, Math.max(0, Number(body?.tariffIndex) || 0));
    const tariffVideo = Math.min(
      VIDEO_TOKEN_PACKAGES.length - 1,
      Math.max(0, Number(body?.videoTariff ?? body?.tariffIndex) || 0)
    );
    const tariffIdx = paymentKind === "video_tokens" ? tariffVideo : tariffCreativeOrFlow;

    const rawCode = typeof body?.promoCode === "string" ? body.promoCode : "";
    const res = await validatePromoForCheckout(supabase, {
      userId: user.id,
      rawCode,
      paymentKind,
      tariffIndex: tariffIdx,
    });

    if (!res.ok) {
      return NextResponse.json({ success: false, error: res.error }, { status: 200 });
    }

    return NextResponse.json({
      success: true,
      originalRub: res.originalRub,
      finalRub: res.finalRub,
      discountPercent: res.discountPercent,
    });
  } catch (err: unknown) {
    if (isSupabaseNetworkError(err)) {
      return NextResponse.json({ success: false, error: "Сервис временно недоступен" }, { status: 200 });
    }
    console.error("[promo-preview]", err);
    return NextResponse.json({ success: false, error: "Ошибка сервера" }, { status: 500 });
  }
}
