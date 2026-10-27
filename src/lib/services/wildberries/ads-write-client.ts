import { adDepositWbBody, type AdDepositRequest } from "@/lib/seller-hub/ads-deposit";
import { mergeMinusPhrases, type AdMinusRequest } from "@/lib/seller-hub/ads-minus";
import { checkBidSafety, rubToKopecks, type AdBidRequest } from "@/lib/seller-hub/ads-bid";
import { adCreateWbBody, type AdCreateRequest } from "@/lib/seller-hub/ads-create";
import { adAddNmWbBody, adRemoveNmWbBody, AD_MAX_NMS_PER_CAMPAIGN, type AdAddNmRequest, type AdRemoveNmRequest } from "@/lib/seller-hub/ads-nms";
import { adDailyLimitWbBody, type AdDailyLimitRequest } from "@/lib/seller-hub/ads-daily-limit";
import { type AdPlacementsRequest } from "@/lib/seller-hub/ads-placements";
import { clusterBidKey, type ClusterBidRequest, type ClusterResetRequest } from "@/lib/seller-hub/ads-cluster-bid";
import { WildberriesApiError } from "./client";

const ADVERT_BASE = "https://advert-api.wildberries.ru";
const REQUEST_TIMEOUT_MS = 20_000;

function normalizeToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new WildberriesApiError("API-токен не указан", 400);
  return trimmed.startsWith("Bearer ") ? trimmed.slice(7).trim() : trimmed;
}

async function wbGetFetch(
  token: string,
  url: string
): Promise<{ status: number; ok: boolean; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${normalizeToken(token)}`,
      },
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

async function wbPutFetch(
  token: string,
  url: string,
  body?: unknown
): Promise<{ status: number; ok: boolean; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "PUT",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${normalizeToken(token)}`,
      },
      body: body ? JSON.stringify(body) : undefined,
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

/** POST без повторов: для запросов, двигающих деньги, повторная отправка недопустима. */
async function wbPostFetch(
  token: string,
  url: string,
  body: unknown
): Promise<{ status: number; ok: boolean; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${normalizeToken(token)}`,
      },
      body: JSON.stringify(body),
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

/** PATCH без повторов: запись ставки. */
async function wbPatchFetch(
  token: string,
  url: string,
  body: unknown
): Promise<{ status: number; ok: boolean; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "PATCH",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${normalizeToken(token)}`,
      },
      body: JSON.stringify(body),
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

/**
 * Start or pause a WB ad campaign.
 * GET https://advert-api.wildberries.ru/adv/v0/start?id={campaignId}
 * GET https://advert-api.wildberries.ru/adv/v0/pause?id={campaignId}
 * (v1-методы убраны из документации WB; актуальные — v0.)
 */
export async function toggleWbAdCampaign(
  token: string,
  campaignId: number,
  action: "start" | "pause"
): Promise<{ ok: boolean; error?: string }> {
  const endpoint = action === "start" ? "start" : "pause";
  const res = await wbGetFetch(
    token,
    `${ADVERT_BASE}/adv/v0/${endpoint}?id=${campaignId}`
  );

  if (!res.ok) {
    const body = parseJson<{ title?: string; detail?: string; message?: string; error?: string }>(
      res.text
    );
    const msg =
      body?.detail ?? body?.title ?? body?.message ?? body?.error ?? `Ошибка ${res.status}`;
    return { ok: false, error: msg };
  }

  return { ok: true };
}

/**
 * Update the daily budget for a WB ad campaign.
 * PUT https://advert-api.wildberries.ru/adv/v1/budget/daily?id={campaignId}&dailyBudget={amount}
 */
