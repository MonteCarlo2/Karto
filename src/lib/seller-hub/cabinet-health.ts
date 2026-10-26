import type { SellerHubAreaId } from "./nav";
import type { SellerCatalogSnapshot } from "./types";

export type HubUrgency = "critical" | "important" | "recommended";

export type HubHealthZoneId = "orders" | "stocks" | "ads" | "reviews" | "content";

export type HubHealthZone = {
  id: HubHealthZoneId;
  label: string;
  critical: number;
  important: number;
  recommended: number;
};

export type HubFeedItem = {
  id: string;
  urgency: HubUrgency;
  text: string;
  area: SellerHubAreaId;
};

export function buildCabinetHealth(snapshot: SellerCatalogSnapshot | undefined): {
  zones: HubHealthZone[];
  feed: HubFeedItem[];
} {
  const items = snapshot?.items ?? [];
  const outOfStock = items.filter((item) => item.totalStock === 0);
  const lowStock = items.filter((item) => item.totalStock != null && item.totalStock > 0 && item.totalStock <= 2);
  const noPrice = items.filter((item) => (item.discountedPrice ?? item.price) == null);
  const noPhoto = items.filter((item) => !item.imageUrl);
  const unanswered = snapshot?.comms?.unansweredFeedbacks ?? 0;
  const questions = snapshot?.comms?.unansweredQuestions ?? 0;
  /** Показы идут из бюджета кампании, а не из «баланса»: считаем активные кампании с остатком бюджета 0 ₽ (и < 500 ₽). */
  const liveAds = (snapshot?.ads?.campaigns ?? []).filter((c) => c.status === 9);
  const exhaustedAds = liveAds.filter((c) => c.budget === 0);
  const lowBudgetAds = liveAds.filter((c) => c.budget != null && c.budget > 0 && c.budget < 500);
  const newOrders = snapshot?.orders?.newCount ?? 0;

  const zones: HubHealthZone[] = [
    {
      id: "orders",
      label: "Заказы и продажи",
      critical: 0,
      important: newOrders > 0 ? 1 : 0,
      recommended: snapshot?.analytics ? 1 : 0,
    },
    {
      id: "stocks",
      label: "Остатки",
      critical: outOfStock.length,
      important: lowStock.length,
      recommended: 0,
    },
    {
      id: "ads",
      label: "Реклама",
      critical: exhaustedAds.length,
      important: lowBudgetAds.length,
      recommended: snapshot?.ads ? Math.max(0, (snapshot.ads.pausedCount ?? 0)) : 0,
    },
    {
      id: "reviews",
      label: "Отзывы",
      critical: unanswered >= 5 ? unanswered : 0,
      important: unanswered > 0 && unanswered < 5 ? unanswered : questions,
      recommended: 0,
    },
    {
      id: "content",
      label: "Контент",
      critical: 0,
      important: noPrice.length,
      recommended: noPhoto.length,
    },
  ];

  const feed: HubFeedItem[] = [];
  if (outOfStock[0]) {
    feed.push({
      id: "oos",
      urgency: "critical",
      text: `${outOfStock.length} товар(ов) с нулевым остатком. Ближайший: ${outOfStock[0].title}.`,
      area: "stocks",
    });
  }
  if (unanswered > 0) {
    feed.push({
      id: "reviews",
      urgency: unanswered >= 5 ? "critical" : "important",
      text: `${unanswered} отзыв(ов) без ответа.`,
      area: "knowledge",
    });
  }
  if (exhaustedAds.length > 0) {
    feed.push({
      id: "ads",
      urgency: "critical",
      text: `У активных кампаний закончился бюджет: ${exhaustedAds.length}.`,
      area: "ads",
    });
  }
  if (noPrice.length > 0) {
    feed.push({
      id: "price",
      urgency: "important",
      text: `${noPrice.length} карточек без цены в выгрузке.`,
      area: "prices",
    });
  }
  if (newOrders > 0) {
    feed.push({
      id: "orders",
      urgency: "important",
      text: `${newOrders} новых сборочных заданий FBS.`,
      area: "orders",
    });
  }
  if (feed.length === 0) {
    feed.push({
      id: "calm",
      urgency: "recommended",
      text: "Срочных сигналов по текущему снимку нет.",
      area: "overview",
    });
  }

  return { zones, feed };
}
