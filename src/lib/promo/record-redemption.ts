import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Фиксирует одноразовое использование промокода после успешной оплаты (webhook / confirm).
 */
export async function recordPromoRedemption(
  supabase: SupabaseClient,
  params: {
    campaignId: string;
    userId: string;
    paymentId: string;
    amountPaidRub: number;
    originalPriceRub: number;
    discountPercent: number;
  }
): Promise<{ ok: boolean; duplicate?: boolean; error?: string }> {
  const { error } = await supabase.from("promo_redemptions").insert({
    campaign_id: params.campaignId,
    user_id: params.userId,
    payment_id: params.paymentId,
    amount_paid_rub: params.amountPaidRub,
    original_price_rub: params.originalPriceRub,
    discount_percent: params.discountPercent,
  });

  if (error?.code === "23505") {
    return { ok: true, duplicate: true };
  }
  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return { ok: false, error: "Таблица промокодов не создана" };
    }
    console.warn("[promo] redemption insert:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export function parsePromoFromPaymentMetadata(meta: Record<string, unknown>): {
  campaignId: string;
  originalRub: number;
  discountPercent: number;
} | null {
  const campaignId = String(meta.promo_campaign_id ?? "").trim();
  if (!campaignId) return null;
  const originalRub = Number(meta.promo_original_rub ?? 0);
  const discountPercent = Number(meta.promo_discount_percent ?? 0);
  if (!Number.isFinite(originalRub) || !Number.isFinite(discountPercent)) return null;
  return { campaignId, originalRub, discountPercent };
}
