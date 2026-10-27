import type { AcceptanceRow } from "@/lib/seller-hub/acceptance-slots";
import type { HistoryPoint } from "@/lib/seller-hub/metric-history";
import type { VisionResult } from "@/lib/seller-hub/card-vision-score";
import type { TextResult } from "@/lib/seller-hub/card-text-score";
import type { QueryRelevance } from "@/lib/seller-hub/ads-query-relevance";
import type { AgentAction, AgentRule, AgentRuleKind } from "@/lib/seller-hub/ads-agent-engine";

/** Предложение агента, насчитанное сервером (строка очереди из базы). */
export type ServerAgentProposal = {
  id: string;
  key: string;
  rule: AgentRuleKind | "playbook";
  title: string;
  facts: string[];
  effect: string;
  risk: "low" | "medium" | "high";
  action: AgentAction;
  meta?: Record<string, unknown>;
  status: "open" | "done" | "dismissed" | "expired" | "failed";
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
};
import type { CampaignFacts, CampaignReview } from "@/lib/seller-hub/ads-review";
import type { ProductAdvice, ProductFacts } from "@/lib/seller-hub/product-advice";
import { autoRepliesAuthorizedFetch } from "@/lib/auto-replies/auto-replies-fetch";
import type { SellerFeedbacksSnapshot } from "@/lib/seller-hub/feedbacks/types";
import type {
  SellerSearchTexts,
  SellerBlockedCards,
  SellerRegionOrders,
  SellerWarehouseStocks,
  SellerAdBidRecommendation,
  SellerAdClusters,
  SellerAdsStats,
  SellerCatalogSnapshot,
  SellerFunnelSnapshot,
  SellerPaidStorageSnapshot,
  SellerStocksReportSnapshot,
  SellerHubMarketplaceId,
  SellerHubScopeState,
  SellerRealizationSnapshot,
  SellerWarehouse,
} from "./types";

export type SellerHubWbConnectionAction = "connect" | "migrate" | "replace" | "disconnect";

export async function manageSellerHubWbConnection(input: {
  action: SellerHubWbConnectionAction;
  apiKey?: string;
}): Promise<{
  ok: boolean;
  alreadyStored?: boolean;
  serverVerified?: boolean;
  keepLocal?: boolean;
  sellerName?: string | null;
  verifiedAt?: string;
  sampleCount?: number;
  totalCards?: number | null;
  scopes?: SellerHubScopeState;
  error?: string;
}> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/connection", {
    method: "POST",
    body: JSON.stringify({
      action: input.action,
      ...(input.apiKey ? { apiKey: input.apiKey } : {}),
    }),
    timeoutMs: 45_000,
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    alreadyStored?: boolean;
    serverVerified?: boolean;
    keepLocal?: boolean;
    sellerName?: string | null;
    verifiedAt?: string;
    sampleCount?: number;
    totalCards?: number | null;
    scopes?: SellerHubScopeState;
    error?: string;
  };
  if (!res.ok || !data.ok) {
    return {
      ok: false,
      keepLocal: data.keepLocal !== false,
      alreadyStored: data.alreadyStored === true,
      error: data.error ?? `Ошибка ${res.status}`,
    };
  }
  return {
    ok: true,
    alreadyStored: data.alreadyStored === true,
    serverVerified: data.serverVerified === true,
    keepLocal: false,
    sellerName: data.sellerName,
    verifiedAt: data.verifiedAt,
    sampleCount: data.sampleCount,
    totalCards: data.totalCards,
    scopes: data.scopes,
  };
}

export async function loadSellerHubWbConnectionStatus(): Promise<{
  ok: boolean;
  connected?: boolean;
  error?: string;
}> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/connection", {
    method: "GET",
    timeoutMs: 20_000,
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    connected?: boolean;
    error?: string;
  };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  }
  return { ok: true, connected: data.connected === true };
}

export async function verifySellerHubConnection(input: {
  marketplaceId: SellerHubMarketplaceId;
  apiKey?: string;
  clientId?: string;
  campaignId?: string;
  businessId?: string;
  /** Для WB: connect | replace | recheck. По умолчанию recheck серверного секрета. */
  wbMode?: "connect" | "replace" | "recheck";
}): Promise<{
  ok: boolean;
  sellerName?: string | null;
  verifiedAt?: string;
  businessId?: string;
  campaignId?: string;
  sampleCount?: number;
  totalCards?: number | null;
  scopes?: SellerHubScopeState;
  error?: string;
}> {
  if (input.marketplaceId === "wildberries") {
    const mode = input.wbMode ?? (input.apiKey?.trim() ? "connect" : "recheck");
    if (mode === "connect" || mode === "replace") {
      if (!input.apiKey?.trim()) {
        return { ok: false, error: "Укажите API-токен Wildberries" };
      }
      return manageSellerHubWbConnection({ action: mode, apiKey: input.apiKey });
    }
    const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/verify", {
      method: "POST",
      body: JSON.stringify({}),
      timeoutMs: 45_000,
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      sellerName?: string | null;
      verifiedAt?: string;
      sampleCount?: number;
      totalCards?: number | null;
      scopes?: SellerHubScopeState;
    };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
    }
    return { ok: true, ...data };
  }

  const path =
    input.marketplaceId === "ozon"
      ? "/api/seller-hub/ozon/verify"
      : "/api/seller-hub/yandex/verify";

  const body =
    input.marketplaceId === "ozon"
      ? { apiKey: input.apiKey, clientId: input.clientId }
      : {
          apiKey: input.apiKey,
          campaignId: input.campaignId,
          businessId: input.businessId,
        };

  const res = await autoRepliesAuthorizedFetch(path, {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs: 45_000,
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    sellerName?: string | null;
    verifiedAt?: string;
    businessId?: string;
    campaignId?: string;
    sampleCount?: number;
    totalCards?: number | null;
    scopes?: SellerHubScopeState;
  };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  }
  return { ok: true, ...data };
}

export async function syncSellerHubCatalog(input: {
  marketplaceId: SellerHubMarketplaceId;
  apiKey?: string;
  clientId?: string;
  campaignId?: string;
  businessId?: string;
  categoryCharcCache?: SellerCatalogSnapshot["categoryCharcCache"];
}): Promise<{
  ok: boolean;
  snapshot?: SellerCatalogSnapshot;
  warning?: string;
  error?: string;
}> {
  const path =
    input.marketplaceId === "wildberries"
      ? "/api/seller-hub/wildberries/sync-catalog"
      : input.marketplaceId === "ozon"
        ? "/api/seller-hub/ozon/sync-catalog"
        : "/api/seller-hub/yandex/sync-catalog";

  const body =
    input.marketplaceId === "wildberries"
      ? { categoryCharcCache: input.categoryCharcCache }
      : input.marketplaceId === "ozon"
        ? { apiKey: input.apiKey, clientId: input.clientId }
        : {
            apiKey: input.apiKey,
            campaignId: input.campaignId,
            businessId: input.businessId,
          };

  const res = await autoRepliesAuthorizedFetch(path, {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs: 180_000,
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    snapshot?: SellerCatalogSnapshot;
    warning?: string;
  };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  }
  return { ok: true, ...data };
}

export type SellerHubPriceOutcome = "confirmed" | "processed" | "rejected" | "partial" | "unknown" | "failed";