export async function updateWbAdBudget(
  token: string,
  campaignId: number,
  dailyBudget: number
): Promise<{ ok: boolean; error?: string }> {
  const url = `${ADVERT_BASE}/adv/v1/budget/daily?id=${campaignId}&dailyBudget=${Math.round(dailyBudget)}`;
  const res = await wbPutFetch(token, url);

  if (!res.ok) {
    const body = parseJson<{ title?: string; detail?: string; message?: string; error?: string }>(
      res.text
    );
    const msg =
      body?.detail ?? body?.title ?? body?.message ?? body?.error ?? `Ошибка ${res.status}`;
    return { ok: false, error: msg };
  }

  return { ok: true };
}

/**
 * Пополнить бюджет кампании со счёта продвижения (type 0).
 * POST https://advert-api.wildberries.ru/adv/v1/budget/deposit?id={campaignId}  тело: { sum, type, return }
 * Деньги двигаются: вызывать только после явного подтверждения суммы человеком (см. parseAdDepositRequest).
 */
export async function depositWbAdBudget(
  token: string,
  request: AdDepositRequest
): Promise<{ ok: boolean; error?: string; budget?: number | null }> {
  let res: { status: number; ok: boolean; text: string };
  try {
    res = await wbPostFetch(
      token,
      `${ADVERT_BASE}/adv/v1/budget/deposit?id=${request.campaignId}`,
      adDepositWbBody(request)
    );
  } catch (e) {
    if (e instanceof WildberriesApiError && (e.status === 504 || e.status === 502)) {
      return {
        ok: false,
        error:
          "WB не подтвердил пополнение: неизвестно, прошло ли оно. Проверьте бюджет кампании в кабинете WB и не повторяйте, пока не убедитесь.",
      };
    }
    throw e;
  }

  if (!res.ok) {
    const body = parseJson<{ title?: string; detail?: string; message?: string; error?: string }>(res.text);
    const msg = body?.detail ?? body?.title ?? body?.message ?? body?.error ?? `Ошибка ${res.status}`;
    return { ok: false, error: msg };
  }
  const payload = parseJson<{ total?: number }>(res.text);
  return { ok: true, budget: typeof payload?.total === "number" ? payload.total : null };
}

/**
 * Добавить минус-фразы в кампанию для артикула. WB заменяет список целиком, поэтому сначала читаем
 * уже стоящие фразы и отправляем объединённый список (пустой список никогда не отправляем).
 * POST /adv/v0/normquery/get-minus, затем POST /adv/v0/normquery/set-minus.
 */
export async function addWbAdMinusPhrases(
  token: string,
  request: AdMinusRequest
): Promise<{ ok: boolean; error?: string; added?: string[]; total?: number }> {
  const readRes = await wbPostFetch(token, `${ADVERT_BASE}/adv/v0/normquery/get-minus`, {
    items: [{ advert_id: request.advertId, nm_id: request.nmId }],
  });
  if (!readRes.ok) {
    return { ok: false, error: "Не удалось прочитать текущие минус-фразы: изменения не внесены." };
  }
  const readPayload = parseJson<{ items?: Array<{ advert_id?: number; nm_id?: number; norm_queries?: string[] }> }>(
    readRes.text
  );
  const existingRow = (readPayload?.items ?? []).find(
    (item) => item.advert_id === request.advertId && item.nm_id === request.nmId
  );
  const existing = (existingRow?.norm_queries ?? []).filter((q): q is string => typeof q === "string");
  const { merged, added } = mergeMinusPhrases(existing, request.queries);
  if (added.length === 0) return { ok: true, added: [], total: existing.length };
  if (merged.length < existing.length) {
    return { ok: false, error: "Список минус-фраз стал бы короче: изменения не внесены." };
  }

  const writeRes = await wbPostFetch(token, `${ADVERT_BASE}/adv/v0/normquery/set-minus`, {
    advert_id: request.advertId,
    nm_id: request.nmId,
    norm_queries: merged,
  });
  if (!writeRes.ok) {
    const body = parseJson<{ title?: string; detail?: string; message?: string; error?: string }>(writeRes.text);
    return { ok: false, error: body?.detail ?? body?.title ?? body?.message ?? body?.error ?? `Ошибка ${writeRes.status}` };
  }
  return { ok: true, added, total: merged.length };
}

