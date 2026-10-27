import type {
  SellerAdsSnapshot,
  SellerAnalyticsSummary,
  SellerCatalogItem,
  SellerCatalogSnapshot,
  SellerHubScopeState,
  SellerOrdersSummary,
  SellerPromotionRow,
  SellerSuppliesSnapshot,
} from "@/lib/seller-hub/types";
import { fetchWbAdsSnapshot } from "./advert-client";
import { fetchWbFboStocksMap, fetchWbSalesSummary } from "./analytics-client";
import { fetchCabinetExtras } from "./cabinet-extra";
import { fetchWildberriesSellerName, WildberriesApiError } from "./client";
import {
  buildFbsSuppliesSnapshot,
  dedupeSupplyRows,
  fetchWbFbsSupplies,
  fetchWbOrdersSummary,
} from "./marketplace-ops-client";
import { fetchPublicCardInfo } from "./public-card-client";
import { fetchWbFbwSupplies } from "./supplies-fbw-client";

const CONTENT_BASE = "https://content-api.wildberries.ru";
const PRICES_BASE = "https://discounts-prices-api.wildberries.ru";
const MARKETPLACE_BASE = "https://marketplace-api.wildberries.ru";
const ANALYTICS_BASE = "https://seller-analytics-api.wildberries.ru";
const CALENDAR_BASE = "https://dp-calendar-api.wildberries.ru";
const SUPPLIES_BASE = "https://supplies-api.wildberries.ru";
const ADVERT_BASE = "https://advert-api.wildberries.ru";

const REQUEST_TIMEOUT_MS = 45_000;
const CARDS_PAGE_SIZE = 100;
const CARDS_MAX_PAGES = 50;
const CARDS_MIN_INTERVAL_MS = 650;
const PRICES_PAGE_SIZE = 1000;
const PRICES_MAX_PAGES = 30;
const PRICES_MIN_INTERVAL_MS = 650;
const MARKETPLACE_MIN_INTERVAL_MS = 220;
const FBS_SKU_BATCH = 500;
const PROMO_DETAILS_BATCH = 20;
const PROMO_NM_BATCH = 100;
const CALENDAR_MIN_INTERVAL_MS = 650;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new WildberriesApiError("API-токен не указан", 400);
  return trimmed.startsWith("Bearer ") ? trimmed.slice(7).trim() : trimmed;
}

async function throttle(lastAt: { value: number }, minMs: number) {
  const now = Date.now();
  const wait = Math.max(0, minMs - (now - lastAt.value));
  if (wait > 0) await sleep(wait);
  lastAt.value = Date.now();
}

const cardsThrottle = { value: 0 };
const pricesThrottle = { value: 0 };
const marketplaceThrottle = { value: 0 };
const calendarThrottle = { value: 0 };

