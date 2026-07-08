import { NextRequest, NextResponse } from "next/server";
import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings } from "@/lib/auto-replies/settings-types";
import type { AutoRepliesUsageId } from "@/lib/auto-replies/types";
import { parseApiKey, requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import { createServerClient } from "@/lib/supabase/server";
import type { InboxFeedTab, InboxReviewItem } from "@/lib/auto-replies/inbox-demo-data";
import { extractOzonProducts } from "@/lib/auto-replies/ozon-inbox";
import { reassignInboxItemFeeds } from "@/lib/auto-replies/inbox-feed-utils";
import { postProcessInboxAutoSend } from "@/lib/auto-replies/inbox-sync-finish";
import { consumeReviewScopeLimit } from "@/lib/auto-replies/inbox-review-scope";
import { runOzonInboxSync } from "@/lib/auto-replies/inbox-sync-ozon-core";
import { OZON_REVIEW_SUBSCRIPTION_DENIED, ozonReviewApiBlocked } from "@/lib/auto-replies/ozon-subscription";
import {
  cooldownRetryAfterSec,
  getCachedOzonSync,
  getOzonVerifyCooldown,
  getStaleOzonSync,
  ozonCredentialsKey,
  setCachedOzonSync,
  setOzonVerifyCooldown,
} from "@/lib/services/ozon/server-cache";
import {
  answerOzonReview,
  OZON_REVIEW_SUBSCRIPTION_HINT,
  OzonApiError,
  parseOzonCredentials,
} from "@/lib/services/ozon/client";
import { persistServerMarketplaceSecret } from "@/lib/auto-replies/persist-server-marketplace-secret";

export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_TABS = new Set<InboxFeedTab>(["semi", "auto"]);
const VALID_USAGE = new Set<AutoRepliesUsageId>(["semi", "auto"]);
const SYNC_CACHE_MS = 30_000;

type SyncPayload = {
  items: InboxReviewItem[];
  products: ReturnType<typeof extractOzonProducts>;
  sellerName: string;
  meta: Record<string, unknown>;
};

function ozonSendReply(
  usage: AutoRepliesUsageId,
  credentials: { clientId: string; apiKey: string }
) {
  if (usage === "manual") return undefined;
  return async (item: InboxReviewItem, replyText: string) => {
    const reviewId = item.externalId?.trim();
    if (!reviewId) throw new Error("Не найден ID отзыва");
    await answerOzonReview(credentials, reviewId, replyText);
  };
}

async function refreshCachedInboxPayload(input: {
  payload: SyncPayload;
  shop: AutoRepliesShopSettings;
  mp: AutoRepliesMarketplaceSettings;
  usage: AutoRepliesUsageId;
  credentials: { clientId: string; apiKey: string };
  brandName?: string | null;
  userId: string;
  supabase: ReturnType<typeof createServerClient>;
}): Promise<SyncPayload> {
  const post = await postProcessInboxAutoSend({
    items: input.payload.items,
    shop: input.shop,
    mp: input.mp,
    brandName: input.brandName ?? null,
    userId: input.userId,
    supabase: input.supabase,
    sendReply: ozonSendReply(input.usage, input.credentials),
  });
  const nextLimitConsumed = consumeReviewScopeLimit(input.mp.reviewScope, post.autoSentCount).limitConsumed;

  return {
    ...input.payload,
    items: reassignInboxItemFeeds(post.items, input.mp),
    meta: {
      ...input.payload.meta,
      autoSentCount: (Number(input.payload.meta?.autoSentCount) || 0) + post.autoSentCount,
      autoSendWarning: post.autoSendWarning,
      reviewScopeLimitConsumed: nextLimitConsumed,
    },
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const supabase = createServerClient();

  let body: {
    clientId?: string;
    apiKey?: string;
    tab?: InboxFeedTab;
    usage?: AutoRepliesUsageId;
    shop?: AutoRepliesShopSettings;
    shopSettings?: AutoRepliesShopSettings;
    mp?: AutoRepliesMarketplaceSettings;
    mpSettings?: AutoRepliesMarketplaceSettings;
    brandName?: string | null;
    sellerName?: string | null;
    take?: number;
    force?: boolean;
    shopId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Нужен JSON-тело запроса" }, { status: 400 });
  }

  const credentials = parseOzonCredentials({
    clientId: body.clientId,
    apiKey: parseApiKey(body.apiKey),
  });
  const tab = body.tab;
  const usage = body.usage;
  const shop = body.shop ?? body.shopSettings;
  const mp = body.mp ?? body.mpSettings;
  const force = body.force === true;

  if (!credentials) {
    return NextResponse.json({ error: "Укажите Client ID и API Key Ozon" }, { status: 400 });
  }
  if (!tab || !VALID_TABS.has(tab)) {
    return NextResponse.json({ error: "Укажите tab: semi или auto" }, { status: 400 });
  }
  if (!usage || !VALID_USAGE.has(usage)) {
    return NextResponse.json({ error: "Укажите usage: semi или auto" }, { status: 400 });
  }
  if (!shop?.style || !shop?.templates || !shop?.training || !shop?.advanced) {
    return NextResponse.json({ error: "Настройки магазина не переданы" }, { status: 400 });
  }
  if (!mp?.usage || !mp?.starRules || !mp?.reviewScope || !mp?.connection) {
    return NextResponse.json({ error: "Настройки маркетплейса не переданы" }, { status: 400 });
  }

  const secretPersist = await persistServerMarketplaceSecret(supabase, auth.user.id, {
    shopId: body.shopId,
    marketplaceId: "ozon",
    apiKey: credentials.apiKey,
    clientId: credentials.clientId,
  });
  if (!secretPersist.ok) {
    console.warn("[ozon/sync-inbox] server secret not saved:", secretPersist.error);
  }

  if (
    mp.connection.verifiedAt &&
    ozonReviewApiBlocked(mp.connection.reviewApiAvailable, mp.connection.premiumPlus)
  ) {
    return NextResponse.json(
      {
        error: OZON_REVIEW_SUBSCRIPTION_DENIED,
        premiumPlusRequired: true,
        reviewApiAvailable: false,
      },
      { status: 403 }
    );
  }

  const cacheKey = `${ozonCredentialsKey(credentials.clientId, credentials.apiKey)}:all`;
  const credKey = ozonCredentialsKey(credentials.clientId, credentials.apiKey);
  const refreshInput = {
    shop,
    mp,
    usage,
    credentials,
    brandName: body.brandName ?? null,
    userId: auth.user.id,
    supabase,
  };

  const returnStale = (stale: SyncPayload, warning: string) =>
    NextResponse.json({
      ...stale,
      cached: true,
      stale: true,
      warning,
    });

  const cooldown = getOzonVerifyCooldown(credKey);
  if (cooldown && !force) {
    const fresh = getCachedOzonSync<SyncPayload>(cacheKey);
    if (fresh) {
      const refreshed = await refreshCachedInboxPayload({ payload: fresh, ...refreshInput });
      setCachedOzonSync(cacheKey, refreshed, SYNC_CACHE_MS);
      return NextResponse.json({ ...refreshed, cached: true });
    }

    const stale = getStaleOzonSync<SyncPayload>(cacheKey);
    if (stale?.items?.length) {
      const refreshed = await refreshCachedInboxPayload({ payload: stale, ...refreshInput });
      return returnStale(refreshed, `${cooldown.message} Показана сохранённая лента.`);
    }

    return NextResponse.json(
      {
        error: `${cooldown.message} Повтор через ~${Math.ceil(cooldownRetryAfterSec(cooldown) / 60)} мин.`,
        retryAfterSec: cooldownRetryAfterSec(cooldown),
      },
      { status: 429 }
    );
  }

  const cachedSync = getCachedOzonSync<SyncPayload>(cacheKey);
  if (cachedSync && !force) {
    const refreshed = await refreshCachedInboxPayload({ payload: cachedSync, ...refreshInput });
    setCachedOzonSync(cacheKey, refreshed, SYNC_CACHE_MS);
    return NextResponse.json({ ...refreshed, cached: true });
  }

  try {
    const result = await runOzonInboxSync({
      supabase,
      userId: auth.user.id,
      clientId: credentials.clientId,
      apiKey: credentials.apiKey,
      tab,
      usage,
      shop,
      mp,
      brandName: body.brandName ?? null,
      sellerName: body.sellerName ?? null,
      take: body.take,
      mode: "ui",
    });

    const items = result.items;
    const products = extractOzonProducts(items);
    const nextLimitConsumed = consumeReviewScopeLimit(mp.reviewScope, result.autoSentCount).limitConsumed;

    const payload: SyncPayload = {
      items,
      products,
      sellerName: result.sellerName,
      meta: {
        tab,
        unansweredCount: result.unansweredCount,
        unansweredToday: 0,
        fetched: items.length,
        premiumPlus: true,
        reviewApiAvailable: true,
        reviewScopeLimitConsumed: nextLimitConsumed,
        autoSentCount: result.autoSentCount,
        autoSendWarning: result.autoSendWarning,
      },
    };

    setCachedOzonSync(cacheKey, payload, SYNC_CACHE_MS);
    return NextResponse.json(payload);
  } catch (e) {
    const message =
      e instanceof OzonApiError && e.premiumPlusRequired
        ? OZON_REVIEW_SUBSCRIPTION_HINT
        : e instanceof OzonApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Не удалось загрузить отзывы";
    const status = e instanceof OzonApiError && e.status >= 400 && e.status < 500 ? e.status : 502;

    if (status === 429) {
      setOzonVerifyCooldown(credKey, 2 * 60, "Ozon временно ограничивает запросы.");
    }

    const stale = getStaleOzonSync<SyncPayload>(cacheKey);
    if (stale?.items?.length) {
      const refreshed = await refreshCachedInboxPayload({ payload: stale, ...refreshInput });
      return returnStale(refreshed, message);
    }

    return NextResponse.json(
      {
        error: message,
        retryAfterSec: status === 429 ? 2 * 60 : undefined,
        premiumPlusRequired: e instanceof OzonApiError ? e.premiumPlusRequired : undefined,
        ozonMessage: e instanceof OzonApiError ? e.ozonMessage : undefined,
      },
      { status }
    );
  }
}