/**
 * Изменить ставку товара в поиске для CPM-кампании (PATCH /api/advert/v1/bids).
 * Перед записью читаем текущую ставку и минимальную ставку WB и проверяем, что новая ставка не ниже минимальной
 * и не выше текущей более чем втрое (защита от опечатки).
 */
export async function changeWbAdBid(
  token: string,
  request: AdBidRequest
): Promise<{ ok: boolean; error?: string; bidRub?: number }> {
  const readRes = await wbGetFetch(token, `${ADVERT_BASE}/api/advert/v2/adverts?ids=${request.advertId}`);
  if (!readRes.ok) return { ok: false, error: "Не удалось прочитать кампанию: ставка не изменена." };
  const advert = parseJson<{
    adverts?: Array<{
      id?: number;
      settings?: { payment_type?: string };
      nm_settings?: Array<{ nm_id?: number; bids_kopecks?: { search?: number } }>;
    }>;
  }>(readRes.text)?.adverts?.find((a) => a.id === request.advertId);
  if (!advert) return { ok: false, error: "Кампания не найдена: ставка не изменена." };
  if (advert.settings?.payment_type && advert.settings.payment_type !== "cpm") {
    return { ok: false, error: "Ставку можно менять только у кампаний с оплатой за показы (CPM)." };
  }
  const nmSetting = (advert.nm_settings ?? []).find((n) => n.nm_id === request.nmId);
  if (!nmSetting) return { ok: false, error: "Товара нет в этой кампании: ставка не изменена." };
  const current = typeof nmSetting.bids_kopecks?.search === "number" ? nmSetting.bids_kopecks.search : null;

  let minKopecks: number | null = null;
  const minRes = await wbPostFetch(token, `${ADVERT_BASE}/api/advert/v1/bids/min`, {
    advert_id: request.advertId,
    nm_ids: [request.nmId],
    payment_type: "cpm",
    placement_types: ["search"],
  });
  if (minRes.ok) {
    const minRow = parseJson<{ bids?: Array<{ nm_id?: number; bids?: Array<{ type?: string; value?: number }> }> }>(
      minRes.text
    )?.bids?.find((b) => b.nm_id === request.nmId);
    const value = minRow?.bids?.find((b) => b.type === "search")?.value;
    if (typeof value === "number") minKopecks = value;
  }

  const newKopecks = rubToKopecks(request.bidRub);
  const safety = checkBidSafety({ newKopecks, currentKopecks: current, minKopecks });
  if (!safety.ok) return { ok: false, error: safety.error };

  const writeRes = await wbPatchFetch(token, `${ADVERT_BASE}/api/advert/v1/bids`, {
    bids: [{ advert_id: request.advertId, nm_bids: [{ nm_id: request.nmId, bid_kopecks: newKopecks, placement: "search" }] }],
  });
  if (!writeRes.ok) {
    const body = parseJson<{ title?: string; detail?: string; message?: string; error?: string }>(writeRes.text);
    return { ok: false, error: body?.detail ?? body?.title ?? body?.message ?? body?.error ?? `Ошибка ${writeRes.status}` };
  }
  return { ok: true, bidRub: newKopecks / 100 };
}

/**
 * Создать кампанию для одного товара (POST /adv/v2/seacat/save-ad). Деньги не списываются, показы не начинаются:
 * кампания появляется в статусе «готова к запуску». Без повторов: двойная отправка создала бы две кампании.
 */
