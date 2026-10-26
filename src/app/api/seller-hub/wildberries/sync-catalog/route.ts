import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubWbToken, wbRouteError } from "@/lib/seller-hub/wb-token-http";
import { syncWildberriesCatalog } from "@/lib/services/wildberries/content-client";
import { WildberriesApiError } from "@/lib/services/wildberries/client";

export const maxDuration = 180;

export async function POST(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      categoryCharcCache?: Record<
        string,
        { names: string[]; requiredNames: string[]; loadedAt: string }
      >;
    };
    const snapshot = await syncWildberriesCatalog(access.token, {
      categoryCharcCache: body.categoryCharcCache,
    });
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    if (error instanceof WildberriesApiError) {
      return wbRouteError(error, access.token, error.status >= 400 ? error.status : 502);
    }
    throw error;
  }
}
