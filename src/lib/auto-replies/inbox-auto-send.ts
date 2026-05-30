import type { SupabaseClient } from "@supabase/supabase-js";

import type { InboxFeedTab, InboxReviewItem } from "./inbox-demo-data";

import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings, StarKey } from "./settings-types";

import { generateAutoReply } from "./generate-auto-reply";

import { prepareReplyForMarketplaceSend } from "./reply-postprocess";

import {

  hydrateInboxReplyDrafts,

  isReviewWithoutText,

  resolveEmptyReviewBody,

  shouldUseEmptyReviewTemplate,

} from "./empty-review-settings";

import { formatInboxReviewDates } from "./inbox-review-dates";

import { resolveStarDeliveryMode, shouldAutoSendInboxItem } from "./inbox-star-rules";

import {

  AUTO_REPLY_INSUFFICIENT_BALANCE_MSG,

  consumeAutoReplyCredits,

} from "@/lib/auto-replies-balance";



export { resolveStarDeliveryMode, shouldAutoSendInboxItem } from "./inbox-star-rules";



export function resolveInboxItemFeed(params: {
  status: InboxReviewItem["status"];
  starRating: StarKey;
  mpSettings: AutoRepliesMarketplaceSettings;
  autoSent?: boolean;
}): InboxFeedTab {
  if (params.status === "sent") {
    return params.autoSent ? "auto" : "semi";
  }
  const starMode = resolveStarDeliveryMode(params.mpSettings, params.starRating);
  return starMode === "auto" ? "auto" : "semi";
}

/** Пересчитать feed только для pending — отправленные остаются в своей вкладке. */
export function reassignInboxItemFeeds(
  items: InboxReviewItem[],
  mpSettings: AutoRepliesMarketplaceSettings
): InboxReviewItem[] {
  return items.map((item) => {
    if (item.status === "sent") return item;
    const feed = resolveInboxItemFeed({
      status: item.status,
      starRating: item.starRating,
      mpSettings,
      autoSent: item.autoSent,
    });
    if (feed === item.feed) return item;
    return { ...item, feed };
  });
}



export function resolveSentAtLabel(params: {
  dateLabel: string;
  autoSent?: boolean;
}): string {
  if (params.autoSent) {
    return `${params.dateLabel} · автоматически`;
  }
  return `${params.dateLabel} · подтверждено`;
}



export function markInboxItemAutoSent(item: InboxReviewItem, replyText: string): InboxReviewItem {

  const { dateLabel } = formatInboxReviewDates(new Date().toISOString());

  return {

    ...item,

    status: "sent",

    feed: "auto",

    autoSent: true,

    replyDraft: replyText,

    canSend: false,

    autoSendError: undefined,

    sentAtLabel: `${dateLabel} · автоматически`,

  };

}



export async function processAutoRepliesInbox(params: {

  items: InboxReviewItem[];

  shopSettings: AutoRepliesShopSettings;

  mpSettings: AutoRepliesMarketplaceSettings;

  brandName?: string | null;

  sendReply: (item: InboxReviewItem, replyText: string) => Promise<void>;

  maxAutoSends?: number;

  userId?: string;

  supabase?: SupabaseClient;

}): Promise<{ items: InboxReviewItem[]; autoSentCount: number; errors: string[] }> {

  const hydrated = hydrateInboxReplyDrafts(params.items, params.shopSettings);

  const pendingAuto = hydrated.filter((item) =>

    shouldAutoSendInboxItem(item, params.mpSettings, params.shopSettings)

  ).length;

  const maxAutoSends = params.maxAutoSends ?? Math.max(pendingAuto, 50);

  const errors: string[] = [];

  let autoSentCount = 0;

  const next = [...hydrated];



  for (let index = 0; index < next.length; index++) {

    if (autoSentCount >= maxAutoSends) break;



    const item = next[index];

    if (!shouldAutoSendInboxItem(item, params.mpSettings, params.shopSettings)) continue;



    const existingDraft = item.replyDraft?.trim();

    const emptyTemplate =

      isReviewWithoutText(item.reviewText) && shouldUseEmptyReviewTemplate(params.shopSettings.style);

    const usesTemplateOnly = emptyTemplate;



    let replyText: string;



    if (existingDraft && existingDraft.length >= 2) {

      replyText = prepareReplyForMarketplaceSend(existingDraft, params.shopSettings);

    } else if (emptyTemplate) {

      replyText = prepareReplyForMarketplaceSend(

        resolveEmptyReviewBody(params.shopSettings.style),

        params.shopSettings

      );

    } else {

      try {

        const generated = await generateAutoReply({

          reviewText: item.reviewText,

          starRating: item.starRating,

          shop: params.shopSettings,

          mp: params.mpSettings,

          brandName: params.brandName ?? null,

          buyerName: item.buyerName,

          productName: item.productName,

          hasReviewPhotos: (item.reviewPhotoUrls?.length ?? 0) > 0,

          revisionHint: null,

          previousReply: null,

        });

        replyText = prepareReplyForMarketplaceSend(generated.reply, params.shopSettings);

      } catch (e) {

        const message = e instanceof Error ? e.message : "Не удалось сгенерировать автоответ";

        next[index] = { ...item, autoSendError: message };

        errors.push(message);

        continue;

      }

    }



    if (replyText.length < 2) {

      const message = "Текст ответа пустой после обработки настроек";

      next[index] = { ...item, replyDraft: replyText, autoSendError: message };

      errors.push(message);

      continue;

    }



    next[index] = { ...item, replyDraft: replyText, draftGeneratedByAi: true, autoSendError: undefined };



    if (params.userId && params.supabase && !usesTemplateOnly) {

      const charge = await consumeAutoReplyCredits(params.supabase, params.userId, 1);

      if (!charge.ok) {

        errors.push(charge.error ?? AUTO_REPLY_INSUFFICIENT_BALANCE_MSG);

        break;

      }

    }



    try {

      await params.sendReply(item, replyText);

      next[index] = markInboxItemAutoSent(next[index], replyText);

      autoSentCount += 1;

    } catch (e) {

      const message = e instanceof Error ? e.message : "Не удалось отправить автоответ";

      errors.push(message);

    }

  }



  return { items: next, autoSentCount, errors };

}


