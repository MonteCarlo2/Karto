import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubWbToken, wbRouteError } from "@/lib/seller-hub/wb-token-http";
import { WildberriesApiError } from "@/lib/services/wildberries/client";
import { fetchWbClusterStats } from "@/lib/services/wildberries/advert-client";
import { CACHE_TTL_MS, cachedFetch, supabaseCacheStore } from "@/lib/seller-hub/data-cache";
import { createServerClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Только чтение: статистика поисковых запросов (кластеров) по парам «кампания — артикул». */
export async function POST(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  let body: { pairs?: unknown; dateFrom?: unknown; dateTo?: unknown; refresh?: unknown };
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
  if (pairs.length === 0 || pairs.length > 300) {
    return NextResponse.json({ ok: false, error: "Укажите от 1 до 300 пар кампания — артикул" }, { status: 400 });
  }
  if (typeof body.dateFrom !== "string" || typeof body.dateTo !== "string" || !DATE.test(body.dateFrom) || !DATE.test(body.dateTo)) {
    return NextResponse.json({ ok: false, error: "Даты в формате ГГГГ-ММ-ДД" }, { status: 400 });
  }

  try {
    const from = body.dateFrom;
    const to = body.dateTo;
    const result = await cachedFetch({
      store: supabaseCacheStore(createServerClient(), access.userId),
      key: `ads-clusters:${pairs.map((p) => `${p.advertId}:${p.nmId}`).sort().join(",")}|${from}|${to}`,
      ttlMs: CACHE_TTL_MS.adsClusters,
      refresh: body.refresh === true,
      fetcher: () => fetchWbClusterStats(access.token, pairs, from, to),
    });
    return NextResponse.json({
      ok: true,
      clusters: result.value,
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
