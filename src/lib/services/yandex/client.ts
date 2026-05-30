import type {
  YandexCampaign,
  YandexCredentials,
  YandexGoodsFeedback,
  YandexGoodsFeedbackComment,
  YandexGoodsFeedbackListResult,
  YandexVerifyResult,
} from "./types";

const YANDEX_BASE = "https://api.partner.market.yandex.ru";
const MIN_INTERVAL_MS = 500;

let lastYandexCallAt = 0;

export class YandexApiError extends Error {
  status: number;
  yandexMessage?: string;

  constructor(message: string, status: number, yandexMessage?: string) {
    super(message);
    this.name = "YandexApiError";
    this.status = status;
    this.yandexMessage = yandexMessage;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttleYandex() {
  const now = Date.now();
  const wait = Math.max(0, MIN_INTERVAL_MS - (now - lastYandexCallAt));
  if (wait > 0) await sleep(wait);
  lastYandexCallAt = Date.now();
}

function friendlyYandexMessage(status: number, message?: string): string {
  const lower = (message ?? "").toLowerCase();
  if (status === 401) {
    return "Яндекс Маркет не принял токен. Проверьте API-ключ и доступ «Общение с покупателями».";
  }
  if (status === 403) {
    return "Нет доступа к API с этим токеном. Проверьте права токена и Campaign ID магазина.";
  }
  if (status === 404 || lower.includes("campaign not found")) {
    return "Магазин с таким Campaign ID не найден. Проверьте ID в кабинете: Настройки → API и модули.";
  }
  if (status === 429 || status === 420) {
    return "Яндекс Маркет временно ограничил запросы. Подождите 1–2 минуты и попробуйте снова.";
  }
  return message || `Яндекс Маркет API вернул ${status}`;
}

function yandexRequestHeaders(apiKey: string): Record<string, string> {
  const token = apiKey.trim();
  if (!token) return {};

  // Api-Key-токен кабинета (ACMA:...) — отдельный заголовок Api-Key, см. документацию Yandex.
  if (/^ACMA:/i.test(token)) {
    return { "Api-Key": token };
  }

  // Устаревший OAuth-токен — через Authorization.
  if (/^(oauth|bearer)\s/i.test(token)) {
    return { Authorization: token };
  }

  // Если пользователь уже вставил префикс Api-Key — только значение в заголовок Api-Key.
  const withoutPrefix = token.replace(/^api-key\s+/i, "").trim();
  return { "Api-Key": withoutPrefix };
}

function extractApiError(payload: Record<string, unknown> | null): string | undefined {
  if (!payload) return undefined;
  const errors = payload.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0] as { message?: string; code?: string };
    return first.message || first.code;
  }
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.error === "string") return payload.error;
  return undefined;
}

async function yandexRequest<T>(
  apiKey: string,
  path: string,
  init?: { method?: "GET" | "POST"; body?: Record<string, unknown>; query?: Record<string, string> }
): Promise<T> {
  await throttleYandex();

  const url = new URL(`${YANDEX_BASE}${path}`);
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v) url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    method: init?.method ?? "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...yandexRequestHeaders(apiKey),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
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

  const apiMessage = extractApiError(payload);

  if (!res.ok) {
    throw new YandexApiError(friendlyYandexMessage(res.status, apiMessage), res.status, apiMessage);
  }

  if (payload && payload.status === "ERROR") {
    throw new YandexApiError(
      friendlyYandexMessage(400, apiMessage),
      400,
      apiMessage
    );
  }

  return payload as T;
}

export function parseYandexCredentials(input: {
  apiKey?: string | null;
  campaignId?: string | null;
  businessId?: string | null;
}): Omit<YandexCredentials, "businessId"> & { businessId?: string } | null {
  const apiKey = String(input.apiKey ?? "").trim();
  const campaignId = String(input.campaignId ?? "").trim();
  const businessId = String(input.businessId ?? "").trim();
  if (!apiKey || !campaignId) return null;
  return { apiKey, campaignId, businessId: businessId || undefined };
}

