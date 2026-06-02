import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTO_REPLY_PACKAGES, getAutoReplyPeriodEndIso, isAutoReplyPeriodActive } from "@/lib/auto-replies-pricing";
import { fetchYookassaPaymentMethodCard } from "@/lib/yookassa-payment-method";

export interface AutoReplySubscriptionInfo {
  /** Общий остаток: бесплатные пробные + оплаченный пакет (если период активен). */
  balance: number;
  /** Бесплатные пробные ответы (без срока, один раз при первом прохождении мастера). */
  welcomeRemaining: number;
  /** Остаток оплаченного месячного пакета (только при активном периоде). */
  paidRemaining: number;
  periodStart?: string;
  periodEnd?: string;
  packExpired: boolean;
  hasActivePack: boolean;
  autoRenew: boolean;
  hasSavedCard: boolean;
  cardLast4?: string;
  cardBrand?: string;
  nextRenewAt?: string;
  tariffIndex: number;
  monthlyPriceRub: number;
}

function isPeriodActive(periodStart: string | null | undefined): boolean {
  return isAutoReplyPeriodActive(periodStart);
}

export async function fetchAutoReplySubscriptionInfo(
  supabase: SupabaseClient,
  userId: string
): Promise<AutoReplySubscriptionInfo> {
  const [{ data: sub }, { data: billing }] = await Promise.all([
    supabase
      .from("user_subscriptions")
      .select("plan_volume, period_start, auto_reply_welcome_remaining")
      .eq("user_id", userId)
      .eq("plan_type", "auto_replies")
      .maybeSingle(),
    supabase
      .from("auto_reply_billing")
      .select(
        "tariff_index, auto_renew, payment_method_id, card_last4, card_brand, next_renew_at, period_start"
      )
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const row = sub as {
    plan_volume?: number;
    period_start?: string;
    auto_reply_welcome_remaining?: number;
  } | null;
  const billingRow = billing as {
    tariff_index?: number;
    auto_renew?: boolean;
    payment_method_id?: string | null;
    card_last4?: string | null;
    card_brand?: string | null;
    next_renew_at?: string;
    period_start?: string;
  } | null;

  let cardLast4 = billingRow?.card_last4?.trim() || undefined;
  let cardBrand = billingRow?.card_brand?.trim() || undefined;
  const paymentMethodId = billingRow?.payment_method_id?.trim() || "";
  if (paymentMethodId && !cardLast4) {
    const fetched = await fetchYookassaPaymentMethodCard(paymentMethodId);
    if (fetched) {
      cardLast4 = fetched.last4;
      cardBrand = fetched.brand ?? undefined;
      await supabase
        .from("auto_reply_billing")
        .update({
          card_last4: fetched.last4,
          card_brand: fetched.brand,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    }
  }

  const periodStart = row?.period_start ?? billingRow?.period_start;
  const active = isPeriodActive(periodStart);
  const rawVolume = Math.max(0, Number(row?.plan_volume ?? 0));
  const welcomeRemaining = Math.max(0, Number(row?.auto_reply_welcome_remaining ?? 0));
  const paidRemaining = active ? rawVolume : 0;
  const balance = welcomeRemaining + paidRemaining;
  const tariffIndex = Math.min(
    AUTO_REPLY_PACKAGES.length - 1,
    Math.max(0, Number(billingRow?.tariff_index ?? 0))
  );

  return {
    balance,
    welcomeRemaining,
    paidRemaining,
    periodStart,
    periodEnd: periodStart ? getAutoReplyPeriodEndIso(periodStart) : undefined,
    packExpired: Boolean(row && !active && rawVolume > 0),
    hasActivePack: active && rawVolume > 0,
    autoRenew: Boolean(billingRow?.auto_renew),
    hasSavedCard: Boolean(paymentMethodId),
    cardLast4,
    cardBrand,
    nextRenewAt: billingRow?.next_renew_at,
    tariffIndex,
    monthlyPriceRub: AUTO_REPLY_PACKAGES[tariffIndex]?.priceRub ?? AUTO_REPLY_PACKAGES[0].priceRub,
  };
}