export async function updateSellerHubPrices(params: {
  /**
   * expected — цена и скидка, которые пользователь видел на экране. Если в WB сейчас другие, сервер ничего не запишет
   * и вернёт stale с актуальными значениями. Без expected сверки нет (старое поведение).
   */
  updates: { nmId: number; price?: number; discount?: number; expected?: { price: number | null; discount: number | null } }[];
}): Promise<{
  ok: boolean;
  outcome: SellerHubPriceOutcome;
  uploadId?: number;
  verified: boolean;
  error?: string;
  message: string;
  stale?: Array<{ nmId: number; current: { price: number | null; discount: number | null } }>;
}> {
  let res: Response;
  try {
    res = await autoRepliesAuthorizedFetch(
      "/api/seller-hub/wildberries/prices/update",
      {
        method: "POST",
        body: JSON.stringify({ updates: params.updates }),
        timeoutMs: 90_000,
      }
    );
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "Не удалось отправить цену";
    return { ok: false, outcome: "failed", verified: false, error: message, message };
  }
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    outcome?: SellerHubPriceOutcome;
    uploadId?: number;
    verified?: boolean;
    error?: string;
    message?: string;
    stale?: Array<{ nmId: number; current: { price: number | null; discount: number | null } }>;
  };
  const outcome = data.outcome ?? (data.ok ? "processed" : "failed");
  const message = data.message ?? data.error ?? (res.ok ? "Результат загрузки цены неизвестен" : `Ошибка ${res.status}`);
  return {
    ok: outcome === "confirmed" || outcome === "processed",
    outcome,
    uploadId: data.uploadId,
    verified: data.verified === true,
    error: data.error ?? (outcome === "confirmed" || outcome === "processed" ? undefined : message),
    message,
    stale: Array.isArray(data.stale) && data.stale.length > 0 ? data.stale : undefined,
  };
}

export async function uploadSellerHubPhoto(params: {
  nmId: number;
  photoNumber: number;
  file: File;
}): Promise<{ ok: boolean; error?: string }> {
  const body = new FormData();
  body.set("nmId", String(params.nmId));
  body.set("photoNumber", String(params.photoNumber));
  body.set("uploadfile", params.file);
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/media/upload", {
    method: "POST",
    body,
    timeoutMs: 60_000,
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true };
}

export async function searchSellerHubCategories(params: {
  query: string;
}): Promise<{ ok: boolean; subjects?: { id: number; name: string; parent: string }[]; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/categories", {
    method: "POST",
    body: JSON.stringify({ query: params.query }),
    timeoutMs: 30_000,
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    subjects?: { id: number; name: string; parent: string }[];
    error?: string;
  };
  if (!res.ok || !data.ok) return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true, subjects: data.subjects };
}

export async function readSellerHubCard(params: {
  nmId: number;
}): Promise<{
  ok: boolean;
  card?: {
    title: string;
    description: string;
    vendorCode: string;
    brand: string;
    category: string;
    imageUrls: string[];
    videoUrl: string;
    dimensions?: { length?: number; width?: number; height?: number; weightKg?: number };
  };
  error?: string;
}> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/cards/read", {
    method: "POST",
    body: JSON.stringify({ nmId: params.nmId }),
    timeoutMs: 30_000,
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    card?: {
      title: string;
      description: string;
      vendorCode: string;
      brand: string;
      category: string;
      imageUrls: string[];
      videoUrl: string;
      dimensions?: { length?: number; width?: number; height?: number; weightKg?: number };
    };
    error?: string;
  };
  if (!res.ok || !data.ok || !data.card) return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true, card: data.card };
}

export async function readSellerHubCardSellability(params: {
  title: string;
  description: string;
  brand?: string;
  category?: string;
  photos: number;
  hasVideo: boolean;
  dimensions: string | null;
}): Promise<{ ok: boolean; text?: string; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/card-read", {
    method: "POST",
    body: JSON.stringify(params),
    timeoutMs: 60_000,
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; text?: string; error?: string };
  if (!res.ok || !data.ok || !data.text) return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true, text: data.text };
}

export async function updateSellerHubCard(params: {
  nmId: number;
  /** Не переданное поле в карточке остаётся как есть. */
  title?: string;
  description?: string;
  vendorCode?: string;
  /** Правки характеристик по идентификатору (остальные в карточке остаются как есть). */
  characteristics?: Array<{ id: number; value: string | number; numeric?: boolean }>;
  length?: number;
  width?: number;
  height?: number;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/cards/update", {
    method: "POST",
    body: JSON.stringify({
      nmId: params.nmId,
      title: params.title,
      description: params.description,
      vendorCode: params.vendorCode,
      characteristics: params.characteristics,
      length: params.length,
      width: params.width,
      height: params.height,
    }),
    timeoutMs: 60_000,
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true };
}

export async function saveSellerHubMedia(params: {
  nmId: number;
  urls: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/media/save", {
    method: "POST",
    body: JSON.stringify({ nmId: params.nmId, urls: params.urls }),
    timeoutMs: 60_000,
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true };
}

export async function manageSellerHubPromotion(params: {
  promotionId: number;
  nmIds: number[];
  action: "add" | "remove";
  isAuto?: boolean;
  discountByNmId?: Record<number, number>;
  promoTermsByNmId?: Record<
    number,
    { planPrice?: number; planDiscount?: number; qualifiedPrice?: number }
  >;
  catalogByNmId?: Record<
    number,
    { basePrice?: number; discountedPrice?: number; discountPercent?: number }
  >;
}): Promise<{
  ok: boolean;
  error?: string;
  warning?: string;
  addedCount?: number;
  verified?: boolean;
  confirmedNmIds?: number[];
  appliedDiscounts?: Record<number, number>;
  savedDiscounts?: Record<number, number>;
  savedPromoTerms?: Record<
    number,
    { planPrice?: number; planDiscount?: number; qualifiedPrice?: number }
  >;
}> {
  const res = await autoRepliesAuthorizedFetch(
    "/api/seller-hub/wildberries/promotions/manage",
    {
      method: "POST",
      // Автоакция: возврат из кэша (быстро). Обычная акция — calendar upload.
      timeoutMs: 120_000,
      body: JSON.stringify({
        promotionId: params.promotionId,
        nmIds: params.nmIds,
        action: params.action,
        isAuto: params.isAuto,
        discountByNmId: params.discountByNmId,
        promoTermsByNmId: params.promoTermsByNmId,
        catalogByNmId: params.catalogByNmId,
      }),
    }
  );
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    warning?: string;
    addedCount?: number;
    verified?: boolean;
    confirmedNmIds?: number[];
    appliedDiscounts?: Record<number, number>;
    savedDiscounts?: Record<number, number>;
    savedPromoTerms?: Record<
      number,
      { planPrice?: number; planDiscount?: number; qualifiedPrice?: number }
    >;
  };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error ?? `Ошибка ${res.status}`, verified: data.verified };
  }
  return {
    ok: true,
    warning: data.warning,
    addedCount: data.addedCount,
    verified: data.verified,
    confirmedNmIds: data.confirmedNmIds,
    appliedDiscounts: data.appliedDiscounts,
    savedDiscounts: data.savedDiscounts,
    savedPromoTerms: data.savedPromoTerms,
  };
}

export type PromoEntryTerm = { planPrice?: number; planDiscount?: number; price?: number };

/** Порог входа в акцию по конкретным товарам напрямую из WB. */
export async function fetchSellerHubPromotionTerms(params: {
  promotionId: number;
  nmIds: number[];
}): Promise<{
  ok: boolean;
  error?: string;
  terms?: Record<number, PromoEntryTerm>;
  probe?: { status: number; rowsSeen: number; matched: number; withPlanPrice: number };
}> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/promotions/terms", {
    method: "POST",
    body: JSON.stringify({ promotionId: params.promotionId, nmIds: params.nmIds }),
    timeoutMs: 60_000,
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    terms?: Record<number, PromoEntryTerm>;
    probe?: { status: number; rowsSeen: number; matched: number; withPlanPrice: number };
  };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  }
  return { ok: true, terms: data.terms, probe: data.probe };
}

export type PromoRosterRow = {
  nmId: number;
  price?: number;
  planPrice?: number;
  planDiscount?: number;
  inAction: boolean;
};