export async function createWbAdCampaign(
  token: string,
  request: AdCreateRequest
): Promise<{ ok: boolean; error?: string; campaignId?: number }> {
  let res: { status: number; ok: boolean; text: string };
  try {
    res = await wbPostFetch(token, `${ADVERT_BASE}/adv/v2/seacat/save-ad`, adCreateWbBody(request));
  } catch (e) {
    if (e instanceof WildberriesApiError && (e.status === 504 || e.status === 502)) {
      return {
        ok: false,
        error: "WB не подтвердил создание: неизвестно, создана ли кампания. Проверьте список кампаний в кабинете WB, прежде чем повторять.",
      };
    }
    throw e;
  }
  if (!res.ok) {
    const text = res.text.trim().replace(/^"|"$/g, "");
    return { ok: false, error: text && text.length < 300 ? text : `Ошибка ${res.status}` };
  }
  const id = parseJson<number>(res.text);
  return { ok: true, campaignId: typeof id === "number" ? id : undefined };
}

/**
 * Убрать товар из кампании (PATCH /adv/v0/auction/nms). Перед записью читаем кампанию: товар должен в ней быть,
 * а убрать последний товар нельзя (для этого есть пауза). Остальные товары кампании не затрагиваются.
 */
export async function removeWbAdNm(
  token: string,
  request: AdRemoveNmRequest
): Promise<{ ok: boolean; error?: string }> {
  const readRes = await wbGetFetch(token, `${ADVERT_BASE}/api/advert/v2/adverts?ids=${request.advertId}`);
  if (!readRes.ok) return { ok: false, error: "Не удалось прочитать кампанию: товар не убран." };
  const advert = parseJson<{
    adverts?: Array<{ id?: number; nm_settings?: Array<{ nm_id?: number }>; restrictions?: { can_change_nms?: boolean } }>;
  }>(readRes.text)?.adverts?.find((a) => a.id === request.advertId);
  if (!advert) return { ok: false, error: "Кампания не найдена: товар не убран." };
  if (advert.restrictions?.can_change_nms === false) {
    return { ok: false, error: "В этой кампании WB не разрешает менять состав товаров." };
  }
  const nms = (advert.nm_settings ?? []).map((n) => n.nm_id);
  if (!nms.includes(request.nmId)) return { ok: false, error: "Этого товара уже нет в кампании." };
  if (nms.length <= 1) {
    return { ok: false, error: "Это единственный товар кампании. Поставьте кампанию на паузу вместо удаления товара." };
  }
  const res = await wbPatchFetch(token, `${ADVERT_BASE}/adv/v0/auction/nms`, adRemoveNmWbBody(request));
  if (!res.ok) {
    const body = parseJson<{ title?: string; detail?: string; message?: string; error?: string }>(res.text);
    return { ok: false, error: body?.detail ?? body?.title ?? body?.message ?? body?.error ?? `Ошибка ${res.status}` };
  }
  return { ok: true };
}

