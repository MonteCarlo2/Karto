import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubWbToken, wbRouteError } from "@/lib/seller-hub/wb-token-http";
import { WildberriesApiError } from "@/lib/services/wildberries/client";
import { fetchWbSupplyOrders, type WbSupplyOrder } from "@/lib/services/wildberries/marketplace-ops-client";
import { CACHE_TTL_MS, cachedFetch, supabaseCacheStore } from "@/lib/seller-hub/data-cache";
import { safeSellerHubMessage } from "@/lib/seller-hub/wb-token";
import { createServerClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const MAX_SUPPLIES = 20;
/** После стольких подряд отказов WB дальше не идём: скорее всего, нет доступа или лимит запросов. */
const MAX_CONSECUTIVE_FAILS = 3;

/** Только чтение: состав FBS-поставок. Закрытые поставки кэшируем на сутки, открытые на 5 минут. Ошибка по одной поставке не ломает остальные. */
export async function POST(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  let body: { supplies?: unknown; refresh?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }
  const raw = Array.isArray(body.supplies) ? body.supplies : [];
  const supplies = raw
    .filter((s): s is { id: string; done: boolean } => !!s && typeof s === "object" && typeof (s as { id?: unknown }).id === "string" && /^[\w-]{1,64}$/.test((s as { id: string }).id))
    .slice(0, MAX_SUPPLIES)
    .map((s) => ({ id: s.id, done: Boolean((s as { done?: unknown }).done) }));
  if (supplies.length === 0) {
    return NextResponse.json({ ok: false, error: "Укажите поставки" }, { status: 400 });
  }

  const store = supabaseCacheStore(createServerClient(), access.userId);
  const result: Array<{ supplyId: string; orders: WbSupplyOrder[] }> = [];
  const failed: Array<{ supplyId: string; status: number; message: string }> = [];
  let stale = false;
  let fails = 0;
  let firstError: WildberriesApiError | null = null;

  for (const supply of supplies) {
    if (fails >= MAX_CONSECUTIVE_FAILS) break;
    try {
      const one = await cachedFetch({
        store,
        key: `supply-orders:${supply.id}`,
        ttlMs: supply.done ? CACHE_TTL_MS.supplyOrdersClosed : CACHE_TTL_MS.supplyOrdersOpen,
        refresh: body.refresh === true && !supply.done,
        fetcher: () => fetchWbSupplyOrders(access.token, supply.id),
      });
      if (one.stale) stale = true;
      result.push({ supplyId: supply.id, orders: one.value });
      fails = 0;
    } catch (e) {
      if (!(e instanceof WildberriesApiError)) throw e;
      fails += 1;
      firstError ??= e;
      failed.push({ supplyId: supply.id, status: e.status, message: safeSellerHubMessage(e.message, access.token) });
    }
  }

  if (result.length === 0 && firstError) {
    return wbRouteError(firstError, access.token, firstError.status >= 400 ? firstError.status : 502);
  }
  return NextResponse.json({ ok: true, supplyOrders: result, failed, loadedAt: new Date().toISOString(), stale });
}