/** Товары акции из календаря WB. Для автоакции, если календарь пуст, сверка с публичной карточкой. */
export async function fetchSellerHubPromotionRoster(params: {
  promotionId: number;
  nmIds: number[];
  isAuto: boolean;
}): Promise<{
  ok: boolean;
  error?: string;
  participating: PromoRosterRow[];
  eligible: PromoRosterRow[];
}> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/promotions/roster", {
    method: "POST",
    body: JSON.stringify({
      promotionId: params.promotionId,
      nmIds: params.nmIds,
      isAuto: params.isAuto,
    }),
    timeoutMs: 60_000,
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    participating?: PromoRosterRow[];
    eligible?: PromoRosterRow[];
  };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error ?? `Ошибка ${res.status}`, participating: [], eligible: [] };
  }
  return {
    ok: true,
    participating: data.participating ?? [],
    eligible: data.eligible ?? [],
  };
}

export async function listSellerHubWarehouses(): Promise<{
  ok: boolean;
  warehouses?: SellerWarehouse[];
  error?: string;
}> {
  const res = await autoRepliesAuthorizedFetch(
    "/api/seller-hub/wildberries/stocks/update",
    {
      method: "POST",
      body: JSON.stringify({ action: "list_warehouses", updates: [] }),
      timeoutMs: 30_000,
    }
  );
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    warehouses?: SellerWarehouse[];
    error?: string;
  };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  }
  return { ok: true, warehouses: data.warehouses };
}

export async function updateSellerHubStocks(params: {
  warehouseId?: number;
  updates: { nmId?: number; sku?: string; chrtId?: number; amount: number }[];
}): Promise<{
  ok: boolean;
  warehouses?: SellerWarehouse[];
  errors?: string[];
  error?: string;
  verified?: boolean;
}> {
  const res = await autoRepliesAuthorizedFetch(
    "/api/seller-hub/wildberries/stocks/update",
    {
      method: "POST",
      body: JSON.stringify({
        warehouseId: params.warehouseId,
        updates: params.updates,
      }),
      timeoutMs: 30_000,
    }
  );
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    warehouses?: SellerWarehouse[];
    errors?: string[];
    error?: string;
  };
  if (!res.ok || !data.ok) {
    const message =
      data.error ??
      data.errors?.filter(Boolean).join("; ") ??
      `Ошибка ${res.status}`;
    return { ok: false, error: message, errors: data.errors };
  }
  return {
    ok: true,
    warehouses: data.warehouses,
    errors: data.errors,
    verified: (data as { verified?: boolean }).verified,
  };
}

export type SellerHubSupplyBarcode = {
  barcode?: string;
  fileBase64?: string;
};

export type SellerHubOrderSticker = {
  orderId: number;
  partA?: string;
  partB?: string;
  barcode?: string;
  fileBase64?: string;
};

export async function manageSellerHubSupply(params: {
  action: "create" | "add_orders" | "close" | "barcode" | "stickers" | "cancel";
  supplyName?: string;
  supplyId?: string;
  orderIds?: number[];
  orderId?: number;
  stickerType?: "png" | "svg";
}): Promise<{
  ok: boolean;
  supplyId?: string;
  barcode?: SellerHubSupplyBarcode;
  stickers?: SellerHubOrderSticker[];
  error?: string;
}> {
  const res = await autoRepliesAuthorizedFetch(
    "/api/seller-hub/wildberries/orders/supply",
    {
      method: "POST",
      body: JSON.stringify({
        action: params.action,
        supplyName: params.supplyName,
        supplyId: params.supplyId,
        orderIds: params.orderIds,
        orderId: params.orderId,
        stickerType: params.stickerType,
      }),
      timeoutMs: 30_000,
    }
  );
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    supplyId?: string;
    barcode?: SellerHubSupplyBarcode;
    stickers?: SellerHubOrderSticker[];
    error?: string;
  };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  }
  return {
    ok: true,
    supplyId: data.supplyId,
    barcode: data.barcode,
    stickers: data.stickers,
  };
}

export async function toggleSellerHubAd(params: {
  campaignId: number;
  action: "start" | "pause";
}): Promise<{ ok: boolean; error?: string }> {
  const res = await autoRepliesAuthorizedFetch(
    "/api/seller-hub/wildberries/ads/toggle",
    {
      method: "POST",
      body: JSON.stringify({
        campaignId: params.campaignId,
        action: params.action,
      }),
      timeoutMs: 20_000,
    }
  );
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  }
  return { ok: true };
}

export type SellerHubLoadMeta = {
  /** Когда данные получены от WB (кэш на сервере). */
  loadedAt?: string;
  fromCache?: boolean;
  /** WB сейчас не ответил, показываем последние известные данные. */
  stale?: boolean;
  staleReason?: string;
};

const wbCachedInFlight = new Map<string, Promise<unknown>>();

/**
 * Запрос к серверному маршруту, который сам кэширует ответ WB в Supabase (таблица seller_hub_data_cache).
 * Одинаковые параллельные запросы делят одно обращение (React в разработке вызывает эффекты дважды).
 * refresh: true просит обновить данные у WB; сервер не пустит чаще раза в минуту.
 */
async function postWbCached<T>(
  path: string,
  body: Record<string, unknown>,
  pick: string,
  timeoutMs: number,
): Promise<{ ok: boolean; value?: T; error?: string } & SellerHubLoadMeta> {
  const key = `${path}|${JSON.stringify(body)}`;
  const flying = wbCachedInFlight.get(key);
  if (flying) return flying as Promise<{ ok: boolean; value?: T; error?: string } & SellerHubLoadMeta>;
  const promise = (async () => {
    const res = await autoRepliesAuthorizedFetch(path, { method: "POST", body: JSON.stringify(body), timeoutMs });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & SellerHubLoadMeta & { ok?: boolean; error?: string };
    const value = data[pick] as T | undefined;
    if (!res.ok || !data.ok || value == null) return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
    return {
      ok: true,
      value,
      loadedAt: data.loadedAt,
      fromCache: data.fromCache,
      stale: data.stale,
      staleReason: data.staleReason,
    };
  })();
  wbCachedInFlight.set(key, promise);
  void promise.finally(() => wbCachedInFlight.delete(key));
  return promise;
}

type LoadResult<K extends string, T> = { ok: boolean; error?: string } & { [P in K]?: T } & SellerHubLoadMeta;

function shape<K extends string, T>(
  key: K,
  result: { ok: boolean; value?: T; error?: string } & SellerHubLoadMeta,
): LoadResult<K, T> {
  const { value, ...rest } = result;
  return { ...rest, [key]: value } as LoadResult<K, T>;
}

/** Статистика рекламных кампаний за период (только чтение; серверный кэш 10 минут). */
export async function loadSellerHubAdsStats(params: {
  campaignIds: number[];
  dateFrom: string;
  dateTo: string;
  refresh?: boolean;
}): Promise<LoadResult<"stats", SellerAdsStats>> {
  return shape("stats", await postWbCached<SellerAdsStats>("/api/seller-hub/wildberries/ads/stats", params, "stats", 60_000));
}

/** Статистика поисковых запросов рекламы (только чтение; серверный кэш 30 минут). */
export async function loadSellerHubAdClusters(params: {
  pairs: Array<{ advertId: number; nmId: number }>;
  dateFrom: string;
  dateTo: string;
  refresh?: boolean;
}): Promise<LoadResult<"clusters", SellerAdClusters>> {
  return shape("clusters", await postWbCached<SellerAdClusters>("/api/seller-hub/wildberries/ads/clusters", params, "clusters", 60_000));
}

