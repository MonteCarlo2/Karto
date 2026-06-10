import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboxFeedTab, InboxReviewItem } from "@/lib/auto-replies/inbox-demo-data";
import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings } from "@/lib/auto-replies/settings-types";
import type { AutoRepliesUsageId } from "@/lib/auto-replies/types";
import {
  extractWildberriesProducts,
  mapWildberriesFeedbacksToInbox,
  resolveInboxShopDisplayName,
} from "@/lib/auto-replies/wildberries-inbox";
import {
  getStaleWildberriesSync,
  setCachedWildberriesSync,
  wildberriesTokenKey,
} from "@/lib/services/wildberries/server-cache";
import { mergeInboxReviewLists } from "@/lib/auto-replies/inbox-item-merge";
import { sortInboxItemsByReviewDate } from "@/lib/auto-replies/inbox-review-scope";
import { finishInboxSyncPipeline, type InboxSyncMode } from "@/lib/auto-replies/inbox-sync-finish";
import {
  answerWildberriesFeedback,
  fetchWildberriesInboxSlice,
  type WildberriesInboxFetchProgress,
} from "@/lib/services/wildberries/client";

const SYNC_CACHE_MS = 10 * 60_000;
const UI_PAGES_PER_SYNC = 15;
const CRON_PAGES_PER_SYNC = 50;
/** Cron: каждый тик заново тянет свежие неотвеченные с начала ленты (dateDesc). */
const CRON_UNANSWERED_PAGES = 10;

type WbSyncCachePayload = {
  items?: InboxReviewItem[];
  meta?: {
    fetchProgress?: WildberriesInboxFetchProgress;
    [key: string]: unknown;
  };
};

function mergeInboxItems(existing: InboxReviewItem[], incoming: InboxReviewItem[]): InboxReviewItem[] {
  return mergeInboxReviewLists(existing, incoming, "wildberries");
}

function countPendingInboxItems(items: InboxReviewItem[]): number {
  return items.filter((item) => item.feed === "semi" && item.status === "pending").length;
}

function defaultProgress(): WildberriesInboxFetchProgress {
  return {
    unansweredSkip: 0,
    answeredSkip: 0,
    unansweredComplete: false,
    fetchComplete: false,
  };
}

export type WildberriesInboxSyncResult = {
  items: InboxReviewItem[];
  sellerName: string;
  unansweredCount: number;
  autoSentCount: number;
  autoSendWarning?: string;
  fetchComplete?: boolean;
  syncWarning?: string;
};

