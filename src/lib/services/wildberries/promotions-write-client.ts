import {
  fetchGoodsRowsByNmIds,
  inferGoodsBasePrice,
  inferGoodsDiscountedPrice,
  inferGoodsDiscountPercent,
  type WbGoodsPrice,
} from "./content-client";
import { WildberriesApiError } from "./client";
import {
  applyWbDiscountRestore,
  updateWbPrices,
  waitForWbPriceUpload,
} from "./prices-write-client";

const CALENDAR_BASE = "https://dp-calendar-api.wildberries.ru";
const REQUEST_TIMEOUT_MS = 30_000;

export type PromoNomenclatureTerms = {
  nmId: number;
  price?: number;
  planPrice?: number;
  discount?: number;
  planDiscount?: number;
  inAction?: boolean;
};

function normalizeToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new WildberriesApiError("API-токен не указан", 400);
  return trimmed.startsWith("Bearer ") ? trimmed.slice(7).trim() : trimmed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function wbFetch(
  token: string,
  url: string,
  init?: { method?: "GET" | "POST" | "PUT" | "PATCH"; body?: unknown }
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

function humanizeWbHttpError(text: string, status: number): string {
  const body = parseJson<{
    title?: string;
    detail?: string;
    message?: string;
    error?: string;
    errorText?: string;
    data?: { errorText?: string };
  }>(text);

  const raw =
    body?.errorText?.trim() ||
    body?.data?.errorText?.trim() ||
    body?.detail?.trim() ||
    body?.message?.trim() ||
    body?.error?.trim() ||
    "";

  const title = body?.title?.trim() ?? "";
  const genericTitle =
    /^unprocessable entity$/i.test(title) ||
    /^bad request$/i.test(title) ||
    /^error$/i.test(title);

  if (raw && !/^unprocessable entity$/i.test(raw)) return raw;
  if (status === 422) {
    return "Wildberries отклонил запрос: проверьте цену и скидку в кабинете WB";
  }
  if (status === 403) return "Нет доступа к API акций Wildberries (категория «Цены и скидки»)";
  if (status === 401) return "Токен Wildberries недействителен или просрочен";
  if (!genericTitle && title) return title;
  return `Ошибка Wildberries (${status})`;
}

function extractApiError(text: string, status: number): string {
  return humanizeWbHttpError(text, status);
}

function parseWbNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/\s/g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function extractNomenclatureTerms(payload: unknown): PromoNomenclatureTerms[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const data = root.data;
  const rows =
    data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).nomenclatures)
      ? ((data as Record<string, unknown>).nomenclatures as Array<Record<string, unknown>>)
      : Array.isArray(root.nomenclatures)
        ? (root.nomenclatures as Array<Record<string, unknown>>)
        : [];

  const terms: PromoNomenclatureTerms[] = [];
  for (const row of rows) {
    const rawId = row.nmID ?? row.nmId ?? row.id;
    const nmId = typeof rawId === "number" ? rawId : Number(rawId);
    if (!Number.isFinite(nmId) || nmId <= 0) continue;

    terms.push({
      nmId,
      price: parseWbNumber(row.price),
      planPrice: parseWbNumber(row.planPrice),
      discount: parseWbNumber(row.discount),
      planDiscount: parseWbNumber(row.planDiscount),
      inAction: typeof row.inAction === "boolean" ? row.inAction : undefined,
    });
  }
  return terms;
}

/** Товары акции с условиями planPrice/planDiscount из Calendar API. */
/** Что именно ответил WB — нужно, чтобы не гадать, почему порог не определился. */
export type NomenclatureProbe = {
  status: number;
  rowsSeen: number;
  matched: number;
  withPlanPrice: number;
};

export async function fetchPromotionNomenclatureTerms(
  token: string,
  promotionId: number,
  inAction: boolean,
  requested?: number[],
  probe?: NomenclatureProbe
): Promise<PromoNomenclatureTerms[]> {
  const requestedSet = requested ? new Set(requested) : null;
  const collected: PromoNomenclatureTerms[] = [];

  for (let offset = 0; offset < 5_000; offset += 100) {
    const params = new URLSearchParams({
      promotionID: String(promotionId),
      inAction: inAction ? "true" : "false",
      limit: "100",
      offset: String(offset),
    });

    const res = await wbFetch(
      token,
      `${CALENDAR_BASE}/api/v1/calendar/promotions/nomenclatures?${params}`
    );

    if (probe) probe.status = res.status;
    if (!res.ok) break;

    const rows = extractNomenclatureTerms(parseJson(res.text));
    if (probe) probe.rowsSeen += rows.length;
    if (rows.length === 0) break;

    for (const row of rows) {
      if (requestedSet && !requestedSet.has(row.nmId)) continue;
      collected.push(row);
      if (probe) {
        probe.matched += 1;
        if (row.planPrice != null && row.planPrice > 0) probe.withPlanPrice += 1;
      }
    }

    if (rows.length < 100) break;
    if (requestedSet && collected.length >= requestedSet.size) break;
  }

  return collected;
}

function parseCalendarUploadId(text: string): number | undefined {
  const body = parseJson<{
    data?: { uploadID?: number; uploadId?: number; id?: number };
    uploadID?: number;
  }>(text);
  const id = body?.data?.uploadID ?? body?.data?.uploadId ?? body?.data?.id ?? body?.uploadID;
  return typeof id === "number" && Number.isFinite(id) ? id : undefined;
}

async function uploadToPromotion(
  token: string,
  promotionId: number,
  nmIds: number[]
): Promise<{ ok: boolean; status: number; text: string; uploadId?: number }> {
  const payload = {
    data: {
      promotionID: promotionId,
      uploadNow: true,
      nomenclatures: nmIds,
    },
  };

  const res = await wbFetch(token, `${CALENDAR_BASE}/api/v1/calendar/promotions/upload`, {
    method: "POST",
    body: payload,
  });

  if (!res.ok) {
    return { ok: false, status: res.status, text: res.text };
  }

  return {
    ok: true,
    status: res.status,
    text: res.text,
    uploadId: parseCalendarUploadId(res.text),
  };
}