/** Рекомендованные WB ставки (только чтение; серверный кэш 30 минут). */
export async function loadSellerHubAdBidRecommendations(params: {
  pairs: Array<{ advertId: number; nmId: number }>;
  refresh?: boolean;
}): Promise<LoadResult<"recommendations", SellerAdBidRecommendation[]>> {
  return shape(
    "recommendations",
    await postWbCached<SellerAdBidRecommendation[]>("/api/seller-hub/wildberries/ads/bids", params, "recommendations", 120_000),
  );
}

/** Остатки артикулов по складам WB (только чтение; серверный кэш 30 минут: WB обновляет данные раз в 30 минут). */
export async function loadSellerHubWarehouseStocks(params: {
  nmIds: number[];
  refresh?: boolean;
}): Promise<LoadResult<"stocks", SellerWarehouseStocks>> {
  return shape("stocks", await postWbCached<SellerWarehouseStocks>("/api/seller-hub/wildberries/logistics/stocks", params, "stocks", 60_000));
}

/** Топ поисковых запросов по товару и позиции в поиске WB (только чтение; серверный кэш 2 часа). */
export async function loadSellerHubSearchTexts(params: {
  nmId: number;
  dateFrom: string;
  dateTo: string;
  pastDateFrom: string;
  pastDateTo: string;
  refresh?: boolean;
}): Promise<LoadResult<"texts", SellerSearchTexts>> {
  return shape("texts", await postWbCached<SellerSearchTexts>("/api/seller-hub/wildberries/seo/search-texts", params, "texts", 60_000));
}

export type ActionLogRow = {
  id: string;
  agent: "ads" | "prices" | "comms" | "stocks";
  action: string;
  target_id: number | null;
  nm_id: number | null;
  request: unknown;
  result: "ok" | "error" | "skipped" | "suggested";
  message: string | null;
  initiator: "user" | "agent";
  created_at: string;
};

/** Журнал действий: что менялось в кабинете и с каким результатом (только чтение). */
export async function loadSellerHubActionLog(): Promise<{ ok: boolean; entries: ActionLogRow[]; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/action-log", { method: "POST", body: "{}", timeoutMs: 20_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; entries?: ActionLogRow[]; error?: string };
  if (!res.ok || !data.ok) return { ok: false, entries: [], error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true, entries: data.entries ?? [] };
}
/** Добавить товар в рекламную кампанию. Запись в WB: только после подтверждения человеком. */
export async function addSellerHubAdNm(params: { advertId: number; nmId: number }): Promise<{ ok: boolean; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/ads/nm", { method: "POST", body: JSON.stringify({ action: "add", advertId: params.advertId, nmId: params.nmId, confirmNmId: params.nmId }), timeoutMs: 30_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  return res.ok && data.ok ? { ok: true } : { ok: false, error: data.error ?? `Ошибка ${res.status}` };
}
/** Изменить зоны показов кампании. Запись в WB: только после подтверждения человеком. */
/** Дневной лимит расхода кампании (CPC). */
export async function setSellerHubAdDailyLimit(params: { advertId: number; enabled: boolean; dailyLimit: number; carryOver: boolean }): Promise<{ ok: boolean; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/ads/daily-limit", { method: "POST", body: JSON.stringify({ ...params, confirm: `${params.advertId}:${params.enabled}:${params.dailyLimit}` }), timeoutMs: 30_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  return res.ok && data.ok ? { ok: true } : { ok: false, error: data.error ?? `Ошибка ${res.status}` };
}
export async function setSellerHubAdPlacements(params: { advertId: number; search: boolean; recommendations: boolean }): Promise<{ ok: boolean; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/ads/placements", { method: "POST", body: JSON.stringify({ ...params, confirm: `${params.search}:${params.recommendations}` }), timeoutMs: 30_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  return res.ok && data.ok ? { ok: true } : { ok: false, error: data.error ?? `Ошибка ${res.status}` };
}
/** Текущие ставки поисковых кластеров (только чтение). Ключ clusterBidKey → ставка, ₽. */
export async function loadSellerHubClusterBids(pairs: Array<{ advertId: number; nmId: number }>): Promise<{ ok: boolean; bids: Record<string, number>; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/ads/cluster-bid", { method: "POST", body: JSON.stringify({ action: "read", pairs }), timeoutMs: 30_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; bids?: Record<string, number>; error?: string };
  if (!res.ok || !data.ok) return { ok: false, bids: {}, error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true, bids: data.bids ?? {} };
}

/** Поставить ставку на кластер. Запись в WB: только после подтверждения человеком. */
export async function setSellerHubClusterBid(params: { advertId: number; nmId: number; query: string; bidRub: number }): Promise<{ ok: boolean; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/ads/cluster-bid", { method: "POST", body: JSON.stringify({ action: "set", ...params, confirmRub: params.bidRub }), timeoutMs: 30_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  return res.ok && data.ok ? { ok: true } : { ok: false, error: data.error ?? `Ошибка ${res.status}` };
}

/** Сбросить ставку кластера к ставке кампании. Запись в WB: только после подтверждения человеком. */
export async function resetSellerHubClusterBid(params: { advertId: number; nmId: number; query: string }): Promise<{ ok: boolean; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/ads/cluster-bid", { method: "POST", body: JSON.stringify({ action: "reset", ...params, confirmQuery: params.query }), timeoutMs: 30_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  return res.ok && data.ok ? { ok: true } : { ok: false, error: data.error ?? `Ошибка ${res.status}` };
}
/** Разбор рекламных кампаний нейросетью. saved=true — только уже сохранённый разбор (бесплатно); иначе платный вызов по команде человека. */
export async function reviewSellerHubCampaigns(params: { facts: CampaignFacts[]; saved?: boolean }): Promise<{ ok: boolean; reviews?: CampaignReview[] | null; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/ads/review", { method: "POST", body: JSON.stringify(params), timeoutMs: 90_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; reviews?: CampaignReview[] | null; error?: string };
  if (!res.ok || !data.ok) return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true, reviews: data.reviews ?? null };
}
/** План действий по товарам нейросетью. saved=true — только уже сохранённый (бесплатно); иначе платный вызов по команде человека. */
export async function adviseSellerHubProducts(params: { facts: ProductFacts[]; saved?: boolean }): Promise<{ ok: boolean; advice?: ProductAdvice[] | null; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/product-advice", { method: "POST", body: JSON.stringify(params), timeoutMs: 90_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; advice?: ProductAdvice[] | null; error?: string };
  if (!res.ok || !data.ok) return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true, advice: data.advice ?? null };
}
/** Правила агента рекламы и «пополнено сегодня» для суточного лимита. Только чтение. */
export async function loadSellerHubAgentRules(): Promise<{ ok: boolean; rules: AgentRule[]; depositedToday: Record<string, number>; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/agent-rules", { method: "POST", body: JSON.stringify({ action: "list" }), timeoutMs: 20_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; rules?: AgentRule[]; depositedToday?: Record<string, number>; error?: string };
  if (!res.ok || !data.ok || !data.rules) return { ok: false, rules: [], depositedToday: {}, error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true, rules: data.rules, depositedToday: data.depositedToday ?? {} };
}

/** Предложения агента, которые сервер насчитал по снимку кабинета. Только чтение из нашей базы. */
export async function loadSellerHubAgentProposals(): Promise<{ ok: boolean; proposals: ServerAgentProposal[]; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/agents/proposals", { method: "GET", timeoutMs: 20_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; proposals?: ServerAgentProposal[]; error?: string };
  if (!res.ok || !data.ok || !data.proposals) return { ok: false, proposals: [], error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true, proposals: data.proposals };
}

/** Отметить решение по предложению агента (само действие в кабинете выполняют отдельные маршруты). */
export async function resolveSellerHubAgentProposal(id: string, decision: "done" | "dismissed" | "failed", note?: string): Promise<{ ok: boolean; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/agents/proposals", { method: "POST", body: JSON.stringify({ id, decision, note }), timeoutMs: 20_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  return res.ok && data.ok ? { ok: true } : { ok: false, error: data.error ?? `Ошибка ${res.status}` };
}

