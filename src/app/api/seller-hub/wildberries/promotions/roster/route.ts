import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubWbToken, wbRouteError } from "@/lib/seller-hub/wb-token-http";
import { WildberriesApiError } from "@/lib/services/wildberries/client";
import { fetchPublicCardInfo } from "@/lib/services/wildberries/public-card-client";
import {
  fetchPromotionNomenclatureTerms,
  type PromoNomenclatureTerms,
} from "@/lib/services/wildberries/promotions-write-client";

import { withSyncInvalidation } from "@/lib/seller-hub/sync/invalidate";
export const maxDuration = 60;

type RosterRow = {
  nmId: number;
  price?: number;
  planPrice?: number;
  planDiscount?: number;
  inAction: boolean;
};

function withDiscount(row: PromoNomenclatureTerms, inAction: boolean): RosterRow {
  const price = row.price != null && row.price > 0 ? row.price : undefined;
  const planPrice = row.planPrice != null && row.planPrice > 0 ? row.planPrice : undefined;
  let planDiscount = row.planDiscount != null && row.planDiscount > 0 ? Math.round(row.planDiscount) : undefined;
  if (planDiscount == null && price != null && planPrice != null && price > planPrice) {
    planDiscount = Math.round(((price - planPrice) / price) * 100);
  }
  if (planDiscount == null && inAction && row.discount != null && row.discount > 0 && row.discount < 100) {
    planDiscount = Math.round(row.discount);
  }
  return { nmId: row.nmId, price, planPrice, planDiscount, inAction };
}

const publicCardCache = new Map<string, { at: number; value: Awaited<ReturnType<typeof fetchPublicCardInfo>> }>();

async function cachedPublicCards(nmIds: number[]) {
  const key = nmIds.join(",");
  const hit = publicCardCache.get(key);
  if (hit && Date.now() - hit.at < 120_000) return hit.value;
  const value = await fetchPublicCardInfo(nmIds);
  publicCardCache.set(key, { at: Date.now(), value });
  return value;
}

/** Список товаров акции: календарь, для автоакции ещё публичная карточка. */
async function handlePost(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  let body: { promotionId?: number; nmIds?: number[]; isAuto?: boolean };
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
    ? [...new Set(body.nmIds.map(Number).filter((id) => Number.isFinite(id) && id > 0))].slice(0, 500)
    : [];

  try {
    const [participatingRaw, eligibleRaw] = await Promise.all([
      fetchPromotionNomenclatureTerms(apiKey, promotionId, true),
      fetchPromotionNomenclatureTerms(apiKey, promotionId, false),
    ]);
    const inIds = new Set(participatingRaw.map((row) => row.nmId));
    const participating = participatingRaw.map((row) => withDiscount(row, true));
    const eligible = eligibleRaw
      .filter((row) => !inIds.has(row.nmId))
      .map((row) => withDiscount(row, row.inAction === true));

    if (participating.length === 0 && eligible.length === 0 && body.isAuto === true && nmIds.length > 0) {
      const cards = await cachedPublicCards(nmIds);
      const fromCards: RosterRow[] = [];
      for (const info of cards.values()) {
        if (!info.promotionIds.has(promotionId)) continue;
        fromCards.push(
          withDiscount(
            {
              nmId: info.nmId,
              price: info.basicPrice,
              planPrice: info.productPrice,
            },
            true,
          ),
        );
      }
      return NextResponse.json({ ok: true, participating: fromCards, eligible: [], source: "card" });
    }

    return NextResponse.json({ ok: true, participating, eligible, source: "calendar" });
  } catch (error) {
    if (error instanceof WildberriesApiError) {
      return wbRouteError(error, apiKey, error.status >= 400 ? error.status : 502);
    }
    throw error;
  }
}

/** После изменения в кабинете серверный снимок устарел: помечаем источники, воркер перечитает их в ближайшую минуту. */
export const POST = withSyncInvalidation(handlePost, ["base"]);
