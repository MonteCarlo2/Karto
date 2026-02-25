import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { FLOW_VOLUMES, CREATIVE_VOLUMES } from "@/lib/subscription";
import { creditSubscription } from "@/lib/payment-credit";

/**
 * GET: проверка в браузере.
 * POST: webhook ЮKassa. URL: https://karto.pro/api/payment/webhook, событие payment.succeeded.
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
    let body: { type?: string; event?: string; object?: { id?: string; status?: string; metadata?: Record<string, unknown> } };
    try {
      body = JSON.parse(raw);
    } catch (e) {
      console.warn("[PAYMENT WEBHOOK] JSON parse error");
      return new NextResponse("Bad request", { status: 400 });
    }

    const ev = (body?.event ?? "").trim();
    const typ = (body?.type ?? "").trim();
    console.log("[PAYMENT WEBHOOK] type=%s event=%s", typ, ev);

    if (ev !== "payment.succeeded") {
      console.log("[PAYMENT WEBHOOK] skip: event not payment.succeeded");
      return new NextResponse(null, { status: 200 });
    }

    const payment = body.object;
    if (!payment) {
      console.warn("[PAYMENT WEBHOOK] skip: no object");
      return new NextResponse(null, { status: 200 });
    }
    if (payment.status !== "succeeded") {
      console.log("[PAYMENT WEBHOOK] skip: object.status=%s", payment.status);
      return new NextResponse(null, { status: 200 });
    }

    const meta = payment.metadata || {};
    const userId = String(meta.user_id ?? meta.userId ?? "").trim();
    const mode = String(meta.mode) === "1" ? "1" : "0";
    const tariffIndex = Math.min(2, Math.max(0, Number(meta.tariffIndex) ?? 0));

    if (userId.length < 30) {
      console.warn("[PAYMENT WEBHOOK] no user_id, payment:", payment.id);
      return new NextResponse(null, { status: 200 });
    }

    const planType = mode === "0" ? "flow" : "creative";
    const addVolume = mode === "0" ? FLOW_VOLUMES[tariffIndex] : CREATIVE_VOLUMES[tariffIndex];
    console.log("[PAYMENT WEBHOOK] credit:", userId.slice(0, 8) + "...", planType, "+", addVolume);

    let supabase;
    try {
      supabase = createServerClient();
    } catch (e) {
      console.error("[PAYMENT WEBHOOK] Supabase client:", e);
      return new NextResponse(null, { status: 200 });
    }

    console.log("[PAYMENT WEBHOOK] checking payment_processed...");
    const { data: exists } = await supabase.from("payment_processed").select("payment_id").eq("payment_id", payment.id).maybeSingle();
    if (exists) {
      console.log("[PAYMENT WEBHOOK] already processed:", payment.id);
      return new NextResponse(null, { status: 200 });
    }
    console.log("[PAYMENT WEBHOOK] inserting payment_processed...");
    const { error: claimErr } = await supabase.from("payment_processed").insert({ payment_id: payment.id });
    if (claimErr?.code === "23505") {
      console.log("[PAYMENT WEBHOOK] duplicate payment_processed:", payment.id);
      return new NextResponse(null, { status: 200 });
    }
    if (claimErr) {
      console.error("[PAYMENT WEBHOOK] payment_processed insert error:", claimErr.message);
      return new NextResponse(null, { status: 200 });
    }
    console.log("[PAYMENT WEBHOOK] payment_processed ok, crediting...");
    const result = await creditSubscription(supabase, userId, planType, addVolume);
    if (!result.ok) console.error("[PAYMENT WEBHOOK] credit error:", result.error);
    else console.log("[PAYMENT WEBHOOK] credited ok:", payment.id);

    return new NextResponse(null, { status: 200 });
  } catch (err) {
    console.error("[PAYMENT WEBHOOK]", err);
    return new NextResponse(null, { status: 200 });
  }
}
