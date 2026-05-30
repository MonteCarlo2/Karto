import type { AutoRepliesMarketplaceId } from "./types";
import type { StarKey } from "./settings-types";

export type InboxFeedTab = "semi" | "auto";

export type InboxReviewItem = {
  id: string;
  feed: InboxFeedTab;
  status: "pending" | "sent";
  starRating: StarKey;
  productName: string;
  productArticle: string;
  marketplaceId: AutoRepliesMarketplaceId;
  buyerLabel: string;
  shopName: string;
  reviewText: string;
  replyDraft: string;
  timeLabel: string;
  dateLabel: string;
  /** Дата для строки ленты (ДД.ММ.ГГГГ) */
  listDateLabel: string;
  sentAtLabel?: string;
  /** ID отзыва в маркетплейсе (для live-интеграции). */
  externalId?: string;
  source?: "demo" | "wildberries" | "ozon" | "yandex";
  nmId?: number;
  brandName?: string;
  orderStatusLabel?: string;
  buyerName?: string;
  productImageUrl?: string;
  reviewPhotoUrls?: string[];
  /** SKU/offerId продавца — сохраняем между sync, чтобы не терять артикул. */
  supplierOfferId?: string;
  /** false — отправка в WB пока отключена. */
  canSend?: boolean;
  /** Ответ отправлен системой без подтверждения (авто-режим по звёздам). */
  autoSent?: boolean;
  /** Ответ уже сгенерирован AI (не перегенерировать при sync). */
  draftGeneratedByAi?: boolean;
  /** ISO-дата публикации отзыва — для объёма ответов и сортировки. */
  reviewPublishedAt?: string;
  /** Последняя ошибка автоотправки (не повторять бесконечно). */
  autoSendError?: string;
};

export const DEMO_INBOX_ITEMS: InboxReviewItem[] = [
  {
    id: "semi-1",
    feed: "semi",
    status: "pending",
    starRating: "5",
    productName: "Ведро хозяйственное, 12 л, 10 шт",
    productArticle: "Арт. 1849203",
    marketplaceId: "ozon",
    buyerLabel: "Покупатель Ozon",
    shopName: "СимСтрой",
    reviewText:
      "Отличное ведро, плотное, ручка удобная. Рёбра жёсткости реально помогают — не мнётся при наполнении. Доставили быстро.",
    replyDraft:
      "Здравствуйте! Спасибо за подробный отзыв — приятно, что отметили удобную ручку и жёсткость корпуса. Будем рады видеть вас снова!",
    timeLabel: "14:32",
    dateLabel: "19 мая, 14:32",
    listDateLabel: "19 мая 2026",
  },
  {
    id: "semi-2",
    feed: "semi",
    status: "pending",
    starRating: "2",
    productName: "Дрель аккумуляторная X200",
    productArticle: "Арт. 772104",
    marketplaceId: "wildberries",
    buyerLabel: "Покупатель WB",
    shopName: "ToolHouse",
    reviewText: "Пришла с царапиной на корпусе, упаковка была помята. Ожидал лучшего качества.",
    replyDraft:
      "Здравствуйте! Нам жаль, что товар пришёл не в идеальном виде. Мы уже разбираемся в ситуации и свяжемся с вами для решения вопроса.",
    timeLabel: "11:08",
    dateLabel: "19 мая, 11:08",
    listDateLabel: "19 мая 2026",
  },
  {
    id: "semi-3",
    feed: "semi",
    status: "pending",
    starRating: "4",
    productName: "Набор ключей Pro 32",
    productArticle: "Арт. 551902",
    marketplaceId: "yandex",
    buyerLabel: "Покупатель Я.Маркет",
    shopName: "ProFix",
    reviewText: "Хороший набор, всё подошло. Минус — кейс мог бы быть плотнее.",
    replyDraft:
      "Здравствуйте! Благодарим за отзыв — рады, что инструмент подошёл. Замечание про кейс передадим команде, спасибо за обратную связь.",
    timeLabel: "09:41",
    dateLabel: "18 мая, 09:41",
    listDateLabel: "18 мая 2026",
  },
  {
    id: "semi-sent-1",
    feed: "semi",
    status: "sent",
    starRating: "5",
    productName: "Перчатки рабочие Pro",
    productArticle: "Арт. 220441",
    marketplaceId: "wildberries",
    buyerLabel: "Покупатель WB",
    shopName: "ToolHouse",
    reviewText: "Всё подошло, качество нормальное.",
    replyDraft: "Здравствуйте! Спасибо за отзыв — рады, что товар оправдал ожидания.",
    timeLabel: "10:20",
    dateLabel: "17 мая, 10:20",
    listDateLabel: "17 мая 2026",
    sentAtLabel: "17 мая, 10:22 · подтверждено вами",
  },
  {
    id: "auto-1",
    feed: "auto",
    status: "sent",
    starRating: "5",
    productName: "Садовые перчатки Grip",
    productArticle: "Арт. 330118",
    marketplaceId: "ozon",
    buyerLabel: "Покупатель Ozon",
    shopName: "СимСтрой",
    reviewText: "Качество супер, не скользят, размер в размер.",
    replyDraft:
      "Здравствуйте! Спасибо за оценку — рады, что перчатки подошли по размеру и удобны в работе.",
    timeLabel: "08:15",
    dateLabel: "18 мая, 08:15",
    listDateLabel: "18 мая 2026",
    sentAtLabel: "18 мая, 08:16 · автоматически",
  },
  {
    id: "auto-2",
    feed: "auto",
    status: "sent",
    starRating: "5",
    productName: "Форма для выпечки 26 см",
    productArticle: "Арт. 902771",
    marketplaceId: "wildberries",
    buyerLabel: "Покупатель WB",
    shopName: "BakeLab",
    reviewText: "Только звёзды",
    replyDraft: "Спасибо за высокую оценку! Будем рады видеть вас снова.",
    timeLabel: "07:02",
    dateLabel: "18 мая, 07:02",
    listDateLabel: "18 мая 2026",
    sentAtLabel: "18 мая, 07:02 · автоматически",
  },
  {
    id: "auto-3",
    feed: "auto",
    status: "sent",
    starRating: "3",
    productName: "LED-лента 5 м, тёплый белый",
    productArticle: "Арт. 441209",
    marketplaceId: "ozon",
    buyerLabel: "Покупатель Ozon",
    shopName: "СимСтрой",
    reviewText: "Светит нормально, но блок питания греется сильнее, чем ожидал.",
    replyDraft:
      "Здравствуйте! Спасибо за отзыв. Блок рассчитан на указанную нагрузку — если нагрев кажется чрезмерным, напишите нам, поможем проверить комплектацию.",
    timeLabel: "16:44",
    dateLabel: "17 мая, 16:44",
    listDateLabel: "17 мая 2026",
    sentAtLabel: "17 мая, 16:45 · автоматически",
  },
];

