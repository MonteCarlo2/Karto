import type { SupabaseClient } from "@supabase/supabase-js";
import { CREATIVE_PRICES, FLOW_PRICES } from "@/lib/subscription";
import { VIDEO_TOKEN_PACKAGES } from "@/lib/video-token-pricing";

export type PromoPaymentKind = "flow" | "creative" | "video_tokens";

export function basePriceRub(kind: PromoPaymentKind, tariffIndex: number): number {
  if (kind === "flow") {
    const i = Math.min(FLOW_PRICES.length - 1, Math.max(0, tariffIndex));
    return FLOW_PRICES[i];
  }
  if (kind === "creative") {
    const i = Math.min(CREATIVE_PRICES.length - 1, Math.max(0, tariffIndex));
    return CREATIVE_PRICES[i];
  }
  const i = Math.min(VIDEO_TOKEN_PACKAGES.length - 1, Math.max(0, tariffIndex));
  return VIDEO_TOKEN_PACKAGES[i].priceRub;
}

type CampaignRow = {
  id: string;
  discount_percent: number;
  discount_rub: number | null;
  payment_kind: PromoPaymentKind;
  tariff_indices: number[] | null;
  restrict_to_recipients: boolean;
  active: boolean;
  starts_at: string;
  ends_at: string | null;
};

/**
 * Проверка промокода перед созданием платежа ЮKassa.
 * Код в БД хранится в ВЕРХНЕМ регистре (см. миграцию).
 */
export async function validatePromoForCheckout(
  supabase: SupabaseClient,
  params: {
    userId: string;
    rawCode: string;
    paymentKind: PromoPaymentKind;
    tariffIndex: number;
  }
): Promise<
  | {
      ok: true;
      campaignId: string;
      /** Доля скидки для отображения и метаданных (при фикс. ₽ — расчётная). */
      discountPercent: number;
      originalRub: number;
      finalRub: number;
      /** Заданная фиксированная скидка в ₽, если в кампании используется discount_rub. */
      discountRub?: number;
    }
  | { ok: false; error: string }
> {
  const code = params.rawCode.trim().toUpperCase();
  if (!code || code.length > 64) {
    return { ok: false, error: "Введите промокод" };
  }

  let campaigns: CampaignRow[] | null = null;
  let selErr: { message?: string; code?: string } | null = null;
  try {
    const res = await supabase
      .from("promo_campaigns")
      .select(
        "id, discount_percent, discount_rub, payment_kind, tariff_indices, restrict_to_recipients, active, starts_at, ends_at"
      )
      .eq("active", true)
      .eq("code", code)
      .limit(1);
    campaigns = res.data as CampaignRow[] | null;
    selErr = res.error;
  } catch {
    return { ok: false, error: "Промокоды временно недоступны" };
  }

  if (selErr) {
    if (selErr.code === "42P01" || (selErr.message ?? "").includes("does not exist")) {
      return { ok: false, error: "Промокоды ещё не подключены. Обратитесь в поддержку." };
    }
    console.error("[promo] select campaign:", selErr.message);
    return { ok: false, error: "Не удалось проверить промокод" };
  }

  const c = campaigns?.[0];
  if (!c) {
    return { ok: false, error: "Промокод не найден или недействителен" };
  }

  if (c.payment_kind !== params.paymentKind) {
    return { ok: false, error: "Промокод не действует на выбранный тип услуги" };
  }

  const indices = c.tariff_indices;
  if (indices && indices.length > 0) {
    if (!indices.includes(params.tariffIndex)) {
      return { ok: false, error: "Промокод не действует на выбранный объём" };
    }
  }

  const now = Date.now();
  if (c.starts_at && new Date(c.starts_at).getTime() > now) {
    return { ok: false, error: "Промокод ещё не активен" };
  }
  if (c.ends_at && new Date(c.ends_at).getTime() < now) {
    return { ok: false, error: "Срок действия промокода истёк" };
  }

  if (c.restrict_to_recipients) {
    const { data: rec, error: recErr } = await supabase
      .from("promo_campaign_recipients")
      .select("user_id")
      .eq("campaign_id", c.id)
      .eq("user_id", params.userId)
      .maybeSingle();
    if (recErr || !rec) {
      return { ok: false, error: "Этот промокод вам недоступен" };
    }
  }

  const { data: redeemed, error: redErr } = await supabase
    .from("promo_redemptions")
    .select("id")
    .eq("campaign_id", c.id)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (!redErr && redeemed) {
    return { ok: false, error: "Вы уже использовали этот промокод" };
  }

  const originalRub = basePriceRub(params.paymentKind, params.tariffIndex);
  const rubRaw = c.discount_rub != null ? Number(c.discount_rub) : NaN;
  const useFixedRub = Number.isFinite(rubRaw) && rubRaw >= 1;

  let finalRub: number;
  let discountPercent: number;
  let discountRub: number | undefined;

  if (useFixedRub) {
    const applied = Math.min(originalRub - 1, Math.floor(rubRaw));
    finalRub = Math.max(1, originalRub - applied);
    discountRub = applied;
    discountPercent =
      originalRub > 0 ? Math.round(((originalRub - finalRub) / originalRub) * 100) : 0;
  } else {
    const p = Math.min(90, Math.max(1, Math.round(Number(c.discount_percent))));
    discountPercent = p;
    finalRub = Math.max(1, Math.round((originalRub * (100 - p)) / 100));
  }

  return {
    ok: true,
    campaignId: c.id,
    discountPercent,
    originalRub,
    finalRub,
    ...(discountRub != null ? { discountRub } : {}),
  };
}
