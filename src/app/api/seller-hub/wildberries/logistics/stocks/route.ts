import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubWbToken, wbRouteError } from "@/lib/seller-hub/wb-token-http";
import { WildberriesApiError } from "@/lib/services/wildberries/client";
import { fetchWbWarehouseStocks } from "@/lib/services/wildberries/logistics-client";
import { CACHE_TTL_MS, cachedFetch, shortHash, supabaseCacheStore } from "@/lib/seller-hub/data-cache";
import { createServerClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/** Только чтение: остатки артикулов по складам WB. */
export async function POST(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  let body: { nmIds?: unknown; refresh?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }
  const nmIds = Array.isArray(body.nmIds)
    ? body.nmIds.filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0)
    : [];
  if (nmIds.length === 0 || nmIds.length > 5000) {
    return NextResponse.json({ ok: false, error: "Укажите от 1 до 5000 артикулов" }, { status: 400 });
  }

  try {
    const result = await cachedFetch({
      store: supabaseCacheStore(createServerClient(), access.userId),
      key: `wh-stocks:${nmIds.length}:${shortHash([...nmIds].sort((a, b) => a - b).join(","))}`,
      ttlMs: CACHE_TTL_MS.warehouseStocks,
      refresh: body.refresh === true,
      fetcher: () => fetchWbWarehouseStocks(access.token, nmIds),
    });
    return NextResponse.json({
      ok: true,
      stocks: result.value,
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
