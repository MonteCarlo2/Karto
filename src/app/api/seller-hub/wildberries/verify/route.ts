import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubWbToken, wbRouteError } from "@/lib/seller-hub/wb-token-http";
import { verifyWildberriesContentAccess } from "@/lib/services/wildberries/content-client";
import { WildberriesApiError } from "@/lib/services/wildberries/client";

export async function POST(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  try {
    const result = await verifyWildberriesContentAccess(access.token);
    return NextResponse.json({
      ok: true,
      sellerName: result.sellerName,
      sampleCount: result.sampleCount,
      totalCards: result.totalCards,
      scopes: result.scopes,
      verifiedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof WildberriesApiError) {
      return wbRouteError(error, access.token, error.status >= 400 ? error.status : 502);
    }
    throw error;
  }
}
