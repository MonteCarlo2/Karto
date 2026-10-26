import { NextRequest, NextResponse } from "next/server";
import { recordAction, resultMessage } from "@/lib/seller-hub/action-log";
import { safeSellerHubMessage } from "@/lib/seller-hub/wb-token";
import { requireSellerHubWbToken, wbRouteError } from "@/lib/seller-hub/wb-token-http";
import { WildberriesApiError } from "@/lib/services/wildberries/client";
import { toggleWbAdCampaign } from "@/lib/services/wildberries/ads-write-client";

import { withSyncInvalidation } from "@/lib/seller-hub/sync/invalidate";
export const maxDuration = 20;

async function handlePost(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  let body: { campaignId?: number; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }

  const apiKey = access.token;

  if (typeof body.campaignId !== "number") {
    return NextResponse.json({ ok: false, error: "Укажите campaignId" }, { status: 400 });
  }

  if (body.action !== "start" && body.action !== "pause") {
    return NextResponse.json({ ok: false, error: "action должен быть start или pause" }, { status: 400 });
  }

  try {
    const result = await toggleWbAdCampaign(apiKey, body.campaignId, body.action);
    await recordAction({ userId: access.userId, agent: "ads", action: body.action === "pause" ? "ad_pause" : "ad_start", targetId: body.campaignId, request: { campaignId: body.campaignId, action: body.action }, result: result.ok ? "ok" : "error", message: resultMessage(result) });
    return NextResponse.json(result);
  } catch (e) {
    await recordAction({ userId: access.userId, agent: "ads", action: body.action === "pause" ? "ad_pause" : "ad_start", targetId: body.campaignId, request: { campaignId: body.campaignId, action: body.action }, result: "error", message: e instanceof Error ? safeSellerHubMessage(e.message, apiKey) : null });
    if (e instanceof WildberriesApiError) {
      return wbRouteError(e, apiKey, e.status >= 400 ? e.status : 502);
    }
    throw e;
  }
}

/** После изменения в кабинете серверный снимок устарел: помечаем источники, воркер перечитает их в ближайшую минуту. */
export const POST = withSyncInvalidation(handlePost, ["base", "ads_stats"]);