export async function fetchYandexCampaigns(apiKey: string): Promise<YandexCampaign[]> {
  const all: YandexCampaign[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 5; page++) {
    const payload = await yandexRequest<{
      campaigns?: YandexCampaign[];
      result?: { campaigns?: YandexCampaign[] };
      paging?: { nextPageToken?: string };
    }>(apiKey, "/v2/campaigns", {
      method: "GET",
      query: {
        limit: "100",
        ...(pageToken ? { pageToken } : {}),
      },
    });

    const batch = payload.campaigns ?? payload.result?.campaigns ?? [];
    all.push(...batch);
    pageToken = payload.paging?.nextPageToken;
    if (!pageToken || batch.length === 0) break;
  }

  return all;
}

export function resolveYandexCampaign(
  campaigns: YandexCampaign[],
  campaignId: string
): YandexCampaign | null {
  const target = campaignId.trim();
  return (
    campaigns.find((c) => String(c.id) === target) ??
    campaigns.find((c) => String(c.id) === target.replace(/\s/g, "")) ??
    null
  );
}

export async function fetchYandexGoodsFeedbacks(
  credentials: YandexCredentials,
  reactionStatus: "ALL" | "NEED_REACTION",
  limit = 50,
  pageToken?: string
): Promise<YandexGoodsFeedbackListResult> {
  const payload = await yandexRequest<{
    status?: string;
    result?: {
      feedbacks?: YandexGoodsFeedbackListResult["feedbacks"];
      paging?: { nextPageToken?: string };
    };
  }>(credentials.apiKey, `/v2/businesses/${credentials.businessId}/goods-feedback`, {
    method: "POST",
    query: {
      limit: String(Math.min(50, Math.max(1, limit))),
      ...(pageToken ? { pageToken } : {}),
    },
    body: { reactionStatus },
  });

  const result = (payload.result ?? payload) as {
    feedbacks?: YandexGoodsFeedbackListResult["feedbacks"];
    paging?: { nextPageToken?: string };
  };
  const feedbacks = (result.feedbacks ?? []).map(normalizeYandexGoodsFeedback);
  return {
    feedbacks,
    nextPageToken: result.paging?.nextPageToken,
  };
}

const YANDEX_MAX_FEEDBACKS = 10_000;

export async function fetchYandexGoodsFeedbacksAll(
  credentials: YandexCredentials,
  reactionStatus: "ALL" | "NEED_REACTION",
  maxItems = YANDEX_MAX_FEEDBACKS
): Promise<YandexGoodsFeedbackListResult["feedbacks"]> {
  const items: YandexGoodsFeedbackListResult["feedbacks"] = [];
  let pageToken: string | undefined;

  while (items.length < maxItems) {
    const page = await fetchYandexGoodsFeedbacks(
      credentials,
      reactionStatus,
      Math.min(50, maxItems - items.length),
      pageToken
    );
    items.push(...page.feedbacks);
    pageToken = page.nextPageToken;
    if (!pageToken || page.feedbacks.length === 0) break;
  }

  return items;
}

export async function fetchYandexAllRecentFeedbacks(
  credentials: YandexCredentials,
  maxItems = YANDEX_MAX_FEEDBACKS
): Promise<YandexGoodsFeedbackListResult["feedbacks"]> {
  return fetchYandexGoodsFeedbacksAll(credentials, "ALL", maxItems);
}

export async function fetchYandexGoodsFeedbackComments(
  credentials: YandexCredentials,
  feedbackId: number
): Promise<YandexGoodsFeedbackComment[]> {
  const payload = await yandexRequest<{
    result?: { comments?: YandexGoodsFeedbackComment[] };
  }>(credentials.apiKey, `/v2/businesses/${credentials.businessId}/goods-feedback/comments`, {
    method: "POST",
    query: { limit: "50" },
    body: { feedbackId },
  });

  return payload.result?.comments ?? [];
}

export function pickYandexSellerReplyText(comments: YandexGoodsFeedbackComment[]): string | undefined {
  const businessComments = comments
    .filter((c) => c.author?.type === "BUSINESS" && c.text?.trim())
    .map((c) => c.text!.trim());

  if (businessComments.length === 0) return undefined;
  return businessComments[businessComments.length - 1];
}

