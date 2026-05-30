import type {
  OzonCredentials,
  OzonProductInfo,
  OzonReview,
  OzonReviewComment,
  OzonReviewCountResult,
  OzonReviewListResult,
  OzonReviewStatus,
  OzonSellerInfo,
  OzonVerifyResult,
} from "./types";

import { OZON_REVIEW_SUBSCRIPTION_DENIED } from "@/lib/auto-replies/ozon-subscription";

export const OZON_REVIEW_SUBSCRIPTION_HINT = OZON_REVIEW_SUBSCRIPTION_DENIED;

const OZON_BASE = "https://api-seller.ozon.ru";
const MIN_INTERVAL_MS = 400;

let lastOzonCallAt = 0;

export class OzonApiError extends Error {
  status: number;
  ozonMessage?: string;
  premiumPlusRequired?: boolean;

  constructor(message: string, status: number, ozonMessage?: string, premiumPlusRequired?: boolean) {
    super(message);
    this.name = "OzonApiError";
    this.status = status;
    this.ozonMessage = ozonMessage;
    this.premiumPlusRequired = premiumPlusRequired;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttleOzon() {
  const now = Date.now();
  const wait = Math.max(0, MIN_INTERVAL_MS - (now - lastOzonCallAt));
  if (wait > 0) await sleep(wait);
  lastOzonCallAt = Date.now();
}

function friendlyOzonMessage(status: number, message?: string): string {
  const raw = message?.trim();
  if (raw) return raw;

  if (status === 401 || status === 404) {
    return "Ozon не принял Client ID или API Key. Проверьте ключ и права доступа в Seller API.";
  }
  if (status === 403) {
    return "Ozon отклонил запрос (403). Проверьте права ключа и подписку продавца для Review API.";
  }
  if (status === 429) {
    return "Ozon временно ограничил запросы. Подождите 1–2 минуты и попробуйте снова.";
  }
  return `Ozon API вернул HTTP ${status}`;
}

function detectReviewSubscriptionBlock(status: number, message?: string): boolean {
  const lower = (message ?? "").toLowerCase();
  return (
    status === 403 ||
    lower.includes("not available with existing subscription") ||
    lower.includes("permissiondenied") ||
    lower.includes("premium plus") ||
    lower.includes("premium pro") ||
    lower.includes("premium_plus") ||
    lower.includes("premium_pro") ||
    lower.includes("управление отзывами") ||
    lower.includes("подписк") ||
    lower.includes("subscription")
  );
}

async function ozonRequest<T>(
  credentials: OzonCredentials,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  await throttleOzon();

  const res = await fetch(`${OZON_BASE}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Client-Id": credentials.clientId.trim(),
      "Api-Key": credentials.apiKey.trim(),
    },
    body: JSON.stringify(body ?? {}),
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

  const ozonMessage =
    typeof payload?.message === "string"
      ? payload.message
      : typeof payload?.error === "string"
        ? payload.error
        : undefined;

  if (!res.ok) {
    const premiumPlusRequired = detectReviewSubscriptionBlock(res.status, ozonMessage);
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ozon-api]", path, res.status, ozonMessage ?? text.slice(0, 300));
    }
    throw new OzonApiError(
      friendlyOzonMessage(res.status, ozonMessage),
      res.status,
      ozonMessage,
      premiumPlusRequired
    );
  }

  if (payload && typeof payload === "object" && "code" in payload && payload.code !== 0 && payload.code !== undefined) {
    const premiumPlusRequired = detectReviewSubscriptionBlock(Number(payload.code) || 500, ozonMessage);
    throw new OzonApiError(
      friendlyOzonMessage(Number(payload.code) || 500, ozonMessage),
      Number(payload.code) || 500,
      ozonMessage,
      premiumPlusRequired
    );
  }

  return payload as T;
}

export function parseOzonCredentials(input: {
  clientId?: string | null;
  apiKey?: string | null;
}): OzonCredentials | null {
  const clientId = String(input.clientId ?? "").trim();
  const apiKey = String(input.apiKey ?? "").trim();
  if (!clientId || !apiKey) return null;
  return { clientId, apiKey };
}

export async function fetchOzonSellerInfo(credentials: OzonCredentials): Promise<OzonSellerInfo> {
  const payload = await ozonRequest<{ result?: OzonSellerInfo } & OzonSellerInfo>(
    credentials,
    "/v1/seller/info",
    {}
  );
  return payload.result ?? payload;
}

export async function verifyOzonCredentials(
  credentials: OzonCredentials,
  sellerNameHint?: string | null
): Promise<OzonVerifyResult> {
  const sellerInfo = await fetchOzonSellerInfo(credentials);
  const sellerName =
    sellerInfo.company?.name?.trim() ||
    sellerInfo.name?.trim() ||
    sellerNameHint?.trim() ||
    "Продавец Ozon";

  try {
    const countPayload = await ozonRequest<{ result?: OzonReviewCountResult }>(
      credentials,
      "/v1/review/count",
      {}
    );

    const result = countPayload.result ?? countPayload;
    const processed = Number((result as OzonReviewCountResult).processed ?? 0);
    const unprocessed = Number((result as OzonReviewCountResult).unprocessed ?? 0);

    return {
      ok: true,
      sellerName,
      unansweredCount: unprocessed,
      processedCount: processed,
      premiumPlus: true,
      reviewApiAvailable: true,
    };
  } catch (e) {
    if (e instanceof OzonApiError && detectReviewSubscriptionBlock(e.status, e.ozonMessage ?? e.message)) {
      return {
        ok: true,
        sellerName,
        unansweredCount: 0,
        processedCount: 0,
        premiumPlus: false,
        reviewApiAvailable: false,
        reviewSubscriptionHint: OZON_REVIEW_SUBSCRIPTION_HINT,
      };
    }
    throw e;
  }
}

export async function fetchOzonReviews(
  credentials: OzonCredentials,
  status: OzonReviewStatus,
  limit = 50,
  lastId?: string
): Promise<OzonReviewListResult> {
  const payload = await ozonRequest<{ result?: OzonReviewListResult } & OzonReviewListResult>(
    credentials,
    "/v1/review/list",
    {
      limit: Math.min(100, Math.max(20, limit)),
      sort_dir: "DESC",
      status,
      ...(lastId ? { last_id: lastId } : {}),
    }
  );

  const result = payload.result ?? payload;
  return {
    reviews: result.reviews ?? [],
    has_next: result.has_next,
    last_id: result.last_id,
  };
}

const OZON_MAX_REVIEWS_PER_STATUS = 10_000;

async function fetchOzonReviewsPaginated(
  credentials: OzonCredentials,
  status: OzonReviewStatus,
  maxReviews = OZON_MAX_REVIEWS_PER_STATUS
): Promise<OzonReview[]> {
  const collected: OzonReview[] = [];
  let lastId: string | undefined;
  let hasNext = true;

  while (hasNext && collected.length < maxReviews) {
    const pageSize = Math.min(50, maxReviews - collected.length);
    const page = await fetchOzonReviews(credentials, status, pageSize, lastId);
    const reviews = page.reviews ?? [];
    collected.push(...reviews);
    hasNext = Boolean(page.has_next) && reviews.length > 0;
    lastId = page.last_id;
    if (reviews.length === 0) break;
  }

  return collected;
}

export async function fetchOzonAllRecentReviews(
  credentials: OzonCredentials,
  limitPerStatus = OZON_MAX_REVIEWS_PER_STATUS
): Promise<OzonReviewListResult> {
  const [unprocessed, processed] = await Promise.all([
    fetchOzonReviewsPaginated(credentials, "UNPROCESSED", limitPerStatus),
    fetchOzonReviewsPaginated(credentials, "PROCESSED", limitPerStatus),
  ]);

  const byId = new Map<string, NonNullable<OzonReviewListResult["reviews"]>[number]>();
  for (const review of [...unprocessed, ...processed]) {
    if (review?.id) byId.set(review.id, review);
  }

  const reviews = Array.from(byId.values()).sort((a, b) => {
    const ta = a.published_at ? Date.parse(a.published_at) : 0;
    const tb = b.published_at ? Date.parse(b.published_at) : 0;
    return tb - ta;
  });

  return { reviews };
}

export function pickOzonProductImageUrl(product?: OzonProductInfo): string | undefined {
  if (!product) return undefined;
  const primary = product.primary_image;
  if (typeof primary === "string" && primary.trim()) return primary.trim();
  if (Array.isArray(primary)) {
    const first = primary.find((url) => typeof url === "string" && url.trim());
    if (first) return first.trim();
  }
  const fromImages = product.images?.find((url) => typeof url === "string" && url.trim());
  return fromImages?.trim();
}

export async function fetchOzonProductsBySku(
  credentials: OzonCredentials,
  skus: number[]
): Promise<Map<number, OzonProductInfo>> {
  const map = new Map<number, OzonProductInfo>();
  if (skus.length === 0) return map;

  const unique = Array.from(new Set(skus));

  for (let offset = 0; offset < unique.length; offset += 100) {
    const chunk = unique.slice(offset, offset + 100);
    const payload = await ozonRequest<{ result?: { items?: OzonProductInfo[] }; items?: OzonProductInfo[] }>(
      credentials,
      "/v3/product/info/list",
      { sku: chunk.map(String) }
    );

    const items = payload.result?.items ?? payload.items ?? [];
    for (const item of items) {
      if (item.sku) map.set(Number(item.sku), item);
    }
  }

  return map;
}

export async function fetchOzonReviewComments(
  credentials: OzonCredentials,
  reviewId: string
): Promise<OzonReviewComment[]> {
  const payload = await ozonRequest<{ result?: { comments?: OzonReviewComment[] }; comments?: OzonReviewComment[] }>(
    credentials,
    "/v1/review/comment/list",
    { review_id: reviewId }
  );

  return payload.result?.comments ?? payload.comments ?? [];
}

export function pickOzonSellerReplyText(comments: OzonReviewComment[]): string | undefined {
  const official = comments.find((c) => c.is_official && c.text?.trim());
  if (official?.text) return official.text.trim();
  const owner = comments.find((c) => c.is_owner && c.text?.trim());
  if (owner?.text) return owner.text.trim();
  return undefined;
}

export async function enrichOzonReviewsWithSellerReplies(
  credentials: OzonCredentials,
  reviews: OzonReview[],
  maxLookups = 50
): Promise<OzonReview[]> {
  const targets = reviews
    .filter((review) => review.id && (review.status === "PROCESSED" || (review.comments_amount ?? 0) > 0))
    .slice(0, maxLookups);

  if (targets.length === 0) return reviews;

  const replyById = new Map<string, string>();
  const concurrency = 5;

  for (let offset = 0; offset < targets.length; offset += concurrency) {
    const batch = targets.slice(offset, offset + concurrency);
    await Promise.all(
      batch.map(async (review) => {
        if (!review.id) return;
        try {
          const comments = await fetchOzonReviewComments(credentials, review.id);
          const reply = pickOzonSellerReplyText(comments);
          if (reply) replyById.set(review.id, reply);
        } catch {
          // не блокируем всю ленту из-за одного отзыва
        }
      })
    );
  }

  return reviews.map((review) => {
    const sellerReplyText = review.id ? replyById.get(review.id) : undefined;
    return sellerReplyText ? { ...review, sellerReplyText } : review;
  });
}

/** Публикация ответа на отзыв — POST /v1/review/comment/create */
export async function answerOzonReview(
  credentials: OzonCredentials,
  reviewId: string,
  text: string
): Promise<void> {
  await ozonRequest(credentials, "/v1/review/comment/create", {
    review_id: reviewId,
    text,
  });
}