/** Сохранить правило агента (включено, режим, параметры). Кабинет WB не затрагивает. */
export async function saveSellerHubAgentRule(rule: AgentRule): Promise<{ ok: boolean; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/agent-rules", { method: "POST", body: JSON.stringify({ action: "save", rule }), timeoutMs: 20_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  return res.ok && data.ok ? { ok: true } : { ok: false, error: data.error ?? `Ошибка ${res.status}` };
}
/** Нейросеть решает, подходят ли запросы-кандидаты в минус-фразы товару по смыслу. Платный вызов: только по команде человека. */
export async function checkSellerHubQueryRelevance(params: {
  nmId: number;
  title: string;
  category?: string | null;
  description?: string | null;
  queries: string[];
}): Promise<{ ok: boolean; results?: QueryRelevance[]; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/ads/relevance", { method: "POST", body: JSON.stringify(params), timeoutMs: 60_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; results?: QueryRelevance[]; error?: string };
  if (!res.ok || !data.ok || !data.results) return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true, results: data.results };
}
/** Уже сохранённые оценки текста нейросетью: бесплатно, нейросеть не вызывается. */
export async function loadSavedCardText(nmIds: number[]): Promise<{ ok: boolean; saved: Record<string, TextResult>; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/card-text", { method: "POST", body: JSON.stringify({ saved: nmIds }), timeoutMs: 30_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; saved?: Record<string, TextResult>; error?: string };
  if (!res.ok || !data.ok) return { ok: false, saved: {}, error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true, saved: data.saved ?? {} };
}

/** Оценка названия и описания нейросетью. Платный вызов: только по явной команде человека. */
export async function evaluateSellerHubCardText(params: {
  nmId: number;
  title: string;
  description?: string | null;
  category?: string | null;
  brand?: string | null;
  characteristicNames?: string[] | null;
  force?: boolean;
}): Promise<{ ok: boolean; result?: TextResult; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/card-text", { method: "POST", body: JSON.stringify(params), timeoutMs: 90_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: TextResult; error?: string };
  if (!res.ok || !data.ok || !data.result) return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true, result: data.result };
}
/** Уже сохранённые оценки фото нейросетью: бесплатно, нейросеть не вызывается. */
export async function loadSavedCardVision(
  items: Array<{ nmId: number; imageUrls: string[] }>,
): Promise<{ ok: boolean; saved: Record<string, VisionResult>; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/card-vision", { method: "POST", body: JSON.stringify({ saved: items }), timeoutMs: 30_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; saved?: Record<string, VisionResult>; error?: string };
  if (!res.ok || !data.ok) return { ok: false, saved: {}, error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true, saved: data.saved ?? {} };
}

/** Оценка двух первых фото карточки нейросетью. Платный вызов: только по явной команде человека. */
export async function evaluateSellerHubCardPhotos(params: {
  nmId: number;
  imageUrls: string[];
  title: string;
  category?: string | null;
  brand?: string | null;
  /** Перепроверить даже если фото не менялись. */
  force?: boolean;
}): Promise<{ ok: boolean; result?: VisionResult; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/card-vision", { method: "POST", body: JSON.stringify(params), timeoutMs: 90_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: VisionResult; error?: string };
  if (!res.ok || !data.ok || !data.result) return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true, result: data.result };
}
/** Заблокированные WB карточки с причинами (только чтение; серверный кэш 1 час). */
export async function loadSellerHubBlockedCards(params: {
  refresh?: boolean;
} = {}): Promise<LoadResult<"blocked", SellerBlockedCards>> {
  return shape("blocked", await postWbCached<SellerBlockedCards>("/api/seller-hub/wildberries/risks/blocked", params, "blocked", 60_000));
}

/** Заказы по регионам покупателей за период (только чтение; серверный кэш 1 час, у WB лимит 1 запрос в минуту). */
export async function loadSellerHubRegionOrders(params: {
  days: number;
  refresh?: boolean;
}): Promise<LoadResult<"regions", SellerRegionOrders>> {
  return shape("regions", await postWbCached<SellerRegionOrders>("/api/seller-hub/wildberries/logistics/regions", params, "regions", 120_000));
}

/** Слоты приёмки FBO на склады WB (только чтение; серверный кэш 15 минут). */
export async function loadSellerHubAcceptance(params: {
  refresh?: boolean;
}): Promise<LoadResult<"acceptance", { loadedAt: string; rows: AcceptanceRow[] }>> {
  return shape("acceptance", await postWbCached<{ loadedAt: string; rows: AcceptanceRow[] }>("/api/seller-hub/wildberries/logistics/acceptance", params, "acceptance", 60_000));
}

type AnalyticsPeriodResult = { ok: boolean; error?: string; funnel?: SellerFunnelSnapshot; stocksReport?: SellerStocksReportSnapshot; loadedAt?: string };
/** Один запрос на период за раз: повторные вызовы (повторный запуск эффекта) получают тот же ответ и не нагружают WB. */
const analyticsPeriodInFlight = new Map<string, Promise<AnalyticsPeriodResult>>();

/** Воронка и отчёт об остатках за выбранный период и предыдущий такой же (только чтение; серверный кэш 30 минут). */
export function loadSellerHubAnalyticsPeriod(params: { days: number; refresh?: boolean }): Promise<AnalyticsPeriodResult> {
  const key = `${params.days}:${params.refresh ? "r" : ""}`;
  const flying = analyticsPeriodInFlight.get(key);
  if (flying) return flying;
  const promise = requestAnalyticsPeriod(params);
  analyticsPeriodInFlight.set(key, promise);
  void promise.then(
    () => analyticsPeriodInFlight.delete(key),
    () => analyticsPeriodInFlight.delete(key),
  );
  return promise;
}

async function requestAnalyticsPeriod(params: { days: number; refresh?: boolean }): Promise<AnalyticsPeriodResult> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/analytics/period", {
    method: "POST",
    body: JSON.stringify(params),
    timeoutMs: 170_000,
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; funnel?: SellerFunnelSnapshot; stocksReport?: SellerStocksReportSnapshot; loadedAt?: string };
  if (!res.ok || !data.ok) return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true, funnel: data.funnel, stocksReport: data.stocksReport, loadedAt: data.loadedAt };
}

export type AnalyticsHistoryResult = { ok: true; series: HistoryPoint[]; missing: number; notes: string[] } | { ok: false; error: string };

/** История показателей из базы; каждый вызов докачивает до трёх недостающих дней воронки (лимиты WB). */
export async function loadSellerHubAnalyticsHistory(opts: { readOnly?: boolean } = {}): Promise<AnalyticsHistoryResult> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/analytics/history", { method: "POST", body: JSON.stringify({ readOnly: opts.readOnly === true }), timeoutMs: 170_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; series?: HistoryPoint[]; missing?: number; notes?: string[] };
  if (!res.ok || !data.ok) return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true, series: data.series ?? [], missing: data.missing ?? 0, notes: data.notes ?? [] };
}

export type NewsSyncResult = { ok: true; created: number; news: number; more: boolean; warning: string | null } | { ok: false; error: string };

/** Прочитать новости портала WB и превратить их в уведомления «Событий» с учётом профиля продавца. */
export async function syncSellerHubNews(profile: { categories: string[]; brands: string[]; worksFbs: boolean; worksFbw: boolean; usesAds?: boolean; promoNames?: string[]; mutedRubrics?: string[]; warehouseNames: string[] }): Promise<NewsSyncResult> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/events/news", { method: "POST", body: JSON.stringify({ profile }), timeoutMs: 60_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; created?: number; news?: number; more?: boolean; warning?: string | null };
  if (!res.ok || !data.ok) return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true, created: data.created ?? 0, news: data.news ?? 0, more: data.more === true, warning: data.warning ?? null };
}