export type PromoTermsHint = {
  /** Порог входа в акцию по этому товару — только настоящее значение от WB. */
  planPrice?: number;
  planDiscount?: number;
  /** Цена со скидкой, при которой товар фактически участвовал в этой акции. */
  qualifiedPrice?: number;
};

/**
 * planPrice — верхняя граница цены участия (макс. цена со скидкой, «до 2780 ₽»).
 * Считаем минимальную скидку, при которой цена ≤ planPrice.
 */
export function computePromoEntryDiscountPercent(
  basePrice: number,
  term: Pick<PromoNomenclatureTerms, "planDiscount" | "planPrice">,
  opts?: { allowPlanDiscountOnly?: boolean }
): number | null {
  if (!Number.isFinite(basePrice) || basePrice <= 0) return null;

  const fromPlanPrice =
    term.planPrice != null && term.planPrice > 0 && term.planPrice < basePrice
      ? computeMinimumDiscountForMaxPrice(basePrice, term.planPrice)
      : null;

  const fromPlanDiscount =
    term.planDiscount != null && term.planDiscount > 0
      ? Math.round(term.planDiscount)
      : null;

  if (fromPlanPrice != null) {
    return Math.min(99, Math.max(1, fromPlanPrice));
  }
  if (fromPlanDiscount != null && opts?.allowPlanDiscountOnly) {
    return Math.min(99, Math.max(1, fromPlanDiscount));
  }

  return null;
}

/** Минимальный % скидки, чтобы цена не превышала planPrice (верхний порог WB). */
function computeMinimumDiscountForMaxPrice(
  basePrice: number,
  maxAllowedPrice: number
): number {
  let discount = Math.ceil((1 - maxAllowedPrice / basePrice) * 100);
  while (
    discount <= 99 &&
    !discountMeetsPlanPrice(basePrice, discount, maxAllowedPrice)
  ) {
    discount += 1;
  }
  while (discount > 1 && discountMeetsPlanPrice(basePrice, discount - 1, maxAllowedPrice)) {
    discount -= 1;
  }
  return Math.min(99, Math.max(1, discount));
}

function discountedPriceRub(basePrice: number, discountPercent: number): number {
  return basePrice * (1 - discountPercent / 100);
}

function planPriceFromDiscount(basePrice: number, discountPercent: number): number {
  return Math.round(discountedPriceRub(basePrice, discountPercent));
}

function discountMeetsPlanPrice(
  basePrice: number,
  discountPercent: number,
  planPrice: number
): boolean {
  return discountedPriceRub(basePrice, discountPercent) <= planPrice + 0.5;
}

function mergePromoTerm(
  into: Map<number, PromoNomenclatureTerms>,
  row: PromoNomenclatureTerms
): void {
  const prev = into.get(row.nmId);
  if (!prev) {
    into.set(row.nmId, row);
    return;
  }
  const score = (t: PromoNomenclatureTerms) =>
    (t.planPrice != null && t.planPrice > 0 ? 4 : 0) +
    (t.planDiscount != null && t.planDiscount > 0 ? 2 : 0) +
    (t.price != null && t.price > 0 ? 1 : 0);
  if (score(row) > score(prev)) {
    into.set(row.nmId, { ...prev, ...row });
    return;
  }
  if (score(row) === score(prev)) {
    const merged = { ...prev, ...row };
    if (
      prev.planPrice != null &&
      prev.planPrice > 0 &&
      row.planPrice != null &&
      row.planPrice > 0
    ) {
      merged.planPrice = Math.max(prev.planPrice, row.planPrice);
    }
    into.set(row.nmId, merged);
  }
}

/** Условия акции по nmID: inAction=false, затем true, при нехватке — полный обход каталога акции. */
async function resolvePromotionTermsForNmIds(
  token: string,
  promotionId: number,
  nmIds: number[]
): Promise<Map<number, PromoNomenclatureTerms>> {
  const wanted = new Set(nmIds.filter((id) => Number.isFinite(id) && id > 0));
  const byNmId = new Map<number, PromoNomenclatureTerms>();
  if (wanted.size === 0) return byNmId;

  for (const inAction of [false, true] as const) {
    const rows = await fetchPromotionNomenclatureTerms(token, promotionId, inAction, [...wanted]);
    for (const row of rows) mergePromoTerm(byNmId, row);
  }

  if (byNmId.size < wanted.size) {
    for (let offset = 0; offset < 5_000; offset += 100) {
      const params = new URLSearchParams({
        promotionID: String(promotionId),
        inAction: "false",
        limit: "100",
        offset: String(offset),
      });
      const res = await wbFetch(
        token,
        `${CALENDAR_BASE}/api/v1/calendar/promotions/nomenclatures?${params}`
      );
      if (!res.ok) break;
      const rows = extractNomenclatureTerms(parseJson(res.text));
      if (rows.length === 0) break;
      for (const row of rows) {
        if (wanted.has(row.nmId)) mergePromoTerm(byNmId, row);
      }
      if (byNmId.size >= wanted.size) break;
      if (rows.length < 100) break;
    }
  }

  return byNmId;
}

function applyPromoTermsHints(
  termsByNmId: Map<number, PromoNomenclatureTerms>,
  hints?: Record<number, PromoTermsHint>
): void {
  if (!hints) return;
  for (const [rawId, hint] of Object.entries(hints)) {
    const nmId = Number(rawId);
    if (!Number.isFinite(nmId) || nmId <= 0) continue;
    if (hint.planPrice == null || hint.planPrice <= 0) continue;

    const prev = termsByNmId.get(nmId) ?? { nmId };
    termsByNmId.set(nmId, {
      ...prev,
      planPrice:
        prev.planPrice != null && prev.planPrice > 0
          ? Math.max(hint.planPrice, prev.planPrice)
          : hint.planPrice,
    });
  }
}

