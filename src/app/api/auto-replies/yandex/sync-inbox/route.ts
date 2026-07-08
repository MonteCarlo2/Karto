import { NextRequest, NextResponse } from "next/server";
import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings } from "@/lib/auto-replies/settings-types";
import type { AutoRepliesUsageId } from "@/lib/auto-replies/types";
import { parseApiKey, requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import { createServerClient } from "@/lib/supabase/server";
import type { InboxFeedTab, InboxReviewItem } from "@/lib/auto-replies/inbox-demo-data";
import { extractYandexProducts } from "@/lib/auto-replies/yandex-inbox";
import { inboxItemsMissingYandexProductInfo } from "@/lib/auto-replies/inbox-item-merge";
import { reassignInboxItemFeeds } from "@/lib/auto-replies/inbox-feed-utils";
import { postProcessInboxAutoSend } from "@/lib/auto-replies/inbox-sync-finish";
import { consumeReviewScopeLimit } from "@/lib/auto-replies/inbox-review-scope";
import { runYandexInboxSync } from "@/lib/auto-replies/inbox-sync-yandex-core";
import {
  cooldownRetryAfterSec,
  getCachedYandexSync,
  getStaleYandexSync,
  getYandexVerifyCooldown,
  setCachedYandexSync,
  setYandexVerifyCooldown,
  yandexCredentialsKey,
} from "@/lib/services/yandex/server-cache";
import {
  answerYandexGoodsFeedback,
  fetchYandexCampaigns,
  parseYandexCredentials,
  resolveYandexCampaign,
  YandexApiError,
} from "@/lib/services/yandex/client";
import { persistServerMarketplaceSecret } from "@/lib/auto-replies/persist-server-marketplace-secret";

export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_TABS = new Set<InboxFeedTab>(["semi", "auto"]);
const VALID_USAGE = new Set<AutoRepliesUsageId>(["semi", "auto"]);
const SYNC_CACHE_MS = 30_000;

type SyncPayload = {
  items: unknown[];
  products: unknown[];
  sellerName: string;
  meta: Record<string, unknown>;
};

function yandexSendReply(
  usage: AutoRepliesUsageId,
  credentials: { apiKey: string; campaignId: string; businessId: string }
) {
  if (usage === "manual") return undefined;
  return async (item: InboxReviewItem, replyText: string) => {
    const feedbackId = Number(item.externalId);
    if (!Number.isFinite(feedbackId) || feedbackId <= 0) {
      throw new Error("Не найден ID отзыва");
    }
    await answerYandexGoodsFeedback(credentials, feedbackId, replyText);
  };
}

async function refreshCachedInboxPayload(input: {
  payload: SyncPayload;
  shop: AutoRepliesShopSettings;
  mp: AutoRepliesMarketplaceSettings;
  usage: AutoRepliesUsageId;
  credentials: { apiKey: string; campaignId: string; businessId: string };
  brandName?: string | null;
  userId: string;
  supabase: ReturnType<typeof createServerClient>;
}): Promise<SyncPayload> {
  const items = (input.payload.items ?? []) as InboxReviewItem[];
  const sendReply = yandexSendReply(input.usage, input.credentials);
  const post = await postProcessInboxAutoSend({
    items,
    shop: input.shop,
    mp: input.mp,
    brandName: input.brandName ?? null,
    userId: input.userId,
    supabase: input.supabase,
    sendReply,
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
    apiKey?: string;
    campaignId?: string;
    businessId?: string;
    tab?: InboxFeedTab;
    usage?: AutoRepliesUsageId;
    shop?: AutoRepliesShopSettings;
    shopSettings?: AutoRepliesShopSettings;
    mp?: AutoRepliesMarketplaceSettings;
    mpSettings?: AutoRepliesMarketplaceSettings;
    brandName?: string | null;
    sellerName?: string | null;
    force?: boolean;
    shopId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Нужен JSON-тело запроса" }, { status: 400 });
  }

  const tab = body.tab;
  const usage = body.usage;
  const shop = body.shop ?? body.shopSettings;
  const mp = body.mp ?? body.mpSettings;
  const force = body.force === true;

  const parsed = parseYandexCredentials({
    apiKey: parseApiKey(body.apiKey),
    campaignId: body.campaignId ?? mp?.connection.campaignId,
    businessId: body.businessId ?? mp?.connection.businessId,
  });

  if (!parsed) {
    return NextResponse.json({ error: "Укажите токен и Campaign ID Яндекс Маркета" }, { status: 400 });
  }
  let businessId = parsed.businessId || mp?.connection.businessId?.trim();
  if (!businessId) {
    try {
      const campaigns = await fetchYandexCampaigns(parsed.apiKey);
      const campaign = resolveYandexCampaign(campaigns, parsed.campaignId);
      businessId = campaign?.business?.id ? String(campaign.business.id) : undefined;
    } catch (e) {
      const message = e instanceof YandexApiError ? e.message : "Не удалось определить кабинет";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }
  if (!businessId) {
    return NextResponse.json(
      { error: "Не найден businessId. Проверьте Campaign ID или нажмите «Проверить подключение»." },
      { status: 400 }
    );
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
    marketplaceId: "yandex",
    apiKey: parsed.apiKey,
    campaignId: parsed.campaignId,
    businessId,
  });
  if (!secretPersist.ok) {
    console.warn("[yandex/sync-inbox] server secret not saved:", secretPersist.error);
  }

  const credentials = {
    apiKey: parsed.apiKey,
    campaignId: parsed.campaignId,
    businessId,
  };

  const cacheKey = `${yandexCredentialsKey(credentials.apiKey, credentials.campaignId)}:all`;
  const credKey = yandexCredentialsKey(credentials.apiKey, credentials.campaignId);
  const refreshInput = {
    shop,
    mp,
    usage,
    credentials,
    brandName: body.brandName ?? null,
    userId: auth.user.id,
    supabase,
  };

  const cooldown = getYandexVerifyCooldown(credKey);
  if (cooldown && !force) {
    const cached = getCachedYandexSync<SyncPayload>(cacheKey);
    if (cached) {
      const refreshed = await refreshCachedInboxPayload({ payload: cached, ...refreshInput });
      setCachedYandexSync(cacheKey, refreshed, SYNC_CACHE_MS);
      return NextResponse.json({ ...refreshed, cached: true });
    }

    const stale = getStaleYandexSync<SyncPayload>(cacheKey);
    if (stale?.items?.length) {
      const refreshed = await refreshCachedInboxPayload({ payload: stale, ...refreshInput });
      return NextResponse.json({
        ...refreshed,
        cached: true,
        stale: true,
        warning: `${cooldown.message} Показана сохранённая лента.`,
      });
    }

    return NextResponse.json(
      {
        error: `${cooldown.message} Повтор через ~${Math.ceil(cooldownRetryAfterSec(cooldown) / 60)} мин.`,
        retryAfterSec: cooldownRetryAfterSec(cooldown),
      },
      { status: 429 }
    );
  }

  const cachedSync = getCachedYandexSync<SyncPayload>(cacheKey);
  if (
    cachedSync &&
    !force &&
    !inboxItemsMissingYandexProductInfo((cachedSync.items ?? []) as InboxReviewItem[])
  ) {
    const refreshed = await refreshCachedInboxPayload({ payload: cachedSync, ...refreshInput });
    setCachedYandexSync(cacheKey, refreshed, SYNC_CACHE_MS);
    return NextResponse.json({ ...refreshed, cached: true });
  }

  try {
    const result = await runYandexInboxSync({
      supabase,
      userId: auth.user.id,
      apiKey: credentials.apiKey,
      campaignId: credentials.campaignId,
      businessId: credentials.businessId,
      tab,
      usage,
      shop,
      mp,
      brandName: body.brandName ?? null,
      sellerName: body.sellerName ?? null,
      mode: "ui",
    });

    const items = result.items;
    const products = extractYandexProducts(items);
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
        reviewScopeLimitConsumed: nextLimitConsumed,
        autoSentCount: result.autoSentCount,
        autoSendWarning: result.autoSendWarning,
      },
    };

    setCachedYandexSync(cacheKey, payload, SYNC_CACHE_MS);
    return NextResponse.json(payload);
  } catch (e) {
    const message =
      e instanceof YandexApiError ? e.message : e instanceof Error ? e.message : "Не удалось загрузить отзывы";
    const status = e instanceof YandexApiError && e.status >= 400 && e.status < 500 ? e.status : 502;

    if (status === 429) {
      setYandexVerifyCooldown(credKey, 2 * 60, "Яндекс Маркет временно ограничивает запросы.");
    }

    const stale = getStaleYandexSync<SyncPayload>(cacheKey);
    if (stale?.items?.length) {
      const refreshed = await refreshCachedInboxPayload({ payload: stale, ...refreshInput });
      return NextResponse.json({
        ...refreshed,
        cached: true,
        stale: true,
        warning: message,
      });
    }

    return NextResponse.json(
      {
        error: message,
        retryAfterSec: status === 429 ? 2 * 60 : undefined,
      },
      { status }
    );
  }
}
