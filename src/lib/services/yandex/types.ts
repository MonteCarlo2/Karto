export type YandexCredentials = {
  apiKey: string;
  campaignId: string;
  businessId: string;
};

export type YandexCampaign = {
  id: number;
  domain?: string;
  clientId?: number;
  business?: { id: number; name?: string };
  placementType?: string;
  apiAvailability?: string;
};

export type YandexGoodsFeedback = {
  feedbackId: number;
  createdAt?: string;
  needReaction?: boolean;
  identifiers?: {
    orderId?: number;
    offerId?: string;
    modelId?: number;
  };
  author?: string;
  description?: {
    advantages?: string;
    disadvantages?: string;
    comment?: string;
  };
  media?: {
    photos?: string[] | null;
    videos?: string[] | null;
  };
  statistics?: {
    rating?: number;
    commentsCount?: number;
    recommended?: boolean;
  };
  /** Текст ответа продавца (подтягивается отдельным запросом при sync). */
  sellerReplyText?: string;
};

export type YandexGoodsFeedbackComment = {
  id: number;
  feedbackId?: number;
  text?: string;
  parentId?: number;
  canModify?: boolean;
  status?: string;
  author?: {
    type?: "USER" | "BUSINESS" | string;
    name?: string;
  };
};

export type YandexGoodsFeedbackListResult = {
  feedbacks: YandexGoodsFeedback[];
  nextPageToken?: string;
};

export type YandexVerifyResult = {
  ok: true;
  sellerName: string;
  businessId: string;
  campaignId: string;
  unansweredCount: number;
  processedCount: number;
};
