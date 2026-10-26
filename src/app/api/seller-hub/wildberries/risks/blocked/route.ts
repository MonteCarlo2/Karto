import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubWbToken, wbRouteError } from "@/lib/seller-hub/wb-token-http";
import { WildberriesApiError } from "@/lib/services/wildberries/client";
import { fetchWbBlockedCards } from "@/lib/services/wildberries/risks-client";
import { CACHE_TTL_MS, cachedFetch, supabaseCacheStore } from "@/lib/seller-hub/data-cache";
import { createServerClient } from "@/lib/supabase/server";

export const maxDuration = 30;

/** Только чтение: заблокированные WB карточки с причинами (серверный кэш, у WB узкий лимит). */
export async function POST(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => ({}))) as { refresh?: unknown };

  try {
    const result = await cachedFetch({
      store: supabaseCacheStore(createServerClient(), access.userId),
      key: "blocked-cards",
      ttlMs: CACHE_TTL_MS.blockedCards,
      refresh: body.refresh === true,
      fetcher: () => fetchWbBlockedCards(access.token),
    });
    return NextResponse.json({
      ok: true,
      blocked: result.value,
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
