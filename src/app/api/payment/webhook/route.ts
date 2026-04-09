import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { FLOW_VOLUMES, CREATIVE_VOLUMES } from "@/lib/subscription";
import { creditSubscription } from "@/lib/payment-credit";
import { VIDEO_TOKEN_PACKAGES } from "@/lib/video-token-pricing";
import { addVideoTokens } from "@/lib/video-tokens";
import { capturePayment } from "@/lib/yookassa-capture";

/**
 * GET: проверка в браузере.
 * POST: webhook ЮKassa. Обрабатываем payment.succeeded и payment.waiting_for_capture (делаем capture, затем начисление).
 */
export async function GET() {
  return new NextResponse("Webhook ЮKassa. Только POST.", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: NextRequest) {
  console.log("[PAYMENT WEBHOOK] === POST received ===");
  try {
    const raw = await request.text();
    console.log("[PAYMENT WEBHOOK] body length:", raw?.length ?? 0);
    let body: {
      type?: string;
      event?: string;
      object?: { id?: string; status?: string; metadata?: Record<string, unknown>; amount?: { value?: string; currency?: string } };
    };
    try {
      body = JSON.parse(raw);
    } catch (e) {
      console.warn("[PAYMENT WEBHOOK] JSON parse error");
      return new NextResponse("Bad request", { status: 400 });
    }

    const ev = (body?.event ?? "").trim();
    const typ = (body?.type ?? "").trim();
    console.log("[PAYMENT WEBHOOK] type=%s event=%s", typ, ev);

    const payment = body.object as { id?: string; status?: string; metadata?: Record<string, unknown>; amount?: { value?: string; currency?: string } } | undefined;
    if (!payment) {
      console.warn("[PAYMENT WEBHOOK] skip: no object");
      return new NextResponse(null, { status: 200 });
    }

    // Двухстадийная оплата: приходит waiting_for_capture — делаем capture, затем обрабатываем как succeeded
    let paymentToProcess: { id: string; metadata?: Record<string, unknown> } = { id: payment.id!, metadata: payment.metadata };
    if (ev === "payment.waiting_for_capture" && payment.status === "waiting_for_capture") {
      const amount = payment.amount;
      const value = amount?.value ?? "0";
      const currency = amount?.currency ?? "RUB";
      console.log("[PAYMENT WEBHOOK] capturing payment:", payment.id, value, currency);
      const capture = await capturePayment(payment.id!, value, currency, `wh-cap-${payment.id}`);
      if (!capture.ok) {
        console.error("[PAYMENT WEBHOOK] capture failed:", capture.error);
        return new NextResponse(null, { status: 200 });
      }
      console.log("[PAYMENT WEBHOOK] capture ok, processing");
    } else if (ev !== "payment.succeeded" || payment.status !== "succeeded") {
      console.log("[PAYMENT WEBHOOK] skip: event=%s status=%s", ev, payment.status);
      return new NextResponse(null, { status: 200 });
    } else {
      paymentToProcess = { id: payment.id!, metadata: payment.metadata };
    }

    // Общая обработка: payment_processed + начисление
    const meta = paymentToProcess.metadata || {};
    const userId = String(meta.user_id ?? meta.userId ?? "").trim();
    const mode = String(meta.mode) === "1" ? "1" : "0";
    const rawTariff = Number(meta.tariffIndex);
    const tariffIndex = Number.isFinite(rawTariff) ? rawTariff : 0;
    const bloggerCode = String(meta.blogger_code ?? "").trim().toLowerCase();
    const bloggerSource = String(meta.blogger_source ?? "").trim().toLowerCase() || "unknown";
    const amountRub = Number(payment.amount?.value ?? 0);

    if (userId.length < 30) {
      console.warn("[PAYMENT WEBHOOK] no user_id, payment:", paymentToProcess.id);
      return new NextResponse(null, { status: 200 });
    }

    const paymentKind =
      String(meta.payment_kind ?? "").trim() || (mode === "0" ? "flow" : "creative");
    console.log("[PAYMENT WEBHOOK] credit:", userId.slice(0, 8) + "...", paymentKind, "idx", tariffIndex);

    let supabase;
    try {
      supabase = createServerClient();
    } catch (e) {
      console.error("[PAYMENT WEBHOOK] Supabase client:", e);
      return new NextResponse(null, { status: 200 });
    }

    console.log("[PAYMENT WEBHOOK] checking payment_processed...");
    const { data: exists } = await supabase.from("payment_processed").select("payment_id").eq("payment_id", paymentToProcess.id).maybeSingle();
    if (exists) {
      console.log("[PAYMENT WEBHOOK] already processed:", paymentToProcess.id);
      return new NextResponse(null, { status: 200 });
    }
    console.log("[PAYMENT WEBHOOK] inserting payment_processed...");
    const { error: claimErr } = await supabase.from("payment_processed").insert({ payment_id: paymentToProcess.id });
    if (claimErr?.code === "23505") {
      console.log("[PAYMENT WEBHOOK] duplicate payment_processed:", paymentToProcess.id);
      return new NextResponse(null, { status: 200 });
    }
    if (claimErr) {
      console.error("[PAYMENT WEBHOOK] payment_processed insert error:", claimErr.message);
      return new NextResponse(null, { status: 200 });
    }
    const { error: evtErr } = await supabase.from("influencer_payment_events").upsert(
      {
        payment_id: paymentToProcess.id,
        user_id: userId,
        blogger_code: bloggerCode || null,
        blogger_source: bloggerCode ? bloggerSource : null,
        payment_kind: paymentKind,
        amount_rub: Number.isFinite(amountRub) ? amountRub : null,
      },
      { onConflict: "payment_id" }
    );
    if (evtErr) {
      console.warn("[PAYMENT WEBHOOK] influencer_payment_events upsert:", evtErr.message);
    }
    console.log("[PAYMENT WEBHOOK] payment_processed ok, crediting...");
    let result: { ok: boolean; error?: string } = { ok: true };
    if (paymentKind === "video_tokens") {
      const idx = Math.min(
        VIDEO_TOKEN_PACKAGES.length - 1,
        Math.max(0, tariffIndex)
      );
      const addTokens = VIDEO_TOKEN_PACKAGES[idx].tokens;
      result = await addVideoTokens(supabase, userId, addTokens);
    } else if (paymentKind === "flow") {
      const idx = Math.min(2, Math.max(0, tariffIndex));
      result = await creditSubscription(supabase, userId, "flow", FLOW_VOLUMES[idx]);
    } else {
      const idx = Math.min(2, Math.max(0, tariffIndex));
      result = await creditSubscription(supabase, userId, "creative", CREATIVE_VOLUMES[idx]);
    }
    if (!result.ok) console.error("[PAYMENT WEBHOOK] credit error:", result.error);
    else console.log("[PAYMENT WEBHOOK] credited ok:", paymentToProcess.id);

    return new NextResponse(null, { status: 200 });
  } catch (err) {
    console.error("[PAYMENT WEBHOOK]", err);
    return new NextResponse(null, { status: 200 });
  }
}
