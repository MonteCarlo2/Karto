import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubWbToken } from "@/lib/seller-hub/wb-token-http";
import { safeSellerHubMessage } from "@/lib/seller-hub/wb-token";
import { fetchRealizationMargin } from "@/lib/services/wildberries/realization-margin";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  const realization = await fetchRealizationMargin(access.token);
  if (realization.error) {
    return NextResponse.json(
      { ok: false, error: safeSellerHubMessage(realization.error, access.token), realization },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, realization });
}
