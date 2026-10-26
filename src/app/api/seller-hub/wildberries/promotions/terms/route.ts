import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubWbToken, wbRouteError } from "@/lib/seller-hub/wb-token-http";
import { WildberriesApiError } from "@/lib/services/wildberries/client";
import {
  fetchPromotionEntryTermsForNmIds,
  type PromoEntryTermsResult,
} from "@/lib/services/wildberries/promotions-write-client";

import { withSyncInvalidation } from "@/lib/seller-hub/sync/invalidate";
export const maxDuration = 60;

/** Пороги входа в акцию по конкретным товарам — источник правды для превью скидки. */
async function handlePost(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  let body: { promotionId?: number; nmIds?: number[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }

  const apiKey = access.token;

  const promotionId = Number(body.promotionId);
  if (!Number.isFinite(promotionId) || promotionId <= 0) {
    return NextResponse.json({ ok: false, error: "Некорректный ID акции" }, { status: 400 });
  }

  const nmIds = Array.isArray(body.nmIds)
    ? [...new Set(body.nmIds.map(Number).filter((id) => Number.isFinite(id) && id > 0))]
    : [];
  if (nmIds.length === 0) {
    return NextResponse.json({ ok: false, error: "Не указаны nmID" }, { status: 400 });
  }

  try {
    const result: PromoEntryTermsResult = await fetchPromotionEntryTermsForNmIds(
      apiKey,
      promotionId,
      nmIds
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof WildberriesApiError) {
      return wbRouteError(e, apiKey, e.status >= 400 ? e.status : 502);
    }
    throw e;
  }
}

/** После изменения в кабинете серверный снимок устарел: помечаем источники, воркер перечитает их в ближайшую минуту. */
export const POST = withSyncInvalidation(handlePost, ["base"]);
