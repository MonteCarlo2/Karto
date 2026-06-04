import { NextRequest, NextResponse } from "next/server";
import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings } from "@/lib/auto-replies/settings-types";
import type { AutoRepliesUsageId } from "@/lib/auto-replies/types";
import { parseApiKey, requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import { createServerClient } from "@/lib/supabase/server";
import type { InboxFeedTab, InboxReviewItem } from "@/lib/auto-replies/inbox-demo-data";
import { postProcessInboxAutoSend } from "@/lib/auto-replies/inbox-sync-finish";
import { reassignInboxItemFeeds } from "@/lib/auto-replies/inbox-auto-send";
import {
  extractWildberriesProducts,
} from "@/lib/auto-replies/wildberries-inbox";
import {
  cooldownRetryAfterSec,
  coalesceWildberriesSync,
  clearWildberriesSyncCooldown,
  getCachedWildberriesSync,
  getStaleWildberriesSync,
  getWildberriesSyncCooldown,
  setCachedWildberriesSync,
  setWildberriesSyncCooldown,
  wildberriesTokenKey,
} from "@/lib/services/wildberries/server-cache";
import { runWildberriesInboxSync } from "@/lib/auto-replies/inbox-sync-wildberries-core";
import { persistServerMarketplaceSecret } from "@/lib/auto-replies/persist-server-marketplace-secret";
import {
  WildberriesApiError,
  answerWildberriesFeedback,
} from "@/lib/services/wildberries/client";

export const runtime = "nodejs";
export const maxDuration = 120;

const SYNC_CACHE_MS = 90_000;

type SyncPayload = {
  items: unknown[];
  products: unknown[];
  sellerName: string;
  meta: Record<string, unknown>;
};

function isSyncCacheComplete(payload: SyncPayload): boolean {
  const items = payload.items;
  const complete = payload.meta?.fetchComplete === true;
  return Array.isArray(items) && items.length > 0 && complete;
}

function wbAutoSendReply(usage: AutoRepliesUsageId, apiKey: string) {
  if (usage === "manual") return undefined;
  return async (item: InboxReviewItem, replyText: string) => {
    const feedbackId = item.externalId?.trim();
    if (!feedbackId) throw new Error("Не найден ID отзыва");
    await answerWildberriesFeedback({ token: apiKey, feedbackId, text: replyText });
  };
}

async function refreshCachedInboxPayload(input: {
  payload: SyncPayload;
  shop: AutoRepliesShopSettings;
  mp: AutoRepliesMarketplaceSettings;
  usage: AutoRepliesUsageId;
  apiKey: string;
  brandName?: string | null;
  userId: string;
  supabase: ReturnType<typeof createServerClient>;
}): Promise<SyncPayload> {
  const items = (input.payload.items ?? []) as InboxReviewItem[];
  const sendReply = wbAutoSendReply(input.usage, input.apiKey);
  const post = await postProcessInboxAutoSend({
    items,
    shop: input.shop,
    mp: input.mp,
    brandName: input.brandName ?? null,
    userId: input.userId,
    supabase: input.supabase,
    sendReply,
  });
  return {
    ...input.payload,
    items: reassignInboxItemFeeds(post.items, input.mp),
    meta: {
      ...input.payload.meta,
      autoSentCount: (Number(input.payload.meta?.autoSentCount) || 0) + post.autoSentCount,
      autoSendWarning: post.autoSendWarning,
    },
  };
}

const VALID_TABS = new Set<InboxFeedTab>(["semi", "auto"]);
const VALID_USAGE = new Set<AutoRepliesUsageId>(["semi", "auto"]);

export async function POST(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const supabase = createServerClient();

  let body: {
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
    mode?: "ui" | "full";
    shopId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Нужен JSON-тело запроса" }, { status: 400 });
  }

  const apiKey = parseApiKey(body.apiKey);
  const tab = body.tab;
  const usage = body.usage;
  const shop = body.shop ?? body.shopSettings;
  const mp = body.mp ?? body.mpSettings;

  if (!apiKey) {
    return NextResponse.json({ error: "Укажите API-токен Wildberries" }, { status: 400 });
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
    marketplaceId: "wildberries",
    apiKey,
  });
  if (!secretPersist.ok) {
    console.warn("[wildberries/sync-inbox] server secret not saved:", secretPersist.error);
  }

  const cacheKey = `${wildberriesTokenKey(apiKey)}:inbox`;
  const force = body.force === true;

  const returnStale = (stale: SyncPayload, warning: string) =>
    NextResponse.json({
      ...stale,
      cached: true,
      stale: true,
      warning,
    });

  const wbCooldown = getWildberriesSyncCooldown(cacheKey);
  if (wbCooldown && !force) {
    const fresh = getCachedWildberriesSync<SyncPayload>(cacheKey);
    if (fresh && isSyncCacheComplete(fresh)) {
      const refreshed = await refreshCachedInboxPayload({
        payload: fresh,
        shop,
        mp,
        usage,
        apiKey,
        brandName: body.brandName ?? null,
        userId: auth.user.id,
        supabase,
      });
      setCachedWildberriesSync(cacheKey, refreshed, SYNC_CACHE_MS);
      return NextResponse.json({ ...refreshed, cached: true });
    }

    const stale = getStaleWildberriesSync<SyncPayload>(cacheKey);
    if (stale?.items?.length) {
      const refreshed = await refreshCachedInboxPayload({
        payload: stale,
        shop,
        mp,
        usage,
        apiKey,
        brandName: body.brandName ?? null,
        userId: auth.user.id,
        supabase,
      });
      return returnStale(
        refreshed,
        `${wbCooldown.message} Показана сохранённая лента — обновление через ~${Math.ceil(cooldownRetryAfterSec(wbCooldown) / 60)} мин.`
      );
    }

    return NextResponse.json(
      {
        items: [],
        products: [],
        sellerName: body.sellerName ?? "Продавец Wildberries",
        meta: { tab: tab ?? "semi", unansweredCount: 0, fetched: 0 },
        warning: `${wbCooldown.message} Повтор через ~${Math.ceil(cooldownRetryAfterSec(wbCooldown) / 60)} мин.`,
        retryAfterSec: cooldownRetryAfterSec(wbCooldown),
      },
      { status: 200 }
    );
  }

  const cachedSync = getCachedWildberriesSync<SyncPayload>(cacheKey);
  if (cachedSync && !force && isSyncCacheComplete(cachedSync)) {
    const refreshed = await refreshCachedInboxPayload({
      payload: cachedSync,
      shop,
      mp,
      usage,
      apiKey,
      brandName: body.brandName ?? null,
      userId: auth.user.id,
      supabase,
    });
    setCachedWildberriesSync(cacheKey, refreshed, SYNC_CACHE_MS);
    return NextResponse.json({ ...refreshed, cached: true });
  }

  try {
    const result = await coalesceWildberriesSync(cacheKey, () =>
      runWildberriesInboxSync({
        supabase,
        userId: auth.user.id,
        apiKey,
        tab,
        usage,
        shop,
        mp,
        brandName: body.brandName ?? null,
        sellerName: body.sellerName ?? null,
        take: body.take,
        mode: body.mode === "full" ? "full" : "ui",
        force,
      })
    );

    const items = result.items;
    const products = extractWildberriesProducts(items);
    const unansweredCount = result.unansweredCount;

    const payload = {
      items,
      products,
      sellerName: result.sellerName,
      meta: {
        tab,
        unansweredCount,
        unansweredToday: 0,
        fetched: items.length,
        countUnanswered: unansweredCount,
        autoSentCount: result.autoSentCount,
        autoSendWarning: result.autoSendWarning,
        fetchComplete: result.fetchComplete,
        warning: result.syncWarning,
      },
    };

    setCachedWildberriesSync(cacheKey, payload, SYNC_CACHE_MS);

    if (items.length > 0) {
      clearWildberriesSyncCooldown(cacheKey);
    }

    return NextResponse.json(payload);
  } catch (e) {
    const message =
      e instanceof WildberriesApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Не удалось загрузить отзывы";

    const status =
      e instanceof WildberriesApiError && e.status >= 400 && e.status < 500 ? e.status : 502;

    const stale = getStaleWildberriesSync<SyncPayload>(cacheKey);

    if (stale?.items?.length) {
      return returnStale(stale, message);
    }

    const retrySec =
      status === 429
        ? e instanceof WildberriesApiError
          ? Math.min(120, e.retryAfterSec ?? 60)
          : 60
        : undefined;

    if (status === 429 && apiKey) {
      setWildberriesSyncCooldown(
        cacheKey,
        retrySec ?? 60,
        "Wildberries временно ограничивает запросы."
      );
    }

    console.error("[auto-replies/wildberries/sync-inbox]", message);
    return NextResponse.json(
      {
        items: [],
        products: [],
        sellerName: body.sellerName ?? "Продавец Wildberries",
        meta: { tab, unansweredCount: 0, fetched: 0 },
        warning: message,
        retryAfterSec: retrySec,
      },
      { status: 200 }
    );
  }
}
