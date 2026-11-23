import type { SupabaseClient } from "@supabase/supabase-js";

import type { InboxReviewItem } from "./inbox-demo-data";

import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings } from "./settings-types";

import { generateAutoReply } from "./generate-auto-reply";

import { prepareReplyForMarketplaceSend } from "./reply-postprocess";

import {
  hydrateInboxReplyDrafts,
  isReviewWithoutText,
  resolveEmptyReviewBody,
  shouldChargeAutoReplyCreditForSend,
  shouldUseEmptyReviewTemplate,
} from "./empty-review-settings";

import { formatInboxReviewDates } from "./inbox-review-dates";

import { shouldAutoSendInboxItem } from "./inbox-star-rules";

import {

  AUTO_REPLY_INSUFFICIENT_BALANCE_MSG,

  consumeAutoReplyCredits,

  getAutoReplyBalance,

} from "@/lib/auto-replies-balance";

export { resolveStarDeliveryMode, shouldAutoSendInboxItem } from "./inbox-star-rules";
export {
  reassignInboxItemFeeds,
  resolveInboxItemFeed,
  resolveSentAtLabel,
} from "./inbox-feed-utils";



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

    autoSendAttempts: undefined,

    autoSendFailedAt: undefined,

    sentAtLabel: `${dateLabel} · автоматически`,

  };

}



/** Неудача автоотправки: запоминаем причину, число попыток и время, чтобы следующая попытка была не раньше паузы. */
function failedAutoSend(item: InboxReviewItem, message: string): InboxReviewItem {
  return { ...item, autoSendError: message, autoSendAttempts: (item.autoSendAttempts ?? 0) + 1, autoSendFailedAt: new Date().toISOString() };
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

  let creditsLeft: number | null = null;



  for (let index = 0; index < next.length; index++) {

    if (autoSentCount >= maxAutoSends) break;



    const item = next[index];

    if (!shouldAutoSendInboxItem(item, params.mpSettings, params.shopSettings)) continue;



    const existingDraft = item.replyDraft?.trim();

    const emptyTemplate =
      isReviewWithoutText(item.reviewText) && shouldUseEmptyReviewTemplate(params.shopSettings.style);
    const shouldCharge = shouldChargeAutoReplyCreditForSend(item.reviewText, params.shopSettings);

    let replyText: string;



    if (existingDraft && existingDraft.length >= 2) {

      try {

        replyText = prepareReplyForMarketplaceSend(existingDraft, params.shopSettings);

      } catch (e) {

        // Заготовка не прошла проверку (например, чужой язык): не ломаем остальные отзывы, этот остаётся на ручное подтверждение.
        const message = e instanceof Error ? e.message : "Заготовка ответа не прошла проверку";

        next[index] = failedAutoSend(item, message);

        errors.push(message);

        continue;

      }

    } else if (emptyTemplate) {

      try {

        replyText = prepareReplyForMarketplaceSend(

          resolveEmptyReviewBody(params.shopSettings.style),

          params.shopSettings

        );

      } catch (e) {

        const message = e instanceof Error ? e.message : "Шаблон ответа не прошёл проверку";

        next[index] = failedAutoSend(item, message);

        errors.push(message);

        continue;

      }

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

        next[index] = failedAutoSend(item, message);

        errors.push(message);

        continue;

      }

    }



    if (replyText.length < 2) {

      const message = "Текст ответа пустой после обработки настроек";

      next[index] = failedAutoSend({ ...item, replyDraft: replyText }, message);

      errors.push(message);

      continue;

    }



    next[index] = { ...item, replyDraft: replyText, draftGeneratedByAi: true, autoSendError: undefined };



    // Сначала убеждаемся, что ответ оплачен остатком, потом отправляем, и только после успеха списываем: сбой WB не сжигает ответы.
    if (params.userId && params.supabase && shouldCharge) {

      // Остаток читаем один раз за проход и дальше ведём счёт сами: лишних запросов к базе на каждый отзыв нет.
      if (creditsLeft === null) creditsLeft = await getAutoReplyBalance(params.supabase, params.userId).catch(() => 0);

      if (creditsLeft < 1) {

        errors.push(AUTO_REPLY_INSUFFICIENT_BALANCE_MSG);

        break;

      }

    }



    try {

      await params.sendReply(item, replyText);

    } catch (e) {

      const message = e instanceof Error ? e.message : "Не удалось отправить автоответ";

      next[index] = failedAutoSend(next[index], message);

      errors.push(message);

      continue;

    }

    next[index] = markInboxItemAutoSent(next[index], replyText);

    autoSentCount += 1;

    if (params.userId && params.supabase && shouldCharge) {

      const charge = await consumeAutoReplyCredits(params.supabase, params.userId, 1);

      if (!charge.ok) {

        // Ответ уже ушёл; остаток закончился в этот же момент. Дальше не отправляем.
        errors.push(charge.error ?? AUTO_REPLY_INSUFFICIENT_BALANCE_MSG);

        break;

      }

      if (creditsLeft !== null) creditsLeft -= 1;

    }

  }



  return { items: next, autoSentCount, errors };

}