/** planPrice из WB nomenclatures — единственный надёжный порог (верхняя граница «до X ₽»). */
async function loadWbNomenclaturePlanPrices(
  token: string,
  promotionId: number,
  nmIds: number[],
  termsByNmId: Map<number, PromoNomenclatureTerms>
): Promise<void> {
  for (const inAction of [false, true] as const) {
    const rows = await fetchPromotionNomenclatureTerms(token, promotionId, inAction, nmIds);
    for (const row of rows) {
      if (row.planPrice == null || row.planPrice <= 0) continue;

      const prev = termsByNmId.get(row.nmId) ?? { nmId: row.nmId };
      const basePrice = row.price ?? prev.price;
      if (basePrice != null && row.planPrice >= basePrice) continue;

      termsByNmId.set(row.nmId, {
        ...prev,
        nmId: row.nmId,
        price: basePrice ?? prev.price,
        planPrice:
          prev.planPrice != null && prev.planPrice > 0
            ? Math.max(prev.planPrice, row.planPrice)
            : row.planPrice,
        planDiscount: undefined,
      });
    }
  }
}

async function enrichTermsWithGoodsPrices(
  token: string,
  terms: PromoNomenclatureTerms[]
): Promise<PromoNomenclatureTerms[]> {
  const missing = terms.filter((t) => t.price == null || t.price <= 0).map((t) => t.nmId);
  if (missing.length === 0) return terms;

  const goods = await fetchGoodsRowsByNmIds(token, missing);
  return terms.map((term) => {
    if (term.price != null && term.price > 0) return term;
    const row = goods.get(term.nmId);
    const base = row ? inferGoodsBasePrice(row) : null;
    return base != null && base > 0 ? { ...term, price: base } : term;
  });
}

async function applyPriceUpdatesAndWait(
  token: string,
  updates: { nmId: number; price?: number; discount?: number }[]
): Promise<{ ok: boolean; error?: string; uploadId?: number }> {
  if (updates.length === 0) {
    return { ok: false, error: "Нет данных для установки цены и скидки акции" };
  }

  const withPriceAndDiscount = updates.filter(
    (u) =>
      u.discount != null &&
      u.discount > 0 &&
      u.price != null &&
      u.price > 0
  );

  if (withPriceAndDiscount.length === updates.length && withPriceAndDiscount.length > 0) {
    const combined = await updateWbPrices(token, withPriceAndDiscount);
    if (combined.ok) {
      if (combined.uploadId == null) {
        return { ok: false, error: "WB не вернул номер загрузки. Применилась ли цена, неизвестно." };
      }
      const waited = await waitForWbPriceUpload(token, combined.uploadId);
      if (!waited.ok) return { ok: false, error: waited.error, uploadId: combined.uploadId };
      return { ok: true, uploadId: combined.uploadId };
    }
  }

  const withDiscount = updates.filter((u) => u.discount != null && u.discount > 0);
  if (withDiscount.length === updates.length) {
    const restored = await applyWbDiscountRestore(
      token,
      withDiscount.map((u) => ({
        nmId: u.nmId,
        discount: u.discount!,
        price: u.price,
      }))
    );
    if (restored.ok) return restored;
  }

  const result = await updateWbPrices(token, updates);
  if (!result.ok) {
    return { ok: false, error: result.error ?? "Не удалось установить цену и скидку акции" };
  }

  if (result.uploadId == null) {
    return { ok: false, error: "WB не вернул номер загрузки. Применилась ли цена, неизвестно." };
  }
  const waited = await waitForWbPriceUpload(token, result.uploadId);
  if (!waited.ok) return { ok: false, error: waited.error, uploadId: result.uploadId };
  return { ok: true, uploadId: result.uploadId };
}

async function verifyDiscountsApplied(
  token: string,
  expected: Map<number, number>,
  termsByNmId?: Map<number, PromoNomenclatureTerms>
): Promise<{ ok: boolean; missing: number[] }> {
  const nmIds = [...expected.keys()];
  const rows = await fetchGoodsRowsByNmIds(token, nmIds);
  const missing: number[] = [];

  for (const [nmId, targetDiscount] of expected) {
    const row = rows.get(nmId);
    const applied = row ? inferGoodsDiscountPercent(row) : null;
    const basePrice = row ? inferGoodsBasePrice(row) : null;
    const term = termsByNmId?.get(nmId);

    if (applied != null && basePrice != null && term?.planPrice != null && term.planPrice > 0) {
      if (discountMeetsPlanPrice(basePrice, applied, term.planPrice)) continue;
    }
    if (applied != null && Math.abs(applied - targetDiscount) <= 1) continue;
    missing.push(nmId);
  }

  return { ok: missing.length === 0, missing };
}

export type PromoCatalogHint = {
  basePrice?: number;
  discountedPrice?: number;
  discountPercent?: number;
};

type PromoAddResult = {
  ok: boolean;
  error?: string;
  warning?: string;
  uploadId?: number;
  addedCount?: number;
  verified?: boolean;
  confirmedNmIds?: number[];
  /** Фактически применённая скидка по товарам — подтверждённое значение для истории. */
  appliedDiscounts?: Record<number, number>;
  savedPromoTerms?: Record<number, PromoTermsHint>;
};

type PromoAddOpts = {
  useCalendarUpload: boolean;
  promoTermsByNmId?: Record<number, PromoTermsHint>;
  discountByNmId?: Record<number, number>;
  catalogByNmId?: Record<number, PromoCatalogHint>;
};

