import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubWbToken, wbRouteError } from "@/lib/seller-hub/wb-token-http";
import { WildberriesApiError } from "@/lib/services/wildberries/client";
import { fetchWbOrdersByRegion } from "@/lib/services/wildberries/logistics-client";
import { CACHE_TTL_MS, cachedFetch, supabaseCacheStore } from "@/lib/seller-hub/data-cache";
import { createServerClient } from "@/lib/supabase/server";

export const maxDuration = 120;

/** Только чтение: заказы за период по регионам покупателей (отчёт Statistics «Заказы»). */
export async function POST(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  let body: { days?: unknown; refresh?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }
  const days = typeof body.days === "number" && Number.isInteger(body.days) ? body.days : 0;
  if (days < 7 || days > 90) {
    return NextResponse.json({ ok: false, error: "Период от 7 до 90 дней" }, { status: 400 });
  }

  try {
    const result = await cachedFetch({
      store: supabaseCacheStore(createServerClient(), access.userId),
      // v3: в ответ добавлен суточный ряд заказов (daily). v4: выгрузка начинается с начала первых суток периода, прежние кэши неполны по первому дню.
      key: `region-orders:v4:${days}`,
      ttlMs: CACHE_TTL_MS.regionOrders,
      refresh: body.refresh === true,
      fetcher: () => fetchWbOrdersByRegion(access.token, days),
    });
    return NextResponse.json({
      ok: true,
      regions: result.value,
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
