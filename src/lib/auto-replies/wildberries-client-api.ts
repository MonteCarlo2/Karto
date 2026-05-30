import { autoRepliesAuthorizedFetch, AutoRepliesFetchError } from "@/lib/auto-replies/auto-replies-fetch";
import type { InboxFeedTab, InboxReviewItem } from "./inbox-demo-data";
import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings } from "./settings-types";
import type { AutoRepliesUsageId } from "./types";
import type { MarketplaceSyncInboxResult } from "./marketplace-live";
import type { WildberriesProductPreview } from "./wildberries-inbox";

export type WildberriesSyncInboxResult = MarketplaceSyncInboxResult;

export async function verifyWildberriesConnection(
  apiKey: string,
  sellerNameHint?: string | null
) {
  const res = await autoRepliesAuthorizedFetch("/api/auto-replies/wildberries/verify", {
    method: "POST",
    body: JSON.stringify({ apiKey, sellerNameHint }),
    timeoutMs: 25_000,
  });

  let data: {
    ok?: boolean;
    error?: string;
    sellerName?: string;
    unansweredCount?: number;
    unansweredToday?: number;
    verifiedAt?: string;
    retryAfterSec?: number;
    cached?: boolean;
    warning?: string;
    tokenType?: string;
    tokenTypeLabel?: string;
    tokenRateLimitHint?: string;
    tokenWarning?: string;
  };

  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new AutoRepliesFetchError("Сервер вернул некорректный ответ. Попробуйте ещё раз.");
  }

  if (!res.ok || !data.ok) {
    const err = new Error(data.error || "Не удалось проверить токен") as Error & {
      retryAfterSec?: number;
    };
    err.retryAfterSec = data.retryAfterSec;
    throw err;
  }

  return {
    ...data,
    verifiedAt: data.verifiedAt ?? new Date().toISOString(),
    warning: data.tokenWarning || data.warning,
  };
}

export async function syncWildberriesInbox(input: {
  apiKey: string;
  tab: InboxFeedTab;
  usage: AutoRepliesUsageId;
  shopSettings: AutoRepliesShopSettings;
  mpSettings: AutoRepliesMarketplaceSettings;
  brandName?: string | null;
  sellerName?: string | null;
  force?: boolean;
}): Promise<WildberriesSyncInboxResult> {
  const res = await autoRepliesAuthorizedFetch("/api/auto-replies/wildberries/sync-inbox", {
    method: "POST",
    body: JSON.stringify({
      apiKey: input.apiKey,
      tab: input.tab,
      usage: input.usage,
      shop: input.shopSettings,
      mp: input.mpSettings,
      brandName: input.brandName,
      sellerName: input.sellerName,
      force: input.force === true,
      mode: "ui",
    }),
    timeoutMs: 90_000,
  });

  const data = (await res.json()) as WildberriesSyncInboxResult & {
    error?: string;
    warning?: string;
    stale?: boolean;
    retryAfterSec?: number;
  };

  if (!res.ok) {
    if (data.items?.length || data.warning) {
      return {
        ...data,
        items: data.items ?? [],
        products: data.products ?? [],
        sellerName: data.sellerName ?? input.sellerName ?? "Продавец Wildberries",
        meta: {
          ...data.meta,
          warning: data.warning ?? data.error,
          stale: data.stale ?? res.status === 429,
          retryAfterSec: data.retryAfterSec,
        },
      };
    }
    const err = new Error(data.error || "Не удалось загрузить отзывы") as Error & {
      retryAfterSec?: number;
    };
    err.retryAfterSec = data.retryAfterSec;
    throw err;
  }

  if (data.warning) {
    return {
      ...data,
      meta: { ...data.meta, warning: data.warning, stale: data.stale },
    };
  }

  return data;
}

/** Только автоотправка pending-отзывов — без повторной загрузки списка с WB. */
export async function sendWildberriesPendingAuto(input: {
  apiKey: string;
  usage: AutoRepliesUsageId;
  shopSettings: AutoRepliesShopSettings;
  mpSettings: AutoRepliesMarketplaceSettings;
  brandName?: string | null;
  items?: InboxReviewItem[];
}): Promise<{
  items: InboxReviewItem[];
  autoSentCount: number;
  autoSendWarning?: string;
  reviewScopeLimitConsumed?: number;
}> {
  const res = await autoRepliesAuthorizedFetch("/api/auto-replies/wildberries/send-pending-auto", {
    method: "POST",
    body: JSON.stringify({
      apiKey: input.apiKey,
      usage: input.usage,
      shop: input.shopSettings,
      mp: input.mpSettings,
      brandName: input.brandName,
      items: input.items,
    }),
    timeoutMs: 60_000,
  });

  const data = (await res.json()) as {
    items?: InboxReviewItem[];
    autoSentCount?: number;
    autoSendWarning?: string;
    reviewScopeLimitConsumed?: number;
    warning?: string;
    error?: string;
  };

  if (!res.ok) {
    throw new Error(data.error || data.warning || "Не удалось отправить автоответы");
  }

  return {
    items: data.items ?? input.items ?? [],
    autoSentCount: data.autoSentCount ?? 0,
    autoSendWarning: data.autoSendWarning ?? data.warning,
    reviewScopeLimitConsumed: data.reviewScopeLimitConsumed,
  };
}

/** Лёгкий опрос: только count-unanswered (1 запрос к WB). */
export async function pollWildberriesInboxCount(apiKey: string): Promise<{
  countUnanswered?: number;
  throttled?: boolean;
  retryAfterSec?: number;
  error?: string;
}> {
  const res = await autoRepliesAuthorizedFetch("/api/auto-replies/wildberries/poll-inbox", {
    method: "POST",
    body: JSON.stringify({ apiKey }),
    timeoutMs: 15_000,
  });

  const data = (await res.json()) as {
    ok?: boolean;
    countUnanswered?: number;
    throttled?: boolean;
    retryAfterSec?: number;
    error?: string;
  };

  if (res.status === 429 || data.throttled) {
    return {
      throttled: true,
      retryAfterSec: data.retryAfterSec,
      error: data.error,
    };
  }

  if (!res.ok || !data.ok) {
    return { error: data.error || "Не удалось проверить отзывы" };
  }

  return { countUnanswered: data.countUnanswered ?? 0 };
}

export async function sendWildberriesReply(input: {
  apiKey: string;
  feedbackId: string;
  text: string;
}): Promise<void> {
  const res = await autoRepliesAuthorizedFetch("/api/auto-replies/wildberries/send-reply", {
    method: "POST",
    body: JSON.stringify({
      apiKey: input.apiKey,
      feedbackId: input.feedbackId,
      text: input.text,
    }),
    timeoutMs: 30_000,
  });

  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Не удалось опубликовать ответ");
  }
}

export function isWildberriesLiveReady(
  marketplaceId: string,
  usage: AutoRepliesUsageId,
  connection: { apiKey: string; status: string; verifiedAt?: string }
): boolean {
  return (
    marketplaceId === "wildberries" &&
    usage !== "manual" &&
    connection.apiKey.trim().length > 8 &&
    connection.status === "active" &&
    Boolean(connection.verifiedAt)
  );
}