export type TaskSettingsPayload = {
  values: Record<string, number | null>;
  defaults: Record<string, number | null>;
  disabledTypes: string[];
  mutedProducts: Array<{ nmId: string; type: string }>;
};

export async function loadSellerHubTaskSettings(marketplaceId = "wildberries"): Promise<{ ok: true; data: TaskSettingsPayload } | { ok: false; error: string }> {
  const res = await autoRepliesAuthorizedFetch(`/api/seller-hub/tasks/settings?marketplaceId=${encodeURIComponent(marketplaceId)}`, { method: "GET", timeoutMs: 30_000 });
  const data = (await res.json().catch(() => ({}))) as Partial<TaskSettingsPayload> & { ok?: boolean; error?: string };
  if (!res.ok || !data.ok || !data.values) return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true, data: { values: data.values, defaults: data.defaults ?? {}, disabledTypes: data.disabledTypes ?? [], mutedProducts: data.mutedProducts ?? [] } };
}

export async function saveSellerHubTaskSettings(
  marketplaceId: string,
  values: Record<string, number | null>,
  disabledTypes: string[],
): Promise<{ ok: true } | { ok: false; error: string; errors?: Record<string, string> }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/tasks/settings", { method: "PUT", body: JSON.stringify({ marketplaceId, values, disabledTypes }), timeoutMs: 30_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; errors?: Record<string, string> };
  if (!res.ok || !data.ok) return { ok: false, error: data.error ?? `Ошибка ${res.status}`, errors: data.errors };
  return { ok: true };
}

/** Отключить (disabled = true) или вернуть задачи одного типа по одному товару. */
export async function muteSellerHubTask(nmId: string, type: string, disabled: boolean, marketplaceId = "wildberries"): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/tasks/mute", { method: "POST", body: JSON.stringify({ nmId, type, disabled, marketplaceId }), timeoutMs: 30_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true };
}

export type TaskFromEventResult = { ok: true; taskId: string; existed: boolean } | { ok: false; error: string };

/** Создать задачу из уведомления «Событий». Повторный вызов по тому же событию вернёт уже созданную задачу. */
export async function createSellerHubTaskFromEvent(eventId: string, marketplaceId = "wildberries"): Promise<TaskFromEventResult> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/tasks/from-event", { method: "POST", body: JSON.stringify({ eventId, marketplaceId }), timeoutMs: 30_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; taskId?: string; existed?: boolean };
  if (!res.ok || !data.ok || !data.taskId) return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true, taskId: data.taskId, existed: data.existed === true };
}

export type MarketCommissionResult = {
  query: string;
  matches: Array<{ name: string; commissionFbw: number; commissionFbs: number }>;
};

/** Комиссии WB для категорий магазина по официальной таблице (без запросов к WB). */
export async function loadMarketCommissions(categories: string[]): Promise<{ ok: boolean; error?: string; effectiveFrom?: string; source?: string; results?: MarketCommissionResult[] }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/market/commissions", {
    method: "POST",
    body: JSON.stringify({ categories }),
    timeoutMs: 30_000,
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; effectiveFrom?: string; source?: string; results?: MarketCommissionResult[] };
  if (!res.ok || !data.ok) return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true, effectiveFrom: data.effectiveFrom, source: data.source, results: data.results };
}

export type SellerHubSupplyOrders = Array<{
  supplyId: string;
  orders: Array<{ id: number; createdAt?: string; nmId?: number; article?: string }>;
}>;

/** Состав FBS-поставок (только чтение; закрытые кэшируются на сутки). */
export async function loadSellerHubSupplyOrders(params: {
  supplies: Array<{ id: string; done: boolean }>;
  refresh?: boolean;
}): Promise<LoadResult<"supplyOrders", SellerHubSupplyOrders>> {
  return shape("supplyOrders", await postWbCached<SellerHubSupplyOrders>("/api/seller-hub/wildberries/orders/supply-orders", params, "supplyOrders", 60_000));
}

/** Убрать товар из кампании. Запись в WB: только после подтверждения человеком. */
export async function removeSellerHubAdNm(params: {
  advertId: number;
  nmId: number;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/ads/nm", {
    method: "POST",
    body: JSON.stringify({ ...params, confirmNmId: params.nmId }),
    timeoutMs: 30_000,
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  }
  return { ok: true };
}

/** Создать тестовую кампанию для товара (без запуска и без списания денег). Запись в WB: только после подтверждения. */
export async function createSellerHubAdCampaign(params: {
  nmId: number;
  name: string;
}): Promise<{ ok: boolean; error?: string; campaignId?: number }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/ads/create", {
    method: "POST",
    body: JSON.stringify({ ...params, confirmNmId: params.nmId }),
    timeoutMs: 30_000,
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; campaignId?: number };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  }
  return { ok: true, campaignId: data.campaignId };
}

/** Изменить ставку товара в CPM-кампании. Запись в WB: вызывать только после подтверждения ставки человеком. */
export async function changeSellerHubAdBid(params: {
  advertId: number;
  nmId: number;
  bidRub: number;
}): Promise<{ ok: boolean; error?: string; bidRub?: number }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/ads/bid", {
    method: "POST",
    body: JSON.stringify({ ...params, confirmRub: params.bidRub }),
    timeoutMs: 30_000,
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; bidRub?: number };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  }
  return { ok: true, bidRub: data.bidRub };
}

/** Добавить минус-фразы в кампанию для артикула. Запись в WB: вызывать только после подтверждения списка человеком. */
export async function addSellerHubAdMinusPhrases(params: {
  advertId: number;
  nmId: number;
  queries: string[];
}): Promise<{ ok: boolean; error?: string; added?: string[] }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/ads/minus", {
    method: "POST",
    body: JSON.stringify({ ...params, confirmCount: params.queries.length }),
    timeoutMs: 30_000,
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; added?: string[] };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  }
  return { ok: true, added: data.added ?? [] };
}


/** Пополнить бюджет кампании со счёта продвижения. Деньги двигаются: вызывать только после подтверждения суммы человеком. */
export async function depositSellerHubAdBudget(params: {
  campaignId: number;
  sum: number;
}): Promise<{ ok: boolean; error?: string; budget?: number | null }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/ads/deposit", {
    method: "POST",
    body: JSON.stringify({ campaignId: params.campaignId, sum: params.sum, confirmSum: params.sum }),
    timeoutMs: 30_000,
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; budget?: number | null };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
  }
  return { ok: true, budget: data.budget ?? null };
}


let realizationFlight: Promise<{ ok: boolean; realization?: SellerRealizationSnapshot; error?: string }> | null = null;

export function loadSellerHubRealization(): Promise<{
  ok: boolean;
  realization?: SellerRealizationSnapshot;
  error?: string;
}> {
  if (realizationFlight) return realizationFlight;
  realizationFlight = requestSellerHubRealization().finally(() => {
    realizationFlight = null;
  });
  return realizationFlight;
}

async function requestSellerHubRealization(): Promise<{
  ok: boolean;
  realization?: SellerRealizationSnapshot;
  error?: string;
}> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/realization", {
    method: "POST",
    body: JSON.stringify({}),
    timeoutMs: 60_000,
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    realization?: SellerRealizationSnapshot;
  };
  if (data.realization) {
    return { ok: Boolean(data.ok && !data.realization.error), realization: data.realization, error: data.realization.error ?? data.error };
  }
  return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
}

let funnelFlight: Promise<{ ok: boolean; funnel?: SellerFunnelSnapshot; error?: string }> | null = null;

export function loadSellerHubFunnel(): Promise<{
  ok: boolean;
  funnel?: SellerFunnelSnapshot;
  error?: string;
}> {
  if (funnelFlight) return funnelFlight;
  funnelFlight = requestSellerHubFunnel().finally(() => {
    funnelFlight = null;
  });
  return funnelFlight;
}

