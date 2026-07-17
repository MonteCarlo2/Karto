import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isSupabaseNetworkError } from "@/lib/supabase/network-error";
import { getSubscriptionByUserId, FREE_WELCOME_CREDITS } from "@/lib/subscription";
import { addCredits, migrateLegacyCreativeToCredits } from "@/lib/credits";
import { sendWelcomeEmail } from "@/lib/send-welcome-email";
import { fetchAutoReplySubscriptionInfo } from "@/lib/auto-replies-subscription-info";
import { grantDemoFlowOnWelcome, clearDemoFlowIfHasPaid } from "@/lib/demo-flow-server";

/**
 * GET: текущая подписка пользователя (по Authorization: Bearer <token>).
 * Новый аккаунт: FREE_WELCOME_CREDITS в едином кошельке + 1 демо-поток.
 * Если есть платный Поток — демо снимается.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json(
        { success: false, subscription: null, error: "Не авторизован" },
        { status: 401 }
      );
    }

    let supabase: ReturnType<typeof createServerClient>;
    try {
      supabase = createServerClient();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("⚠️ [SUBSCRIPTION] Серверный Supabase не настроен:", msg);
      return NextResponse.json({
        success: true,
        subscription: null,
        creditBalance: 0,
        videoTokenBalance: 0,
        videoTokensSpent: 0,
        videoTokensLifetimePurchased: 0,
        degraded: true,
      });
    }
    let user: { id: string; email?: string; user_metadata?: any } | null = null;
    let authError: Error | null = null;
    try {
      const result = await supabase.auth.getUser(token);
      user = result.data?.user ?? null;
      authError = result.error as Error | null;
    } catch (e) {
      if (isSupabaseNetworkError(e)) {
        console.warn("⚠️ [SUBSCRIPTION] Supabase недоступен при проверке пользователя");
        return NextResponse.json({ success: true, subscription: null });
      }
      throw e;
    }
    if (authError || !user) {
      return NextResponse.json(
        { success: false, subscription: null, error: "Не авторизован" },
        { status: 401 }
      );
    }

    let row = await getSubscriptionByUserId(supabase as any, user.id);

    if (!row) {
      const { data: existingRows } = await supabase
        .from("user_subscriptions")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      const isNewAccount = !existingRows?.length;
      if (isNewAccount) {
        const { ok: creditsOk, error: creditsErr } = await addCredits(
          supabase as any,
          user.id,
          FREE_WELCOME_CREDITS
        );
        if (!creditsOk) {
          console.error(
            "❌ [SUBSCRIPTION] Не удалось начислить приветственные кредиты:",
            creditsErr
          );
        } else {
          sendWelcomeEmail({
            to: user.email ?? "",
            name: (user.user_metadata?.name as string) || undefined,
          }).catch(() => {});
        }
      }
      row = (await getSubscriptionByUserId(supabase as any, user.id)) ?? null;
    }

    // Демо получает только аккаунт с маркером новой регистрации и только один раз.
    await grantDemoFlowOnWelcome(supabase, user.id);
    row = (await getSubscriptionByUserId(supabase as any, user.id)) ?? row;

    // Платный Поток заменяет демо (демо больше не показываем и не списываем)
    if (row) {
      await clearDemoFlowIfHasPaid(supabase, user.id);
      row = (await getSubscriptionByUserId(supabase as any, user.id)) ?? row;
    }

    // Миграция остатка старых creative-генераций → единые кредиты
    await migrateLegacyCreativeToCredits(supabase as any, user.id);
    row = (await getSubscriptionByUserId(supabase as any, user.id)) ?? row;

    if (!row) {
      return NextResponse.json({
        success: true,
        subscription: null,
        creditBalance: 0,
        videoTokenBalance: 0,
        videoTokensSpent: 0,
        videoTokensLifetimePurchased: 0,
      });
    }

    const autoReply = await fetchAutoReplySubscriptionInfo(supabase as any, user.id);
    const creditBalance = row.videoTokenBalance;
    const subscription = {
      ...row,
      creditBalance,
      autoReplyBalance: autoReply.balance,
      autoReplyWelcomeRemaining: autoReply.welcomeRemaining,
      autoReplyPaidRemaining: autoReply.paidRemaining,
      autoReplyPeriodStart: autoReply.periodStart,
      autoReplyPeriodEnd: autoReply.periodEnd,
      autoReplyPackExpired: autoReply.packExpired,
      autoReplyAutoRenew: autoReply.autoRenew,
      autoReplyHasSavedCard: autoReply.hasSavedCard,
      autoReplyCardLast4: autoReply.cardLast4,
      autoReplyCardBrand: autoReply.cardBrand,
      autoReplyNextRenewAt: autoReply.nextRenewAt,
      autoReplyTariffIndex: autoReply.tariffIndex,
      autoReplyMonthlyPriceRub: autoReply.monthlyPriceRub,
    };

    return NextResponse.json(
      {
        success: true,
        subscription,
        creditBalance,
        videoTokenBalance: creditBalance,
        videoTokensSpent: row.videoTokensSpent,
        videoTokensLifetimePurchased: row.videoTokensLifetimePurchased,
        autoReply,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err: unknown) {
    if (isSupabaseNetworkError(err)) {
      console.warn("⚠️ [SUBSCRIPTION] Supabase недоступен (сеть/таймаут), отдаём пустую подписку");
      return NextResponse.json({
        success: true,
        subscription: null,
      });
    }
    console.error("❌ [SUBSCRIPTION] GET:", err);
    return NextResponse.json(
      { success: false, subscription: null, error: "Внутренняя ошибка" },
      { status: 500 }
    );
  }
}
