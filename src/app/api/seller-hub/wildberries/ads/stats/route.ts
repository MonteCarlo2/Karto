import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubWbToken, wbRouteError } from "@/lib/seller-hub/wb-token-http";
import { WildberriesApiError } from "@/lib/services/wildberries/client";
import { fetchWbAdsStats } from "@/lib/services/wildberries/advert-client";
import { CACHE_TTL_MS, cachedFetch, supabaseCacheStore } from "@/lib/seller-hub/data-cache";
import { createServerClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 31;

/** Только чтение: статистика рекламных кампаний за период (WB fullstats). */
export async function POST(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  let body: { campaignIds?: unknown; dateFrom?: unknown; dateTo?: unknown; refresh?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }

  const ids = Array.isArray(body.campaignIds)
    ? body.campaignIds.filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0)
    : [];
  if (ids.length === 0 || ids.length > 200) {
    return NextResponse.json({ ok: false, error: "Укажите от 1 до 200 кампаний" }, { status: 400 });
  }
  if (typeof body.dateFrom !== "string" || typeof body.dateTo !== "string" || !DATE.test(body.dateFrom) || !DATE.test(body.dateTo)) {
    return NextResponse.json({ ok: false, error: "Даты в формате ГГГГ-ММ-ДД" }, { status: 400 });
  }
  const days = (Date.parse(body.dateTo) - Date.parse(body.dateFrom)) / 86_400_000 + 1;
  if (!(days >= 1 && days <= MAX_DAYS)) {
    return NextResponse.json({ ok: false, error: `Период от 1 до ${MAX_DAYS} дней` }, { status: 400 });
  }

  try {
    const from = body.dateFrom;
    const to = body.dateTo;
    const result = await cachedFetch({
      store: supabaseCacheStore(createServerClient(), access.userId),
      key: `ads-stats:${[...ids].sort((a, b) => a - b).join(",")}|${from}|${to}`,
      ttlMs: CACHE_TTL_MS.adsStats,
      refresh: body.refresh === true,
      fetcher: () => fetchWbAdsStats(access.token, ids, from, to),
    });
    return NextResponse.json({
      ok: true,
      stats: result.value,
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
