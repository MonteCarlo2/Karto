export type OzonReviewStatus = "ALL" | "UNPROCESSED" | "PROCESSED";

export type OzonReview = {
  id: string;
  text?: string;
  rating?: number;
  sku?: number;
  status?: string;
  published_at?: string;
  order_status?: string;
  comments_amount?: number;
  photos_amount?: number;
  videos_amount?: number;
  /** Текст ответа продавца — подтягивается через comment/list. */
  sellerReplyText?: string;
};

export type OzonReviewListResult = {
  reviews: OzonReview[];
  has_next?: boolean;
  last_id?: string;
};

export type OzonReviewCountResult = {
  processed?: number;
  unprocessed?: number;
};

export type OzonProductInfo = {
  sku?: number;
  name?: string;
  offer_id?: string;
  id?: number;
  primary_image?: string | string[];
  images?: string[];
};

export type OzonReviewComment = {
  id?: string;
  text?: string;
  is_official?: boolean;
  is_owner?: boolean;
  published_at?: string;
};

export type OzonSellerInfo = {
  name?: string;
  company?: {
    name?: string;
    inn?: string;
  };
};

export type OzonVerifyResult = {
  ok: true;
  sellerName: string;
  unansweredCount: number;
  processedCount: number;
  /** @deprecated используйте reviewApiAvailable */
  premiumPlus: boolean;
  reviewApiAvailable: boolean;
  reviewSubscriptionHint?: string;
};

export type OzonCredentials = {
  clientId: string;
  apiKey: string;
};
