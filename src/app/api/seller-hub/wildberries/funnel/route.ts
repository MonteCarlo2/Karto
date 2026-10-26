import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubWbToken } from "@/lib/seller-hub/wb-token-http";
import { safeSellerHubMessage } from "@/lib/seller-hub/wb-token";
import { fetchSalesFunnel } from "@/lib/services/wildberries/analytics-client";

export const maxDuration = 180;

export async function POST(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  const funnel = await fetchSalesFunnel(access.token);
  if (funnel.error) {
    return NextResponse.json(
      { ok: false, error: safeSellerHubMessage(funnel.error, access.token), funnel },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, funnel });
}
