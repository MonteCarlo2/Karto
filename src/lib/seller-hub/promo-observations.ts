import type { SellerCatalogItem } from "./types";

/**
 * WB не отдаёт порог входа в автоакцию ни одним публичным методом: календарный
 * `nomenclatures` отвечает 422, а поддержка WB подтверждает, что методов для автоакций
 * нет. Единственный источник правды — сам факт участия товара: пока товар в акции, его
 * цена со скидкой заведомо проходит порог именно этого товара. Поэтому при каждой
 * синхронизации каталога мы запоминаем эту цену по паре (акция, товар) и позже
 * возвращаем товар в акцию по ней — точно и без ручного ввода.
 */
const OBSERVED_STORAGE_PREFIX = "karto-wb-promo-observed";

export type PromoObservation = {
  /** Цена со скидкой, при которой товар наблюдался участвующим в акции. */
  price: number;
  /** Скидка в этот момент, %. */
  discount: number;
  /** Базовая цена в этот момент — порог зависит от неё. */
  basePrice?: number;
  observedAt: string;
};

function observationKey(promotionId: number, nmId: number): string {
  return `${OBSERVED_STORAGE_PREFIX}:${promotionId}:${nmId}`;
}

export function readPromoObservation(
  promotionId: number,
  nmId: number
): PromoObservation | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(observationKey(promotionId, nmId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as PromoObservation;
    if (!parsed || typeof parsed.price !== "number" || parsed.price <= 0) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function writePromoObservation(
  promotionId: number,
  nmId: number,
  observation: PromoObservation
): void {
  try {
    localStorage.setItem(observationKey(promotionId, nmId), JSON.stringify(observation));
  } catch {
    /* ignore quota */
  }
}

/** Подтверждённый вход товара в акцию: скидка, которую WB принял в акцию. */
export function recordVerifiedPromoEntry(
  promotionId: number,
  nmId: number,
  discount: number,
  basePrice?: number
): void {
  if (typeof window === "undefined" || discount <= 0) return;
  const price = basePrice != null && basePrice > 0 ? basePrice * (1 - discount / 100) : 0;
  writePromoObservation(promotionId, nmId, {
    price: price > 0 ? Math.round(price) : 0,
    discount: Math.round(discount),
    basePrice,
    observedAt: new Date().toISOString(),
  });
}

/** Сбросить ложное наблюдение (например после ошибочного «успеха» на 4%). */
export function clearPromoObservation(promotionId: number, nmId: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(observationKey(promotionId, nmId));
  } catch {
    /* ignore */
  }
}

/**
 * Запоминает цены участия по товарам, которые сейчас состоят в акциях.
 *
 * `trustedPromotionIds` — акции, где участие товара известно точно (обычные акции).
 * Для автоакций участие в каталоге проставляется догадкой, поэтому такие пары сюда
 * не попадают: иначе в историю попал бы неверный порог и скидка снова была бы не та.
 */
export function recordPromoObservations(
  items: SellerCatalogItem[],
  trustedPromotionIds: Set<string>
): void {
  if (typeof window === "undefined" || trustedPromotionIds.size === 0) return;

  for (const item of items) {
    const nmId = Number(item.externalId);
    const promotionIds = (item.promotionIds ?? []).filter((id) => trustedPromotionIds.has(id));
    if (!Number.isFinite(nmId) || nmId <= 0 || promotionIds.length === 0) continue;

    const price = item.discountedPrice;
    const discount = item.discountPercent;
    if (price == null || price <= 0 || discount == null || discount <= 0) continue;

    for (const rawPromoId of promotionIds) {
      const promotionId = Number(rawPromoId);
      if (!Number.isFinite(promotionId) || promotionId <= 0) continue;

      const previous = readPromoObservation(promotionId, nmId);
      // Держим самую высокую из подтверждённых цен участия: она ближе всего к порогу
      // сверху, а значит даёт минимальную достаточную скидку.
      if (previous != null && previous.price >= price) continue;

      writePromoObservation(promotionId, nmId, {
        price,
        discount,
        basePrice: item.price ?? undefined,
        observedAt: new Date().toISOString(),
      });
    }
  }
}
