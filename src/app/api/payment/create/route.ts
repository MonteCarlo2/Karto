import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isSupabaseNetworkError } from "@/lib/supabase/network-error";
import {
  FLOW_VOLUMES,
  CREATIVE_VOLUMES,
  FLOW_PRICES,
  CREATIVE_PRICES,
} from "@/lib/subscription";

const YOOKASSA_API = "https://api.yookassa.ru/v3/payments";
/** ЮKassa требует ключ идемпотентности не длиннее допустимого (иначе "Idempotence key is too long"). */
const IDEMPOTENCE_KEY_MAX_LENGTH = 36;

/**
 * POST: создание платежа в ЮKassa. Возвращает confirmation_url для редиректа.
 * Body: { mode: "0" | "1", tariffIndex: 0 | 1 | 2 }
 * mode 0 = Поток, 1 = Свободное творчество
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
    const mode = body?.mode === "1" ? "1" : "0";
    const tariffIndex = Math.min(2, Math.max(0, Number(body?.tariffIndex) || 0));

    const amountRub = mode === "0"
      ? FLOW_PRICES[tariffIndex]
      : CREATIVE_PRICES[tariffIndex];
    const planType = mode === "0" ? "flow" : "creative";
    const planVolume = mode === "0" ? FLOW_VOLUMES[tariffIndex] : CREATIVE_VOLUMES[tariffIndex];
    const description =
      mode === "0"
        ? `KARTO: Поток — ${planVolume} ${planVolume === 1 ? "поток" : planVolume < 5 ? "потока" : "потоков"}`
        : `KARTO: Свободное творчество — ${planVolume} генераций`;

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (request.headers.get("x-forwarded-proto") && request.headers.get("host")
        ? `${request.headers.get("x-forwarded-proto")}://${request.headers.get("host")}`
        : "https://karto.pro");
    const returnUrl = `${baseUrl.replace(/\/$/, "")}/profile?payment=success`;

    const idempotenceRaw = `karto-${user.id}-${planType}-${tariffIndex}-${Date.now()}`;
    const idempotenceKey = createHash("sha256").update(idempotenceRaw).digest("hex").slice(0, IDEMPOTENCE_KEY_MAX_LENGTH);
    const yookassaBody = {
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
        mode,
        tariffIndex: String(tariffIndex),
      },
    };

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
        if (errJson.description) userMessage = errJson.description;
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
    if (!confirmationUrl) {
      console.error("❌ [PAYMENT CREATE] No confirmation_url in response:", data);
      return NextResponse.json(
        { success: false, error: "Ошибка ответа платёжной системы. Попробуйте ещё раз." },
        { status: 200 }
      );
    }

    return NextResponse.json({
      success: true,
      confirmation_url: confirmationUrl,
      paymentId: data.id,
    });
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
