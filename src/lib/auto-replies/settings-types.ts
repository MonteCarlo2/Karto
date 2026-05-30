import type { AutoRepliesReviewScopeSettings } from "./review-scope-settings";
import type { AutoRepliesMarketplaceId, AutoRepliesUsageId } from "./types";

export type StylePresetId = "warm" | "neutral" | "formal" | "custom";

export type ToneKind = "warm" | "neutral" | "formal";

export type ResponseLength = "short" | "normal" | "long" | "auto";

export type AddressForm = "vy" | "ty";

export type DeliveryContext = "ignore" | "marketplace" | "seller";

export type ConnectionStatus = "disconnected" | "active" | "error";

export type AutoRepliesStyleSettings = {
  preset: StylePresetId;
  addressForm: AddressForm;
  useBuyerName: boolean;
  mentionProduct: boolean;
  length: ResponseLength;
  emojis: boolean;
  thankForPhotos: boolean;
  deliveryContext: DeliveryContext;
  /** Свой шаблон для отзыва без текста (только оценка). */
  emptyReviewEnabled: boolean;
  emptyReviewCustomText: string;
  tonePositive: ToneKind;
  toneNeutral: ToneKind;
  toneNegative: ToneKind;
};

export type SignatureRotationMode = "random" | "sequential";

export type ReplySignature = {
  id: string;
  text: string;
  /** Для каких рейтингов действует подпись. Пустой список = все. */
  starRatings: StarKey[];
  enabled: boolean;
  createdAt: string;
};

export type AutoRepliesTemplateSettings = {
  signaturesEnabled: boolean;
  rotationMode: SignatureRotationMode;
  rotationIndex: number;
  signatures: ReplySignature[];
};

export type AutoRepliesTrainingSettings = {
  aboutShop: string;
  rulesAndFaq: string;
  documents: TrainingDocument[];
  referenceImages: TrainingReferenceImage[];
};

export type TrainingDocKind = "pdf" | "txt" | "md";

export type TrainingDocument = {
  id: string;
  name: string;
  kind: TrainingDocKind;
  sizeBytes: number;
  uploadedAt: string;
  extractedText: string;
  charCount: number;
  status: "ready" | "error";
  errorMessage?: string;
};

export type TrainingReferenceImage = {
  id: string;
  name: string;
  sizeBytes: number;
  uploadedAt: string;
};

export type AutoRepliesAdvancedSettings = {
  /** Проверять текст отзыва на стоп-слова перед генерацией ответа. */
  stopWordsEnabled: boolean;
  stopWords: string[];
  /** Исключать минус-слова при генерации ответа ИИ. */
  minusWordsEnabled: boolean;
  /** Слова, которые ИИ не использует при генерации ответа. */
  minusWords: string[];
};

export type StarDeliveryMode = "confirm" | "auto";

export type StarKey = "1" | "2" | "3" | "4" | "5";

export type AutoRepliesStarRules = {
  /** Режим отправки для каждого рейтинга отдельно. */
  byStar: Record<StarKey, StarDeliveryMode>;
};

export type AutoRepliesConnectionSettings = {
  cabinetEnabled: boolean;
  apiKey: string;
  /** Client ID для Ozon Seller API. */
  clientId?: string;
  /** Campaign ID магазина в Partner API Яндекс Маркета. */
  campaignId?: string;
  /** Business ID кабинета (заполняется после verify). */
  businessId?: string;
  status: ConnectionStatus;
  /** Имя продавца после проверки интеграции. */
  sellerName?: string;
  /** ISO-время последней успешной проверки. */
  verifiedAt?: string;
  /** Неотвеченных отзывов по данным маркетплейса. */
  unansweredCount?: number;
  /** Ozon Review API доступен (Premium Pro / «Управление отзывами»). */
  premiumPlus?: boolean;
  /** Явный флаг доступа к Review API Ozon после verify. */
  reviewApiAvailable?: boolean;
  lastError?: string;
};

export type AutoRepliesShopSettings = {
  /** Название магазина в панели автоответов (не из API маркетплейса). */
  displayName?: string;
  style: AutoRepliesStyleSettings;
  templates: AutoRepliesTemplateSettings;
  training: AutoRepliesTrainingSettings;
  advanced: AutoRepliesAdvancedSettings;
};

export type AutoRepliesMarketplaceSettings = {
  usage: AutoRepliesUsageId;
  starRules: AutoRepliesStarRules;
  connection: AutoRepliesConnectionSettings;
  reviewScope: AutoRepliesReviewScopeSettings;
};

export type AutoRepliesSettingsRoot = {
  version: 1;
  shops: Record<string, AutoRepliesShopSettings>;
  marketplaces: Record<string, AutoRepliesMarketplaceSettings>;
};

export type MarketplaceSettingsKey = `${string}:${AutoRepliesMarketplaceId}`;
