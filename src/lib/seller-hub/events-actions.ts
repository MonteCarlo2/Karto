import type { SellerProductEvent } from "@/lib/seller-hub/event-engine/types";
import type { SellerHubAreaId } from "@/lib/seller-hub/nav";

/**
 * Куда вести из уведомления: раздел платформы (и вкладка аналитики, если нужна). Уведомление не просто текст:
 * по нему можно сразу перейти туда, где с этим работают.
 */

export type AnalyticsTabHint = "summary" | "daily" | "funnel" | "products" | "money" | "stock" | "ads" | "market";

export type EventTarget =
  | { kind: "area"; area: SellerHubAreaId; label: string; analyticsTab?: AnalyticsTabHint }
  /** Ответы на отзывы живут в отдельном рабочем пространстве. */
  | { kind: "reviews"; label: string };

export function eventTarget(event: SellerProductEvent): EventTarget | null {
  switch (event.kind) {
    case "stock_out":
    case "low_stock":
    case "forecast_stockout":
      return { kind: "area", area: "stocks", label: "Открыть остатки" };
    case "price_changed":
    case "discount_changed":
    case "promo_price_changed":
      return { kind: "area", area: "prices", label: "Открыть цены" };
    case "promo_new":
    case "promo_entered":
    case "promo_left":
      return { kind: "area", area: "promotions", label: "Открыть акции" };
    case "sales_up":
    case "sales_down":
    case "sales_new":
    case "product_silent":
      return { kind: "area", area: "analytics", label: "Открыть аналитику товаров", analyticsTab: "products" };
    case "day_orders_drop":
    case "day_orders_spike":
    case "trend_orders_down":
    case "trend_orders_up":
    case "trend_recovered":
      return { kind: "area", area: "analytics", label: "Открыть динамику заказов", analyticsTab: "daily" };
    case "funnel_shift":
      return { kind: "area", area: "analytics", label: "Открыть воронку", analyticsTab: "funnel" };
    case "rating_changed":
    case "review_negative":
    case "reviews_unanswered":
    case "questions_unanswered":
      return { kind: "reviews", label: "Открыть ответы на отзывы" };
    case "orders_new":
    case "orders_canceled":
      return { kind: "area", area: "orders", label: "Открыть заказы" };
    case "supply_closed":
    case "supply_created":
      return { kind: "area", area: "deliveries", label: "Открыть поставки" };
    case "ad_status_changed":
    case "ad_campaign_added":
    case "ad_budget_ended":
    case "ad_budget_topped_up":
    case "ad_product_added":
    case "ad_product_removed":
    case "ad_bid_changed":
    case "ad_limit_changed":
    case "ad_spend_spike":
      return { kind: "area", area: "ads", label: "Открыть рекламу" };
    case "penalties_up":
    case "tariff_logistics_changed":
    case "tariff_storage_changed":
      return { kind: "area", area: "analytics", label: "Открыть деньги", analyticsTab: "money" };
    case "finance_document":
    case "finance_withdraw_up":
      return { kind: "area", area: "finance", label: "Открыть финансы" };
    case "agent_action":
      return { kind: "area", area: "agents", label: "Открыть агентов" };
    case "access_lost":
    case "access_restored":
      return { kind: "area", area: "integration", label: "Открыть подключение" };
    case "buyout_changed":
      return { kind: "area", area: "analytics", label: "Открыть аналитику товаров", analyticsTab: "products" };
    case "card_blocked":
    case "card_unblocked":
    case "product_added":
    case "product_removed":
    case "photos_changed":
    case "content_score_changed":
    case "card_title_changed":
    case "card_description_changed":
    case "card_characteristics_changed":
    case "card_video_changed":
      return { kind: "area", area: "catalog", label: "Открыть товары" };
    case "news_item":
    case "news_general":
      return null;
    case "promo_deadline":
      return { kind: "area", area: "promotions", label: "Открыть акции" };
    case "sync_completed":
      return null;
    default: {
      const unexpected: never = event.kind;
      return unexpected;
    }
  }
}

/** Ключ подсказки вкладки аналитики между разделами (как у вкладки агентов). */
export const ANALYTICS_TAB_HINT_KEY = "karto-hub-analytics-tab";
export const ANALYTICS_TABS: readonly AnalyticsTabHint[] = ["summary", "daily", "funnel", "products", "money", "stock", "ads", "market"];