export async function enrichYandexFeedbacksWithSellerReplies(
  credentials: YandexCredentials,
  feedbacks: YandexGoodsFeedback[],
  maxLookups = 25
): Promise<YandexGoodsFeedback[]> {
  const answered = feedbacks.filter((f) => f.needReaction === false).slice(0, maxLookups);
  if (answered.length === 0) return feedbacks;

  const replyByFeedbackId = new Map<number, string>();

  for (const feedback of answered) {
    try {
      const comments = await fetchYandexGoodsFeedbackComments(credentials, feedback.feedbackId);
      const reply = pickYandexSellerReplyText(comments);
      if (reply) replyByFeedbackId.set(feedback.feedbackId, reply);
    } catch {
      // пропускаем отдельный отзыв — не блокируем всю ленту
    }
  }

  return feedbacks.map((feedback) => {
    const sellerReplyText = replyByFeedbackId.get(feedback.feedbackId);
    return sellerReplyText ? { ...feedback, sellerReplyText } : feedback;
  });
}

export async function answerYandexGoodsFeedback(
  credentials: YandexCredentials,
  feedbackId: number,
  text: string
): Promise<void> {
  await yandexRequest<{ status?: string }>(
    credentials.apiKey,
    `/v2/businesses/${credentials.businessId}/goods-feedback/comments/update`,
    {
      method: "POST",
      body: {
        feedbackId,
        comment: { text },
      },
    }
  );
}

export type YandexOfferPreview = {
  offerId: string;
  name?: string;
  pictureUrl?: string;
};

function pickFirstPictureUrl(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const obj = value as { url?: string; downloadUrl?: string; link?: string };
    const url = obj.url?.trim() || obj.downloadUrl?.trim() || obj.link?.trim();
    if (url) return url;
  }
  return undefined;
}

function pickPicturesFromOffer(source: Record<string, unknown>): string | undefined {
  const direct = pickFirstPictureUrl(source.picture) ?? pickFirstPictureUrl(source.mainPicture);
  if (direct) return direct;

  const pictures = source.pictures;
  if (Array.isArray(pictures)) {
    for (const entry of pictures) {
      const url = pickFirstPictureUrl(entry);
      if (url) return url;
    }
  }

  const mediaFiles = source.mediaFiles as Record<string, unknown> | undefined;
  if (mediaFiles) {
    const fromMedia = pickPicturesFromOffer(mediaFiles);
    if (fromMedia) return fromMedia;
  }

  return undefined;
}

function parseYandexOfferMappingEntry(entry: Record<string, unknown>): YandexOfferPreview | null {
  const offer = (entry.offer ?? {}) as Record<string, unknown>;
  const mapping = (entry.mapping ?? {}) as Record<string, unknown>;
  const offerId = String(offer.offerId ?? offer.id ?? "").trim();
  if (!offerId) return null;

  const name =
    String(offer.name ?? mapping.marketSkuName ?? mapping.marketModelName ?? "").trim() || undefined;
  const pictureUrl = pickPicturesFromOffer(offer) ?? pickPicturesFromOffer(entry);

  return { offerId, name, pictureUrl };
}

export function normalizeYandexGoodsFeedback(raw: YandexGoodsFeedback): YandexGoodsFeedback {
  const identifiersRaw = (raw.identifiers ?? {}) as Record<string, unknown>;
  const offerId = String(
    identifiersRaw.offerId ?? identifiersRaw.shopSku ?? identifiersRaw.shop_sku ?? ""
  ).trim();

  return {
    ...raw,
    identifiers: {
      orderId:
        typeof identifiersRaw.orderId === "number"
          ? identifiersRaw.orderId
          : raw.identifiers?.orderId,
      modelId:
        typeof identifiersRaw.modelId === "number"
          ? identifiersRaw.modelId
          : raw.identifiers?.modelId,
      offerId: offerId || raw.identifiers?.offerId,
    },
  };
}

export function extractYandexOfferId(
  feedback: YandexGoodsFeedback,
  fallbackOfferId?: string | null
): string | undefined {
  const fromFeedback = feedback.identifiers?.offerId?.trim();
  if (fromFeedback) return fromFeedback;
  const fallback = fallbackOfferId?.trim();
  return fallback || undefined;
}

