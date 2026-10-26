import { contentScore, stockCoverDays } from "@/lib/seller-hub/product-signal";
import type { SellerCatalogItem, SellerCatalogSnapshot, SellerHubMarketplaceId } from "@/lib/seller-hub/types";
import { signalsFromSnapshot } from "./store-events";
import { diffSellerEvents, emptyEventsState, hashText, type ProductReading, type StoreReading } from "./compare";
import type { SellerEventsState, SellerProductEvent } from "./types";

const PREFIX = "karto-seller-hub-events-v1:";

function storageKey(userId: string, marketplaceId: SellerHubMarketplaceId): string {
  return `${PREFIX}${userId}:${marketplaceId}`;
}

function readState(userId: string, marketplaceId: SellerHubMarketplaceId): SellerEventsState {
  if (typeof window === "undefined" || !userId) return emptyEventsState();
  const raw = localStorage.getItem(storageKey(userId, marketplaceId));
  if (!raw) return emptyEventsState();
  const parsed = JSON.parse(raw) as SellerEventsState;
  if (parsed?.version !== 1 || !parsed.products || !parsed.store || !Array.isArray(parsed.events)) {
    return emptyEventsState();
  }
  return parsed;
}

function writeState(userId: string, marketplaceId: SellerHubMarketplaceId, state: SellerEventsState) {
  localStorage.setItem(storageKey(userId, marketplaceId), JSON.stringify(state));
}

function money(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value);
}

function photoCount(item: SellerCatalogItem): number {
  if (item.imageUrls && item.imageUrls.length > 0) return item.imageUrls.length;
  return item.imageUrl ? 1 : 0;
}

function readingOf(item: SellerCatalogItem, snapshot: SellerCatalogSnapshot): ProductReading | null {
  const nmId = item.externalId?.trim();
  if (!nmId) return null;
  const realization = snapshot.realization && !snapshot.realization.error ? snapshot.realization.byNm[nmId] : undefined;
  const score = contentScore({
    photos: photoCount(item),
    hasVideo: Boolean(item.videoUrl),
    description: item.description ?? null,
    characteristicNames: item.characteristicNames ?? null,
    categoryCharcNames: item.categoryCharcNames ?? null,
    categoryCharcRequiredNames: item.categoryCharcRequiredNames ?? null,
    dimensions: item.dimensions ?? null,
  }).score;
  return {
    nmId,
    itemId: item.id,
    title: item.title || item.vendorCode || nmId,
    vendorCode: item.vendorCode,
    price: money(item.price),
    discount: item.discountPercent == null ? null : Math.round(item.discountPercent),
    promoPrice: money(item.discountedPrice),
    stock: item.totalStock == null ? null : Math.round(item.totalStock),
    salesQty: realization?.qty ?? null,
    priorSalesQty: realization?.priorQty ?? null,
    contentScore: Number.isFinite(score) ? Math.round(score) : null,
    photoCount: photoCount(item),
    coverDays: stockCoverDays(item.totalStock ?? null, realization),
    descriptionHash: item.description == null ? null : hashText(item.description.trim()),
    descriptionLength: item.description == null ? null : item.description.trim().length,
    characteristicsCount: item.characteristicNames ? item.characteristicNames.length : null,
    hasVideo: item.videoUrl === undefined ? null : Boolean(item.videoUrl),
  };
}

/** Те же показания, что локальное сравнение. Сервер принимает их, а не весь каталог. */
export function eventReadingsFromSnapshot(snapshot: SellerCatalogSnapshot): {
  products: ProductReading[];
  store: StoreReading;
} {
  return {
    products: snapshot.items
      .map((item) => readingOf(item, snapshot))
      .filter((row): row is ProductReading => row != null),
    store: {
      syncAt: snapshot.syncedAt,
      unansweredFeedbacks: snapshot.comms?.unansweredFeedbacks ?? null,
      unansweredQuestions: snapshot.comms?.unansweredQuestions ?? null,
      signals: signalsFromSnapshot(snapshot),
    },
  };
}

/** Запасной путь, пока таблицы истории нет. Источник истины — сервер. */
export function reconcileSellerHubEvents(
  userId: string,
  snapshot: SellerCatalogSnapshot,
): SellerProductEvent[] {
  const readings = eventReadingsFromSnapshot(snapshot);
  const next = diffSellerEvents({
    now: new Date().toISOString(),
    previous: readState(userId, snapshot.marketplaceId),
    products: readings.products,
    store: readings.store,
  });
  writeState(userId, snapshot.marketplaceId, next);
  return next.events;
}

export function readSellerHubEvents(
  userId: string,
  marketplaceId: SellerHubMarketplaceId,
): SellerProductEvent[] {
  return readState(userId, marketplaceId).events;
}
