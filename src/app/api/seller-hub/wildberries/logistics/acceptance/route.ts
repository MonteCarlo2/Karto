import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubWbToken, wbRouteError } from "@/lib/seller-hub/wb-token-http";
import { WildberriesApiError } from "@/lib/services/wildberries/client";
import { fetchWbAcceptanceCoefficients } from "@/lib/services/wildberries/logistics-client";
import { CACHE_TTL_MS, cachedFetch, supabaseCacheStore } from "@/lib/seller-hub/data-cache";
import { createServerClient } from "@/lib/supabase/server";

export const maxDuration = 30;

/** Только чтение: коэффициенты приёмки на склады WB (слоты для поставок FBO). */
export async function POST(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  let body: { refresh?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const result = await cachedFetch({
      store: supabaseCacheStore(createServerClient(), access.userId),
      key: "acceptance-coefficients",
      ttlMs: CACHE_TTL_MS.acceptance,
      refresh: body.refresh === true,
      fetcher: () => fetchWbAcceptanceCoefficients(access.token),
    });
    return NextResponse.json({
      ok: true,
      acceptance: result.value,
      loadedAt: result.loadedAt,
      fromCache: result.fromCache,
      stale: result.stale,
      staleReason: result.staleReason,
    });
  } catch (e) {
    if (e instanceof WildberriesApiError) {
      return wbRouteError(e, access.token, e.status >= 400 ? e.status : 502);
    }
    throw e;
  }
}
