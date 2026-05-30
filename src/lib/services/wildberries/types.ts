export type WbApiEnvelope<T> = {
  data: T;
  error: boolean;
  errorText?: string;
  additionalErrors?: unknown;
};

export type WbProductDetails = {
  imtId?: number;
  nmId?: number;
  productName?: string;
  supplierArticle?: string;
  supplierName?: string;
  brandName?: string;
  size?: string;
};

export type WbFeedbackAnswer = {
  text?: string;
  state?: string;
  editable?: boolean;
  createDate?: string;
};

export type WbFeedback = {
  id: string;
  text?: string;
  pros?: string;
  cons?: string;
  productValuation?: number;
  createdDate?: string;
  answer?: WbFeedbackAnswer | null;
  state?: string;
  productDetails?: WbProductDetails;
  userName?: string;
  orderStatus?: string;
  wasViewed?: boolean;
  photoLinks?: { fullSize?: string; miniSize?: string }[];
};

export type WbFeedbacksListData = {
  countUnanswered?: number;
  countArchive?: number;
  feedbacks?: WbFeedback[];
};

export type WbUnansweredCountData = {
  countUnanswered?: number;
  countUnansweredToday?: number;
};

export type WbSellerInfo = {
  name?: string;
  sid?: string;
  tradeMark?: string;
};

export type WbVerifyResult = {
  ok: true;
  sellerName: string;
  unansweredCount: number;
  unansweredToday: number;
  tokenType?: string;
  tokenTypeLabel?: string;
  tokenRateLimitHint?: string;
  tokenWarning?: string;
};