export function inboxItemsForTab(items: InboxReviewItem[], tab: InboxFeedTab): InboxReviewItem[] {
  return items.filter((item) => item.feed === tab);
}

export function inboxSemiPendingCount(items: InboxReviewItem[]): number {
  return items.filter((item) => item.feed === "semi" && item.status === "pending").length;
}

export function inboxSemiSentCount(items: InboxReviewItem[]): number {
  return items.filter((item) => item.feed === "semi" && item.status === "sent").length;
}

export function inboxAutoSentCount(items: InboxReviewItem[]): number {
  return items.filter((item) => item.feed === "auto" && item.status === "sent").length;
}

export function inboxAutoPendingCount(items: InboxReviewItem[]): number {
  return items.filter((item) => item.feed === "auto" && item.status === "pending").length;
}

/** Pending auto, которые реально можно отправить (без ошибки и вне лимита). */
export function inboxAutoSendablePendingCount(
  items: InboxReviewItem[],
  canSend: (item: InboxReviewItem) => boolean
): number {
  return items.filter(
    (item) =>
      item.feed === "auto" &&
      item.status === "pending" &&
      canSend(item)
  ).length;
}

/** Подписи переключателя ленты (две зоны: подтверждение + авто-журнал). */
export function inboxFeedTabLabels(pendingCount: number) {
  return {
    semi:
      pendingCount > 0 ? `Подтверждение · ${pendingCount}` : "Подтверждение",
    auto: "Авто-журнал",
  } as const;
}

/** Лента inbox: в полуавто — все отзывы (сначала без ответа), в журнале — авто-отправленные. */
export function inboxVisibleItems(
  items: InboxReviewItem[],
  tab: InboxFeedTab,
  liveMode: boolean
): InboxReviewItem[] {
  if (!liveMode) {
    return inboxItemsForTab(items, tab).filter((item) =>
      tab === "semi" ? item.status === "pending" : item.status === "sent"
    );
  }

  if (tab === "semi") {
    return [...items]
      .filter((item) => item.feed === "semi")
      .sort((a, b) => {
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (b.status === "pending" && a.status !== "pending") return 1;
        return 0;
      });
  }

  return items.filter((item) => item.feed === "auto").sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (b.status === "pending" && a.status !== "pending") return 1;
    return 0;
  });
}

/** Демо-отзывы только в ручном режиме. Полуавто/авто — только API или пустая лента. */
export function shouldShowInboxDemo(usage: string): boolean {
  return usage === "manual";
}

export function demoInboxItemsForMarketplace(marketplaceId: AutoRepliesMarketplaceId): InboxReviewItem[] {
  return DEMO_INBOX_ITEMS.filter((item) => item.marketplaceId === marketplaceId);
}