export async function fetchYandexOfferMappings(
  credentials: YandexCredentials,
  offerIds: string[]
): Promise<Map<string, YandexOfferPreview>> {
  const map = new Map<string, YandexOfferPreview>();
  const unique = [...new Set(offerIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return map;

  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    const payload = await yandexRequest<Record<string, unknown>>(
      credentials.apiKey,
      `/v2/businesses/${credentials.businessId}/offer-mappings`,
      {
        method: "POST",
        body: { offerIds: batch },
      }
    );

    const result = (payload.result ?? payload) as Record<string, unknown>;
    const entries = (result.offerMappings ?? []) as Array<Record<string, unknown>>;
    for (const entry of entries) {
      const parsed = parseYandexOfferMappingEntry(entry);
      if (!parsed) continue;
      map.set(parsed.offerId, parsed);
    }
  }

  return map;
}

export async function fetchYandexCampaignSkuStats(
  credentials: YandexCredentials,
  shopSkus: string[]
): Promise<Map<string, YandexOfferPreview>> {
  const map = new Map<string, YandexOfferPreview>();
  const unique = [...new Set(shopSkus.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return map;

  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    const payload = await yandexRequest<Record<string, unknown>>(
      credentials.apiKey,
      `/v2/campaigns/${credentials.campaignId}/stats/skus`,
      {
        method: "POST",
        body: { shopSkus: batch },
      }
    );

    const result = (payload.result ?? payload) as Record<string, unknown>;
    const rows = (result.shopSkus ?? []) as Array<Record<string, unknown>>;
    for (const row of rows) {
      const offerId = String(row.shopSku ?? row.offerId ?? "").trim();
      if (!offerId) continue;
      const pictures = row.pictures;
      let pictureUrl: string | undefined;
      if (Array.isArray(pictures)) {
        for (const entry of pictures) {
          pictureUrl = pickFirstPictureUrl(entry);
          if (pictureUrl) break;
        }
      }
      map.set(offerId, {
        offerId,
        name: String(row.name ?? "").trim() || undefined,
        pictureUrl,
      });
    }
  }

  return map;
}

function mergeOfferPreviewMaps(
  primary: Map<string, YandexOfferPreview>,
  secondary: Map<string, YandexOfferPreview>
): Map<string, YandexOfferPreview> {
  const merged = new Map(primary);
  for (const [offerId, preview] of secondary) {
    const existing = merged.get(offerId);
    merged.set(offerId, {
      offerId,
      name: preview.name || existing?.name,
      pictureUrl: preview.pictureUrl || existing?.pictureUrl,
    });
  }
  return merged;
}

/** Каталог: offer-mappings + резерв stats/skus по Campaign ID. */
export async function fetchYandexProductPreviews(
  credentials: YandexCredentials,
  offerIds: string[]
): Promise<Map<string, YandexOfferPreview>> {
  const unique = [...new Set(offerIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return new Map();

  let previews = new Map<string, YandexOfferPreview>();

  try {
    previews = await fetchYandexOfferMappings(credentials, unique);
  } catch {
    previews = new Map();
  }

  const needsFallback = unique.filter((id) => {
    const preview = previews.get(id);
    return !preview?.name || !preview?.pictureUrl;
  });

  if (needsFallback.length > 0) {
    try {
      const fromStats = await fetchYandexCampaignSkuStats(credentials, needsFallback);
      previews = mergeOfferPreviewMaps(previews, fromStats);
    } catch {
      // offer-mappings уже мог частично заполнить карточку
    }
  }

  return previews;
}

export async function verifyYandexCredentials(
  input: Omit<YandexCredentials, "businessId"> & { businessId?: string },
  sellerNameHint?: string | null
): Promise<YandexVerifyResult> {
  const campaigns = await fetchYandexCampaigns(input.apiKey);
  const campaign = resolveYandexCampaign(campaigns, input.campaignId);

  if (!campaign) {
    throw new YandexApiError(
      `Магазин с Campaign ID ${input.campaignId} не найден. Проверьте ID в кабинете (Настройки → API и модули).`,
      404
    );
  }

  const businessId = String(campaign.business?.id ?? input.businessId ?? "").trim();
  if (!businessId) {
    throw new YandexApiError(
      "Не удалось определить businessId кабинета. Укажите корректный Campaign ID.",
      400
    );
  }

  const credentials: YandexCredentials = {
    apiKey: input.apiKey,
    campaignId: input.campaignId,
    businessId,
  };

  const pending = await fetchYandexGoodsFeedbacks(credentials, "NEED_REACTION", 50);
  const unansweredCount = pending.feedbacks.length;

  const sellerName =
    sellerNameHint?.trim() ||
    campaign.business?.name?.trim() ||
    campaign.domain?.trim() ||
    `Магазин ${input.campaignId}`;

  return {
    ok: true,
    sellerName,
    businessId,
    campaignId: input.campaignId,
    unansweredCount,
    processedCount: 0,
  };
}