function applyLegacyDiscountHints(
  termsByNmId: Map<number, PromoNomenclatureTerms>,
  discountByNmId?: Record<number, number>
): void {
  if (!discountByNmId) return;
  for (const [rawId, discount] of Object.entries(discountByNmId)) {
    const nmId = Number(rawId);
    if (!Number.isFinite(nmId) || nmId <= 0 || discount <= 0) continue;
    const prev = termsByNmId.get(nmId) ?? { nmId };
    const roundedDiscount = Math.round(discount);
    const basePrice =
      prev.price != null && prev.price > 0 ? prev.price : undefined;
    const derivedPlanPrice =
      basePrice != null && basePrice > 0
        ? planPriceFromDiscount(basePrice, roundedDiscount)
        : undefined;

    termsByNmId.set(nmId, {
      ...prev,
      planDiscount: roundedDiscount,
      planPrice:
        prev.planPrice != null &&
        prev.planPrice > 0 &&
        !isSuspiciousAutoPlanPrice(basePrice ?? prev.price ?? 0, prev.planPrice, prev)
          ? prev.planPrice
          : derivedPlanPrice != null &&
              basePrice != null &&
              !isSuspiciousAutoPlanPrice(basePrice, derivedPlanPrice, {
                planDiscount: roundedDiscount,
              })
            ? derivedPlanPrice
            : prev.planPrice,
    });
  }
}

function applyCatalogHints(
  termsByNmId: Map<number, PromoNomenclatureTerms>,
  catalogByNmId?: Record<number, PromoCatalogHint>
): void {
  if (!catalogByNmId) return;
  for (const [rawId, hint] of Object.entries(catalogByNmId)) {
    const nmId = Number(rawId);
    if (!Number.isFinite(nmId) || nmId <= 0 || !hint) continue;
    const prev = termsByNmId.get(nmId) ?? { nmId };
    const basePrice =
      hint.basePrice != null && hint.basePrice > 0
        ? hint.basePrice
        : prev.price != null && prev.price > 0
          ? prev.price
          : undefined;

    if (basePrice != null && prev.price == null) {
      prev.price = basePrice;
    }

    termsByNmId.set(nmId, prev);
  }
}

/** Порог <5% или совпадает с planDiscount — скорее текущая цена, а не условие акции. */
function isSuspiciousAutoPlanPrice(
  basePrice: number,
  planPrice: number,
  term?: Pick<PromoNomenclatureTerms, "planDiscount">
): boolean {
  if (basePrice <= 0 || planPrice <= 0 || planPrice >= basePrice) return true;
  const impliedDiscount = (1 - planPrice / basePrice) * 100;
  if (impliedDiscount < 3) return true;
  if (
    term?.planDiscount != null &&
    term.planDiscount > 0 &&
    Math.abs(impliedDiscount - term.planDiscount) <= 1.5
  ) {
    return true;
  }
  return false;
}


/** planDiscount без planPrice (часто 3% от WB) — не порог участия, удаляем всегда. */
function stripPlanDiscountWithoutPlanPrice(
  termsByNmId: Map<number, PromoNomenclatureTerms>,
  nmIds: number[]
): void {
  for (const nmId of nmIds) {
    const prev = termsByNmId.get(nmId);
    if (!prev) continue;
    if (prev.planPrice != null && prev.planPrice > 0) {
      if (prev.planDiscount != null) {
        termsByNmId.set(nmId, { ...prev, planDiscount: undefined });
      }
      continue;
    }
    termsByNmId.set(nmId, { ...prev, planDiscount: undefined, planPrice: undefined });
  }
}

/**
 * Обычная акция: planPrice берём из WB nomenclatures (там он реально доступен),
 * поэтому расчёт надёжен — поднимаем скидку шагами, пока цена не впишется в porog,
 * и подтверждаем по фактической цене/скидке товара после каждой попытки.
 */
async function escalateAutoPromoDiscountsUntilMet(
  token: string,
  updates: { nmId: number; price: number; discount: number }[],
  termsByNmId: Map<number, PromoNomenclatureTerms>
): Promise<{ ok: boolean; error?: string; uploadId?: number }> {
  let lastUploadId: number | undefined;

  for (const update of updates) {
    const term = termsByNmId.get(update.nmId);
    const planPrice = term?.planPrice;
    let discount =
      planPrice != null && planPrice > 0
        ? computeMinimumDiscountForMaxPrice(update.price, planPrice)
        : update.discount;

    let applied = false;

    for (let attempt = 0; attempt <= 4; attempt += 1) {
      const priced = await applyPriceUpdatesAndWait(token, [
        { nmId: update.nmId, price: update.price, discount },
      ]);
      if (!priced.ok) return { ok: false, error: priced.error };
      lastUploadId = priced.uploadId;

      await sleep(attempt === 0 ? 800 : 1_200);

      const rows = await fetchGoodsRowsByNmIds(token, [update.nmId]);
      const row = rows.get(update.nmId);
      const basePrice = (row ? inferGoodsBasePrice(row) : null) ?? update.price;
      const appliedDiscount = row ? inferGoodsDiscountPercent(row) : null;

      if (planPrice == null || planPrice <= 0) {
        if (appliedDiscount != null && Math.abs(appliedDiscount - discount) <= 1) {
          update.discount = appliedDiscount;
          applied = true;
          break;
        }
      } else if (
        appliedDiscount != null &&
        basePrice > 0 &&
        discountMeetsPlanPrice(basePrice, appliedDiscount, planPrice)
      ) {
        update.discount = appliedDiscount;
        applied = true;
        break;
      }

      if (planPrice != null && discount < 99) {
        discount += 1;
        continue;
      }
      break;
    }

    if (!applied) {
      const thresholdHint =
        planPrice != null && planPrice > 0
          ? ` (цена должна быть ≤ ${Math.round(planPrice)} ₽)`
          : "";
      return {
        ok: false,
        error: `WB не применил скидку для nmID ${update.nmId}${thresholdHint}.`,
      };
    }
  }

  return { ok: true, uploadId: lastUploadId };
}