async function wbFetch(
  token: string,
  url: string,
  init?: { method?: "GET" | "POST" | "PUT"; body?: unknown }
): Promise<{ status: number; ok: boolean; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${normalizeToken(token)}`,
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    return { status: res.status, ok: res.ok, text: await res.text() };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new WildberriesApiError("Wildberries не ответил вовремя", 504);
    }
    throw new WildberriesApiError(
      e instanceof Error ? e.message : "Не удалось связаться с Wildberries",
      502
    );
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson<T>(text: string): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** WB иногда отдаёт цены в копейках (целое > 50000), иногда в рублях. */
function normalizeWbMoney(raw: unknown): number | null {
  if (raw == null) return null;
  const n = typeof raw === "string" ? Number(raw.replace(/\s/g, "")) : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (Number.isInteger(n) && n >= 50_000) return Math.round(n / 100);
  return n;
}

function pickBestSizePrice(
  sizes: Array<Record<string, unknown>> | undefined
): { price: number | null; discountedPrice: number | null } {
  if (!sizes?.length) return { price: null, discountedPrice: null };

  let bestBase: number | null = null;
  let bestFinal: number | null = null;

  for (const size of sizes) {
    const discounted =
      normalizeWbMoney(size.discountedPrice) ??
      normalizeWbMoney(size.discounted_price) ??
      normalizeWbMoney(size.priceU);
    const base =
      normalizeWbMoney(size.price) ??
      normalizeWbMoney(size.basicPrice) ??
      normalizeWbMoney(size.basic);

    const final = discounted ?? base;
    if (final == null) continue;

    if (bestFinal == null || final < bestFinal) {
      bestFinal = final;
      bestBase = base ?? discounted;
    }
  }

  return { price: bestBase, discountedPrice: bestFinal };
}

/* ------------------------------------------------------------------ */
/* Категории токена                                                    */
/* ------------------------------------------------------------------ */

const SCOPE_PING_URL: Record<keyof SellerHubScopeState, string> = {
  content: `${CONTENT_BASE}/ping`,
  prices: `${PRICES_BASE}/ping`,
  stocks: `${ANALYTICS_BASE}/ping`,
  analytics: `${ANALYTICS_BASE}/ping`,
  promotion: `${CALENDAR_BASE}/ping`,
  marketplace: `${MARKETPLACE_BASE}/ping`,
  supplies: `${SUPPLIES_BASE}/ping`,
  advert: `${ADVERT_BASE}/ping`,
};

export async function probeWildberriesScopes(token: string): Promise<SellerHubScopeState> {
  const entries = Object.entries(SCOPE_PING_URL) as Array<
    [keyof SellerHubScopeState, string]
  >;

  const results = await Promise.all(
    entries.map(async ([scope, url]) => {
      try {
        const res = await wbFetch(token, url);
        return [scope, res.ok] as const;
      } catch {
        return [scope, false] as const;
      }
    })
  );

  const scopes: SellerHubScopeState = {};
  for (const [scope, ok] of results) {
    scopes[scope] = ok;
  }
  return scopes;
}

/* ------------------------------------------------------------------ */
/* Карточки товаров (Контент)                                          */
/* ------------------------------------------------------------------ */

type WbContentCard = {
  nmID?: number;
  vendorCode?: string;
  brand?: string;
  title?: string;
  description?: string;
  subjectID?: number;
  subjectName?: string;
  photos?: Array<{ big?: string; c246x328?: string; square?: string }>;
  video?: string;
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
    weightBrutto?: number;
  };
  sizes?: Array<Record<string, unknown> & { skus?: string[]; techSize?: string; chrtID?: number }>;
  characteristics?: Array<{ id?: number; name?: string; value?: unknown }>;
  createdAt?: string;
  updatedAt?: string;
};

type WbCardsListResponse = {
  cards?: WbContentCard[];
  cursor?: { updatedAt?: string; nmID?: number; total?: number };
};

async function fetchCardsPage(
  token: string,
  cursor?: { updatedAt: string; nmID: number }
): Promise<WbCardsListResponse> {
  await throttle(cardsThrottle, CARDS_MIN_INTERVAL_MS);

  const body = {
    settings: {
      sort: { ascending: false },
      filter: { withPhoto: -1 },
      cursor: {
        limit: CARDS_PAGE_SIZE,
        ...(cursor ? { updatedAt: cursor.updatedAt, nmID: cursor.nmID } : {}),
      },
    },
  };

  const res = await wbFetch(token, `${CONTENT_BASE}/content/v2/get/cards/list`, {
    method: "POST",
    body,
  });

  const payload = parseJson<
    WbCardsListResponse & { errorText?: string; data?: WbCardsListResponse; error?: boolean }
  >(res.text);

  if (!res.ok) {
    const wbError = payload?.errorText;
    if (res.status === 401) {
      throw new WildberriesApiError(
        "Токен не принят. Для каталога нужен персональный токен с категорией «Контент».",
        401,
        wbError
      );
    }
    if (res.status === 403) {
      throw new WildberriesApiError(
        "У токена нет доступа к категории «Контент». Создайте новый токен с этой категорией.",
        403,
        wbError
      );
    }
    throw new WildberriesApiError(
      wbError || `Wildberries Content API вернул ${res.status}`,
      res.status,
      wbError
    );
  }

  if (payload?.error) {
    throw new WildberriesApiError(payload.errorText || "Wildberries Content API вернул ошибку", 502);
  }

  const data = payload?.data ?? payload;
  if (!data) throw new WildberriesApiError("Пустой ответ Wildberries Content API", 502);
  return data;
}

function collectSkus(card: WbContentCard): string[] {
  const set = new Set<string>();
  for (const size of card.sizes ?? []) {
    for (const sku of size.skus ?? []) {
      const trimmed = sku.trim();
      if (trimmed) set.add(trimmed);
    }
  }
  return [...set];
}

function chrtIdFromSize(size: Record<string, unknown>): number | undefined {
  const raw = size.chrtID ?? size.chrtId ?? size.chrt_id;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function collectChrtIds(card: WbContentCard): number[] {
  const set = new Set<number>();
  for (const size of card.sizes ?? []) {
    const id = chrtIdFromSize(size);
    if (id != null) set.add(id);
  }
  return [...set];
}

function collectChrtIdsFromGoodsSizes(sizes: Array<Record<string, unknown>> | undefined): number[] {
  const ids = new Set<number>();
  for (const size of sizes ?? []) {
    const id = chrtIdFromSize(size);
    if (id != null) ids.add(id);
    const sizeId = size.sizeID ?? size.sizeId;
    const n = typeof sizeId === "number" ? sizeId : Number(sizeId);
    if (Number.isFinite(n) && n > 0) ids.add(n);
  }
  return [...ids];
}

/** Карточка по nmID через textSearch — быстрее полной пагинации. */
async function fetchCardByNmId(token: string, nmId: number): Promise<WbContentCard | null> {
  await throttle(cardsThrottle, CARDS_MIN_INTERVAL_MS);
  const res = await wbFetch(token, `${CONTENT_BASE}/content/v2/get/cards/list`, {
    method: "POST",
    body: {
      settings: {
        filter: { textSearch: String(nmId), withPhoto: -1 },
        cursor: { limit: 20 },
      },
    },
  });
  if (!res.ok) return null;

  const payload = parseJson<
    WbCardsListResponse & { data?: WbCardsListResponse; error?: boolean; errorText?: string }
  >(res.text);
  if (payload?.error) return null;

  const data = payload?.data ?? payload;
  for (const card of data?.cards ?? []) {
    if (card.nmID === nmId) return card;
  }
  return null;
}

/** chrtID через Prices API (sizeID = chrtID) — для категорий с editableSizePrice. */
async function resolveChrtIdsFromPricesApi(token: string, nmId: number): Promise<number[]> {
  await throttle(pricesThrottle, PRICES_MIN_INTERVAL_MS);
  const params = new URLSearchParams({ limit: "100", nmID: String(nmId) });
  const res = await wbFetch(token, `${PRICES_BASE}/api/v2/list/goods/size/nm?${params}`);
  if (!res.ok) return [];

  const payload = parseJson<{
    data?: { listGoods?: Array<{ nmID?: number; sizeID?: number; sizes?: Array<{ sizeID?: number }> }> };
    listGoods?: Array<{ nmID?: number; sizeID?: number; sizes?: Array<{ sizeID?: number }> }>;
  }>(res.text);

  const rows = payload?.data?.listGoods ?? payload?.listGoods ?? [];
  const ids = new Set<number>();
  for (const row of rows) {
    if (row.nmID != null && row.nmID !== nmId) continue;
    if (row.sizeID != null && row.sizeID > 0) ids.add(row.sizeID);
    for (const size of row.sizes ?? []) {
      if (size.sizeID != null && size.sizeID > 0) ids.add(size.sizeID);
    }
  }
  return [...ids];
}

async function resolveChrtIdsFromGoodsFilter(token: string, nmId: number): Promise<number[]> {
  await throttle(pricesThrottle, PRICES_MIN_INTERVAL_MS);

  const postRes = await wbFetch(token, `${PRICES_BASE}/api/v2/list/goods/filter`, {
    method: "POST",
    body: { nmList: [nmId] },
  });
  if (postRes.ok) {
    const postPayload = parseJson<{
      data?: { listGoods?: Array<{ nmID?: number; sizes?: Array<Record<string, unknown>> }> };
    }>(postRes.text);
    for (const row of postPayload?.data?.listGoods ?? []) {
      if (row.nmID !== nmId) continue;
      const ids = collectChrtIdsFromGoodsSizes(row.sizes);
      if (ids.length > 0) return ids;
    }
  }

  const params = new URLSearchParams({ limit: "1000", filterNmID: String(nmId) });
  const res = await wbFetch(token, `${PRICES_BASE}/api/v2/list/goods/filter?${params}`);
  if (!res.ok) return [];

  const payload = parseJson<{
    data?: { listGoods?: Array<{ nmID?: number; sizes?: Array<Record<string, unknown>> }> };
  }>(res.text);

  for (const row of payload?.data?.listGoods ?? []) {
    if (row.nmID !== nmId) continue;
    const ids = collectChrtIdsFromGoodsSizes(row.sizes);
    if (ids.length > 0) return ids;
  }
  return [];
}

/** Свежие chrtID размеров по nmID — для записи FBS-остатков. */
export async function resolveChrtIdsForNmId(token: string, nmId: number): Promise<number[]> {
  if (!Number.isFinite(nmId) || nmId <= 0) return [];

  const card = await fetchCardByNmId(token, nmId);
  if (card) {
    const fromCard = collectChrtIds(card);
    if (fromCard.length > 0) return fromCard;
  }

  const fromFilter = await resolveChrtIdsFromGoodsFilter(token, nmId);
  if (fromFilter.length > 0) return fromFilter;

  const fromSizeNm = await resolveChrtIdsFromPricesApi(token, nmId);
  if (fromSizeNm.length > 0) return fromSizeNm;

  let cursor: { updatedAt: string; nmID: number } | undefined;
  for (let page = 0; page < CARDS_MAX_PAGES; page += 1) {
    const response = await fetchCardsPage(token, cursor);
    for (const cardPage of response.cards ?? []) {
      if (cardPage.nmID !== nmId) continue;
      const ids = collectChrtIds(cardPage);
      if (ids.length > 0) return ids;
    }
    const nextUpdatedAt = response.cursor?.updatedAt;
    const nextNmId = response.cursor?.nmID;
    if ((response.cards?.length ?? 0) < CARDS_PAGE_SIZE || !nextUpdatedAt || !nextNmId) break;
    cursor = { updatedAt: nextUpdatedAt, nmID: nextNmId };
  }

  return [];
}

function collectPhotoUrls(card: WbContentCard): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const p of card.photos ?? []) {
    const url = p.big ?? p.c246x328 ?? p.square;
    if (url && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

function characteristicValueFilled(raw: unknown): boolean {
  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === "string") return raw.trim().length > 0;
  return raw != null;
}

function countFilledCharacteristics(value: unknown): number | undefined {
  if (!Array.isArray(value)) return undefined;
  let filled = 0;
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    if (characteristicValueFilled((row as { value?: unknown }).value)) filled += 1;
  }
  return filled;
}

function filledCharacteristicNames(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const names: string[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const named = row as { name?: unknown; value?: unknown };
    if (!characteristicValueFilled(named.value)) continue;
    if (typeof named.name === "string" && named.name.trim()) names.push(named.name.trim());
  }
  return names;
}

/** Заполненные характеристики карточки с значениями: основа для правдивых правок текста. Не больше 40 строк по 120 знаков, чтобы снимок не раздувался. */
export function filledCharacteristicValues(value: unknown): Array<{ id?: number; name: string; value: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: Array<{ id?: number; name: string; value: string }> = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const named = row as { id?: unknown; name?: unknown; value?: unknown };
    if (!characteristicValueFilled(named.value) || typeof named.name !== "string" || !named.name.trim()) continue;
    const raw = named.value;
    const text = (Array.isArray(raw) ? raw.map((x) => String(x)).join(", ") : String(raw)).replace(/\s+/g, " ").trim().slice(0, 120);
    if (text) out.push({ ...(typeof named.id === "number" ? { id: named.id } : {}), name: named.name.trim(), value: text });
    if (out.length >= 40) break;
  }
  return out;
}

/** Справочник категории меняется редко — обновляем раз в неделю. */
const CHARC_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** За один sync не тянем все subjectId сразу: остаток — в следующую синхронизацию. */
const CHARC_FETCH_BUDGET = 40;

export type CategoryCharc = { id: number; name: string; required: boolean; /** 1 — текст (список значений), 4 — число. */ type: number | null; unit: string | null; maxCount: number | null };

export type CategoryCharcCacheEntry = {
  names: string[];
  requiredNames: string[];
  /** Характеристики категории с идентификаторами: нужны, чтобы агент мог заполнять недостающие. Может не быть в старых записях кэша. */
  charcs?: CategoryCharc[];
  loadedAt: string;
};

export type CategoryCharcMeta = {
  withDictionary: number;
  withoutDictionary: number;
  pending: number;
};

const categoryCharcMemory = new Map<number, CategoryCharcCacheEntry>();

function charcEntryFresh(entry: CategoryCharcCacheEntry, now = Date.now()): boolean {
  const loaded = Date.parse(entry.loadedAt);
  return Number.isFinite(loaded) && now - loaded < CHARC_TTL_MS;
}

function applyCharcEntry(items: SellerCatalogItem[], subjectId: number, entry: CategoryCharcCacheEntry) {
  for (const item of items) {
    if (item.subjectId !== subjectId) continue;
    item.categoryCharcCount = entry.names.length;
    item.categoryCharcNames = entry.names;
    item.categoryCharcRequiredNames = entry.requiredNames;
    item.categoryCharcs = entry.charcs;
  }
}

async function fetchSubjectCharcs(
  token: string,
  subjectId: number,
): Promise<CategoryCharcCacheEntry | null> {
  await throttle(cardsThrottle, CARDS_MIN_INTERVAL_MS);
  const res = await wbFetch(token, `${CONTENT_BASE}/content/v2/object/charcs/${subjectId}?locale=ru`);
  if (!res.ok) return null;
  const parsed = parseJson<{ data?: Array<{ charcID?: number; name?: string; required?: boolean; unitName?: string; maxCount?: number; charcType?: number }> }>(res.text);
  const rows = parsed?.data ?? [];
  const charcs: CategoryCharc[] = rows
    .filter((row) => typeof row.charcID === "number" && row.charcID > 0 && typeof row.name === "string" && row.name.trim())
    .map((row) => ({ id: row.charcID as number, name: (row.name as string).trim(), required: row.required === true, type: typeof row.charcType === "number" ? row.charcType : null, unit: row.unitName?.trim() || null, maxCount: typeof row.maxCount === "number" ? row.maxCount : null }));
  const names = rows.map((row) => row.name?.trim() ?? "").filter((name) => name.length > 0);
  const requiredNames = rows
    .filter((row) => row.required === true)
    .map((row) => row.name?.trim() ?? "")
    .filter((name) => name.length > 0);
  return { names, requiredNames, charcs, loadedAt: new Date().toISOString() };
}

function seedCharcMemory(previous?: Record<string, CategoryCharcCacheEntry>) {
  if (!previous) return;
  for (const [key, entry] of Object.entries(previous)) {
    const subjectId = Number(key);
    if (!Number.isFinite(subjectId) || subjectId <= 0 || !entry?.names || !entry.loadedAt) continue;
    const existing = categoryCharcMemory.get(subjectId);
    if (!existing || Date.parse(entry.loadedAt) >= Date.parse(existing.loadedAt)) {
      categoryCharcMemory.set(subjectId, {
        names: entry.names,
        requiredNames: entry.requiredNames ?? [],
        charcs: entry.charcs,
        loadedAt: entry.loadedAt,
      });
    }
  }
}

async function attachCategoryCharcs(
  token: string,
  items: SellerCatalogItem[],
  previousCache?: Record<string, CategoryCharcCacheEntry>,
): Promise<{ meta: CategoryCharcMeta; cache: Record<string, CategoryCharcCacheEntry> }> {
  seedCharcMemory(previousCache);
  const subjects = [
    ...new Set(
      items
        .map((item) => item.subjectId)
        .filter((id): id is number => id != null && id > 0),
    ),
  ];
  const toFetch: number[] = [];
  for (const subjectId of subjects) {
    const cached = categoryCharcMemory.get(subjectId);
    if (cached && charcEntryFresh(cached)) {
      applyCharcEntry(items, subjectId, cached);
    } else {
      toFetch.push(subjectId);
    }
  }

  const fetchNow = toFetch.slice(0, CHARC_FETCH_BUDGET);
  let pending = toFetch.length - fetchNow.length;
  for (const subjectId of fetchNow) {
    try {
      const entry = await fetchSubjectCharcs(token, subjectId);
      if (!entry) {
        pending += 1;
        continue;
      }
      categoryCharcMemory.set(subjectId, entry);
      applyCharcEntry(items, subjectId, entry);
    } catch {
      pending += 1;
    }
  }

  const cache: Record<string, CategoryCharcCacheEntry> = {};
  let withDictionary = 0;
  let withoutDictionary = 0;
  for (const subjectId of subjects) {
    const entry = categoryCharcMemory.get(subjectId);
    if (entry && items.some((item) => item.subjectId === subjectId && item.categoryCharcNames != null)) {
      cache[String(subjectId)] = entry;
      withDictionary += 1;
    } else {
      withoutDictionary += 1;
    }
  }

  return {
    meta: { withDictionary, withoutDictionary, pending },
    cache,
  };
}

function mapCard(card: WbContentCard): SellerCatalogItem {
  const nmId = card.nmID ?? 0;
  const skus = collectSkus(card);
  const chrtIds = collectChrtIds(card);
  const imageUrls = collectPhotoUrls(card);
  const photo = imageUrls[0];

  return {
    id: `wb:${nmId}`,
    marketplaceId: "wildberries",
    externalId: String(nmId),
    vendorCode: card.vendorCode?.trim() || "—",
    title: card.title?.trim() || `Артикул ${nmId}`,
    brand: card.brand?.trim() || undefined,
    category: card.subjectName?.trim() || undefined,
    subjectId: card.subjectID ?? null,
    description: card.description?.trim() || undefined,
    imageUrl: photo,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    videoUrl: card.video?.trim() || undefined,
    dimensions: card.dimensions
      ? {
          length: card.dimensions.length,
          width: card.dimensions.width,
          height: card.dimensions.height,
          weightKg: card.dimensions.weightBrutto,
        }
      : undefined,
    price: null,
    discountedPrice: null,
    discountPercent: null,
    stockFbo: null,
    stockFbs: null,
    totalStock: null,
    barcode: skus[0],
    skus,
    chrtIds: chrtIds.length > 0 ? chrtIds : undefined,
    sizesCount: card.sizes?.length ?? null,
    filledCharacteristics: countFilledCharacteristics(card.characteristics),
    characteristicNames: filledCharacteristicNames(card.characteristics),
    characteristics: filledCharacteristicValues(card.characteristics),
    promotionIds: [],
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}

/* ------------------------------------------------------------------ */
/* Цены и скидки                                                       */
/* ------------------------------------------------------------------ */

export type WbGoodsPrice = {
  nmID?: number;
  discount?: number;
  clubDiscount?: number;
  wholesaleDiscountThreshold?: Array<{ minQuantity?: number; wholesaleDiscount?: number; level?: number }>;
  sizes?: Array<Record<string, unknown>>;
};

export type WbPriceRow = {
  price: number | null;
  discountedPrice: number | null;
  discountPercent: number | null;
  clubDiscount: number | null;
  clubPrice: number | null;
  wholesaleDiscount: number | null;
  wholesaleMinQty: number | null;
};

function mapGoodsPriceRow(row: WbGoodsPrice): WbPriceRow | null {
  if (!row.nmID) return null;
  const picked = pickBestSizePrice(row.sizes);
  const discountPercent = typeof row.discount === "number" ? row.discount : null;
  const clubDiscount = typeof row.clubDiscount === "number" && row.clubDiscount > 0 ? row.clubDiscount : null;
  let clubPrice: number | null = null;
  for (const size of row.sizes ?? []) {
    const value = normalizeWbMoney(size.clubDiscountedPrice);
    if (value != null && (clubPrice == null || value < clubPrice)) clubPrice = value;
  }
  const wholesale = (row.wholesaleDiscountThreshold ?? [])
    .filter((level) => (level.wholesaleDiscount ?? 0) > 0)
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))[0];

  return {
    price: picked.price,
    discountedPrice: picked.discountedPrice,
    discountPercent,
    clubDiscount,
    clubPrice,
    wholesaleDiscount: wholesale?.wholesaleDiscount ?? null,
    wholesaleMinQty: wholesale?.minQuantity ?? null,
  };
}

async function fetchPricesPage(
  token: string,
  offset: number
): Promise<{ rows: WbGoodsPrice[]; errorText?: string }> {
  await throttle(pricesThrottle, PRICES_MIN_INTERVAL_MS);

  const res = await wbFetch(
    token,
    `${PRICES_BASE}/api/v2/list/goods/filter?limit=${PRICES_PAGE_SIZE}&offset=${offset}`
  );

  const payload = parseJson<{
    data?: { listGoods?: WbGoodsPrice[] };
    error?: boolean;
    errorText?: string;
  }>(res.text);

  if (!res.ok) {
    throw new WildberriesApiError(
      res.status === 401 || res.status === 403
        ? "Нет доступа к категории «Цены и скидки»"
        : payload?.errorText || `Wildberries Prices API вернул ${res.status}`,
      res.status,
      payload?.errorText
    );
  }

  if (payload?.error) {
    throw new WildberriesApiError(payload.errorText || "Wildberries Prices API вернул ошибку", 502);
  }

  return { rows: payload?.data?.listGoods ?? [], errorText: payload?.errorText };
}

async function fetchPricesMap(token: string): Promise<Map<number, WbPriceRow>> {
  const map = new Map<number, WbPriceRow>();

  for (let page = 0; page < PRICES_MAX_PAGES; page += 1) {
    const offset = page * PRICES_PAGE_SIZE;
    const { rows } = await fetchPricesPage(token, offset);

    for (const row of rows) {
      const mapped = mapGoodsPriceRow(row);
      if (mapped && row.nmID) map.set(row.nmID, mapped);
    }

    if (rows.length < PRICES_PAGE_SIZE) break;
  }

  return map;
}

export async function fetchGoodsRowsByNmIds(
  token: string,
  nmIds: number[]
): Promise<Map<number, WbGoodsPrice>> {
  const map = new Map<number, WbGoodsPrice>();
  if (nmIds.length === 0) return map;

  for (let i = 0; i < nmIds.length; i += 100) {
    const chunk = nmIds.slice(i, i + 100);
    await throttle(pricesThrottle, PRICES_MIN_INTERVAL_MS);

    const res = await wbFetch(token, `${PRICES_BASE}/api/v2/list/goods/filter`, {
      method: "POST",
      body: { nmList: chunk },
    });

    const payload = parseJson<{
      data?: { listGoods?: WbGoodsPrice[] };
      error?: boolean;
      errorText?: string;
    }>(res.text);

    if (!res.ok || payload?.error) continue;

    for (const row of payload?.data?.listGoods ?? []) {
      if (row.nmID) map.set(row.nmID, row);
    }
  }

  return map;
}

export async function fetchPricesByNmIds(
  token: string,
  nmIds: number[]
): Promise<Map<number, WbPriceRow>> {
  const map = new Map<number, WbPriceRow>();
  const rows = await fetchGoodsRowsByNmIds(token, nmIds);
  for (const [nmId, row] of rows) {
    const mapped = mapGoodsPriceRow(row);
    if (mapped) map.set(nmId, mapped);
  }
  return map;
}

/** Типичная активная скидка продавца — запасной вариант для возврата в автоакцию. */
export async function fetchTypicalSellerDiscount(token: string): Promise<number | null> {
  const discounts: number[] = [];
  for (let page = 0; page < 3; page += 1) {
    const { rows } = await fetchPricesPage(token, page * PRICES_PAGE_SIZE);
    for (const row of rows) {
      if (typeof row.discount === "number" && row.discount > 0) {
        discounts.push(Math.round(row.discount));
      }
    }
    if (rows.length < PRICES_PAGE_SIZE) break;
  }
  if (discounts.length === 0) return null;
  discounts.sort((a, b) => a - b);
  return discounts[Math.floor(discounts.length / 2)];
}

export function inferGoodsBasePrice(row: WbGoodsPrice): number | null {
  const picked = pickBestSizePrice(row.sizes);
  const base = picked.price ?? picked.discountedPrice;
  return base != null && base > 0 ? Math.round(base) : null;
}

export function inferGoodsDiscountPercent(row: WbGoodsPrice): number | null {
  if (typeof row.discount === "number" && row.discount > 0) {
    return Math.round(row.discount);
  }
  const picked = pickBestSizePrice(row.sizes);
  if (picked.price && picked.discountedPrice && picked.discountedPrice < picked.price) {
    return Math.round((1 - picked.discountedPrice / picked.price) * 100);
  }
  return null;
}

export function inferGoodsDiscountedPrice(row: WbGoodsPrice): number | null {
  const picked = pickBestSizePrice(row.sizes);
  if (picked.discountedPrice != null && picked.discountedPrice > 0) {
    return Math.round(picked.discountedPrice);
  }
  const base = inferGoodsBasePrice(row);
  const discount = inferGoodsDiscountPercent(row);
  if (base != null && discount != null && discount > 0) {
    return Math.round(base * (1 - discount / 100));
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Остатки FBO (Analytics) + FBS (Marketplace)                         */
/* ------------------------------------------------------------------ */

type WbWarehouse = { id?: number; name?: string };

async function fetchSellerWarehouses(token: string): Promise<WbWarehouse[]> {
  await throttle(marketplaceThrottle, MARKETPLACE_MIN_INTERVAL_MS);
  const res = await wbFetch(token, `${MARKETPLACE_BASE}/api/v3/warehouses`);
  if (!res.ok) {
    throw new WildberriesApiError(
      res.status === 401 || res.status === 403
        ? "Нет доступа к категории «Маркетплейс» для FBS-остатков"
        : `Wildberries Marketplace API вернул ${res.status}`,
      res.status
    );
  }
  const payload = parseJson<WbWarehouse[] | { data?: WbWarehouse[] }>(res.text);
  if (Array.isArray(payload)) return payload;
  return payload?.data ?? [];
}

async function fetchFbsStocksForWarehouse(
  token: string,
  warehouseId: number,
  keys: { skus: string[]; chrtIds: number[] }
): Promise<{ bySku: Map<string, number>; byChrtId: Map<number, number> }> {
  const bySku = new Map<string, number>();
  const byChrtId = new Map<number, number>();

  if (keys.chrtIds.length > 0) {
    for (let i = 0; i < keys.chrtIds.length; i += FBS_SKU_BATCH) {
      const batch = keys.chrtIds.slice(i, i + FBS_SKU_BATCH);
      await throttle(marketplaceThrottle, MARKETPLACE_MIN_INTERVAL_MS);

      const res = await wbFetch(token, `${MARKETPLACE_BASE}/api/v3/stocks/${warehouseId}`, {
        method: "POST",
        body: { chrtIds: batch },
      });

      if (!res.ok) continue;

      const payload = parseJson<{
        stocks?: Array<{ chrtId?: number; sku?: string; amount?: number; quantity?: number }>;
      }>(res.text);

      for (const row of payload?.stocks ?? []) {
        const qty = row.amount ?? row.quantity ?? 0;
        const chrtId = row.chrtId ?? (row as { chrtID?: number }).chrtID;
        if (chrtId != null) byChrtId.set(chrtId, qty);
        if (row.sku) bySku.set(row.sku, qty);
      }
    }
    return { bySku, byChrtId };
  }

  for (let i = 0; i < keys.skus.length; i += FBS_SKU_BATCH) {
    const batch = keys.skus.slice(i, i + FBS_SKU_BATCH);
    await throttle(marketplaceThrottle, MARKETPLACE_MIN_INTERVAL_MS);

    const res = await wbFetch(token, `${MARKETPLACE_BASE}/api/v3/stocks/${warehouseId}`, {
      method: "POST",
      body: { skus: batch },
    });

    if (!res.ok) continue;

    const payload = parseJson<{
      stocks?: Array<{ sku?: string; amount?: number; quantity?: number }>;
    }>(res.text);

    for (const row of payload?.stocks ?? []) {
      if (!row.sku) continue;
      const qty = row.amount ?? row.quantity ?? 0;
      bySku.set(row.sku, qty);
    }
  }

  return { bySku, byChrtId };
}

async function fetchFbsStocksMap(
  token: string,
  items: SellerCatalogItem[]
): Promise<Map<number, number>> {
  const warehouses = await fetchSellerWarehouses(token);
  if (warehouses.length === 0) return new Map();

  const skuToNmId = new Map<string, number>();
  const chrtToNmId = new Map<number, number>();
  const allSkus: string[] = [];
  const allChrtIds: number[] = [];

  for (const item of items) {
    const nmId = Number(item.externalId);
    if (!Number.isFinite(nmId)) continue;
    for (const chrtId of item.chrtIds ?? []) {
      chrtToNmId.set(chrtId, nmId);
      allChrtIds.push(chrtId);
    }
    for (const sku of item.skus ?? []) {
      skuToNmId.set(sku, nmId);
      allSkus.push(sku);
    }
  }

  if (allChrtIds.length === 0 && allSkus.length === 0) return new Map();

  const nmTotals = new Map<number, number>();

  for (const warehouse of warehouses) {
    if (!warehouse.id) continue;
    const stocks = await fetchFbsStocksForWarehouse(token, warehouse.id, {
      skus: allSkus,
      chrtIds: allChrtIds,
    });
    if (allChrtIds.length > 0) {
      for (const [chrtId, qty] of stocks.byChrtId) {
        const nmId = chrtToNmId.get(chrtId);
        if (nmId == null) continue;
        nmTotals.set(nmId, (nmTotals.get(nmId) ?? 0) + qty);
      }
    } else {
      for (const [sku, qty] of stocks.bySku) {
        const nmId = skuToNmId.get(sku);
        if (nmId == null) continue;
        nmTotals.set(nmId, (nmTotals.get(nmId) ?? 0) + qty);
      }
    }
  }

  return nmTotals;
}

/* ------------------------------------------------------------------ */
/* Акции (Календарь акций)                                             */
/* ------------------------------------------------------------------ */

type WbCalendarPromotion = {
  id?: number;
  name?: string;
  type?: string;
  startDateTime?: string;
  endDateTime?: string;
};

type WbCalendarPromotionDetails = WbCalendarPromotion & {
  description?: string;
  advantages?: string[];
  inPromoActionTotal?: number;
  inPromoActionLeftovers?: number;
  notInPromoActionTotal?: number;
  participationPercentage?: number;
  exceptionProductsCount?: number;
  ranging?: Array<{ condition?: string; participationRate?: number; boost?: number }>;
};

type PromoNmRow = {
  nmId: number;
  inAction?: boolean;
  price?: number;
  planPrice?: number;
  planDiscount?: number;
};

function extractCalendarPromotions<T extends WbCalendarPromotion>(payload: unknown): T[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const data = root.data;
  if (data && typeof data === "object") {
    const nested = (data as Record<string, unknown>).promotions;
    if (Array.isArray(nested)) return nested as T[];
  }
  if (Array.isArray(root.promotions)) return root.promotions as T[];
  return [];
}

function readPromoNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function extractNomenclatures(payload: unknown): PromoNmRow[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const data = root.data;
  const nested =
    data && typeof data === "object" ? (data as Record<string, unknown>).nomenclatures : root.nomenclatures;
  if (!Array.isArray(nested)) return [];
  const rows: PromoNmRow[] = [];
  for (const raw of nested) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const idRaw = row.nmID ?? row.nmId ?? row.id;
    const nmId = typeof idRaw === "number" ? idRaw : Number(idRaw);
    if (!Number.isFinite(nmId) || nmId <= 0) continue;
    rows.push({
      nmId,
      inAction: typeof row.inAction === "boolean" ? row.inAction : undefined,
      price: readPromoNumber(row.price),
      planPrice: readPromoNumber(row.planPrice),
      planDiscount: readPromoNumber(row.planDiscount),
    });
  }
  return rows;
}

function promoParticipationCount(details: WbCalendarPromotionDetails): number {
  return details.inPromoActionTotal ?? details.inPromoActionLeftovers ?? 0;
}

/** Активна ли акция в заданное время */
function isPromoActive(startAt: string | undefined, endAt: string | undefined, now: Date): boolean {
  const started = !startAt || new Date(startAt) <= now;
  const notEnded = !endAt || new Date(endAt) >= now;
  return started && notEnded;
}

async function fetchPromotionListPage(
  token: string,
  start: Date,
  end: Date,
  allPromo: boolean,
  offset: number
): Promise<WbCalendarPromotion[]> {
  const pageParams = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    allPromo: allPromo ? "true" : "false",
    limit: "100",
    offset: String(offset),
  });
  await throttle(calendarThrottle, CALENDAR_MIN_INTERVAL_MS);
  const res = await wbFetch(
    token,
    `${CALENDAR_BASE}/api/v1/calendar/promotions?${pageParams}`
  );
  if (!res.ok) return [];
  return extractCalendarPromotions<WbCalendarPromotion>(parseJson(res.text));
}

function buildPromotionIdsParams(promotionIds: string[]): URLSearchParams {
  const params = new URLSearchParams();
  for (const id of promotionIds) params.append("promotionIDs", id);
  return params;
}

async function fetchPromotionDetailsBatch(
  token: string,
  promotionIds: string[]
): Promise<WbCalendarPromotionDetails[]> {
  if (promotionIds.length === 0) return [];

  const params = buildPromotionIdsParams(promotionIds);

  await throttle(calendarThrottle, CALENDAR_MIN_INTERVAL_MS);
  const res = await wbFetch(
    token,
    `${CALENDAR_BASE}/api/v1/calendar/promotions/details?${params}`
  );

  if (!res.ok) {
    throw new WildberriesApiError(
      res.status === 401 || res.status === 403
        ? "Нет доступа к деталям акций"
        : `Wildberries Calendar API (details) вернул ${res.status}`,
      res.status
    );
  }

  return extractCalendarPromotions<WbCalendarPromotionDetails>(parseJson(res.text));
}

type CalendarPromotionsResult = {
  rows: SellerPromotionRow[];
  /** ID акций из allPromo=false — доступны для участия ваших товаров */
  eligibleIds: Set<string>;
};

/** Загружает акции WB с inPromoActionTotal из details. */
async function fetchCalendarPromotions(token: string): Promise<CalendarPromotionsResult> {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  const end = new Date(now);
  end.setDate(end.getDate() + 60);

  const byId = new Map<number, WbCalendarPromotion>();
  const eligibleIds = new Set<string>();
  let firstCallOk = false;

  // allPromo=false — акции, куда ваши товары могут войти; allPromo=true — все акции WB
  for (const allPromo of [false, true]) {
    for (let offset = 0; offset < 300; offset += 100) {
      const pageRows = await fetchPromotionListPage(token, start, end, allPromo, offset);
      if (pageRows.length === 0) break;
      firstCallOk = true;
      for (const row of pageRows) {
        if (row.id == null) continue;
        byId.set(row.id, row);
        if (!allPromo) eligibleIds.add(String(row.id));
      }
      if (pageRows.length < 100) break;
    }
  }

  if (!firstCallOk) {
    throw new WildberriesApiError(
      "Нет доступа к категории «Цены и скидки / Календарь акций»",
      403
    );
  }

  const allRows = [...byId.values()];
  if (allRows.length === 0) return { rows: [], eligibleIds };

  const ids = allRows.map((p) => String(p.id!));
  const detailedById = new Map<number, WbCalendarPromotionDetails>();
  for (let i = 0; i < ids.length; i += PROMO_DETAILS_BATCH) {
    const batch = ids.slice(i, i + PROMO_DETAILS_BATCH);
    try {
      const chunk = await fetchPromotionDetailsBatch(token, batch);
      for (const row of chunk) {
        if (row.id != null) detailedById.set(row.id, row);
      }
    } catch {
      /* batch без деталей — останутся данные из списка */
    }
  }

  const rows = allRows
    .filter((row) => row.id != null)
    .map((listRow) => {
      const p: WbCalendarPromotionDetails = detailedById.get(listRow.id!) ?? listRow;
      const participating = promoParticipationCount(p);
      return {
        id: String(p.id!),
        name: p.name?.trim() || `Акция ${p.id}`,
        description: p.description?.trim() || undefined,
        startAt: p.startDateTime,
        endAt: p.endDateTime,
        type: p.type,
        participatingSkuCount: participating,
        inPromoTotal: p.inPromoActionTotal,
        participationPercent: p.participationPercentage,
        canManageProducts: false,
        advantages: Array.isArray(p.advantages)
          ? p.advantages.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
          : undefined,
        ranging: Array.isArray(p.ranging) ? p.ranging : undefined,
        exceptionProductsCount:
          p.type === "auto" && typeof p.exceptionProductsCount === "number"
            ? p.exceptionProductsCount
            : undefined,
        notInPromoTotal: p.notInPromoActionTotal,
      } satisfies SellerPromotionRow;
    })
    .sort((a, b) => (b.participatingSkuCount ?? 0) - (a.participatingSkuCount ?? 0));

  return { rows, eligibleIds };
}

/** Товары акции из календаря. Для автоакции WB отвечает 422 — тогда список пустой. */
async function fetchPromotionNomenclatures(
  token: string,
  promotionId: string,
  catalogNmIds: Set<number>,
  inAction: boolean,
): Promise<PromoNmRow[]> {
  const collected: PromoNmRow[] = [];

  for (let offset = 0; offset < 5_000; offset += PROMO_NM_BATCH) {
    await throttle(calendarThrottle, CALENDAR_MIN_INTERVAL_MS);

    const params = new URLSearchParams({
      promotionID: promotionId,
      inAction: inAction ? "true" : "false",
      limit: String(PROMO_NM_BATCH),
      offset: String(offset),
    });

    const res = await wbFetch(
      token,
      `${CALENDAR_BASE}/api/v1/calendar/promotions/nomenclatures?${params}`
    );

    if (!res.ok) break;

    const rows = extractNomenclatures(parseJson(res.text));
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!catalogNmIds.has(row.nmId)) continue;
      collected.push(row);
    }

    if (rows.length < PROMO_NM_BATCH) break;
  }

  return collected;
}

function rememberPromoTerms(
  bucket: Record<string, Record<string, { planPrice?: number; planDiscount?: number; price?: number; inAction?: boolean }>>,
  promoId: string,
  row: PromoNmRow,
) {
  if (row.planPrice == null && row.planDiscount == null && row.inAction == null) return;
  const byNm = bucket[promoId] ?? {};
  byNm[String(row.nmId)] = {
    planPrice: row.planPrice,
    planDiscount: row.planDiscount,
    price: row.price,
    inAction: row.inAction,
  };
  bucket[promoId] = byNm;
}

function linkPromoToCatalog(
  promo: SellerPromotionRow,
  nmIds: number[],
  byNmId: Map<number, SellerCatalogItem>
): number {
  const ids = new Set(promo.participantNmIds ?? []);
  let linked = 0;
  for (const nmId of nmIds) {
    const item = byNmId.get(nmId);
    if (!item) continue;
    linked += 1;
    ids.add(nmId);
    if (!(item.promotionIds ?? []).includes(promo.id)) {
      item.promotionIds = [...(item.promotionIds ?? []), promo.id];
    }
  }
  if (ids.size > 0) {
    promo.participantNmIds = [...ids];
    promo.participatingSkuCount = ids.size;
  }
  return linked;
}

/**
 * Если календарь назвал число участников, но не отдал nmID (у автоакции nomenclatures
 * отвечает 422), сверяем публичную карточку с каталогом.
 */
async function attachParticipantsFromPublicCards(
  promos: SellerPromotionRow[],
  byNmId: Map<number, SellerCatalogItem>,
  catalogNmIds: number[],
): Promise<void> {
  const unresolved = promos.filter(
    (promo) => (promo.participantNmIds?.length ?? 0) === 0 && (promo.inPromoTotal ?? 0) > 0,
  );
  if (unresolved.length === 0 || catalogNmIds.length === 0) return;
  const wanted = new Set(
    unresolved.map((promo) => Number(promo.id)).filter((id) => Number.isFinite(id) && id > 0),
  );
  if (wanted.size === 0) return;
  try {
    const cards = await fetchPublicCardInfo(catalogNmIds);
    const found = new Map<string, number[]>();
    for (const info of cards.values()) {
      for (const pid of info.promotionIds) {
        if (!wanted.has(pid)) continue;
        const key = String(pid);
        const list = found.get(key) ?? [];
        list.push(info.nmId);
        found.set(key, list);
      }
    }
    for (const promo of unresolved) {
      const ids = found.get(promo.id);
      if (ids && ids.length > 0) linkPromoToCatalog(promo, ids, byNmId);
    }
  } catch {
    /* публичная карточка необязательна: без неё останется честный пустой список */
  }
}

function applyStockToItem(item: SellerCatalogItem, fbo: number | null, fbs: number | null) {
  item.stockFbo = fbo;
  item.stockFbs = fbs;
  if (fbo != null || fbs != null) {
    item.totalStock = (fbo ?? 0) + (fbs ?? 0);
  }
}

/* ------------------------------------------------------------------ */
/* Публичное API                                                       */
/* ------------------------------------------------------------------ */

export async function verifyWildberriesContentAccess(token: string): Promise<{
  ok: true;
  sellerName: string | null;
  sampleCount: number;
  totalCards: number | null;
  scopes: SellerHubScopeState;
}> {
  const page = await fetchCardsPage(token);
  const [sellerName, scopes] = await Promise.all([
    fetchWildberriesSellerName(token),
    probeWildberriesScopes(token),
  ]);

  return {
    ok: true,
    sellerName,
    sampleCount: page.cards?.length ?? 0,
    totalCards: page.cursor?.total ?? null,
    scopes: { ...scopes, content: true },
  };
}

export async function syncWildberriesCatalog(
  token: string,
  options?: { categoryCharcCache?: Record<string, CategoryCharcCacheEntry> },
): Promise<SellerCatalogSnapshot> {
  const items: SellerCatalogItem[] = [];
  const byNmId = new Map<number, SellerCatalogItem>();
  let cursor: { updatedAt: string; nmID: number } | undefined;
  let truncated = false;

  for (let page = 0; page < CARDS_MAX_PAGES; page += 1) {
    const response = await fetchCardsPage(token, cursor);
    const batch = response.cards ?? [];

    for (const card of batch) {
      if (!card.nmID) continue;
      const item = mapCard(card);
      items.push(item);
      byNmId.set(card.nmID, item);
    }

    const nextUpdatedAt = response.cursor?.updatedAt;
    const nextNmId = response.cursor?.nmID;
    if (batch.length < CARDS_PAGE_SIZE || !nextUpdatedAt || !nextNmId) break;

    cursor = { updatedAt: nextUpdatedAt, nmID: nextNmId };
    if (page === CARDS_MAX_PAGES - 1) truncated = true;
  }

  const warnings: string[] = [];
  const scopes: SellerHubScopeState = { content: true };

  const nmIds = items
    .map((i) => Number(i.externalId))
    .filter((n) => Number.isFinite(n));

  const charcsPromise = attachCategoryCharcs(token, items, options?.categoryCharcCache);

  const [pricesResult, fbsResult, promotionsResult, charcsResult] = await Promise.allSettled([
    fetchPricesMap(token),
    fetchFbsStocksMap(token, items),
    fetchCalendarPromotions(token),
    charcsPromise,
  ]);

  let categoryCharcMeta: CategoryCharcMeta | undefined;
  let categoryCharcCache: Record<string, CategoryCharcCacheEntry> | undefined;
  if (charcsResult.status === "fulfilled") {
    categoryCharcMeta = charcsResult.value.meta;
    categoryCharcCache = charcsResult.value.cache;
    if (charcsResult.value.meta.pending > 0) {
      warnings.push(
        `Справочник характеристик: ${charcsResult.value.meta.withDictionary} категорий загружено, ${charcsResult.value.meta.pending} отложено на следующий sync.`,
      );
    }
  } else {
    warnings.push(
      charcsResult.reason instanceof Error
        ? charcsResult.reason.message
        : "Справочник характеристик категорий не загрузился.",
    );
  }

  let pricesMap = new Map<number, WbPriceRow>();

  if (pricesResult.status === "fulfilled") {
    scopes.prices = true;
    pricesMap = pricesResult.value;
  } else {
    scopes.prices = false;
    warnings.push(
      pricesResult.reason instanceof Error
        ? pricesResult.reason.message
        : "Цены не загрузились: проверьте категорию «Цены и скидки»."
    );
  }

  if (pricesMap.size > 0) {
    for (const [nmId, row] of pricesMap) {
      const item = byNmId.get(nmId);
      if (!item) continue;
      item.price = row.price;
      item.discountedPrice = row.discountedPrice;
      item.discountPercent = row.discountPercent;
      item.clubDiscount = row.clubDiscount;
      item.clubPrice = row.clubPrice;
      item.wholesaleDiscount = row.wholesaleDiscount;
      item.wholesaleMinQty = row.wholesaleMinQty;
    }
  }

  const missingPriceNmIds = items
    .filter((i) => (i.discountedPrice ?? i.price) == null)
    .map((i) => Number(i.externalId))
    .filter((n) => Number.isFinite(n));

  if (missingPriceNmIds.length > 0 && scopes.prices !== false) {
    try {
      const fallback = await fetchPricesByNmIds(token, missingPriceNmIds);
      for (const [nmId, row] of fallback) {
        const item = byNmId.get(nmId);
        if (!item) continue;
        item.price = row.price;
        item.discountedPrice = row.discountedPrice;
        item.discountPercent = row.discountPercent;
        item.clubDiscount = row.clubDiscount;
        item.clubPrice = row.clubPrice;
        item.wholesaleDiscount = row.wholesaleDiscount;
        item.wholesaleMinQty = row.wholesaleMinQty;
      }
    } catch {
      /* доп. запрос необязателен */
    }
  }

  const withPrice = items.filter((i) => (i.discountedPrice ?? i.price) != null).length;
  if (scopes.prices && withPrice === 0 && items.length > 0) {
    warnings.push(
      "Цены не пришли из WB API — проверьте, что товары выведены в продажу и категория «Цены и скидки» включена."
    );
  }

  let fboMap = new Map<number, number>();
  try {
    fboMap = await fetchWbFboStocksMap(token, nmIds);
    if (fboMap.size > 0) scopes.stocks = true;
    scopes.analytics = true;
  } catch (e) {
    if (fboMap.size === 0) scopes.stocks = false;
    warnings.push(
      e instanceof Error
        ? e.message
        : "Остатки FBO не загрузились: нужна категория «Аналитика»."
    );
  }

  let fbsMap = new Map<number, number>();
  if (fbsResult.status === "fulfilled") {
    fbsMap = fbsResult.value;
    if (fbsMap.size > 0) scopes.stocks = true;
  } else if (fboMap.size === 0) {
    warnings.push(
      fbsResult.reason instanceof Error
        ? fbsResult.reason.message
        : "Остатки FBS не загрузились: нужна категория «Маркетплейс»."
    );
  }

  for (const item of items) {
    const nmId = Number(item.externalId);
    if (!Number.isFinite(nmId)) continue;
    const fbo = fboMap.has(nmId) ? fboMap.get(nmId)! : fboMap.size > 0 ? 0 : null;
    const fbs = fbsMap.has(nmId) ? fbsMap.get(nmId)! : fbsMap.size > 0 ? 0 : null;
    applyStockToItem(item, fbo, fbs);
  }

  let promotions: SellerPromotionRow[] = [];
  const promotionEntryTerms: Record<
    string,
    Record<string, { planPrice?: number; planDiscount?: number; price?: number; inAction?: boolean }>
  > = {};
  if (promotionsResult.status === "fulfilled") {
    scopes.promotion = true;
    const { rows: allFromCalendar, eligibleIds } = promotionsResult.value;
    const now = new Date();
    const catalogNmIds = new Set(nmIds);

    const activeOrUpcoming = allFromCalendar.filter(
      (p) => isPromoActive(p.startAt, p.endAt, now) || (p.endAt && new Date(p.endAt) >= now)
    );

    // Сначала акции с подтверждённым участием, потом доступные для входа
    const candidates = [...activeOrUpcoming].sort((a, b) => {
      const aScore =
        (a.inPromoTotal ?? a.participatingSkuCount ?? 0) * 10 + (eligibleIds.has(a.id) ? 1 : 0);
      const bScore =
        (b.inPromoTotal ?? b.participatingSkuCount ?? 0) * 10 + (eligibleIds.has(b.id) ? 1 : 0);
      return bScore - aScore;
    });

    const enriched: SellerPromotionRow[] = [];
    let nomenclatureCalls = 0;
    const MAX_NOMENCLATURE_CALLS = 25;
    let autoTermsCalls = 0;
    const MAX_AUTO_TERMS_CALLS = 8;

    for (const promo of candidates) {
      const apiCount = promo.inPromoTotal ?? promo.participatingSkuCount ?? 0;
      promo.canManageProducts = promo.type !== "auto";

      if (promo.type === "auto") {
        if (apiCount <= 0) continue;
        if (autoTermsCalls < MAX_AUTO_TERMS_CALLS) {
          autoTermsCalls += 1;
          try {
            const { fetchPromotionNomenclatureTerms } = await import(
              "./promotions-write-client"
            );
            const promotionId = Number(promo.id);
            const [participating, eligible] = await Promise.all([
              fetchPromotionNomenclatureTerms(token, promotionId, true),
              fetchPromotionNomenclatureTerms(token, promotionId, false),
            ]);
            const confirmed: number[] = [];
            const remember = (
              row: { nmId: number; planPrice?: number; planDiscount?: number; price?: number; inAction?: boolean },
              inPromo: boolean,
            ) => {
              if (!catalogNmIds.has(row.nmId)) return;
              const byNm = promotionEntryTerms[promo.id] ?? {};
              const prev = byNm[String(row.nmId)];
              byNm[String(row.nmId)] = {
                planPrice: row.planPrice ?? prev?.planPrice,
                planDiscount: row.planDiscount ?? prev?.planDiscount,
                price: row.price ?? prev?.price,
                inAction: inPromo || prev?.inAction === true || row.inAction === true,
              };
              promotionEntryTerms[promo.id] = byNm;
              if (inPromo || row.inAction === true) confirmed.push(row.nmId);
            };
            for (const row of participating) remember(row, true);
            for (const row of eligible) remember(row, false);
            if (confirmed.length > 0) linkPromoToCatalog(promo, confirmed, byNmId);
          } catch {
            /* автоакция: nomenclatures официально неприменим */
          }
        }
        if ((promo.participatingSkuCount ?? 0) === 0) promo.participatingSkuCount = apiCount;
        enriched.push(promo);
        continue;
      }

      if (nomenclatureCalls < MAX_NOMENCLATURE_CALLS) {
        nomenclatureCalls += 1;
        const inRows = await fetchPromotionNomenclatures(token, promo.id, catalogNmIds, true);
        const outRows = await fetchPromotionNomenclatures(token, promo.id, catalogNmIds, false);
        for (const row of [...inRows, ...outRows]) rememberPromoTerms(promotionEntryTerms, promo.id, row);
        const participating = inRows.filter((row) => row.inAction !== false).map((row) => row.nmId);
        if (participating.length > 0) {
          linkPromoToCatalog(promo, participating, byNmId);
          enriched.push(promo);
          continue;
        }
        if (outRows.length > 0) {
          enriched.push(promo);
          continue;
        }
      }

      if (apiCount > 0) {
        promo.participatingSkuCount = apiCount;
        enriched.push(promo);
      }
    }

    await attachParticipantsFromPublicCards(enriched, byNmId, nmIds);

    promotions = enriched.sort(
      (a, b) => (b.participatingSkuCount ?? 0) - (a.participatingSkuCount ?? 0)
    );

    if (promotions.length === 0 && allFromCalendar.length > 0) {
      warnings.push(
        `WB вернул ${allFromCalendar.length} акций, но inPromoActionTotal = 0 для всех. Проверьте категорию «Цены и скидки» в токене и нажмите «Обновить данные».`
      );
    }
  } else {
    scopes.promotion = false;
    warnings.push(
      promotionsResult.reason instanceof Error
        ? promotionsResult.reason.message
        : "Акции не загрузились: нужна категория «Цены и скидки» в токене."
    );
  }

  let analytics: SellerAnalyticsSummary | undefined;
  try {
    const summary = await fetchWbSalesSummary(token);
    analytics = {
      periodStart: summary.periodStart,
      periodEnd: summary.periodEnd,
      ordersTotal: summary.ordersTotal,
      revenueTotal: summary.revenueTotal,
      buyoutsTotal: summary.buyoutsTotal,
      avgOrderValue: summary.avgOrderValue,
      daily: summary.daily,
      currency: summary.currency,
    };
    scopes.analytics = true;
  } catch (e) {
    if (!scopes.analytics) scopes.analytics = false;
    warnings.push(
      e instanceof Error
        ? e.message
        : "Аналитика продаж не загрузилась: нужна категория «Аналитика»."
    );
  }

  let orders: SellerOrdersSummary | undefined;
  try {
    orders = await fetchWbOrdersSummary(token);
    scopes.marketplace = true;
  } catch (e) {
    scopes.marketplace = false;
    warnings.push(
      e instanceof Error ? e.message : "Заказы FBS не загрузились: нужна категория «Маркетплейс»."
    );
  }

  let supplies: SellerSuppliesSnapshot | undefined;
  try {
    const fbs = await fetchWbFbsSupplies(token);
    const fbsSnapshot = buildFbsSuppliesSnapshot(fbs);
    let fbw: Awaited<ReturnType<typeof fetchWbFbwSupplies>> = [];
    try {
      fbw = await fetchWbFbwSupplies(token);
      scopes.supplies = true;
    } catch (e) {
      scopes.supplies = false;
      if (fbs.length === 0) {
        warnings.push(
          e instanceof Error ? e.message : "Поставки FBO не загрузились: нужна категория «Поставки»."
        );
      }
    }
    const merged = dedupeSupplyRows([...fbsSnapshot.supplies, ...fbw]);
    supplies = {
      openCount: merged.filter((s) => !s.done).length,
      closedCount: merged.filter((s) => s.done).length,
      supplies: merged.slice(0, 200),
    };
    if (merged.length > 0) scopes.marketplace = true;
  } catch (e) {
    scopes.marketplace = scopes.marketplace ?? false;
    warnings.push(
      e instanceof Error ? e.message : "Поставки FBS не загрузились: нужна категория «Маркетплейс»."
    );
  }

  let ads: SellerAdsSnapshot | undefined;
  try {
    ads = await fetchWbAdsSnapshot(token);
    scopes.advert = true;
  } catch (e) {
    scopes.advert = false;
    warnings.push(
      e instanceof Error ? e.message : "Рекламные кампании не загрузились: нужна категория «Продвижение»."
    );
  }

  if (truncated) {
    warnings.push(`Загружены первые ${items.length} карточек — остальные подтянем в следующих версиях.`);
  }

  let comms: SellerCatalogSnapshot["comms"];
  let finance: SellerCatalogSnapshot["finance"];
  try {
    const extras = await fetchCabinetExtras(token);
    comms = extras.comms;
    finance = extras.finance;
    warnings.push(...extras.warnings);
  } catch (e) {
    warnings.push(e instanceof Error ? e.message : "Дополнительные данные кабинета не загрузились.");
  }

  return {
    marketplaceId: "wildberries",
    items,
    syncedAt: new Date().toISOString(),
    totalCount: items.length,
    truncated,
    scopes,
    promotions,
    promotionEntryTerms:
      Object.keys(promotionEntryTerms).length > 0 ? promotionEntryTerms : undefined,
    analytics,
    orders,
    supplies,
    ads,
    comms,
    finance,
    warnings,
    categoryCharcCache,
    categoryCharcMeta,
  };
}
