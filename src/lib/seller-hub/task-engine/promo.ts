import { classifyPromoSku, readOrderPace, type PromoCohort } from "@/lib/seller-hub/promo-cohort";
import { saleMargin } from "@/lib/seller-hub/product-signal";
import type { SellerCatalogItem, SellerCatalogSnapshot, SellerPromotionRow } from "@/lib/seller-hub/types";
import type { PromoOfferFact, TaskDraft, TaskFact } from "./types";

/** Через сколько дней после начала акции предлагать вступить: дальше окно разумного решения закрывается. */
const OFFER_HORIZON_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function rub(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function dateRu(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  // Дата как в календаре WB: по Москве.
  return new Date(t).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
}

/**
 * Условия акций WB для одного товара. Цифры считаются теми же функциями, что на странице «Акции»
 * (saleMargin и classifyPromoSku), чтобы в задаче и на странице были одни и те же числа.
 */
export function promoOffersForItem(snapshot: SellerCatalogSnapshot, item: SellerCatalogItem): PromoOfferFact[] {
  const promotions = snapshot.promotions ?? [];
  if (promotions.length === 0) return [];
  const terms = snapshot.promotionEntryTerms ?? {};
  const realization = snapshot.realization ?? null;
  const realizationReady = Boolean(realization && !realization.error);
  const nm = item.externalId?.trim();
  if (!nm) return [];
  const current = item.discountedPrice ?? item.price ?? null;
  const marginNow = saleMargin({ realization, externalId: nm, cost: item.costPrice, sale: current });
  const pace = readOrderPace(nm, snapshot.funnel);
  const offers: PromoOfferFact[] = [];
  for (const promo of promotions) {
    const term = terms[promo.id]?.[nm] ?? terms[promo.id]?.[String(Number(nm))];
    const planPrice = term?.planPrice != null && term.planPrice > 0 ? term.planPrice : null;
    const isMember =
      (promo.participantNmIds ?? []).some((id) => String(id) === nm) || (item.promotionIds ?? []).includes(promo.id);
    // Участие известно, только если WB его назвал (inAction) или товар найден среди участников. Иначе не знаем.
    const inPromo: boolean | null = term?.inAction === true || isMember ? true : term?.inAction === false ? false : null;
    if (planPrice == null && inPromo !== true) continue;
    const marginPromo = saleMargin({ realization, externalId: nm, cost: item.costPrice, sale: planPrice });
    const advice = classifyPromoSku({
      currentPrice: current,
      planPrice,
      costPrice: item.costPrice,
      realizationReady,
      marginNow: marginNow ? { rub: marginNow.rub, percent: marginNow.percent } : null,
      marginPromo: marginPromo ? { rub: marginPromo.rub, percent: marginPromo.percent } : null,
      pace,
      peerMedian: null,
    });
    offers.push(offerOf(promo, planPrice, inPromo, advice.cohort, marginPromo, marginNow));
  }
  return offers;
}

function offerOf(
  promo: SellerPromotionRow,
  planPrice: number | null,
  inPromo: boolean | null,
  cohort: PromoCohort,
  marginPromo: { rub: number; percent: number } | null,
  marginNow: { rub: number; percent: number } | null,
): PromoOfferFact {
  return {
    promoId: promo.id,
    promoName: promo.name,
    promoType: promo.type ?? null,
    startAt: promo.startAt ?? null,
    endAt: promo.endAt ?? null,
    canManage: promo.canManageProducts === true,
    planPrice,
    inPromo,
    cohort,
    marginPromoRub: marginPromo ? Math.round(marginPromo.rub) : null,
    marginPromoPercent: marginPromo ? marginPromo.percent : null,
    marginNowRub: marginNow ? Math.round(marginNow.rub) : null,
  };
}

function ended(offer: PromoOfferFact, nowMs: number): boolean {
  const end = offer.endAt ? Date.parse(offer.endAt) : NaN;
  return Number.isFinite(end) && end <= nowMs;
}

function startsInDays(offer: PromoOfferFact, nowMs: number): number | null {
  const start = offer.startAt ? Date.parse(offer.startAt) : NaN;
  if (!Number.isFinite(start)) return null;
  return (start - nowMs) / DAY_MS;
}

/**
 * Товар в акции (или будет в ней), а цена акции после списаний WB даёт убыток.
 * Условие: WB прислал цену входа, указана себестоимость, отчёт реализации прочитан.
 */
export function rulePromoLoss(fact: TaskFact, now: string): TaskDraft | null {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) return null;
  const hits = (fact.promoOffers ?? [])
    .filter((o) => o.inPromo === true && o.cohort === "loss" && o.planPrice != null && o.marginPromoRub != null && !ended(o, nowMs))
    .sort((a, b) => (a.marginPromoRub ?? 0) - (b.marginPromoRub ?? 0));
  const worst = hits[0];
  if (!worst || worst.planPrice == null || worst.marginPromoRub == null) return null;
  const running = (startsInDays(worst, nowMs) ?? 1) <= 0;
  const names = hits.map((o) => `«${o.promoName}»`).join(", ");
  const manageable = worst.canManage;
  const when = running ? "акция идёт" : `акция начнётся ${dateRu(worst.startAt)}`;
  return {
    type: "TASK_PROMO_LOSS",
    category: "economics",
    nmId: fact.nmId,
    itemId: fact.itemId,
    productTitle: fact.title,
    vendorCode: fact.vendorCode,
    baseSeverity: running ? "critical" : "important",
    severityFloor: "important",
    severityCeiling: "critical",
    title: running ? "Акция продаёт товар в минус" : "Цена акции уведёт товар в минус",
    description: `Товар участвует в ${names}. Цена акции ${rub(worst.planPrice)}: после списаний WB на каждой продаже минус ${rub(Math.abs(worst.marginPromoRub))} (${when}).`,
    reason: "Цена входа в акцию от WB ниже точки, где продажа окупает себестоимость и списания WB.",
    evidence: {
      promo_name: worst.promoName,
      promo_start: worst.startAt,
      promo_end: worst.endAt,
      plan_price: Math.round(worst.planPrice),
      promo_margin_rub: worst.marginPromoRub,
      promo_margin_percent: worst.marginPromoPercent,
      promo_count: hits.length,
      promo_running: running,
      can_manage: manageable,
    },
    recommendation: manageable
      ? `Уберите товар из акции «${worst.promoName}» на странице «Акции»: пока он там, каждая продажа по ${rub(worst.planPrice)} уходит в минус на ${rub(Math.abs(worst.marginPromoRub))}.`
      : `«${worst.promoName}» автоакция: через API товар не убрать. В кабинете WB (Цены и скидки → Акции) исключите товар из акции${running ? "" : " до её старта"}.`,
    actionType: "OPEN_PROMOTIONS",
    businessImpactType: "PROFIT_PROTECTION",
    eventKind: null,
  };
}

