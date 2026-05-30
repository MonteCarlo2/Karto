/** Тексты и ссылки про подписку Ozon для работы с отзывами через API. */

export const OZON_REVIEW_SUBSCRIPTION_SHORT =
  "Premium Pro или «Управление отзывами»";

export const OZON_REVIEW_SUBSCRIPTION_CONFIRMED =
  "Подписка подтверждена — отзывы будут загружаться, ответы отправляться через API.";

export const OZON_REVIEW_SUBSCRIPTION_DENIED =
  "Подписка не подтверждена — загрузка отзывов и отправка ответов через API недоступны.";

export const OZON_MANUAL_MODE_HIGHLIGHT =
  "Без подписки Premium Pro или «Управление отзывами» отзывы из кабинета не загружаются и ответы через API не отправляются. При этом вы можете работать в режиме «По тексту отзыва»: скопируйте текст отзыва из Ozon вручную — KARTO сгенерирует готовый ответ, который вы сами опубликуете в кабинете.";

export const OZON_CABINET_MODE_SUBSCRIPTION_LINE =
  "Для этого режима нужна подписка «Управление отзывами» или Premium Pro.";

export const OZON_MARKETPLACE_SELECTED_NOTICE =
  "Для полуавтоматического и автоматического режимов работы с отзывами через API нужна подписка Premium Pro или «Управление отзывами». Ручной режим «По тексту отзыва» доступен без подписки.";

export const OZON_API_KEY_SCOPES_HINT =
  "Какие доступы отметить при генерации ключа — смотрите в инструкции ниже.";

export const OZON_SUBSCRIPTION_NEED_LINE =
  "Для полуавтоматического и автоматического режимов нужна подписка Premium Pro или «Управление отзывами».";

export const OZON_SUBSCRIPTION_RECOMMENDATION =
  "Рекомендуем начать с «Управление отзывами» — обычно это дешевле Premium Pro.";

export const OZON_SUBSCRIPTION_TERMS_NOTE =
  "Перед подключением обязательно прочитайте условия подписки на сайте Ozon.";

export const OZON_PREMIUM_PRO_URL = "https://seller.ozon.ru/app/subscriptions/premium";

export const OZON_REVIEW_MANAGEMENT_URL = "https://seller.ozon.ru/app/reviews/subscription";

/** @deprecated используйте OZON_REVIEW_SUBSCRIPTION_DENIED */
export const OZON_REVIEW_SUBSCRIPTION_HINT = OZON_REVIEW_SUBSCRIPTION_DENIED;

export const OZON_API_METHODS_HINT =
  "KARTO использует Seller API: проверка кабинета (/v1/seller/info), список и счётчик отзывов (/v1/review/list, /v1/review/count), публикация ответов (/v1/review/comment/create), карточки товаров (/v3/product/info/list). Ключ — с доступами Company, Review и Product read-only.";

/** @deprecated используйте OZON_API_METHODS_HINT */
export const OZON_REVIEW_SUBSCRIPTION_API_HINT = OZON_API_METHODS_HINT;

export function ozonNeedsReviewSubscription(usage: "manual" | "semi" | "auto"): boolean {
  return usage === "semi" || usage === "auto";
}

/** Подписка явно подтверждена (после verify или успешного sync). */
export function ozonReviewApiReady(
  reviewApiAvailable: boolean | undefined,
  premiumPlus: boolean | undefined
): boolean {
  if (reviewApiAvailable === true) return true;
  if (premiumPlus === true) return true;
  return false;
}

/** Подписка явно отклонена — показываем баннеры и блокируем sync. */
export function ozonReviewApiBlocked(
  reviewApiAvailable: boolean | undefined,
  premiumPlus: boolean | undefined
): boolean {
  if (reviewApiAvailable === false) return true;
  if (premiumPlus === false && reviewApiAvailable !== true) return true;
  return false;
}
