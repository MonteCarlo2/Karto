import { NextRequest, NextResponse } from "next/server";
import { idsOf, recordAction, resultMessage } from "@/lib/seller-hub/action-log";
import { safeSellerHubMessage } from "@/lib/seller-hub/wb-token";
import { requireSellerHubWbToken, wbRouteError } from "@/lib/seller-hub/wb-token-http";
import { parseAdCreateRequest } from "@/lib/seller-hub/ads-create";
import { WildberriesApiError } from "@/lib/services/wildberries/client";
import { createWbAdCampaign } from "@/lib/services/wildberries/ads-write-client";

import { withSyncInvalidation } from "@/lib/seller-hub/sync/invalidate";
export const maxDuration = 30;

/**
 * Создание тестовой кампании для одного товара. Запись в WB, деньги не списываются, показы не начинаются.
 * Принимаем только запрос с подтверждённым артикулом.
 */
async function handlePost(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }

  const parsed = parseAdCreateRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  try {
    const result = await createWbAdCampaign(access.token, parsed.request);
    await recordAction({ userId: access.userId, agent: "ads", action: "ad_create", ...idsOf(parsed.request), request: parsed.request, result: result.ok ? "ok" : "error", message: resultMessage(result) });
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (e) {
    await recordAction({ userId: access.userId, agent: "ads", action: "ad_create", ...idsOf(parsed.request), request: parsed.request, result: "error", message: e instanceof Error ? safeSellerHubMessage(e.message, access.token) : null });
    if (e instanceof WildberriesApiError) {
      return wbRouteError(e, access.token, e.status >= 400 ? e.status : 502);
    }
    throw e;
  }
}

/** После изменения в кабинете серверный снимок устарел: помечаем источники, воркер перечитает их в ближайшую минуту. */
export const POST = withSyncInvalidation(handlePost, ["base", "ads_stats"]);
