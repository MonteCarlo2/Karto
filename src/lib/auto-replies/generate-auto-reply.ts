import type { SupabaseClient } from "@supabase/supabase-js";

import type { InboxReviewItem } from "./inbox-demo-data";

import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings } from "./settings-types";

import { type GenerateReplyRequest } from "./reply-generation";

import { finalizeReplyText } from "./reply-postprocess";

import {

  generateAutoReplyViaOpenRouter,

  type AutoReplyPipelineStage,

} from "@/lib/services/openrouter-auto-reply";

import { getNormalizedOpenRouterApiKey } from "@/lib/openrouter-headers";

import { shouldAutoSendInboxItem } from "./inbox-star-rules";

import { consumeAutoReplyCredits } from "@/lib/auto-replies-balance";

import {

  isReviewWithoutText,

  resolveEmptyReviewBody,

  shouldUseEmptyReviewTemplate,

} from "./empty-review-settings";

export type AutoReplyGenerationSource = "openrouter-dual" | "openrouter-writer" | "template" | "local";



export type AutoReplyGenerationResult = {

  reply: string;

  source: AutoReplyGenerationSource;

  stage: AutoReplyPipelineStage;

};



function mapStageToSource(stage: AutoReplyPipelineStage): AutoReplyGenerationSource {

  if (stage === "dual") return "openrouter-dual";

  if (stage === "writer-only") return "openrouter-writer";

  return "local";

}



const AI_UNAVAILABLE_MSG =

  "Генерация ответов через AI временно недоступна. Проверьте подключение и попробуйте снова.";



/** Единая точка генерации: AI (OpenRouter). Шаблон — только если включён в настройках для пустого отзыва. */

export async function generateAutoReply(input: GenerateReplyRequest): Promise<AutoReplyGenerationResult> {

  const isEmpty = isReviewWithoutText(input.reviewText);

  if (isEmpty && shouldUseEmptyReviewTemplate(input.shop.style)) {

    return {

      reply: finalizeReplyText(resolveEmptyReviewBody(input.shop.style), input.shop),

      source: "template",

      stage: "local",

    };

  }



  if (!getNormalizedOpenRouterApiKey()) {

    throw new Error(AI_UNAVAILABLE_MSG);

  }



  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {

    try {

      const attemptInput: GenerateReplyRequest =

        attempt === 0

          ? input

          : {

              ...input,

              revisionHint:

                "Перепиши ответ целиком на русском языке. Только русский — без китайского, английского и других языков (кроме лatin в названиях брендов).",

              previousReply: null,

            };

      const { reply, stage } = await generateAutoReplyViaOpenRouter(attemptInput);

      const finalized = finalizeReplyText(reply, input.shop);

      return {

        reply: finalized,

        source: mapStageToSource(stage),

        stage,

      };

    } catch (e) {

      lastError = e;

    }

  }



  throw lastError instanceof Error ? lastError : new Error(AI_UNAVAILABLE_MSG);

}



function toGenerateInput(

  item: InboxReviewItem,

  shop: AutoRepliesShopSettings,

  mp: AutoRepliesMarketplaceSettings,

  brandName?: string | null

): GenerateReplyRequest {

  return {

    reviewText: item.reviewText,

    starRating: item.starRating,

    shop,

    mp,

    brandName: brandName ?? null,

    buyerName: item.buyerName,

    productName: item.productName,

    hasReviewPhotos: (item.reviewPhotoUrls?.length ?? 0) > 0,

    revisionHint: null,

    previousReply: null,

  };

}



/**

 * AI-ответы для pending в полуавто и для pending без черновика (fallback после сбоя авто-отправки).

 */

export async function enrichPendingInboxDrafts(params: {

  items: InboxReviewItem[];

  shopSettings: AutoRepliesShopSettings;

  mpSettings: AutoRepliesMarketplaceSettings;

  brandName?: string | null;

  maxItems?: number;

  userId?: string;

  supabase?: SupabaseClient;

  /** Не генерировать для звёзд в авто-режиме — их обработает auto-send. */

  skipAutoStarItems?: boolean;

  semiFeedOnly?: boolean;

}): Promise<InboxReviewItem[]> {

  const next = [...params.items];

  const hasOpenRouter = Boolean(getNormalizedOpenRouterApiKey());

  let enriched = 0;

  const cap = params.maxItems;



  for (let index = 0; index < next.length; index++) {

    if (cap != null && enriched >= cap) break;



    const item = next[index];

    if (item.status !== "pending" || item.canSend === false) continue;

    if (params.semiFeedOnly && item.feed !== "semi") {
      const needsEmptyTemplate =
        isReviewWithoutText(item.reviewText) &&
        shouldUseEmptyReviewTemplate(params.shopSettings.style) &&
        item.replyDraft.trim().length < 2;
      if (!needsEmptyTemplate) continue;
    }

    if (item.draftGeneratedByAi && item.replyDraft.trim()) continue;

    if (params.skipAutoStarItems && shouldAutoSendInboxItem(item, params.mpSettings, params.shopSettings)) {
      if (item.replyDraft.trim().length >= 2) continue;
    }

    if (shouldAutoSendInboxItem(item, params.mpSettings, params.shopSettings) && item.replyDraft.trim()) {
      continue;
    }

    const usesTemplateOnly =
      isReviewWithoutText(item.reviewText) && shouldUseEmptyReviewTemplate(params.shopSettings.style);

    if (usesTemplateOnly) {
      next[index] = {
        ...item,
        replyDraft: resolveEmptyReviewBody(params.shopSettings.style),
        draftGeneratedByAi: true,
      };
      enriched += 1;
      continue;
    }

    if (params.userId && params.supabase && hasOpenRouter && !params.skipAutoStarItems && !usesTemplateOnly) {

      const charge = await consumeAutoReplyCredits(params.supabase, params.userId, 1);

      if (!charge.ok) break;

    }



    try {

      const result = await generateAutoReply(

        toGenerateInput(item, params.shopSettings, params.mpSettings, params.brandName)

      );

      next[index] = { ...item, replyDraft: result.reply, draftGeneratedByAi: true };

      enriched += 1;

    } catch (e) {

      console.warn("[enrichPendingInboxDrafts]", e);

    }

  }



  return next;

}