async function requestSellerHubFunnel(): Promise<{
  ok: boolean;
  funnel?: SellerFunnelSnapshot;
  error?: string;
}> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/funnel", {
    method: "POST",
    body: JSON.stringify({}),
    timeoutMs: 180_000,
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    funnel?: SellerFunnelSnapshot;
  };
  if (data.funnel) {
    return { ok: Boolean(data.ok && !data.funnel.error), funnel: data.funnel, error: data.funnel.error ?? data.error };
  }
  return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
}

let stocksReportFlight: Promise<{
  ok: boolean;
  stocksReport?: SellerStocksReportSnapshot;
  error?: string;
}> | null = null;

export function loadSellerHubStocksReport(): Promise<{
  ok: boolean;
  stocksReport?: SellerStocksReportSnapshot;
  error?: string;
}> {
  if (stocksReportFlight) return stocksReportFlight;
  stocksReportFlight = requestSellerHubStocksReport().finally(() => {
    stocksReportFlight = null;
  });
  return stocksReportFlight;
}

async function requestSellerHubStocksReport(): Promise<{
  ok: boolean;
  stocksReport?: SellerStocksReportSnapshot;
  error?: string;
}> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/stocks-report", {
    method: "POST",
    body: JSON.stringify({}),
    timeoutMs: 180_000,
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    stocksReport?: SellerStocksReportSnapshot;
  };
  if (data.stocksReport) {
    return {
      ok: Boolean(data.ok && !data.stocksReport.error),
      stocksReport: data.stocksReport,
      error: data.stocksReport.error ?? data.error,
    };
  }
  return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
}

let feedbacksFlight: Promise<{
  ok: boolean;
  feedbacks?: SellerFeedbacksSnapshot;
  error?: string;
}> | null = null;

export function loadSellerHubFeedbacks(options?: {
  wbFeedbackRatingByNm?: Record<string, number | null>;
}): Promise<{
  ok: boolean;
  feedbacks?: SellerFeedbacksSnapshot;
  error?: string;
}> {
  if (feedbacksFlight) return feedbacksFlight;
  feedbacksFlight = requestSellerHubFeedbacks(options).finally(() => {
    feedbacksFlight = null;
  });
  return feedbacksFlight;
}

async function requestSellerHubFeedbacks(options?: {
  wbFeedbackRatingByNm?: Record<string, number | null>;
}): Promise<{
  ok: boolean;
  feedbacks?: SellerFeedbacksSnapshot;
  error?: string;
}> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/feedbacks", {
    method: "POST",
    body: JSON.stringify({
      wbFeedbackRatingByNm: options?.wbFeedbackRatingByNm,
    }),
    timeoutMs: 120_000,
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    feedbacks?: SellerFeedbacksSnapshot;
  };
  if (data.feedbacks) {
    return {
      ok: Boolean(data.ok),
      feedbacks: data.feedbacks,
      error: data.feedbacks.error ?? data.error,
    };
  }
  return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
}

let paidStorageFlight: Promise<{
  ok: boolean;
  paidStorage?: SellerPaidStorageSnapshot;
  error?: string;
}> | null = null;

export function loadSellerHubPaidStorage(previous?: SellerPaidStorageSnapshot | null): Promise<{
  ok: boolean;
  paidStorage?: SellerPaidStorageSnapshot;
  error?: string;
}> {
  if (paidStorageFlight) return paidStorageFlight;
  paidStorageFlight = requestSellerHubPaidStorage(previous).finally(() => {
    paidStorageFlight = null;
  });
  return paidStorageFlight;
}

async function requestSellerHubPaidStorage(
  previous?: SellerPaidStorageSnapshot | null,
): Promise<{
  ok: boolean;
  paidStorage?: SellerPaidStorageSnapshot;
  error?: string;
}> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/paid-storage", {
    method: "POST",
    body: JSON.stringify({ previous: previous ?? null }),
    timeoutMs: 180_000,
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    paidStorage?: SellerPaidStorageSnapshot;
  };
  if (data.paidStorage) {
    const waiting =
      data.paidStorage.status === "pending" ||
      (data.paidStorage.pendingChunks?.length ?? 0) > 0;
    return {
      ok: Boolean(data.ok && (waiting || !data.paidStorage.error || Object.keys(data.paidStorage.byNm).length > 0)),
      paidStorage: data.paidStorage,
      error: data.paidStorage.error ?? data.error,
    };
  }
  return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
}

/** Последние себестоимости с сервера (seller_hub_cost_history). */
export async function fetchSellerHubCostPrices(marketplaceId = "wildberries"): Promise<{
  ok: boolean;
  costs: Record<string, number>;
  error?: string;
}> {
  try {
    const res = await autoRepliesAuthorizedFetch(
      `/api/seller-hub/cost-history?marketplaceId=${encodeURIComponent(marketplaceId)}`,
      { method: "GET", timeoutMs: 30_000 },
    );
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      costs?: Record<string, number>;
      error?: string;
    };
    if (!res.ok || !data.ok || !data.costs) {
      return { ok: false, costs: {}, error: data.error ?? `Ошибка ${res.status}` };
    }
    return { ok: true, costs: data.costs };
  } catch (error) {
    return {
      ok: false,
      costs: {},
      error: error instanceof Error ? error.message : "Себестоимость не прочиталась",
    };
  }
}