async function mergeFullPromotionTerms(
  token: string,
  promotionId: number,
  termsByNmId: Map<number, PromoNomenclatureTerms>,
  nmIds: number[]
): Promise<void> {
  const allTerms = await fetchAllPromotionEntryTermsMap(token, promotionId);
  for (const nmId of nmIds) {
    const row = allTerms.get(nmId);
    if (row) mergePromoTerm(termsByNmId, row);
  }
}

function inferPeerPromoPlanPrice(
  termsByNmId: Map<number, PromoNomenclatureTerms>,
  nmIds: number[],
  allTerms: Map<number, PromoNomenclatureTerms>
): void {
  const peerPlanPrices: number[] = [];
  for (const term of allTerms.values()) {
    if (term.planPrice != null && term.planPrice > 0) {
      peerPlanPrices.push(term.planPrice);
    }
  }
  if (peerPlanPrices.length === 0) return;

  const lenientPlanPrice = Math.max(...peerPlanPrices);

  for (const nmId of nmIds) {
    const prev = termsByNmId.get(nmId) ?? { nmId };
    if (prev.planPrice != null && prev.planPrice > 0) continue;
    termsByNmId.set(nmId, { ...prev, planPrice: lenientPlanPrice });
  }
}

/** Если nmID нет в nomenclatures — оцениваем planPrice по похожим товарам той же акции. */
function inferPlanPriceFromSimilarProducts(
  termsByNmId: Map<number, PromoNomenclatureTerms>,
  nmIds: number[],
  allTerms: Map<number, PromoNomenclatureTerms>,
  goods: Map<number, WbGoodsPrice>
): void {
  const peers = [...allTerms.values()].filter(
    (t) =>
      t.planPrice != null &&
      t.planPrice > 0 &&
      t.price != null &&
      t.price > 0 &&
      t.planPrice < t.price
  );
  if (peers.length === 0) return;

  for (const nmId of nmIds) {
    const prev = termsByNmId.get(nmId) ?? { nmId };
    if (prev.planPrice != null && prev.planPrice > 0) continue;

    const row = goods.get(nmId);
    const basePrice =
      prev.price != null && prev.price > 0
        ? prev.price
        : row
          ? inferGoodsBasePrice(row)
          : null;
    if (basePrice == null || basePrice <= 0) continue;

    const estimates: number[] = [];
    for (const peer of peers) {
      if (!peer.planPrice || !peer.price) continue;
      const delta = Math.abs(peer.price - basePrice);
      if (delta / basePrice > 0.35) continue;

      const ratio = peer.planPrice / peer.price;
      let estimated = Math.round(basePrice * ratio);
      if (estimated >= basePrice) estimated = Math.round(peer.planPrice);
      if (estimated > 0 && estimated < basePrice) estimates.push(estimated);
    }
    if (estimates.length === 0) continue;

    termsByNmId.set(nmId, {
      ...prev,
      price: basePrice,
      planPrice: Math.max(...estimates),
    });
  }
}

function buildPromoPriceUpdates(
  terms: PromoNomenclatureTerms[],
  goods: Map<number, WbGoodsPrice>
): {
  updates: { nmId: number; price: number; discount: number }[];
  errors: string[];
  skippedNmIds: number[];
} {
  const updates: { nmId: number; price: number; discount: number }[] = [];
  const errors: string[] = [];
  const skippedNmIds: number[] = [];

  for (const term of terms) {
    const row = goods.get(term.nmId);
    const basePrice =
      term.price != null && term.price > 0
        ? term.price
        : row
          ? inferGoodsBasePrice(row)
          : null;

    if (basePrice == null || basePrice <= 0) {
      errors.push(`nmID ${term.nmId}: нет базовой цены для расчёта скидки акции`);
      continue;
    }

    const targetDiscount = computePromoEntryDiscountPercent(basePrice, term);
    if (targetDiscount == null || targetDiscount <= 0) {
      errors.push(
        `nmID ${term.nmId}: нет planDiscount/planPrice — не удалось рассчитать скидку для акции`
      );
      continue;
    }

    const currentDiscount = row ? inferGoodsDiscountPercent(row) : null;
    if (currentDiscount != null && currentDiscount > 0) {
      const meetsPlanPrice =
        term.planPrice != null &&
        term.planPrice > 0 &&
        discountMeetsPlanPrice(basePrice, currentDiscount, term.planPrice);
      if (meetsPlanPrice) {
        skippedNmIds.push(term.nmId);
        continue;
      }
    }

    updates.push({
      nmId: term.nmId,
      price: Math.round(basePrice),
      discount: targetDiscount,
    });
  }

  return { updates, errors, skippedNmIds };
}

async function verifyProductsInPromotion(
  token: string,
  promotionId: number,
  nmIds: number[]
): Promise<{ confirmed: number[]; missing: number[] }> {
  if (nmIds.length === 0) return { confirmed: [], missing: [] };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) await sleep(800);
    const inPromo = await fetchPromotionNomenclatureTerms(token, promotionId, true, nmIds);
    const confirmedSet = new Set(
      inPromo.filter((r) => r.inAction === true).map((r) => r.nmId)
    );
    const confirmed = nmIds.filter((id) => confirmedSet.has(id));
    const missing = nmIds.filter((id) => !confirmedSet.has(id));
    if (missing.length === 0) return { confirmed, missing: [] };
    if (attempt === 4) return { confirmed, missing };
  }

  return { confirmed: [], missing: nmIds };
}

/** Calendar uploadID не отслеживается через Prices API — ждём появления в nomenclatures. */
async function waitForCalendarPromotionUpload(
  token: string,
  promotionId: number,
  nmIds: number[]
): Promise<{ ok: boolean; error?: string; confirmed: number[] }> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (attempt > 0) await sleep(1_000);
    const { confirmed, missing } = await verifyProductsInPromotion(token, promotionId, nmIds);
    if (missing.length === 0) return { ok: true, confirmed };
    if (attempt === 9) {
      return {
        ok: false,
        confirmed,
        error: `WB не подтвердил участие в акции (nmID: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}).`,
      };
    }
  }

  return { ok: false, confirmed: [], error: "WB не подтвердил участие в акции" };
}

