import { NextRequest, NextResponse } from "next/server";
import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings } from "@/lib/auto-replies/settings-types";
import type { AutoRepliesUsageId } from "@/lib/auto-replies/types";
import type { InboxReviewItem } from "@/lib/auto-replies/inbox-demo-data";
import { parseApiKey, requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import { runWildberriesPendingAutoSend } from "@/lib/auto-replies/wildberries-auto-send";
import { consumeReviewScopeLimit } from "@/lib/auto-replies/inbox-review-scope";
import { createServerClient } from "@/lib/supabase/server";
import {
  getCachedWildberriesSync,
  getStaleWildberriesSync,
  setCachedWildberriesSync,
  wildberriesTokenKey,
} from "@/lib/services/wildberries/server-cache";

export const runtime = "nodejs";
export const maxDuration = 60;

const CACHE_MS = 10 * 60_000;

export async function POST(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    apiKey?: string;
    usage?: AutoRepliesUsageId;
    shop?: AutoRepliesShopSettings;
    shopSettings?: AutoRepliesShopSettings;
    mp?: AutoRepliesMarketplaceSettings;
    mpSettings?: AutoRepliesMarketplaceSettings;
    brandName?: string | null;
    items?: InboxReviewItem[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Нужен JSON-тело запроса" }, { status: 400 });
  }

  const apiKey = parseApiKey(body.apiKey);
  const usage = body.usage;
  const shop = body.shop ?? body.shopSettings;
  const mp = body.mp ?? body.mpSettings;

  if (!apiKey) {
    return NextResponse.json({ error: "Укажите API-токен Wildberries" }, { status: 400 });
  }
  if (usage !== "semi" && usage !== "auto") {
    return NextResponse.json({ error: "Укажите usage: semi или auto" }, { status: 400 });
  }
  if (!shop?.style || !shop?.templates || !shop?.training || !shop?.advanced) {
    return NextResponse.json({ error: "Настройки магазина не переданы" }, { status: 400 });
  }
  if (!mp?.usage || !mp?.starRules || !mp?.reviewScope || !mp?.connection) {
    return NextResponse.json({ error: "Настройки маркетплейса не переданы" }, { status: 400 });
  }

  const cacheKey = `${wildberriesTokenKey(apiKey)}:inbox`;
  const cached =
    getCachedWildberriesSync<{ items?: InboxReviewItem[]; meta?: Record<string, unknown> }>(cacheKey) ??
    getStaleWildberriesSync<{ items?: InboxReviewItem[]; meta?: Record<string, unknown> }>(cacheKey);

  const sourceItems =
    (Array.isArray(body.items) && body.items.length > 0 ? body.items : cached?.items) ?? [];

  if (sourceItems.length === 0) {
    return NextResponse.json({
      items: [],
      autoSentCount: 0,
      warning: "Нет отзывов для автоотправки",
    });
  }

  const supabase = createServerClient();
  const result = await runWildberriesPendingAutoSend({
    items: sourceItems,
    shop,
    mp,
    usage,
    apiKey,
    brandName: body.brandName ?? null,
    userId: auth.user.id,
    supabase,
  });
  const reviewScopeLimitConsumed = consumeReviewScopeLimit(
    mp.reviewScope,
    result.autoSentCount
  ).limitConsumed;

  if (cached) {
    setCachedWildberriesSync(
      cacheKey,
      {
        ...cached,
        items: result.items,
        meta: {
          ...(cached.meta ?? {}),
          autoSentCount: (Number(cached.meta?.autoSentCount) || 0) + result.autoSentCount,
          autoSendWarning: result.autoSendWarning,
          reviewScopeLimitConsumed,
        },
      },
      CACHE_MS
    );
  }

  return NextResponse.json({
    items: result.items,
    autoSentCount: result.autoSentCount,
    autoSendWarning: result.autoSendWarning,
    reviewScopeLimitConsumed,
  });
}