/** Запись одной себестоимости в seller_hub_cost_history. */
export async function saveSellerHubCostPrice(input: {
  nmId: string;
  costPrice: number;
  marketplaceId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await autoRepliesAuthorizedFetch("/api/seller-hub/cost-history", {
      method: "POST",
      body: JSON.stringify({
        nmId: input.nmId,
        costPrice: input.costPrice,
        marketplaceId: input.marketplaceId ?? "wildberries",
      }),
      timeoutMs: 15_000,
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Себестоимость не сохранилась",
    };
  }
}

/** Dev: полный sync + диагностика → karto-diagnostics.json в корне. */
export async function buildSellerHubDiagnosticsRemote(): Promise<{
  ok: boolean;
  path?: string;
  meta?: unknown;
  taskCount?: number;
  error?: string;
  paidStorageStatus?: string;
  paidStorageNmCount?: number;
  rawRealizationSampleNm?: string[];
  rawRealizationSampleRows?: number;
}> {
  try {
    const res = await autoRepliesAuthorizedFetch("/api/seller-hub/diagnostics/build", {
      method: "POST",
      body: JSON.stringify({}),
      timeoutMs: 600_000,
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      path?: string;
      meta?: unknown;
      taskCount?: number;
      error?: string;
      paidStorageStatus?: string;
      paidStorageNmCount?: number;
      rawRealizationSampleNm?: string[];
      rawRealizationSampleRows?: number;
    };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? `Ошибка ${res.status}` };
    }
    return {
      ok: true,
      path: data.path,
      meta: data.meta,
      taskCount: data.taskCount,
      paidStorageStatus: data.paidStorageStatus,
      paidStorageNmCount: data.paidStorageNmCount,
      rawRealizationSampleNm: data.rawRealizationSampleNm,
      rawRealizationSampleRows: data.rawRealizationSampleRows,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Полный прогон диагностики не удался";
    return { ok: false, error: message };
  }
}


export type AiFeedItem = import("@/lib/seller-hub/agent/feed").FeedItem & { kindLabel: string | null };

/** Единая лента: задачи алгоритмов и находки ИИ. Только чтение из нашей базы. */
export async function loadSellerHubAiFeed(): Promise<{ ok: boolean; items: AiFeedItem[]; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/agents/feed", { method: "GET", timeoutMs: 20_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: AiFeedItem[]; error?: string };
  if (!res.ok || !data.ok || !data.items) return { ok: false, items: [], error: data.error ?? `Ошибка ${res.status}` };
  return { ok: true, items: data.items };
}

/** Скрыть находку ИИ (владелец решил, что она не нужна). */
export async function dismissSellerHubAiFinding(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/agents/findings", { method: "POST", body: JSON.stringify({ id, action: "dismiss" }), timeoutMs: 20_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  return res.ok && data.ok ? { ok: true } : { ok: false, error: data.error ?? `Ошибка ${res.status}` };
}

/** Принять действие из находки ИИ (или снять принятие): оно станет предложением «Выполнить» в разделе «Агенты». */
export async function acceptSellerHubAiFinding(id: string, accept: boolean): Promise<{ ok: boolean; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/agents/findings", { method: "POST", body: JSON.stringify({ id, action: accept ? "accept" : "unaccept" }), timeoutMs: 40_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  return res.ok && data.ok ? { ok: true } : { ok: false, error: data.error ?? `Ошибка ${res.status}` };
}

/** Принять сразу несколько планов (после одного пересчёта предложений). */
export async function acceptSellerHubAiFindings(ids: string[], accept: boolean): Promise<{ ok: boolean; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/agents/findings", { method: "POST", body: JSON.stringify({ ids, action: accept ? "accept" : "unaccept" }), timeoutMs: 60_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  return res.ok && data.ok ? { ok: true } : { ok: false, error: data.error ?? `Ошибка ${res.status}` };
}

export type AiChatMessage = { role: "user" | "assistant"; text: string; at: string; questions?: string[] };
export type AiChat = { id: string; title: string; state: "asking" | "planned" | "closed"; rounds: number; messages: AiChatMessage[]; updatedAt: string };

export async function listSellerHubAiChats(): Promise<{ ok: boolean; chats: Array<Pick<AiChat, "id" | "title" | "state" | "updatedAt">>; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/agents/chat", { method: "GET", timeoutMs: 20_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; chats?: Array<Pick<AiChat, "id" | "title" | "state" | "updatedAt">>; error?: string };
  return res.ok && data.ok && data.chats ? { ok: true, chats: data.chats } : { ok: false, chats: [], error: data.error ?? `Ошибка ${res.status}` };
}

export async function loadSellerHubAiChat(id: string): Promise<{ ok: boolean; chat?: AiChat; error?: string }> {
  const res = await autoRepliesAuthorizedFetch(`/api/seller-hub/agents/chat?id=${encodeURIComponent(id)}`, { method: "GET", timeoutMs: 20_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; chat?: AiChat; error?: string };
  return res.ok && data.ok && data.chat ? { ok: true, chat: data.chat } : { ok: false, error: data.error ?? `Ошибка ${res.status}` };
}

/** Сообщение владельца в диалог: ИИ задаёт вопросы или составляет планы (долго: до пары минут). */
export async function sendSellerHubAiChat(chatId: string | null, message: string): Promise<{ ok: boolean; chat?: AiChat; planIds?: string[]; limited?: boolean; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/agents/chat", { method: "POST", body: JSON.stringify({ chatId, message }), timeoutMs: 200_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; chat?: AiChat; planIds?: string[]; limited?: boolean; error?: string };
  return res.ok && data.ok && data.chat ? { ok: true, chat: data.chat, planIds: data.planIds ?? [], limited: data.limited } : { ok: false, error: data.error ?? `Ошибка ${res.status}` };
}

export async function closeSellerHubAiChat(chatId: string): Promise<void> {
  await autoRepliesAuthorizedFetch("/api/seller-hub/agents/chat", { method: "POST", body: JSON.stringify({ chatId, action: "close" }), timeoutMs: 20_000 }).catch(() => undefined);
}

export type AiActivityPlan = {
  id: string;
  nmId: string | null;
  title: string;
  origin: string;
  accepted: boolean;
  strategy: import("@/lib/seller-hub/agent/strategy").Strategy | null;
  state: import("@/lib/seller-hub/agent/strategy").StrategyState;
  lastSeenAt: string;
};
export type AiActivity = { plans: AiActivityPlan[] };

/** История работы ИИ: что стало с принятыми планами. Только чтение из нашей базы. */
export async function loadSellerHubAiActivity(): Promise<{ ok: boolean; data?: AiActivity; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/agents/ai-activity", { method: "GET", timeoutMs: 20_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; plans?: AiActivityPlan[]; error?: string };
  return res.ok && data.ok ? { ok: true, data: { plans: data.plans ?? [] } } : { ok: false, error: data.error ?? `Ошибка ${res.status}` };
}

/** Отметить шаг плана, который делает человек: «сделал», «пропустил» или сбросить отметку. */
export async function markSellerHubPlanStep(id: string, stepIndex: number, status: "done" | "skipped" | "reset"): Promise<{ ok: boolean; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/agents/findings", { method: "POST", body: JSON.stringify({ id, action: "step", stepIndex, status }), timeoutMs: 20_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  return res.ok && data.ok ? { ok: true } : { ok: false, error: data.error ?? `Ошибка ${res.status}` };
}

/** Скидка WB Клуба по товару (целые проценты). */
export async function updateSellerHubClubDiscount(params: { nmId: number; clubDiscount: number }): Promise<{ ok: boolean; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/wildberries/prices/club", { method: "POST", body: JSON.stringify({ updates: [params] }), timeoutMs: 90_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  return res.ok && data.ok ? { ok: true } : { ok: false, error: data.error ?? `Ошибка ${res.status}` };
}

export type AutopilotSettingsView = { enabled: boolean; allowedTypes: string[]; maxActionsPerDay: number; maxDepositPerDayRub: number; routines: string[] };
export type AutopilotView = { settings: AutopilotSettingsView; types: string[]; routines: Array<{ id: string; label: string }>; recent: Array<{ id: string; title: string; status: string; note: string; at: string }> };

export async function loadSellerHubAutopilot(): Promise<{ ok: boolean; data?: AutopilotView; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/agents/autopilot", { method: "GET", timeoutMs: 20_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; settings?: AutopilotSettingsView; types?: string[]; routines?: AutopilotView["routines"]; recent?: AutopilotView["recent"]; error?: string };
  return res.ok && data.ok && data.settings ? { ok: true, data: { settings: data.settings, types: data.types ?? [], routines: data.routines ?? [], recent: data.recent ?? [] } } : { ok: false, error: data.error ?? `Ошибка ${res.status}` };
}

export async function saveSellerHubAutopilot(settings: AutopilotSettingsView): Promise<{ ok: boolean; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/agents/autopilot", { method: "POST", body: JSON.stringify(settings), timeoutMs: 20_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  return res.ok && data.ok ? { ok: true } : { ok: false, error: data.error ?? `Ошибка ${res.status}` };
}

/** Включить или выключить автопилот у принятого плана. */
export async function setSellerHubPlanAutopilot(id: string, on: boolean): Promise<{ ok: boolean; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/agents/findings", { method: "POST", body: JSON.stringify({ id, action: "autopilot", on }), timeoutMs: 20_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  return res.ok && data.ok ? { ok: true } : { ok: false, error: data.error ?? `Ошибка ${res.status}` };
}

export type AgentReportView = { id: string; period_start: string; period_end: string; payload: import("@/lib/seller-hub/agent/report").WeeklyReport };

/** Недельные отчёты о работе агентов. */
export async function loadSellerHubAgentReports(): Promise<{ ok: boolean; reports: AgentReportView[]; error?: string }> {
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/agents/report", { method: "GET", timeoutMs: 20_000 });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; reports?: AgentReportView[]; error?: string };
  return res.ok && data.ok ? { ok: true, reports: data.reports ?? [] } : { ok: false, reports: [], error: data.error ?? `Ошибка ${res.status}` };
}
