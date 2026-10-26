import { NextRequest, NextResponse } from "next/server";
import { recordAction, resultMessage } from "@/lib/seller-hub/action-log";
import { parseClusterBidReset, parseClusterBidSet } from "@/lib/seller-hub/ads-cluster-bid";
import { safeSellerHubMessage } from "@/lib/seller-hub/wb-token";
import { requireSellerHubWbToken, wbRouteError } from "@/lib/seller-hub/wb-token-http";
import { WildberriesApiError } from "@/lib/services/wildberries/client";
import { fetchWbClusterBids, resetWbClusterBid, setWbClusterBid } from "@/lib/services/wildberries/ads-write-client";

import { withSyncInvalidation } from "@/lib/seller-hub/sync/invalidate";
export const maxDuration = 30;

/**
 * Ставки поисковых кластеров (запросов) внутри кампании.
 * action "read" — только чтение текущих ставок; "set" — поставить ставку (подтверждение числа обязательно);
 * "reset" — сбросить ставку кластера к ставке кампании (подтверждение запроса обязательно).
 */
async function handlePost(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }

  try {
    if (body.action === "read") {
      const pairs = Array.isArray(body.pairs)
        ? body.pairs.flatMap((p) => {
            const o = p as { advertId?: unknown; nmId?: unknown };
            return Number.isInteger(o?.advertId) && Number.isInteger(o?.nmId) ? [{ advertId: o.advertId as number, nmId: o.nmId as number }] : [];
          })
        : [];
      if (pairs.length === 0 || pairs.length > 300) {
        return NextResponse.json({ ok: false, error: "Укажите от 1 до 300 пар «кампания и артикул»" }, { status: 400 });
      }
      return NextResponse.json({ ok: true, bids: await fetchWbClusterBids(access.token, pairs) });
    }

    if (body.action === "set") {
      const parsed = parseClusterBidSet(body);
      if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
      const result = await setWbClusterBid(access.token, parsed.request);
      await recordAction({ userId: access.userId, agent: "ads", action: "ad_cluster_bid", targetId: parsed.request.advertId, nmId: parsed.request.nmId, request: parsed.request, result: result.ok ? "ok" : "error", message: resultMessage(result) });
      return NextResponse.json(result, { status: result.ok ? 200 : 502 });
    }

    if (body.action === "reset") {
      const parsed = parseClusterBidReset(body);
      if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
      const result = await resetWbClusterBid(access.token, parsed.request);
      await recordAction({ userId: access.userId, agent: "ads", action: "ad_cluster_bid_reset", targetId: parsed.request.advertId, nmId: parsed.request.nmId, request: parsed.request, result: result.ok ? "ok" : "error", message: resultMessage(result) });
      return NextResponse.json(result, { status: result.ok ? 200 : 502 });
    }

    return NextResponse.json({ ok: false, error: "action должен быть read, set или reset" }, { status: 400 });
  } catch (e) {
    if (body.action === "set" || body.action === "reset") {
      await recordAction({ userId: access.userId, agent: "ads", action: body.action === "set" ? "ad_cluster_bid" : "ad_cluster_bid_reset", targetId: typeof body.advertId === "number" ? body.advertId : null, nmId: typeof body.nmId === "number" ? body.nmId : null, request: { advertId: body.advertId, nmId: body.nmId, query: body.query }, result: "error", message: e instanceof Error ? safeSellerHubMessage(e.message, access.token) : null });
    }
    if (e instanceof WildberriesApiError) {
      return wbRouteError(e, access.token, e.status >= 400 ? e.status : 502);
    }
    throw e;
  }
}

/** После изменения в кабинете серверный снимок устарел: помечаем источники, воркер перечитает их в ближайшую минуту. */
export const POST = withSyncInvalidation(handlePost, ["base"]);
