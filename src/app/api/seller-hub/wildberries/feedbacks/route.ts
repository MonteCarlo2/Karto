import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubWbToken } from "@/lib/seller-hub/wb-token-http";
import { safeSellerHubMessage } from "@/lib/seller-hub/wb-token";
import { syncSellerHubFeedbacks } from "@/lib/seller-hub/feedbacks/sync";
import { createServerClient } from "@/lib/supabase/server";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as {
    force?: boolean;
    wbFeedbackRatingByNm?: Record<string, number | null>;
  } | null;
  try {
    const supabase = createServerClient();
    const feedbacks = await syncSellerHubFeedbacks({
      supabase,
      userId: access.userId,
      token: access.token,
      force: body?.force === true,
      wbFeedbackRatingByNm: body?.wbFeedbackRatingByNm,
    });
    return NextResponse.json({
      ok: feedbacks.status === "ok" || feedbacks.status === "partial",
      feedbacks,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Отзывы не загрузились.";
    return NextResponse.json(
      { ok: false, error: safeSellerHubMessage(message, access.token) },
      { status: 502 },
    );
  }
}