export async function runWildberriesInboxSync(input: {
  supabase: SupabaseClient;
  userId: string;
  apiKey: string;
  tab?: InboxFeedTab;
  usage: AutoRepliesUsageId;
  shop: AutoRepliesShopSettings;
  mp: AutoRepliesMarketplaceSettings;
  brandName?: string | null;
  sellerName?: string | null;
  take?: number;
  mode?: InboxSyncMode;
  force?: boolean;
  /** Снимок из Supabase — подмешивается, если in-memory кэш пуст (после рестарта). */
  seedItems?: InboxReviewItem[];
}): Promise<WildberriesInboxSyncResult> {
  const apiKey = input.apiKey.trim();
  const tab = input.tab ?? "semi";
  const mp = input.mp;
  const shop = input.shop;
  const mode = input.mode ?? "ui";
  const cacheKey = `${wildberriesTokenKey(apiKey)}:inbox`;
  const take = Math.min(100, Math.max(20, Number(input.take ?? 100)));

  const wbSellerName =
    input.sellerName?.trim() || mp.connection.sellerName?.trim() || "Продавец Wildberries";
  const displayShopName = resolveInboxShopDisplayName({
    brandName: input.brandName,
    sellerName: wbSellerName,
  });

  const stalePayload = getStaleWildberriesSync<WbSyncCachePayload>(cacheKey);
  const seedItems = (input.seedItems ?? []) as InboxReviewItem[];
  const staleItems = mergeInboxItems(
    seedItems,
    (stalePayload?.items ?? []) as InboxReviewItem[]
  );

  let progress: WildberriesInboxFetchProgress =
    stalePayload?.meta?.fetchProgress ?? defaultProgress();

  if (input.force === true) {
    progress = defaultProgress();
  }

  const maxPages = mode === "full" ? CRON_PAGES_PER_SYNC : UI_PAGES_PER_SYNC;
  let syncWarning: string | undefined;
  let mergedBeforePipeline: InboxReviewItem[];

  if (mode === "full") {
    try {
      const slice = await fetchWildberriesInboxSlice(apiKey, {
        take,
        progress: defaultProgress(),
        maxPagesPerStatus: CRON_UNANSWERED_PAGES,
        includeAnswered: false,
      });
      const freshItems = mapWildberriesFeedbacksToInbox({
        feedbacks: slice.feedbacks ?? [],
        tab: "semi",
        sellerName: displayShopName,
        shopSettings: shop,
        mpSettings: mp,
        brandName: input.brandName ?? null,
        usage: mp.usage ?? input.usage,
        existingItems: staleItems,
      });
      mergedBeforePipeline = sortInboxItemsByReviewDate(mergeInboxItems(staleItems, freshItems));
    } catch (e) {
      mergedBeforePipeline = sortInboxItemsByReviewDate([...staleItems]);
      const message =
        e instanceof Error ? e.message : "Wildberries временно недоступен";
      syncWarning =
        mergedBeforePipeline.length > 0
          ? `${message} Продолжаем с сохранённой лентой и автоотправкой.`
          : message;
    }
  } else if (!progress.fetchComplete || input.force === true) {
    try {
      const slice = await fetchWildberriesInboxSlice(apiKey, {
        take,
        progress,
        maxPagesPerStatus: maxPages,
        includeAnswered: true,
      });
      progress = slice.progress;

      const freshItems = mapWildberriesFeedbacksToInbox({
        feedbacks: slice.feedbacks ?? [],
        tab: "semi",
        sellerName: displayShopName,
        shopSettings: shop,
        mpSettings: mp,
        brandName: input.brandName ?? null,
        usage: mp.usage ?? input.usage,
        existingItems: staleItems,
      });

      mergedBeforePipeline = sortInboxItemsByReviewDate(mergeInboxItems(staleItems, freshItems));

      if (!progress.fetchComplete) {
        syncWarning =
          mergedBeforePipeline.length > 0
            ? `Загружено ${mergedBeforePipeline.length} отзывов — подгружаем остальные в фоне.`
            : "Подключаемся к Wildberries…";
      }
    } catch (e) {
      mergedBeforePipeline = sortInboxItemsByReviewDate([...staleItems]);
      const message =
        e instanceof Error ? e.message : "Wildberries временно недоступен";
      syncWarning =
        mergedBeforePipeline.length > 0
          ? `${message} Продолжаем с сохранённой лентой и автоотправкой.`
          : message;
    }
  } else {
    mergedBeforePipeline = sortInboxItemsByReviewDate([...staleItems]);
  }

  const runAiPipeline =
    mode === "full" ||
    progress.fetchComplete ||
    mergedBeforePipeline.some((item) => item.status === "pending");

  let items: InboxReviewItem[];
  let autoSentCount = 0;
  let autoSendWarning: string | undefined;

  if (runAiPipeline) {
    const pipeline = await finishInboxSyncPipeline({
      items: mergedBeforePipeline,
      mode,
      usage: input.usage,
      shop,
      mp,
      brandName: input.brandName ?? null,
      userId: input.userId,
      supabase: input.supabase,
      sendReply:
        input.usage !== "manual"
          ? async (item, replyText) => {
              const feedbackId = item.externalId?.trim();
              if (!feedbackId) throw new Error("Не найден ID отзыва");
              await answerWildberriesFeedback({ token: apiKey, feedbackId, text: replyText });
            }
          : undefined,
    });
    items = pipeline.items;
    autoSentCount = pipeline.autoSentCount;
    autoSendWarning = pipeline.autoSendWarning;
  } else {
    items = mergedBeforePipeline;
  }

  const unansweredCount = countPendingInboxItems(items);
  const products = extractWildberriesProducts(items);

  setCachedWildberriesSync(
    cacheKey,
    {
      items,
      products,
      sellerName: displayShopName,
      meta: {
        tab,
        unansweredCount,
        countUnanswered: unansweredCount,
        fetched: items.length,
        autoSentCount,
        fetchProgress: progress,
        fetchComplete: progress.fetchComplete,
      },
    },
    SYNC_CACHE_MS
  );

  return {
    items,
    sellerName: displayShopName,
    unansweredCount,
    autoSentCount,
    autoSendWarning,
    fetchComplete: progress.fetchComplete,
    syncWarning,
  };
}