/** Все товары, доступные для входа в акцию (inAction=false), с planPrice/planDiscount. */
export async function fetchAllPromotionEntryTermsMap(
  token: string,
  promotionId: number
): Promise<Map<number, PromoNomenclatureTerms>> {
  const byNmId = new Map<number, PromoNomenclatureTerms>();
  // Пороги нужны и по участникам акции (inAction=true), иначе после удаления товара
  // из акции его порог негде взять и возврат перестаёт быть автоматическим.
  const [eligible, participating] = await Promise.all([
    fetchPromotionNomenclatureTerms(token, promotionId, false),
    fetchPromotionNomenclatureTerms(token, promotionId, true),
  ]);
  for (const row of [...eligible, ...participating]) mergePromoTerm(byNmId, row);
  return byNmId;
}

export type PromoEntryTermsResult = {
  terms: Record<number, { planPrice?: number; planDiscount?: number; price?: number }>;
  probe: NomenclatureProbe;
};

/**
 * Пороги входа по конкретным товарам + диагностика ответа WB. Нужно, чтобы интерфейс
 * показывал реальный порог этого товара, а не догадку, и чтобы при отсутствии данных
 * было видно, что именно ответил WB.
 */
export async function fetchPromotionEntryTermsForNmIds(
  token: string,
  promotionId: number,
  nmIds: number[]
): Promise<PromoEntryTermsResult> {
  const probe: NomenclatureProbe = { status: 0, rowsSeen: 0, matched: 0, withPlanPrice: 0 };
  const [eligible, participating] = await Promise.all([
    fetchPromotionNomenclatureTerms(token, promotionId, false, nmIds, probe).catch(() => []),
    fetchPromotionNomenclatureTerms(token, promotionId, true, nmIds, probe).catch(() => []),
  ]);

  const byNmId = new Map<number, PromoNomenclatureTerms>();
  for (const row of [...eligible, ...participating]) mergePromoTerm(byNmId, row);

  const terms: PromoEntryTermsResult["terms"] = {};
  for (const [nmId, term] of byNmId) {
    terms[nmId] = {
      planPrice: term.planPrice,
      planDiscount: term.planDiscount,
      price: term.price,
    };
  }
  return { terms, probe };
}


async function tryCalendarPromotionAdd(
  token: string,
  promotionId: number,
  nmIds: number[],
  alreadyIds: Set<number>
): Promise<PromoAddResult | null> {
  if (nmIds.length === 0) return null;

  const upload = await uploadToPromotion(token, promotionId, nmIds);
  if (!upload.ok) return null;

  const calendarWait = await waitForCalendarPromotionUpload(token, promotionId, nmIds);
  if (calendarWait.ok) {
    return {
      ok: true,
      verified: true,
      uploadId: upload.uploadId,
      addedCount: nmIds.length + alreadyIds.size,
      confirmedNmIds: [...alreadyIds, ...calendarWait.confirmed],
    };
  }

  return null;
}

