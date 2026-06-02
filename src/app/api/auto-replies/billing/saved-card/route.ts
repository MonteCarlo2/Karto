import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import { fetchAutoReplySubscriptionInfo } from "@/lib/auto-replies-subscription-info";
import {
  formatBillingDateLong,
  savedCardLabelFromFields,
} from "@/lib/auto-replies-billing-copy";

/** DELETE: удалить сохранённый способ оплаты из KARTO (автопродление отключается). */
export async function DELETE(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const supabase = createServerClient();
  const info = await fetchAutoReplySubscriptionInfo(supabase, auth.user.id);

  if (!info.hasSavedCard) {
    return NextResponse.json(
      { success: false, error: "Сохранённая карта не найдена." },
      { status: 200 }
    );
  }

  const { error } = await supabase
    .from("auto_reply_billing")
    .upsert(
      {
        user_id: auth.user.id,
        auto_renew: false,
        payment_method_id: null,
        card_last4: null,
        card_brand: null,
        updated_at: new Date().toISOString(),
        ...(info.tariffIndex != null ? { tariff_index: info.tariffIndex } : {}),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("[auto-replies/billing/saved-card]", error.message);
    return NextResponse.json(
      { success: false, error: "Не удалось удалить сохранённую карту" },
      { status: 200 }
    );
  }

  const cardLabel = savedCardLabelFromFields(info.cardLast4, info.cardBrand);
  const periodEndLabel = formatBillingDateLong(info.periodEnd);
  const message = periodEndLabel
    ? cardLabel
      ? `Карта ${cardLabel} отвязана от аккаунта. Автопродление выключено. Оплаченный пакет «Отзывы» действует до ${periodEndLabel} включительно.`
      : `Сохранённая карта отвязана. Автопродление выключено. Оплаченный пакет действует до ${periodEndLabel} включительно.`
    : cardLabel
      ? `Карта ${cardLabel} отвязана от аккаунта. Автопродление выключено.`
      : "Сохранённая карта отвязана. Автопродление выключено.";

  return NextResponse.json({
    success: true,
    autoRenew: false,
    hasSavedCard: false,
    message,
  });
}