/** Запрос с произвольным методом (для DELETE ставки кластера). Без повторов: запись нельзя безопасно повторять. */
async function wbSendFetch(
  token: string,
  url: string,
  method: "POST" | "DELETE" | "PUT",
  body: unknown
): Promise<{ status: number; ok: boolean; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${normalizeToken(token)}` },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return { status: res.status, ok: res.ok, text: await res.text() };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new WildberriesApiError("Wildberries не ответил вовремя", 504);
    throw new WildberriesApiError(e instanceof Error ? e.message : "Не удалось связаться с Wildberries", 502);
  } finally {
    clearTimeout(timeout);
  }
}

/** Текущие ставки поисковых кластеров (POST /adv/v0/normquery/get-bids, только чтение). Ключ clusterBidKey → ставка в рублях. */
export async function fetchWbClusterBids(
  token: string,
  pairs: Array<{ advertId: number; nmId: number }>
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const unique = [...new Map(pairs.map((p) => [`${p.advertId}:${p.nmId}`, p])).values()];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const res = await wbPostFetch(token, `${ADVERT_BASE}/adv/v0/normquery/get-bids`, {
      items: chunk.map((p) => ({ advert_id: p.advertId, nm_id: p.nmId })),
    });
    if (!res.ok) throw new WildberriesApiError(res.status === 429 ? "WB ограничил запросы ставок кластеров. Повторите позже." : `Wildberries вернул ${res.status} (ставки кластеров)`, res.status);
    const bids = parseJson<{ bids?: Array<{ advert_id?: number; nm_id?: number; norm_query?: string; bid_kopecks?: number; bid?: number }> }>(res.text)?.bids ?? [];
    for (const b of bids) {
      if (typeof b.advert_id !== "number" || typeof b.nm_id !== "number" || !b.norm_query) continue;
      const rub = typeof b.bid_kopecks === "number" ? b.bid_kopecks / 100 : typeof b.bid === "number" ? b.bid : null;
      if (rub != null) out[clusterBidKey(b.advert_id, b.nm_id, b.norm_query)] = rub;
    }
  }
  return out;
}

/**
 * Поставить ставку на кластер (POST /adv/v0/normquery/bids). Перед записью читаем кампанию: только ручная ставка и оплата за показы,
 * товар должен быть в кампании; ставка не ниже минимальной по WB и не больше чем втрое выше текущей (ставки кластера или кампании).
 */
export async function setWbClusterBid(token: string, request: ClusterBidRequest): Promise<{ ok: boolean; error?: string; bidRub?: number }> {
  const readRes = await wbGetFetch(token, `${ADVERT_BASE}/api/advert/v2/adverts?ids=${request.advertId}`);
  if (!readRes.ok) return { ok: false, error: "Не удалось прочитать кампанию: ставка кластера не изменена." };
  const advert = parseJson<{
    adverts?: Array<{ id?: number; bid_type?: string; settings?: { payment_type?: string }; nm_settings?: Array<{ nm_id?: number; bids_kopecks?: { search?: number } }> }>;
  }>(readRes.text)?.adverts?.find((a) => a.id === request.advertId);
  if (!advert) return { ok: false, error: "Кампания не найдена: ставка кластера не изменена." };
  if (advert.settings?.payment_type && advert.settings.payment_type !== "cpm") {
    return { ok: false, error: "Ставку кластера можно менять только у кампаний с оплатой за показы (CPM)." };
  }
  if (advert.bid_type && advert.bid_type !== "manual") {
    return { ok: false, error: "Ставку кластера можно менять только у кампаний с ручной ставкой." };
  }
  const nmSetting = (advert.nm_settings ?? []).find((n) => n.nm_id === request.nmId);
  if (!nmSetting) return { ok: false, error: "Товара нет в этой кампании: ставка кластера не изменена." };

  let current: number | null = typeof nmSetting.bids_kopecks?.search === "number" ? nmSetting.bids_kopecks.search : null;
  try {
    const known = await fetchWbClusterBids(token, [{ advertId: request.advertId, nmId: request.nmId }]);
    const own = known[clusterBidKey(request.advertId, request.nmId, request.query)];
    if (typeof own === "number") current = rubToKopecks(own);
  } catch {
    // Ставку кластера не прочитали: проверяем подъём относительно ставки кампании.
  }

  let minKopecks: number | null = null;
  const minRes = await wbPostFetch(token, `${ADVERT_BASE}/api/advert/v1/bids/min`, {
    advert_id: request.advertId,
    nm_ids: [request.nmId],
    payment_type: "cpm",
    placement_types: ["search"],
  });
  if (minRes.ok) {
    const value = parseJson<{ bids?: Array<{ nm_id?: number; bids?: Array<{ type?: string; value?: number }> }> }>(minRes.text)
      ?.bids?.find((b) => b.nm_id === request.nmId)?.bids?.find((b) => b.type === "search")?.value;
    if (typeof value === "number") minKopecks = value;
  }
  const safety = checkBidSafety({ newKopecks: rubToKopecks(request.bidRub), currentKopecks: current, minKopecks });
  if (!safety.ok) return { ok: false, error: safety.error };

  const writeRes = await wbSendFetch(token, `${ADVERT_BASE}/adv/v0/normquery/bids`, "POST", {
    bids: [{ advert_id: request.advertId, nm_id: request.nmId, norm_query: request.query, bid: request.bidRub }],
  });
  if (!writeRes.ok) {
    const body = parseJson<{ title?: string; detail?: string; message?: string; error?: string }>(writeRes.text);
    return { ok: false, error: body?.detail ?? body?.title ?? body?.message ?? body?.error ?? `Ошибка ${writeRes.status}` };
  }
  return { ok: true, bidRub: request.bidRub };
}

/** Сбросить ставку кластера: он вернётся к ставке кампании (DELETE /adv/v0/normquery/bids). */
export async function resetWbClusterBid(token: string, request: ClusterResetRequest): Promise<{ ok: boolean; error?: string }> {
  const res = await wbSendFetch(token, `${ADVERT_BASE}/adv/v0/normquery/bids`, "DELETE", {
    bids: [{ advert_id: request.advertId, nm_id: request.nmId, norm_query: request.query }],
  });
  if (!res.ok) {
    const body = parseJson<{ title?: string; detail?: string; message?: string; error?: string }>(res.text);
    return { ok: false, error: body?.detail ?? body?.title ?? body?.message ?? body?.error ?? `Ошибка ${res.status}` };
  }
  return { ok: true };
}
/**
 * Добавить товар в кампанию (PATCH /adv/v0/auction/nms). Перед записью читаем кампанию: статус 4, 9 или 11, WB разрешает менять
 * состав, товара в ней ещё нет, меньше 50 товаров. WB ставит добавляемому товару минимальную ставку, деньги не списываются.
 */
export async function addWbAdNm(token: string, request: AdAddNmRequest): Promise<{ ok: boolean; error?: string }> {
  const readRes = await wbGetFetch(token, `${ADVERT_BASE}/api/advert/v2/adverts?ids=${request.advertId}`);
  if (!readRes.ok) return { ok: false, error: "Не удалось прочитать кампанию: товар не добавлен." };
  const advert = parseJson<{
    adverts?: Array<{ id?: number; status?: number; nm_settings?: Array<{ nm_id?: number }>; restrictions?: { can_change_nms?: boolean } }>;
  }>(readRes.text)?.adverts?.find((a) => a.id === request.advertId);
  if (!advert) return { ok: false, error: "Кампания не найдена: товар не добавлен." };
  if (advert.status != null && ![4, 9, 11].includes(advert.status)) {
    return { ok: false, error: "Товары можно добавлять только в кампании «готова к запуску», «активна» или «на паузе»." };
  }
  if (advert.restrictions?.can_change_nms === false) return { ok: false, error: "В этой кампании WB не разрешает менять состав товаров." };
  const nms = (advert.nm_settings ?? []).map((n) => n.nm_id);
  if (nms.includes(request.nmId)) return { ok: false, error: "Этот товар уже есть в кампании." };
  if (nms.length >= AD_MAX_NMS_PER_CAMPAIGN) return { ok: false, error: `В кампании уже ${AD_MAX_NMS_PER_CAMPAIGN} товаров: это максимум WB.` };
  const res = await wbPatchFetch(token, `${ADVERT_BASE}/adv/v0/auction/nms`, adAddNmWbBody(request));
  if (!res.ok) {
    const body = parseJson<{ title?: string; detail?: string; message?: string; error?: string }>(res.text);
    return { ok: false, error: body?.detail ?? body?.title ?? body?.message ?? body?.error ?? `Ошибка ${res.status}` };
  }
  return { ok: true };
}
/**
 * Изменить зоны показов кампании (PUT /adv/v0/auction/placements). Перед записью читаем кампанию: только ручная ставка и CPM,
 * статус 4, 9 или 11. Деньги не списываются, меняется только то, где показывается реклама.
 */
export async function setWbAdPlacements(token: string, request: AdPlacementsRequest): Promise<{ ok: boolean; error?: string }> {
  const readRes = await wbGetFetch(token, `${ADVERT_BASE}/api/advert/v2/adverts?ids=${request.advertId}`);
  if (!readRes.ok) return { ok: false, error: "Не удалось прочитать кампанию: зоны не изменены." };
  const advert = parseJson<{ adverts?: Array<{ id?: number; status?: number; bid_type?: string; settings?: { payment_type?: string } }> }>(readRes.text)?.adverts?.find((a) => a.id === request.advertId);
  if (!advert) return { ok: false, error: "Кампания не найдена: зоны не изменены." };
  if (advert.settings?.payment_type && advert.settings.payment_type !== "cpm") return { ok: false, error: "Зоны показов меняются только у кампаний с оплатой за показы (CPM)." };
  if (advert.bid_type && advert.bid_type !== "manual") return { ok: false, error: "Зоны показов меняются только у кампаний с ручной ставкой." };
  if (advert.status != null && ![4, 9, 11].includes(advert.status)) return { ok: false, error: "Зоны можно менять только у кампаний «готова к запуску», «активна» или «на паузе»." };
  const res = await wbSendFetch(token, `${ADVERT_BASE}/adv/v0/auction/placements`, "PUT", {
    placements: [{ advert_id: request.advertId, placements: { search: request.search, recommendations: request.recommendations } }],
  });
  if (!res.ok) {
    const body = parseJson<{ title?: string; detail?: string; message?: string; error?: string }>(res.text);
    return { ok: false, error: body?.detail ?? body?.title ?? body?.message ?? body?.error ?? `Ошибка ${res.status}` };
  }
  return { ok: true };
}
/**
 * Дневной лимит расхода кампании (только CPC). PUT /api/advert/v0/daily-limits: { advertIds, enabled, dailyLimit, carryOverEnabled }.
 * Перед записью читаем текущее состояние: если оно уже такое, запись не нужна (changed=false). После записи читаем лимит ещё раз и сверяем.
 */
export async function setWbAdDailyLimit(token: string, request: AdDailyLimitRequest): Promise<{ ok: boolean; error?: string; changed?: boolean }> {
  const readLimit = async () => {
    const res = await wbGetFetch(token, `${ADVERT_BASE}/api/advert/v0/daily-limits?advertIds=${request.advertId}`);
    if (!res.ok) return null;
    const row = parseJson<{ adverts?: Array<{ advertId?: number; enabled?: boolean; dailyLimit?: number; carryOverEnabled?: boolean }> }>(res.text)?.adverts?.find((a) => a.advertId === request.advertId);
    return row ?? null;
  };
  const same = (row: { enabled?: boolean; dailyLimit?: number; carryOverEnabled?: boolean } | null) =>
    row != null && (row.enabled === true) === request.enabled && (!request.enabled || (row.dailyLimit === request.dailyLimit && (row.carryOverEnabled === true) === request.carryOver));
  const before = await readLimit();
  if (!before) return { ok: false, error: "Не удалось прочитать текущий лимит (метод доступен только кампаниям с оплатой за клики): изменений нет." };
  if (same(before)) return { ok: true, changed: false };
  const res = await wbSendFetch(token, `${ADVERT_BASE}/api/advert/v0/daily-limits`, "PUT", adDailyLimitWbBody(request));
  if (!res.ok) {
    const body = parseJson<{ title?: string; detail?: string; message?: string; error?: string }>(res.text);
    return { ok: false, error: body?.detail ?? body?.title ?? body?.message ?? body?.error ?? `Ошибка ${res.status}` };
  }
  const after = await readLimit();
  if (after && !same(after)) return { ok: false, error: "WB принял запрос, но прочитанный лимит не совпал с отправленным. Проверьте кампанию в кабинете." };
  return { ok: true, changed: true };
}
