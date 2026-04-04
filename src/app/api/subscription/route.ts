import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isSupabaseNetworkError } from "@/lib/supabase/network-error";
import {
  getSubscriptionByUserId,
  FREE_WELCOME_CREATIVE_LIMIT,
  FREE_WELCOME_VIDEO_TOKENS,
} from "@/lib/subscription";
import { addVideoTokens } from "@/lib/video-tokens";
import { sendWelcomeEmail } from "@/lib/send-welcome-email";

/**
 * GET: текущая подписка пользователя (по Authorization: Bearer <token>).
 * Если у пользователя ещё нет активной подписки — создаём приветственную: 3 фото в «Свободное творчество», 100 видео-токенов (RPC).
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

    const supabase = createServerClient();
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
      const { error: insertError } = await supabase.from("user_subscriptions").insert({
        user_id: user.id,
        plan_type: "creative",
        plan_volume: FREE_WELCOME_CREATIVE_LIMIT,
        period_start: new Date().toISOString(),
        flows_used: 0,
        creative_used: 0,
      });

      if (insertError) {
        if (insertError.code === "23505") {
          row = await getSubscriptionByUserId(supabase as any, user.id) ?? null;
        } else {
          console.error("❌ [SUBSCRIPTION] Ошибка создания приветственной подписки:", insertError);
          return NextResponse.json({
            success: true,
            subscription: null,
          });
        }
      } else {
        const { ok: videoOk, error: videoGrantErr } = await addVideoTokens(
          supabase as any,
          user.id,
          FREE_WELCOME_VIDEO_TOKENS
        );
        if (!videoOk) {
          console.error(
            "❌ [SUBSCRIPTION] Не удалось начислить приветственные видео-токены:",
            videoGrantErr
          );
        }
        row = await getSubscriptionByUserId(supabase as any, user.id) ?? null;
        sendWelcomeEmail({
          to: user.email ?? "",
          name: (user.user_metadata?.name as string) || undefined,
        }).catch(() => {});
      }
    }

    if (!row) {
      return NextResponse.json({
        success: true,
        subscription: null,
        videoTokenBalance: 0,
        videoTokensSpent: 0,
        videoTokensLifetimePurchased: 0,
      });
    }

    return NextResponse.json(
      {
        success: true,
        subscription: row,
        videoTokenBalance: row.videoTokenBalance,
        videoTokensSpent: row.videoTokensSpent,
        videoTokensLifetimePurchased: row.videoTokensLifetimePurchased,
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
