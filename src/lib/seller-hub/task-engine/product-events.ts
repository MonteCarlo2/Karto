import { RETIRED_EVENT_KINDS, type SellerProductEvent } from "@/lib/seller-hub/event-engine/types";

/**
 * Что менялось по товару: последние события по нему (цена, скидка, остаток, правки карточки, акции, отзывы).
 * Показывается в карточке задачи, чтобы было видно, что происходило до проблемы. Состояния («мало запаса») и шум не включаются.
 */
export function recentProductEvents(events: SellerProductEvent[], nmId: string | null, limit = 6): SellerProductEvent[] {
  if (!nmId) return [];
  return events
    .filter((e) => e.nmId === nmId && !RETIRED_EVENT_KINDS.has(e.kind))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
