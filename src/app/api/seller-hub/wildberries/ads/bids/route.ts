import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubWbToken, wbRouteError } from "@/lib/seller-hub/wb-token-http";
import { WildberriesApiError } from "@/lib/services/wildberries/client";
import { fetchWbBidRecommendations } from "@/lib/services/wildberries/advert-client";
import { CACHE_TTL_MS, cachedFetch, supabaseCacheStore } from "@/lib/seller-hub/data-cache";
import { createServerClient } from "@/lib/supabase/server";

export const maxDuration = 120;

/** Только чтение: рекомендованные WB ставки для пар «кампания — артикул». */
export async function POST(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  let body: { pairs?: unknown; refresh?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }

  const pairs = Array.isArray(body.pairs)
    ? body.pairs.flatMap((raw) => {
        const pair = raw as { advertId?: unknown; nmId?: unknown };
        return typeof pair?.advertId === "number" &&
          Number.isInteger(pair.advertId) &&
          pair.advertId > 0 &&
          typeof pair?.nmId === "number" &&
          Number.isInteger(pair.nmId) &&
          pair.nmId > 0
          ? [{ advertId: pair.advertId, nmId: pair.nmId }]
          : [];
      })
    : [];
  if (pairs.length === 0 || pairs.length > 20) {
    return NextResponse.json({ ok: false, error: "Укажите от 1 до 20 пар кампания — артикул" }, { status: 400 });
  }

  try {
    const result = await cachedFetch({
      store: supabaseCacheStore(createServerClient(), access.userId),
      key: `ads-bids:${pairs.map((p) => `${p.advertId}:${p.nmId}`).sort().join(",")}`,
      ttlMs: CACHE_TTL_MS.adsBids,
      refresh: body.refresh === true,
      fetcher: () => fetchWbBidRecommendations(access.token, pairs),
    });
    return NextResponse.json({
      ok: true,
      recommendations: result.value,
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
