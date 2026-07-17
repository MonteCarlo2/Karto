import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isSupabaseNetworkError } from "@/lib/supabase/network-error";
import { FLOW_VOLUMES, FLOW_PRICES } from "@/lib/subscription";
import { CREDIT_PACKAGES } from "@/lib/credits-pricing";
import {
  AUTO_REPLY_PACKAGES,
  formatAutoReplyVolume,
} from "@/lib/auto-replies-pricing";
import { ATTR_COOKIE_NAME, isAttributionActive, readAttributionCookie } from "@/lib/attribution";
import { validatePromoForCheckout } from "@/lib/promo/checkout";

const YOOKASSA_API = "https://api.yookassa.ru/v3/payments";
/** ЮKassa требует ключ идемпотентности не длиннее допустимого (иначе "Idempotence key is too long"). */
const IDEMPOTENCE_KEY_MAX_LENGTH = 36;

type CheckoutPaymentKind = "flow" | "credits" | "auto_replies";

function resolvePaymentKind(rawKind: string, mode: "0" | "1"): CheckoutPaymentKind {
  if (rawKind === "auto_replies") return "auto_replies";
  if (rawKind === "flow") return "flow";
  if (rawKind === "credits" || rawKind === "creative" || rawKind === "video_tokens") {
    return "credits";
  }
  return mode === "1" ? "credits" : "flow";
}

/**
 * POST: создание платежа в ЮKassa. Возвращает confirmation_url для редиректа.
 * Body: { mode?: "0"|"1", tariffIndex?: number, paymentKind?: "flow"|"credits"|"creative"|"video_tokens" }
 * paymentKind приоритетнее mode; credits — пакеты единых кредитов (creative/video_tokens — алиасы).
 */