async function addViaNomenclatureTerms(
  token: string,
  promotionId: number,
  nmIds: number[],
  opts: PromoAddOpts
): Promise<PromoAddResult> {
  const unique = [...new Set(nmIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (unique.length === 0) {
    return { ok: false, error: "Не указаны корректные nmID", verified: false };
  }

  const goods = await fetchGoodsRowsByNmIds(token, unique);

  const alreadyIn = await fetchPromotionNomenclatureTerms(token, promotionId, true, unique);
  const alreadyIds = new Set(alreadyIn.filter((t) => t.inAction === true).map((t) => t.nmId));
  const needWork = unique.filter((id) => !alreadyIds.has(id));
  if (needWork.length === 0) {
    return {
      ok: true,
      verified: true,
      addedCount: unique.length,
      confirmedNmIds: unique,
    };
  }

  const termsByNmId = new Map<number, PromoNomenclatureTerms>();
  await loadWbNomenclaturePlanPrices(token, promotionId, unique, termsByNmId);

  const resolvedTerms = await resolvePromotionTermsForNmIds(token, promotionId, unique);
  for (const [, row] of resolvedTerms) mergePromoTerm(termsByNmId, row);
  await mergeFullPromotionTerms(token, promotionId, termsByNmId, unique);
  await loadWbNomenclaturePlanPrices(token, promotionId, unique, termsByNmId);

  applyPromoTermsHints(termsByNmId, opts.promoTermsByNmId);
  applyCatalogHints(termsByNmId, opts.catalogByNmId);
  for (const nmId of unique) {
    const row = goods.get(nmId);
    const basePrice = row ? inferGoodsBasePrice(row) : null;
    if (basePrice == null || basePrice <= 0) continue;
    const prev = termsByNmId.get(nmId) ?? { nmId };
    if (prev.price == null || prev.price <= 0) {
      termsByNmId.set(nmId, { ...prev, price: basePrice });
    }
  }
  applyLegacyDiscountHints(termsByNmId, opts.discountByNmId);

  stripPlanDiscountWithoutPlanPrice(termsByNmId, unique);

  const allPromoTerms = await fetchAllPromotionEntryTermsMap(token, promotionId);
  inferPeerPromoPlanPrice(termsByNmId, unique, allPromoTerms);
  inferPlanPriceFromSimilarProducts(termsByNmId, unique, allPromoTerms, goods);

  const needWorkGoods = await fetchGoodsRowsByNmIds(token, needWork);

  const termsList = needWork.map((id) => termsByNmId.get(id) ?? { nmId: id });
  const enrichedTerms = await enrichTermsWithGoodsPrices(token, termsList);
  const { updates, errors, skippedNmIds } = buildPromoPriceUpdates(
    enrichedTerms,
    needWorkGoods
  );

  if (updates.length === 0 && skippedNmIds.length === 0) {
    const calendarFallback = await tryCalendarPromotionAdd(
      token,
      promotionId,
      needWork,
      alreadyIds
    );
    if (calendarFallback?.ok) return calendarFallback;

    return {
      ok: false,
      verified: false,
      error:
        errors[0] ??
        `Не удалось подготовить добавление в акцию (nmID: ${needWork.slice(0, 3).join(", ")}).`,
    };
  }

  const expectedDiscounts = new Map<number, number>();
  for (const term of enrichedTerms) {
    const row = needWorkGoods.get(term.nmId);
    const basePrice =
      term.price != null && term.price > 0
        ? term.price
        : row
          ? inferGoodsBasePrice(row)
          : null;
    if (basePrice == null || basePrice <= 0) continue;
    const discount = computePromoEntryDiscountPercent(basePrice, term);
    if (discount != null && discount > 0) {
      expectedDiscounts.set(term.nmId, discount);
    }
  }
  let calendarUploadId: number | undefined;
  const workNmIds = updates.length > 0 ? updates.map((u) => u.nmId) : skippedNmIds;

  if (updates.length === 0) {
    const verify = await verifyProductsInPromotion(token, promotionId, needWork);
    if (verify.missing.length === 0) {
      return {
        ok: true,
        verified: true,
        addedCount: unique.length,
        confirmedNmIds: unique,
      };
    }
    return {
      ok: false,
      verified: false,
      error: `Скидка уже подходит, но WB не подтвердил участие (nmID: ${verify.missing.slice(0, 3).join(", ")}).`,
    };
  }

  const pricedFromPlan = await escalateAutoPromoDiscountsUntilMet(token, updates, termsByNmId);
  if (!pricedFromPlan.ok) {
    return { ok: false, verified: false, error: pricedFromPlan.error };
  }
  const priceUploadId = pricedFromPlan.uploadId;

  const discountCheck = await verifyDiscountsApplied(token, expectedDiscounts, termsByNmId);
  if (!discountCheck.ok) {
    return {
      ok: false,
      verified: false,
      error: `WB не применил скидку акции (nmID: ${discountCheck.missing.slice(0, 3).join(", ")}${discountCheck.missing.length > 3 ? "…" : ""}).`,
    };
  }

  if (opts.useCalendarUpload) {
    const upload = await uploadToPromotion(token, promotionId, workNmIds);
    if (!upload.ok) {
      return {
        ok: false,
        verified: false,
        uploadId: priceUploadId,
        error: extractApiError(upload.text, upload.status),
      };
    }

    calendarUploadId = upload.uploadId;
    const calendarWait = await waitForCalendarPromotionUpload(token, promotionId, workNmIds);
    if (!calendarWait.ok) {
      return {
        ok: false,
        verified: false,
        uploadId: calendarUploadId ?? priceUploadId,
        error: calendarWait.error,
      };
    }

    return {
      ok: true,
      verified: true,
      uploadId: calendarUploadId ?? priceUploadId,
      addedCount: unique.length,
      confirmedNmIds: [...alreadyIds, ...calendarWait.confirmed],
    };
  }

  return {
    ok: true,
    verified: true,
    uploadId: priceUploadId,
    addedCount: unique.length,
    confirmedNmIds: [...alreadyIds, ...workNmIds],
  };
}

/**
 * Обычная акция: planPrice из WB nomenclatures → скидка через Prices API → calendar upload.
 */
export async function addToPromotion(
  token: string,
  promotionId: number,
  nmIds: number[],
  opts?: {
    promoTermsByNmId?: Record<number, PromoTermsHint>;
    catalogByNmId?: Record<number, PromoCatalogHint>;
  }
): Promise<PromoAddResult> {
  return addViaNomenclatureTerms(token, promotionId, nmIds, {
    useCalendarUpload: true,
    promoTermsByNmId: opts?.promoTermsByNmId,
    catalogByNmId: opts?.catalogByNmId,
  });
}

/**
 * Автоакции: WB не даёт надёжного API проверить участие nmID
 * (`nomenclatures` → 422, `details` — шумный агрегат, публичная карточка
 * не подтверждает вход даже на заведомо достаточной скидке).
 *
 * Поэтому холодный подбор 1%…12% отключён. Работает только возврат из кэша
 * KARTO: скидка/цена, сохранённые при «Убрать» или после успешного входа.
 */
export async function addToAutoPromotion(
  token: string,
  promotionId: number,
  nmIds: number[],
  opts?: {
    promoTermsByNmId?: Record<number, PromoTermsHint>;
    discountByNmId?: Record<number, number>;
    catalogByNmId?: Record<number, PromoCatalogHint>;
  }
): Promise<PromoAddResult> {
  void promotionId;
  const unique = [...new Set(nmIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (unique.length === 0) {
    return { ok: false, error: "Не указаны корректные nmID", verified: false };
  }

  const goods = await fetchGoodsRowsByNmIds(token, unique);
  const errors: string[] = [];
  const appliedDiscounts: Record<number, number> = {};
  const confirmedNmIds: number[] = [];
  let uploadId: number | undefined;

  for (const nmId of unique) {
    const row = goods.get(nmId);
    const catalogHint = opts?.catalogByNmId?.[nmId];
    const basePrice =
      catalogHint?.basePrice != null && catalogHint.basePrice > 0
        ? catalogHint.basePrice
        : (row ? inferGoodsBasePrice(row) : null);

    if (basePrice == null || basePrice <= 0) {
      errors.push(`nmID ${nmId}: нет базовой цены`);
      continue;
    }

    const termHint = opts?.promoTermsByNmId?.[nmId];
    const savedDiscount = opts?.discountByNmId?.[nmId];
    const currentDiscount = row ? (inferGoodsDiscountPercent(row) ?? 0) : 0;

    const cachedBase =
      termHint?.qualifiedPrice != null && savedDiscount != null
        ? termHint.qualifiedPrice / (1 - savedDiscount / 100)
        : null;
    const cacheBaseOk =
      cachedBase == null ||
      !Number.isFinite(cachedBase) ||
      Math.abs(cachedBase - basePrice) / basePrice <= 0.03;

    let fastDiscount: number | null = null;
    if (cacheBaseOk) {
      if (
        termHint?.qualifiedPrice != null &&
        termHint.qualifiedPrice > 0 &&
        termHint.qualifiedPrice < basePrice
      ) {
        fastDiscount = computeMinimumDiscountForMaxPrice(basePrice, termHint.qualifiedPrice);
      } else if (savedDiscount != null && savedDiscount > 0) {
        fastDiscount = Math.round(savedDiscount);
      }
    }

    if (fastDiscount == null || fastDiscount <= 0) {
      errors.push(
        `nmID ${nmId}: нет сохранённой скидки. Для автоакций WB не даёт API проверить участие — сначала уберите товар через KARTO (сохраним %) или выставьте скидку в кабинете WB.`
      );
      continue;
    }

    const discount = Math.min(60, Math.max(1, fastDiscount));
    if (currentDiscount >= discount - 0.5) {
      confirmedNmIds.push(nmId);
      appliedDiscounts[nmId] = Math.round(currentDiscount);
      continue;
    }

    const priced = await applyPriceUpdatesAndWait(token, [
      { nmId, price: Math.round(basePrice), discount },
    ]);
    if (priced.ok) {
      uploadId = priced.uploadId ?? uploadId;
      confirmedNmIds.push(nmId);
      appliedDiscounts[nmId] = discount;
    } else {
      errors.push(
        `nmID ${nmId}: не удалось выставить скидку ${discount}% из кэша` +
          (priced.error ? ` (${priced.error})` : "")
      );
    }
  }

  if (confirmedNmIds.length === 0) {
    return {
      ok: false,
      verified: false,
      error: errors[0] ?? "Не удалось вернуть товар в автоакцию",
    };
  }

  return {
    ok: true,
    verified: true,
    uploadId,
    addedCount: confirmedNmIds.length,
    confirmedNmIds,
    appliedDiscounts,
    warning: errors.length > 0 ? errors[0] : undefined,
  };
}

/**
 * Убрать товары из акции — сброс скидки через Prices API.
 */
export async function removeFromPromotion(
  token: string,
  nmIds: number[],
  promotionId?: number
): Promise<{
  ok: boolean;
  error?: string;
  verified?: boolean;
  savedDiscounts?: Record<number, number>;
  savedPromoTerms?: Record<number, PromoTermsHint>;
}> {
  if (nmIds.length === 0) {
    return { ok: true, verified: true, savedDiscounts: {}, savedPromoTerms: {} };
  }

  const savedPromoTerms: Record<number, PromoTermsHint> = {};
  if (promotionId != null && Number.isFinite(promotionId) && promotionId > 0) {
    const terms = await resolvePromotionTermsForNmIds(token, promotionId, nmIds);
    for (const nmId of nmIds) {
      const term = terms.get(nmId);
      if (!term) continue;
      savedPromoTerms[nmId] = {
        planPrice: term.planPrice,
        planDiscount: term.planDiscount,
      };
    }
  }

  const goods = await fetchGoodsRowsByNmIds(token, nmIds);
  const savedDiscounts: Record<number, number> = {};
  const updates: { nmId: number; price?: number; discount: number }[] = [];

  for (const nmId of nmIds) {
    const row = goods.get(nmId);
    const basePrice = row ? inferGoodsBasePrice(row) : null;
    const discountedPrice = row ? inferGoodsDiscountedPrice(row) : null;
    const previousDiscount = row ? inferGoodsDiscountPercent(row) : null;
    if (previousDiscount != null && previousDiscount > 0) {
      savedDiscounts[nmId] = Math.round(previousDiscount);
    }

    const existingTerms = savedPromoTerms[nmId];
    const roundedDiscount =
      previousDiscount != null && previousDiscount > 0
        ? Math.round(previousDiscount)
        : undefined;

    // planPrice сохраняем ТОЛЬКО если это настоящий порог от WB. Текущую цену со
    // скидкой сюда подставлять нельзя: это не порог акции, а лишь цена, при которой
    // товар в акции уже был (она уходит в savedDiscounts/qualifiedPrice отдельно).
    if (roundedDiscount != null || existingTerms != null) {
      savedPromoTerms[nmId] = {
        planPrice: existingTerms?.planPrice,
        planDiscount: existingTerms?.planDiscount ?? roundedDiscount,
        qualifiedPrice:
          discountedPrice != null &&
          discountedPrice > 0 &&
          basePrice != null &&
          basePrice > 0 &&
          discountedPrice < basePrice
            ? Math.round(discountedPrice)
            : undefined,
      };
    }

    updates.push({ nmId, discount: 0 });
  }

  const result = await updateWbPrices(token, updates);
  if (!result.ok) {
    return { ok: false, error: result.error ?? "Не удалось убрать товар из акции", verified: false };
  }

  if (result.uploadId != null) {
    const waited = await waitForWbPriceUpload(token, result.uploadId);
    if (!waited.ok) {
      return { ok: false, error: waited.error, verified: false };
    }
  }

  const after = await fetchGoodsRowsByNmIds(token, nmIds);
  const stillDiscounted = nmIds.filter((id) => {
    const row = after.get(id);
    const d = row ? inferGoodsDiscountPercent(row) : null;
    return d != null && d > 0;
  });

  if (stillDiscounted.length > 0) {
    return {
      ok: false,
      verified: false,
      error: `Скидка не сброшена для nmID: ${stillDiscounted.slice(0, 3).join(", ")}`,
    };
  }

  return { ok: true, verified: true, savedDiscounts, savedPromoTerms };
}
