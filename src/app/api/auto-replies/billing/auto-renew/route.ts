import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import { fetchAutoReplySubscriptionInfo } from "@/lib/auto-replies-subscription-info";
import {
  formatAutoReplyPackLine,
  formatBillingDateLong,
  savedCardLabelFromFields,
} from "@/lib/auto-replies-billing-copy";

export async function PATCH(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  let body: { autoRenew?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Нужен JSON" }, { status: 400 });
  }

  if (typeof body.autoRenew !== "boolean") {
    return NextResponse.json(
      { success: false, error: "Укажите autoRenew: true или false" },
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  const info = await fetchAutoReplySubscriptionInfo(supabase, auth.user.id);

  if (body.autoRenew && !info.hasSavedCard) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Нет сохранённой карты. Оформите пакет «Отзывы» с включённым автопродлением в разделе «Цена».",
      },
      { status: 200 }
    );
  }

  const { error } = await supabase
    .from("auto_reply_billing")
    .upsert(
      {
        user_id: auth.user.id,
        auto_renew: body.autoRenew,
        updated_at: new Date().toISOString(),
        ...(info.tariffIndex != null ? { tariff_index: info.tariffIndex } : {}),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("[auto-replies/billing/auto-renew]", error.message);
    return NextResponse.json(
      { success: false, error: "Не удалось обновить автопродление" },
      { status: 200 }
    );
  }

  const cardLabel = savedCardLabelFromFields(info.cardLast4, info.cardBrand);
  const periodEndLabel = formatBillingDateLong(info.periodEnd);
  const renewDateLabel = formatBillingDateLong(info.nextRenewAt);
  const packLine = formatAutoReplyPackLine(info.tariffIndex);

  const message = body.autoRenew
    ? cardLabel && renewDateLabel
      ? `Автопродление включено. С карты ${cardLabel} раз в 30 дней будет списываться ${info.monthlyPriceRub.toLocaleString("ru-RU")} ₽ (${packLine}). Следующее списание — ${renewDateLabel}.`
      : `Автопродление включено. Списание ${info.monthlyPriceRub.toLocaleString("ru-RU")} ₽ раз в 30 дней (${packLine}).`
    : periodEndLabel
      ? cardLabel
        ? `Автопродление выключено. Карта ${cardLabel} остаётся привязанной. Пакет «Отзывы» действует до ${periodEndLabel} включительно — новых списаний не будет.`
        : `Автопродление выключено. Пакет действует до ${periodEndLabel} включительно — новых списаний не будет.`
      : "Автопродление выключено. Следующее списание выполнено не будет.";

  return NextResponse.json({
    success: true,
    autoRenew: body.autoRenew,
    message,
    periodEnd: info.periodEnd,
    nextRenewAt: info.nextRenewAt,
  });
}