export async function POST(request: NextRequest) {
  try {
    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;
    if (!shopId || !secretKey) {
      console.error("❌ [PAYMENT CREATE] YOOKASSA_SHOP_ID or YOOKASSA_SECRET_KEY not set");
      return NextResponse.json(
        { success: false, error: "Оплата временно недоступна" },
        { status: 500 }
      );
    }

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
    const cookieAttr = readAttributionCookie(
      request.cookies.get(ATTR_COOKIE_NAME)?.value ?? null
    );
    const userMeta = (user as { user_metadata?: Record<string, unknown> }).user_metadata || {};
    const userMetaBloggerCode =
      typeof userMeta.blogger_code === "string" ? userMeta.blogger_code.trim() : "";
    const userMetaBloggerSource =
      typeof userMeta.blogger_source === "string" ? userMeta.blogger_source.trim() : "";
    const bloggerCode =
      userMetaBloggerCode || (cookieAttr && isAttributionActive(cookieAttr) ? cookieAttr.code : "");
    const bloggerSource =
      userMetaBloggerSource ||
      (cookieAttr && isAttributionActive(cookieAttr) ? cookieAttr.source : "");

    const mode = body?.mode === "1" ? "1" : "0";
    const rawKind = String(body?.paymentKind ?? "").trim();
    const paymentKind = resolvePaymentKind(rawKind, mode);

    const tariffIndexFlow = Math.min(2, Math.max(0, Number(body?.tariffIndex) || 0));
    const tariffIndexCredits = Math.min(
      CREDIT_PACKAGES.length - 1,
      Math.max(0, Number(body?.tariffIndex) || 0)
    );
    const tariffIndexAutoReplies = Math.min(
      AUTO_REPLY_PACKAGES.length - 1,
      Math.max(0, Number(body?.tariffIndex) || 0)
    );

    let amountRub: number;
    let description: string;
    let metadataTariffIndex: number;

    if (paymentKind === "credits") {
      const pack = CREDIT_PACKAGES[tariffIndexCredits];
      amountRub = pack.priceRub;
      description = `KARTO: Креатив — ${pack.credits} кредитов`;
      metadataTariffIndex = tariffIndexCredits;
    } else if (paymentKind === "auto_replies") {
      const pack = AUTO_REPLY_PACKAGES[tariffIndexAutoReplies];
      amountRub = pack.priceRub;
      description = `KARTO: Автоответы — ${formatAutoReplyVolume(pack.replies)}`;
      metadataTariffIndex = tariffIndexAutoReplies;
    } else {
      amountRub = FLOW_PRICES[tariffIndexFlow];
      const planVolume = FLOW_VOLUMES[tariffIndexFlow];
      description = `KARTO: Поток — ${planVolume} ${planVolume === 1 ? "поток" : planVolume < 5 ? "потока" : "потоков"}`;
      metadataTariffIndex = tariffIndexFlow;
    }

    const rawPromo = typeof body?.promoCode === "string" ? body.promoCode.trim() : "";
    let promoCampaignId: string | null = null;
    let promoDiscountPercent = 0;
    let promoDiscountRub: number | undefined;
    let promoOriginalRub = amountRub;

    if (rawPromo) {
      const promoTariffIdx =
        paymentKind === "credits"
          ? tariffIndexCredits
          : paymentKind === "auto_replies"
            ? tariffIndexAutoReplies
            : tariffIndexFlow;
      const promoCheck = await validatePromoForCheckout(supabase, {
        userId: user.id,
        rawCode: rawPromo,
        paymentKind,
        tariffIndex: promoTariffIdx,
      });
      if (!promoCheck.ok) {
        return NextResponse.json({ success: false, error: promoCheck.error }, { status: 200 });
      }
      promoOriginalRub = promoCheck.originalRub;
      amountRub = promoCheck.finalRub;
      promoCampaignId = promoCheck.campaignId;
      promoDiscountPercent = promoCheck.discountPercent;
      if (promoCheck.discountRub != null) promoDiscountRub = promoCheck.discountRub;
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (request.headers.get("x-forwarded-proto") && request.headers.get("host")
        ? `${request.headers.get("x-forwarded-proto")}://${request.headers.get("host")}`
        : "https://karto.pro");
    const returnUrl = `${baseUrl.replace(/\/$/, "")}/profile?payment=success`;

    const autoRenew =
      paymentKind === "auto_replies" ? body?.autoRenew !== false : false;

    const idempotenceRaw = `karto-${user.id}-${paymentKind}-${metadataTariffIndex}-${Date.now()}`;
    const idempotenceKey = createHash("sha256").update(idempotenceRaw).digest("hex").slice(0, IDEMPOTENCE_KEY_MAX_LENGTH);
    const yookassaBody: Record<string, unknown> = {
      amount: {
        value: amountRub.toFixed(2),
        currency: "RUB",
      },
      confirmation: {
        type: "redirect",
        return_url: returnUrl,
      },
      description,
      metadata: {
        user_id: user.id,
        mode: paymentKind === "flow" ? "0" : "1",
        payment_kind: paymentKind,
        tariffIndex: String(metadataTariffIndex),
        blogger_code: bloggerCode || undefined,
        blogger_source: bloggerSource || undefined,
        ...(paymentKind === "auto_replies"
          ? { auto_renew: autoRenew ? "true" : "false" }
          : {}),
        ...(promoCampaignId
          ? {
              promo_campaign_id: promoCampaignId,
              promo_original_rub: String(promoOriginalRub),
              promo_discount_percent: String(promoDiscountPercent),
              ...(promoDiscountRub != null
                ? { promo_discount_rub: String(promoDiscountRub) }
                : {}),
            }
          : {}),
      },
    };

    if (paymentKind === "auto_replies" && autoRenew) {
      yookassaBody.save_payment_method = true;
    }

    const auth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
    const res = await fetch(YOOKASSA_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
        "Idempotence-Key": idempotenceKey,
      },
      body: JSON.stringify(yookassaBody),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("❌ [PAYMENT CREATE] YooKassa error:", res.status, errText);
      let userMessage = "Не удалось создать платёж. Попробуйте позже.";
      try {
        const errJson = JSON.parse(errText) as { description?: string; code?: string };
        if (errJson.code === "invalid_credentials") {
          userMessage =
            "Неверный Shop ID или секретный ключ ЮKassa. Скопируйте ключ заново из кабинета (Интеграция → Ключи API) для магазина Test, karto.pro и вставьте в .env.local, затем перезапустите npm run dev.";
        } else if (errJson.description) {
          userMessage = errJson.description;
        }
      } catch {
        if (res.status === 408 || res.status === 504) userMessage = "Платёжная система не ответила вовремя. Попробуйте ещё раз.";
      }
      return NextResponse.json(
        { success: false, error: userMessage },
        { status: 200 }
      );
    }

    const data = (await res.json()) as {
      id?: string;
      confirmation?: { confirmation_url?: string };
      status?: string;
    };
    const confirmationUrl = data?.confirmation?.confirmation_url;
    const paymentId = data?.id;
    if (!confirmationUrl) {
      console.error("❌ [PAYMENT CREATE] No confirmation_url in response:", data);
      return NextResponse.json(
        { success: false, error: "Ошибка ответа платёжной системы. Попробуйте ещё раз." },
        { status: 200 }
      );
    }

    if (paymentId) {
      const { error: pendingErr } = await supabase.from("pending_payment").insert({
        user_id: user.id,
        payment_id: paymentId,
      });
      if (pendingErr) {
        console.warn("⚠️ [PAYMENT CREATE] pending_payment insert failed (выполните миграцию 20250219_pending_payment.sql):", pendingErr.message);
      }
    }

    return NextResponse.json(
      { success: true, confirmation_url: confirmationUrl, paymentId: paymentId },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: unknown) {
    if (isSupabaseNetworkError(err)) {
      return NextResponse.json(
        { success: false, error: "Сервис временно недоступен. Попробуйте позже." },
        { status: 200 }
      );
    }
    console.error("❌ [PAYMENT CREATE]:", err);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка" },
      { status: 500 }
    );
  }
}
