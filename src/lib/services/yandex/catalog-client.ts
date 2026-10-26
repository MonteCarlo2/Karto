import type { SellerCatalogItem, SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import type { YandexCredentials } from "./types";
import {
  fetchYandexCampaigns,
  resolveYandexCampaign,
  YandexApiError,
} from "./client";

const YANDEX_BASE = "https://api.partner.market.yandex.ru";
const PAGE_LIMIT = 200;
const MAX_PAGES = 30;
const MIN_INTERVAL_MS = 500;

let lastYandexCatalogCallAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function yandexHeaders(apiKey: string): Record<string, string> {
  const token = apiKey.trim();
  if (/^ACMA:/i.test(token)) return { "Api-Key": token };
  if (/^(oauth|bearer)\s/i.test(token)) return { Authorization: token };
  return { "Api-Key": token.replace(/^api-key\s+/i, "").trim() };
}

async function throttleYandex() {
  const now = Date.now();
  const wait = Math.max(0, MIN_INTERVAL_MS - (now - lastYandexCatalogCallAt));
  if (wait > 0) await sleep(wait);
  lastYandexCatalogCallAt = Date.now();
}

async function yandexCatalogPost<T>(
  apiKey: string,
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  await throttleYandex();
  const res = await fetch(`${YANDEX_BASE}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...yandexHeaders(apiKey),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await res.text();
  let payload: Record<string, unknown> | null = null;
  if (text) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      payload = null;
    }
  }

  const errors = payload?.errors;
  const apiMessage =
    Array.isArray(errors) && errors.length > 0
      ? String((errors[0] as { message?: string }).message ?? "")
      : typeof payload?.message === "string"
        ? payload.message
        : undefined;

  if (!res.ok) {
    throw new YandexApiError(apiMessage || `Яндекс Маркет API вернул ${res.status}`, res.status, apiMessage);
  }

  if (payload?.status === "ERROR") {
    throw new YandexApiError(apiMessage || "Ошибка Яндекс Маркет API", 400, apiMessage);
  }

  const data = (payload?.result ?? payload) as T | null;
  if (!data) {
    throw new YandexApiError("Пустой ответ Яндекс Маркет API", 502);
  }
  return data;
}

type YandexOfferMapping = {
  offer?: {
    offerId?: string;
    name?: string;
    category?: string;
    pictures?: string[];
    basicPrice?: { value?: number; currencyId?: string };
  };
};

export async function resolveYandexBusinessContext(credentials: YandexCredentials): Promise<{
  campaignId: string;
  businessId: string;
  sellerName: string | null;
}> {
  const campaignId = credentials.campaignId?.trim();
  if (!campaignId) {
    throw new YandexApiError("Укажите Campaign ID магазина", 400);
  }

  const campaigns = await fetchYandexCampaigns(credentials.apiKey);
  const match = resolveYandexCampaign(campaigns, campaignId) ?? campaigns[0];
  const businessId = credentials.businessId?.trim() || String(match?.business?.id ?? "");
  if (!businessId) {
    throw new YandexApiError(
      "Не удалось определить Business ID. Укажите его вручную или проверьте Campaign ID.",
      400
    );
  }

  return {
    campaignId: String(match?.id ?? campaignId),
    businessId,
    sellerName: match?.business?.name?.trim() || match?.domain?.trim() || null,
  };
}

export async function verifyYandexCatalogAccess(credentials: YandexCredentials): Promise<{
  ok: true;
  sellerName: string | null;
  businessId: string;
  campaignId: string;
  sampleCount: number;
}> {
  const ctx = await resolveYandexBusinessContext(credentials);
  const page = await yandexCatalogPost<{ offerMappings?: YandexOfferMapping[] }>(
    credentials.apiKey,
    `/v2/businesses/${ctx.businessId}/offer-mappings`,
    { limit: 5 }
  );

  return {
    ok: true,
    sellerName: ctx.sellerName,
    businessId: ctx.businessId,
    campaignId: ctx.campaignId,
    sampleCount: page.offerMappings?.length ?? 0,
  };
}

export async function syncYandexCatalog(credentials: YandexCredentials): Promise<SellerCatalogSnapshot> {
  const ctx = await resolveYandexBusinessContext(credentials);
  const items: SellerCatalogItem[] = [];
  let pageToken: string | undefined;
  let truncated = false;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const body: Record<string, unknown> = { limit: PAGE_LIMIT };
    if (pageToken) body.page_token = pageToken;

    const result = await yandexCatalogPost<{
      offerMappings?: YandexOfferMapping[];
      paging?: { nextPageToken?: string };
    }>(credentials.apiKey, `/v2/businesses/${ctx.businessId}/offer-mappings`, body);

    for (const row of result.offerMappings ?? []) {
      const offer = row.offer;
      const offerId = offer?.offerId?.trim();
      if (!offerId) continue;
      items.push({
        id: `yandex:${offerId}`,
        marketplaceId: "yandex",
        externalId: offerId,
        vendorCode: offerId,
        title: offer?.name?.trim() || offerId,
        category: offer?.category?.trim(),
        imageUrl: offer?.pictures?.[0],
        price: offer?.basicPrice?.value ?? null,
        discountedPrice: offer?.basicPrice?.value ?? null,
        totalStock: null,
      });
    }

    pageToken = result.paging?.nextPageToken;
    if (!pageToken) break;
    if (page === MAX_PAGES - 1) truncated = true;
  }

  return {
    marketplaceId: "yandex",
    items,
    syncedAt: new Date().toISOString(),
    totalCount: items.length,
    truncated,
    scopes: { content: true, prices: true },
    warnings: truncated ? [`Загружены первые ${items.length} офферов.`] : [],
  };
}
