/** Идентификаторы мастера автоответов — общие для мастера и рабочей панели. */
export type AutoRepliesMarketplaceId =
  | "ozon"
  | "wildberries"
  | "yandex";

export type AutoRepliesUsageId =
  /** Только текст отзыва, без API */
  | "manual"
  /** API, подтверждение отправки вручную */
  | "semi"
  /** API, отправка автоматическая где разрешено */
  | "auto";
