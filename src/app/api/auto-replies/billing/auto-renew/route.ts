import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import { fetchAutoReplySubscriptionInfo } from "@/lib/auto-replies-subscription-info";
import { formatSubscriptionPeriodRu } from "@/lib/subscription";

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

  const periodLabel = formatSubscriptionPeriodRu(info.periodStart, info.periodEnd);
  const renewDateLabel = info.nextRenewAt
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(info.nextRenewAt))
    : null;

  const message = body.autoRenew
    ? renewDateLabel
      ? `Автопродление включено. Следующее списание ${info.monthlyPriceRub.toLocaleString("ru-RU")} ₽ — ${renewDateLabel}.`
      : `Автопродление включено. С карты будет списываться ${info.monthlyPriceRub.toLocaleString("ru-RU")} ₽ раз в месяц.`
    : periodLabel
      ? `Автопродление отключено. Текущий пакет действует до конца периода (${periodLabel.split(" — ")[1] ?? periodLabel}). Следующее списание выполнено не будет.`
      : "Автопродление отключено. Следующее списание выполнено не будет.";

  return NextResponse.json({
    success: true,
    autoRenew: body.autoRenew,
    message,
    periodEnd: info.periodEnd,
    nextRenewAt: info.nextRenewAt,
  });
}
