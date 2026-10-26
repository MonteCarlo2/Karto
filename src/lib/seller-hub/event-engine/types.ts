import type { StoreSignalsBaseline } from "./store-events";
export type SellerEventKind =
  | "stock_out"
  | "low_stock"
  | "sales_new"
  | "sales_up"
  | "sales_down"
  | "price_changed"
  | "discount_changed"
  | "promo_price_changed"
  | "content_score_changed"
  | "photos_changed"
  | "reviews_unanswered"
  | "questions_unanswered"
  | "sync_completed"
  | "product_added"
  | "product_removed"
  // Факты по всему кабинету (не состояния: состояния живут в «Задачах»).
  | "ad_status_changed"
  | "ad_campaign_added"
  | "ad_budget_ended"
  | "ad_budget_topped_up"
  | "ad_product_added"
  | "ad_product_removed"
  | "ad_bid_changed"
  | "ad_limit_changed"
  | "ad_spend_spike"
  | "card_blocked"
  | "card_unblocked"
  | "rating_changed"
  | "buyout_changed"
  | "tariff_logistics_changed"
  | "tariff_storage_changed"
  | "promo_new"
  | "promo_entered"
  | "promo_left"
  | "orders_new"
  | "orders_canceled"
  | "supply_closed"
  | "supply_created"
  | "finance_document"
  | "finance_withdraw_up"
  | "penalties_up"
  | "review_negative"
  | "access_lost"
  | "access_restored"
  | "day_orders_drop"
  | "day_orders_spike"
  | "agent_action"
  // «Умные» события по накопленной истории (см. smart-events.ts).
  | "trend_orders_down"
  | "trend_orders_up"
  | "trend_recovered"
  | "funnel_shift"
  | "product_silent"
  // Настоящие изменения полей карточки («было → стало»).
  | "card_title_changed"
  | "card_description_changed"
  | "card_characteristics_changed"
  | "card_video_changed"
  // Новости портала WB (relevant: «своя» в ленте, general: общая, по умолчанию скрыта) и напоминания об акциях.
  | "news_item"
  | "news_general"
  | "promo_deadline"
  // Прогноз по текущему темпу продаж: товар закончится около такой-то даты.
  | "forecast_stockout";

export type SellerEventGroup = "sales" | "stock" | "price" | "content" | "reviews" | "orders" | "ads" | "money" | "agents" | "system" | "news" | "other";

/**
 * Эти виды описывают состояние («мало запаса», «есть неотвеченные»). Состояния ведёт раздел «Задачи», поэтому в «Событиях» новые такие
 * записи не создаются, а старые из истории не показываются. «Каталог обновлён» и «Появились продажи +1 шт.» тоже не события, а шум; «Изменился контент» по нашей оценке карточки тоже: оценка пересчитывается при изменении формулы, а не карточки (настоящие правки полей это события card_*): продажи по дням и за период — в «Аналитике».
 */
export const RETIRED_EVENT_KINDS: ReadonlySet<SellerEventKind> = new Set(["low_stock", "reviews_unanswered", "questions_unanswered", "sync_completed", "sales_new", "content_score_changed"]);

export type SellerEventSeverity = "critical" | "important" | "info";

export type SellerProductEvent = {
  id: string;
  createdAt: string;
  kind: SellerEventKind;
  group: SellerEventGroup;
  severity: SellerEventSeverity;
  title: string;
  detail: string;
  productTitle: string | null;
  vendorCode: string | null;
  nmId: string | null;
  itemId: string | null;
};

export type ProductBaseline = {
  itemId: string;
  title: string;
  vendorCode: string;
  price: number | null;
  discount: number | null;
  promoPrice: number | null;
  stock: number | null;
  salesQty: number | null;
  /** Подпись окна «текущие 28 / прошлые 28», чтобы не повторять то же сравнение. */
  salesWindow: string | null;
  contentScore: number | null;
  photoCount: number | null;
  coverDays: number | null;
  /** Отпечаток описания и его длина: так видно, что описание правили, не храня сам текст. */
  descriptionHash?: string | null;
  descriptionLength?: number | null;
  characteristicsCount?: number | null;
  hasVideo?: boolean | null;
  absent: boolean;
};

export type StoreBaseline = {
  captured: boolean;
  lastSyncAt: string | null;
  unansweredFeedbacks: number | null;
  unansweredQuestions: number | null;
  /** Прошлый снимок фактов по кабинету (реклама, акции, заказы, поставки, финансы, штрафы, отзывы, доступы). */
  signals?: StoreSignalsBaseline | null;
};

export type SellerEventsState = {
  version: 1;
  products: Record<string, ProductBaseline>;
  store: StoreBaseline;
  events: SellerProductEvent[];
};

export const EVENT_GROUP: Record<SellerEventKind, SellerEventGroup> = {
  stock_out: "stock",
  low_stock: "stock",
  sales_new: "sales",
  sales_up: "sales",
  sales_down: "sales",
  price_changed: "price",
  discount_changed: "price",
  promo_price_changed: "price",
  content_score_changed: "content",
  photos_changed: "content",
  reviews_unanswered: "reviews",
  questions_unanswered: "reviews",
  sync_completed: "other",
  product_added: "other",
  product_removed: "other",
  ad_status_changed: "ads",
  ad_campaign_added: "ads",
  ad_budget_ended: "ads",
  ad_budget_topped_up: "ads",
  ad_product_added: "ads",
  ad_product_removed: "ads",
  ad_bid_changed: "ads",
  ad_limit_changed: "ads",
  ad_spend_spike: "ads",
  card_blocked: "content",
  card_unblocked: "content",
  rating_changed: "reviews",
  buyout_changed: "sales",
  tariff_logistics_changed: "money",
  tariff_storage_changed: "money",
  promo_new: "price",
  promo_entered: "price",
  promo_left: "price",
  orders_new: "orders",
  orders_canceled: "orders",
  supply_closed: "orders",
  supply_created: "orders",
  finance_document: "money",
  finance_withdraw_up: "money",
  penalties_up: "money",
  review_negative: "reviews",
  access_lost: "system",
  access_restored: "system",
  day_orders_drop: "sales",
  day_orders_spike: "sales",
  agent_action: "agents",
  trend_orders_down: "sales",
  trend_orders_up: "sales",
  trend_recovered: "sales",
  funnel_shift: "sales",
  product_silent: "sales",
  card_title_changed: "content",
  card_description_changed: "content",
  card_characteristics_changed: "content",
  card_video_changed: "content",
  news_item: "news",
  news_general: "news",
  promo_deadline: "price",
  forecast_stockout: "stock",
};
