import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubWbToken, wbRouteError } from "@/lib/seller-hub/wb-token-http";
import { WildberriesApiError } from "@/lib/services/wildberries/client";
import { fetchWbSearchTexts } from "@/lib/services/wildberries/seo-client";
import { CACHE_TTL_MS, cachedFetch, supabaseCacheStore } from "@/lib/seller-hub/data-cache";
import { createServerClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Только чтение: топ поисковых запросов по одному товару (WB обновляет отчёт раз в 2 часа, серверный кэш 2 часа). */
export async function POST(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as {
    nmId?: unknown;
    dateFrom?: unknown;
    dateTo?: unknown;
    pastDateFrom?: unknown;
    pastDateTo?: unknown;
    refresh?: unknown;
  } | null;
  const dates = [body?.dateFrom, body?.dateTo, body?.pastDateFrom, body?.pastDateTo];
  if (
    !body ||
    typeof body.nmId !== "number" ||
    !Number.isInteger(body.nmId) ||
    body.nmId <= 0 ||
    !dates.every((d): d is string => typeof d === "string" && DATE.test(d))
  ) {
    return NextResponse.json({ ok: false, error: "Нужны артикул и даты ГГГГ-ММ-ДД" }, { status: 400 });
  }
  const [dateFrom, dateTo, pastDateFrom, pastDateTo] = dates as [string, string, string, string];
  const nmId = body.nmId;

  try {
    const result = await cachedFetch({
      store: supabaseCacheStore(createServerClient(), access.userId),
      key: `seo-texts:${nmId}|${dateFrom}|${dateTo}`,
      ttlMs: CACHE_TTL_MS.searchTexts,
      refresh: body.refresh === true,
      fetcher: () =>
        fetchWbSearchTexts(access.token, nmId, { dateFrom, dateTo }, { dateFrom: pastDateFrom, dateTo: pastDateTo }),
    });
    return NextResponse.json({
      ok: true,
      texts: result.value,
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
