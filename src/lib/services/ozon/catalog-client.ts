import type { SellerCatalogItem, SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import type { OzonCredentials } from "./types";
import { OzonApiError } from "./client";

const OZON_BASE = "https://api-seller.ozon.ru";
const OZON_LIST_LIMIT = 200;
const OZON_MAX_PAGES = 40;
const OZON_INFO_CHUNK = 100;
const MIN_INTERVAL_MS = 400;

let lastOzonCatalogCallAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttleOzon() {
  const now = Date.now();
  const wait = Math.max(0, MIN_INTERVAL_MS - (now - lastOzonCatalogCallAt));
  if (wait > 0) await sleep(wait);
  lastOzonCatalogCallAt = Date.now();
}

async function ozonCatalogRequest<T>(
  credentials: OzonCredentials,
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  await throttleOzon();
  const clientId = credentials.clientId.trim();
  const apiKey = credentials.apiKey.trim();
  if (!clientId || !apiKey) {
    throw new OzonApiError("Укажите Client ID и API Key Ozon", 400);
  }

  const res = await fetch(`${OZON_BASE}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Client-Id": clientId,
      "Api-Key": apiKey,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await res.text();
  let payload: { result?: T; message?: string } | null = null;
  if (text) {
    try {
      payload = JSON.parse(text) as { result?: T; message?: string };
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    throw new OzonApiError(
      payload?.message || `Ozon API вернул ${res.status}`,
      res.status,
      payload?.message
    );
  }

  if (!payload?.result) {
    throw new OzonApiError("Пустой ответ Ozon API", 502);
  }
  return payload.result;
}

type OzonListItem = {
  product_id?: number;
  offer_id?: string;
  archived?: boolean;
  has_fbo_stocks?: boolean;
  has_fbs_stocks?: boolean;
};

type OzonListResult = {
  items?: OzonListItem[];
  last_id?: string;
  total?: number;
};

type OzonProductInfo = {
  id?: number;
  offer_id?: string;
  name?: string;
  barcode?: string;
  primary_image?: string;
  images?: string[];
  price?: string;
  old_price?: string;
  marketing_price?: string;
  min_price?: string;
  stocks?: { present?: number; reserved?: number };
  visibility_details?: { has_price?: boolean };
};

export async function verifyOzonCatalogAccess(credentials: OzonCredentials): Promise<{
  ok: true;
  sellerName: string | null;
  sampleCount: number;
}> {
  const result = await ozonCatalogRequest<OzonListResult>(credentials, "/v3/product/list", {
    filter: { visibility: "ALL" },
    last_id: "",
    limit: 5,
  });

  let sellerName: string | null = null;
  try {
    const seller = await ozonCatalogRequest<{ name?: string; company?: { name?: string } }>(
      credentials,
      "/v1/seller/info",
      {}
    );
    sellerName = seller.company?.name?.trim() || seller.name?.trim() || null;
  } catch {
    sellerName = null;
  }

  return {
    ok: true,
    sellerName,
    sampleCount: result.items?.length ?? 0,
  };
}

async function fetchOzonProductInfoMap(
  credentials: OzonCredentials,
  offerIds: string[]
): Promise<Map<string, OzonProductInfo>> {
  const map = new Map<string, OzonProductInfo>();
  for (let i = 0; i < offerIds.length; i += OZON_INFO_CHUNK) {
    const chunk = offerIds.slice(i, i + OZON_INFO_CHUNK);
    const result = await ozonCatalogRequest<{ items?: OzonProductInfo[] }>(
      credentials,
      "/v3/product/info/list",
      { offer_id: chunk }
    );
    for (const item of result.items ?? []) {
      const key = item.offer_id?.trim();
      if (key) map.set(key, item);
    }
  }
  return map;
}

function parseOzonPrice(raw?: string): number | null {
  if (!raw) return null;
  const n = Number.parseFloat(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export async function syncOzonCatalog(credentials: OzonCredentials): Promise<SellerCatalogSnapshot> {
  const listItems: OzonListItem[] = [];
  let lastId = "";
  let truncated = false;

  for (let page = 0; page < OZON_MAX_PAGES; page += 1) {
    const result = await ozonCatalogRequest<OzonListResult>(credentials, "/v3/product/list", {
      filter: { visibility: "ALL" },
      last_id: lastId,
      limit: OZON_LIST_LIMIT,
    });
    const batch = result.items ?? [];
    listItems.push(...batch);
    if (!result.last_id || batch.length < OZON_LIST_LIMIT) break;
    lastId = result.last_id;
    if (page === OZON_MAX_PAGES - 1) truncated = true;
  }

  const offerIds = listItems
    .map((item) => item.offer_id?.trim())
    .filter((id): id is string => Boolean(id));
  const infoMap = await fetchOzonProductInfoMap(credentials, offerIds);

  const items: SellerCatalogItem[] = listItems
    .filter((row) => row.offer_id)
    .map((row) => {
      const offerId = row.offer_id!.trim();
      const info = infoMap.get(offerId);
      const basePrice = parseOzonPrice(info?.old_price);
      const currentPrice =
        parseOzonPrice(info?.price) ??
        parseOzonPrice(info?.marketing_price) ??
        parseOzonPrice(info?.min_price);
      const stock = info?.stocks?.present ?? null;
      const discountPercent =
        basePrice && currentPrice && basePrice > currentPrice
          ? Math.round(((basePrice - currentPrice) / basePrice) * 100)
          : null;

      return {
        id: `ozon:${row.product_id ?? offerId}`,
        marketplaceId: "ozon" as const,
        externalId: String(row.product_id ?? offerId),
        vendorCode: offerId,
        title: info?.name?.trim() || offerId,
        imageUrl: info?.primary_image ?? info?.images?.[0],
        price: basePrice ?? currentPrice,
        discountedPrice: currentPrice,
        discountPercent,
        stockFbo: row.has_fbo_stocks ? stock : null,
        stockFbs: row.has_fbs_stocks ? stock : null,
        totalStock: stock,
        barcode: info?.barcode,
      };
    });

  return {
    marketplaceId: "ozon",
    items,
    syncedAt: new Date().toISOString(),
    totalCount: items.length,
    truncated,
    scopes: { content: true, prices: true, stocks: true },
    warnings: truncated ? [`Загружены первые ${items.length} товаров.`] : [],
  };
}
