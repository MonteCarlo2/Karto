import { diffSellerEvents, type ProductReading, type StoreReading } from "@/lib/seller-hub/event-engine/compare";
import { parseStoreSignals } from "@/lib/seller-hub/event-engine/store-events";
import type { SellerEventsState } from "@/lib/seller-hub/event-engine/types";
import type { SellerHubMarketplaceId } from "@/lib/seller-hub/types";

const MAX_PRODUCTS = 20_000;
const INT_LIMIT = 2_000_000_000;

export type EventReconcileInput = {
  marketplaceId: SellerHubMarketplaceId;
  products: ProductReading[];
  store: StoreReading;
};

function clip(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function intOrNull(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded > INT_LIMIT) return INT_LIMIT;
  if (rounded < -INT_LIMIT) return -INT_LIMIT;
  return rounded;
}

function isMarketplace(value: unknown): value is SellerHubMarketplaceId {
  return value === "wildberries" || value === "ozon" || value === "yandex";
}

/** Тело запроса без user id: магазин берётся из сессии на сервере. */
export function parseEventReconcileInput(body: unknown): EventReconcileInput | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  if (!isMarketplace(raw.marketplaceId)) return null;
  if (!Array.isArray(raw.products) || raw.products.length > MAX_PRODUCTS) return null;
  if (!raw.store || typeof raw.store !== "object") return null;
  const storeRaw = raw.store as Record<string, unknown>;
  const syncAt = clip(storeRaw.syncAt, 80);
  if (!syncAt) return null;

  const byNm = new Map<string, ProductReading>();
  for (const item of raw.products) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const nmId = clip(row.nmId, 32);
    if (!nmId) return null;
    byNm.set(nmId, {
      nmId,
      itemId: clip(row.itemId, 80),
      title: clip(row.title, 300) || nmId,
      vendorCode: clip(row.vendorCode, 80),
      price: intOrNull(row.price),
      discount: intOrNull(row.discount),
      promoPrice: intOrNull(row.promoPrice),
      stock: intOrNull(row.stock),
      salesQty: intOrNull(row.salesQty),
      priorSalesQty: intOrNull(row.priorSalesQty),
      contentScore: intOrNull(row.contentScore),
      photoCount: intOrNull(row.photoCount),
      coverDays: intOrNull(row.coverDays),
      descriptionHash: typeof row.descriptionHash === "string" ? clip(row.descriptionHash, 20) || null : null,
      descriptionLength: intOrNull(row.descriptionLength),
      characteristicsCount: intOrNull(row.characteristicsCount),
      hasVideo: typeof row.hasVideo === "boolean" ? row.hasVideo : null,
    });
  }

  return {
    marketplaceId: raw.marketplaceId,
    products: [...byNm.values()],
    store: {
      syncAt,
      unansweredFeedbacks: intOrNull(storeRaw.unansweredFeedbacks),
      unansweredQuestions: intOrNull(storeRaw.unansweredQuestions),
      signals: parseStoreSignals(storeRaw.signals),
    },
  };
}

/** Первый серверный снимок только запоминает значения. Событий изменения из него нет. */
export function reconcileAgainstPrevious(input: {
  now: string;
  previous: SellerEventsState;
  products: ProductReading[];
  store: StoreReading;
}): SellerEventsState {
  const next = diffSellerEvents(input);
  if (!input.previous.store.captured) {
    return { ...next, events: [] };
  }
  return next;
}
