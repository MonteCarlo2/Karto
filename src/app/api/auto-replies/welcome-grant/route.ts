import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import {
  AUTO_REPLY_WELCOME_CREDITS,
  grantAutoReplyWelcomeIfEligible,
} from "@/lib/auto-replies-welcome";
import { fetchAutoReplySubscriptionInfo } from "@/lib/auto-replies-subscription-info";

export async function POST(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const supabase = createServerClient();
  const result = await grantAutoReplyWelcomeIfEligible(supabase, auth.user.id);
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: "Не удалось начислить пробные ответы. Попробуйте позже." },
      { status: 200 }
    );
  }

  const info = await fetchAutoReplySubscriptionInfo(supabase, auth.user.id);

  return NextResponse.json({
    success: true,
    granted: result.granted,
    welcomeCredits: AUTO_REPLY_WELCOME_CREDITS,
    balance: info.balance,
    message: result.granted
      ? `Вам начислено ${AUTO_REPLY_WELCOME_CREDITS} бесплатных ответов — без срока действия.`
      : undefined,
  });
}
