import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTO_REPLY_PACKAGES, formatAutoReplyVolume } from "@/lib/auto-replies-pricing";
import {
  creditAutoReplyFromPayment,
} from "@/lib/auto-reply-payment-credit";

const YOOKASSA_API = "https://api.yookassa.ru/v3/payments";
const IDEMPOTENCE_KEY_MAX_LENGTH = 36;

export interface AutoReplyBillingRow {
  user_id: string;
  tariff_index: number;
  auto_renew: boolean;
  payment_method_id: string | null;
  period_start: string;
  next_renew_at: string;
}

type RenewalPaymentResult =
  | { ok: false; error: string }
  | {
      ok: true;
      paymentId: string;
      immediate: boolean;
      payment: {
        status?: string;
        metadata?: Record<string, unknown>;
        payment_method?: { id?: string };
      };
    };

function yookassaAuth(): { shopId: string; secretKey: string; auth: string } | null {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) return null;
  return { shopId, secretKey, auth: Buffer.from(`${shopId}:${secretKey}`).toString("base64") };
}

export async function createAutoReplyRenewalPayment(
  userId: string,
  billing: AutoReplyBillingRow
): Promise<RenewalPaymentResult> {
  const creds = yookassaAuth();
  if (!creds) return { ok: false, error: "YooKassa not configured" };
  if (!billing.payment_method_id) return { ok: false, error: "No payment method" };

  const idx = Math.min(AUTO_REPLY_PACKAGES.length - 1, Math.max(0, billing.tariff_index));
  const pack = AUTO_REPLY_PACKAGES[idx];
  const amountRub = pack.priceRub;

  const idempotenceRaw = `karto-auto-renew-${userId}-${idx}-${billing.next_renew_at}`;
  const idempotenceKey = createHash("sha256")
    .update(idempotenceRaw)
    .digest("hex")
    .slice(0, IDEMPOTENCE_KEY_MAX_LENGTH);

  const body = {
    amount: { value: amountRub.toFixed(2), currency: "RUB" },
    capture: true,
    payment_method_id: billing.payment_method_id,
    description: `KARTO: Автоответы — ${formatAutoReplyVolume(pack.replies)} (автопродление)`,
    metadata: {
      user_id: userId,
      payment_kind: "auto_replies",
      tariffIndex: String(idx),
      auto_renew: "true",
      auto_renew_renewal: "true",
    },
  };

  const res = await fetch(YOOKASSA_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${creds.auth}`,
      "Idempotence-Key": idempotenceKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[auto-replies-billing] renewal payment failed:", res.status, errText);
    return { ok: false, error: errText.slice(0, 200) };
  }

  const data = (await res.json()) as {
    id?: string;
    status?: string;
    metadata?: Record<string, unknown>;
    payment_method?: { id?: string };
  };

  if (!data.id) return { ok: false, error: "No payment id in response" };

  return {
    ok: true,
    paymentId: data.id,
    immediate: data.status === "succeeded",
    payment: data,
  };
}

export async function processDueAutoReplyRenewals(
  supabase: SupabaseClient
): Promise<{ processed: number; failed: number }> {
  const nowIso = new Date().toISOString();
  const { data: dueRows, error } = await supabase
    .from("auto_reply_billing")
    .select("user_id, tariff_index, auto_renew, payment_method_id, period_start, next_renew_at")
    .eq("auto_renew", true)
    .not("payment_method_id", "is", null)
    .lte("next_renew_at", nowIso)
    .limit(50);

  if (error) {
    console.error("[auto-replies-billing] fetch due:", error.message);
    return { processed: 0, failed: 0 };
  }

  let processed = 0;
  let failed = 0;

  for (const row of (dueRows ?? []) as AutoReplyBillingRow[]) {
    const result = await createAutoReplyRenewalPayment(row.user_id, row);
    if (!result.ok) {
      failed += 1;
      const nextRetry = new Date();
      nextRetry.setDate(nextRetry.getDate() + 1);
      await supabase
        .from("auto_reply_billing")
        .update({ next_renew_at: nextRetry.toISOString(), updated_at: nowIso })
        .eq("user_id", row.user_id);
      continue;
    }

    if (result.immediate && result.payment.status === "succeeded") {
      const { data: exists } = await supabase
        .from("payment_processed")
        .select("payment_id")
        .eq("payment_id", result.paymentId)
        .maybeSingle();
      if (!exists) {
        await supabase.from("payment_processed").insert({ payment_id: result.paymentId });
        const paymentMethodId =
          result.payment.payment_method?.id ?? row.payment_method_id ?? null;
        await creditAutoReplyFromPayment(supabase, row.user_id, row.tariff_index, {
          autoRenew: row.auto_renew,
          paymentMethodId,
          billingAnchorIso: row.next_renew_at,
          isScheduledRenewal: true,
        });
      }
    }

    processed += 1;
  }

  return { processed, failed };
}