/**
 * Товар не в акции, которую можно подать, цена входа даёт положительную маржу, товар в наличии.
 * Рост продаж не обещается: WB не сообщает, на сколько акция его увеличит.
 */
export function rulePromoOpportunity(fact: TaskFact, now: string): TaskDraft | null {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) return null;
  if (fact.stock == null || fact.stock <= 0) return null;
  // Запас на пару дней продаж: акция всё равно съест остаток раньше, чем довезём новое.
  if (fact.coverDays != null && fact.coverDays < 7) return null;
  const hits = (fact.promoOffers ?? [])
    .filter((o) => {
      if (o.inPromo !== false || !o.canManage || o.planPrice == null) return false;
      if (o.cohort !== "boost" && o.cohort !== "hold") return false;
      if (o.marginPromoRub == null || o.marginPromoRub <= 0) return false;
      if (ended(o, nowMs)) return false;
      const days = startsInDays(o, nowMs);
      return days == null || days <= OFFER_HORIZON_DAYS;
    })
    .sort((a, b) => (b.marginPromoRub ?? 0) - (a.marginPromoRub ?? 0));
  const best = hits[0];
  if (!best || best.planPrice == null || best.marginPromoRub == null) return null;
  const names = hits.map((o) => `«${o.promoName}»`).join(", ");
  return {
    type: "TASK_PROMO_OPPORTUNITY",
    category: "sales",
    nmId: fact.nmId,
    itemId: fact.itemId,
    productTitle: fact.title,
    vendorCode: fact.vendorCode,
    baseSeverity: "opportunity",
    severityFloor: "opportunity",
    severityCeiling: "opportunity",
    title: "Товар можно добавить в акцию",
    description: `Товара нет в ${names}. По цене входа ${rub(best.planPrice)} после списаний WB остаётся ${rub(best.marginPromoRub)} на штуке (${(best.marginPromoPercent ?? 0).toLocaleString("ru-RU")}%).`,
    reason: "Цена входа в акцию выше точки окупаемости, на складе есть остаток.",
    evidence: {
      promo_name: best.promoName,
      promo_start: best.startAt,
      promo_end: best.endAt,
      plan_price: Math.round(best.planPrice),
      promo_margin_rub: best.marginPromoRub,
      promo_margin_percent: best.marginPromoPercent,
      promo_count: hits.length,
      stock: fact.stock,
    },
    recommendation: `Если хотите участвовать, добавьте товар в «${best.promoName}» на странице «Акции». Прирост заказов WB не гарантирует: смотрите на маржу ${rub(best.marginPromoRub)} на штуке и остаток ${fact.stock.toLocaleString("ru-RU")} шт.`,
    actionType: "OPEN_PROMOTIONS",
    businessImpactType: "SALES_GROWTH",
    eventKind: null,
  };
}
