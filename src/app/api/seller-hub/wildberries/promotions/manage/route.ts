import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubWbToken, wbRouteError } from "@/lib/seller-hub/wb-token-http";
import { WildberriesApiError } from "@/lib/services/wildberries/client";
import {
  addToAutoPromotion,
  addToPromotion,
  removeFromPromotion,
} from "@/lib/services/wildberries/promotions-write-client";

import { withSyncInvalidation } from "@/lib/seller-hub/sync/invalidate";
// Автоакция: только возврат из кэша (холодный подбор отключён — нет оракула WB).
export const maxDuration = 60;

async function handlePost(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  let body: {
    promotionId?: number;
    nmIds?: number[];
    action?: string;
    isAuto?: boolean;
    discountByNmId?: Record<string, number>;
    promoTermsByNmId?: Record<
      string,
      { planPrice?: number; planDiscount?: number; qualifiedPrice?: number }
    >;
    catalogByNmId?: Record<
      string,
      { basePrice?: number; discountedPrice?: number; discountPercent?: number }
    >;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }

  const apiKey = access.token;

  const promotionId = Number(body.promotionId);
  if (!Number.isFinite(promotionId) || promotionId <= 0) {
    return NextResponse.json({ ok: false, error: "Укажите promotionId" }, { status: 400 });
  }

  const nmIds = (body.nmIds ?? [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (nmIds.length === 0) {
    return NextResponse.json({ ok: false, error: "Укажите список nmIds" }, { status: 400 });
  }

  if (body.action !== "add" && body.action !== "remove") {
    return NextResponse.json(
      { ok: false, error: "action должен быть add или remove" },
      { status: 400 }
    );
  }

  const discountByNmId: Record<number, number> = {};
  if (body.discountByNmId && typeof body.discountByNmId === "object") {
    for (const [rawId, rawDiscount] of Object.entries(body.discountByNmId)) {
      const nmId = Number(rawId);
      const discount = Number(rawDiscount);
      if (Number.isFinite(nmId) && nmId > 0 && Number.isFinite(discount) && discount > 0) {
        discountByNmId[nmId] = Math.round(discount);
      }
    }
  }

  const promoTermsByNmId: Record<
    number,
    { planPrice?: number; planDiscount?: number; qualifiedPrice?: number }
  > = {};
  if (body.promoTermsByNmId && typeof body.promoTermsByNmId === "object") {
    for (const [rawId, rawTerms] of Object.entries(body.promoTermsByNmId)) {
      const nmId = Number(rawId);
      if (!Number.isFinite(nmId) || nmId <= 0 || !rawTerms || typeof rawTerms !== "object") {
        continue;
      }
      const planPrice = Number(rawTerms.planPrice);
      const planDiscount = Number(rawTerms.planDiscount);
      const qualifiedPrice = Number(rawTerms.qualifiedPrice);
      promoTermsByNmId[nmId] = {
        planPrice: Number.isFinite(planPrice) && planPrice > 0 ? planPrice : undefined,
        planDiscount:
          Number.isFinite(planDiscount) && planDiscount > 0
            ? Math.round(planDiscount)
            : undefined,
        qualifiedPrice:
          Number.isFinite(qualifiedPrice) && qualifiedPrice > 0 ? qualifiedPrice : undefined,
      };
    }
  }

  const catalogByNmId: Record<
    number,
    { basePrice?: number; discountedPrice?: number; discountPercent?: number }
  > = {};
  if (body.catalogByNmId && typeof body.catalogByNmId === "object") {
    for (const [rawId, rawCatalog] of Object.entries(body.catalogByNmId)) {
      const nmId = Number(rawId);
      if (!Number.isFinite(nmId) || nmId <= 0 || !rawCatalog || typeof rawCatalog !== "object") {
        continue;
      }
      const basePrice = Number(rawCatalog.basePrice);
      const discountedPrice = Number(rawCatalog.discountedPrice);
      const discountPercent = Number(rawCatalog.discountPercent);
      catalogByNmId[nmId] = {
        basePrice: Number.isFinite(basePrice) && basePrice > 0 ? basePrice : undefined,
        discountedPrice:
          Number.isFinite(discountedPrice) && discountedPrice > 0 ? discountedPrice : undefined,
        discountPercent:
          Number.isFinite(discountPercent) && discountPercent > 0
            ? Math.round(discountPercent)
            : undefined,
      };
    }
  }

  try {
    const result =
      body.action === "remove"
        ? await removeFromPromotion(apiKey, nmIds, promotionId)
        : body.isAuto
          ? await addToAutoPromotion(apiKey, promotionId, nmIds, {
              promoTermsByNmId,
              discountByNmId,
              catalogByNmId,
            })
          : await addToPromotion(apiKey, promotionId, nmIds, {
              promoTermsByNmId,
              catalogByNmId,
            });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof WildberriesApiError) {
      return wbRouteError(e, apiKey, e.status >= 400 ? e.status : 502);
    }
    throw e;
  }
}

/** После изменения в кабинете серверный снимок устарел: помечаем источники, воркер перечитает их в ближайшую минуту. */
export const POST = withSyncInvalidation(handlePost, ["base"]);
