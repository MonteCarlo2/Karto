import type { InboxFeedTab } from "./inbox-demo-data";

import type { AutoRepliesConnectionSettings, AutoRepliesMarketplaceSettings, AutoRepliesShopSettings } from "./settings-types";

import type { AutoRepliesMarketplaceId, AutoRepliesUsageId } from "./types";

import type { InboxProductPreview } from "./ozon-inbox";

import type { InboxReviewItem } from "./inbox-demo-data";

import { syncOzonInbox, verifyOzonConnection } from "./ozon-client-api";

import { syncWildberriesInbox, verifyWildberriesConnection } from "./wildberries-client-api";

import { syncYandexInbox, verifyYandexConnection } from "./yandex-client-api";



export type MarketplaceSyncInboxResult = {

  items: InboxReviewItem[];

  products: InboxProductPreview[];

  sellerName: string;

  meta: {

    tab: InboxFeedTab;

    unansweredCount: number;

    unansweredToday: number;

    fetched: number;

    premiumPlus?: boolean;
    reviewApiAvailable?: boolean;
    reviewScopeLimitConsumed?: number;
    warning?: string;
    autoSendWarning?: string;
    stale?: boolean;
    retryAfterSec?: number;
    fetchComplete?: boolean;

  };

};



export function isMarketplaceCredentialsReady(

  marketplaceId: AutoRepliesMarketplaceId,

  connection: AutoRepliesConnectionSettings

): boolean {

  const apiKey = connection.apiKey.trim();

  if (apiKey.length < 16) return false;



  if (marketplaceId === "ozon") {

    return Boolean(connection.clientId?.trim());

  }



  if (marketplaceId === "yandex") {

    return Boolean(connection.campaignId?.trim());

  }



  return true;

}



export function isMarketplaceLiveReady(

  marketplaceId: AutoRepliesMarketplaceId,

  usage: AutoRepliesUsageId,

  connection: AutoRepliesConnectionSettings

): boolean {

  if (usage === "manual") return false;

  return isMarketplaceCredentialsReady(marketplaceId, connection);

}



export async function verifyMarketplaceConnection(

  marketplaceId: AutoRepliesMarketplaceId,

  connection: AutoRepliesConnectionSettings,

  sellerNameHint?: string | null

) {

  if (marketplaceId === "wildberries") {

    return verifyWildberriesConnection(connection.apiKey, sellerNameHint);

  }

  if (marketplaceId === "ozon") {

    return verifyOzonConnection(connection.clientId ?? "", connection.apiKey, sellerNameHint);

  }

  if (marketplaceId === "yandex") {

    return verifyYandexConnection(

      connection.apiKey,

      connection.campaignId ?? "",

      connection.businessId,

      sellerNameHint

    );

  }

  throw new Error("Интеграция для этой площадки пока не поддерживается");

}



export async function syncMarketplaceInbox(input: {

  marketplaceId: AutoRepliesMarketplaceId;

  connection: AutoRepliesConnectionSettings;

  tab: InboxFeedTab;

  usage: AutoRepliesUsageId;

  shopSettings: AutoRepliesShopSettings;

  mpSettings: AutoRepliesMarketplaceSettings;

  brandName?: string | null;

  sellerName?: string | null;

  force?: boolean;

}): Promise<MarketplaceSyncInboxResult> {

  if (input.marketplaceId === "wildberries") {

    return syncWildberriesInbox({

      apiKey: input.connection.apiKey,

      tab: input.tab,

      usage: input.usage,

      shopSettings: input.shopSettings,

      mpSettings: input.mpSettings,

      brandName: input.brandName,

      sellerName: input.sellerName,

      force: input.force,

    });

  }



  if (input.marketplaceId === "ozon") {

    return syncOzonInbox({

      clientId: input.connection.clientId ?? "",

      apiKey: input.connection.apiKey,

      tab: input.tab,

      usage: input.usage,

      shopSettings: input.shopSettings,

      mpSettings: input.mpSettings,

      brandName: input.brandName,

      sellerName: input.sellerName,

      force: input.force,

    });

  }



  if (input.marketplaceId === "yandex") {

    return syncYandexInbox({

      apiKey: input.connection.apiKey,

      campaignId: input.connection.campaignId ?? "",

      businessId: input.connection.businessId ?? "",

      tab: input.tab,

      usage: input.usage,

      shopSettings: input.shopSettings,

      mpSettings: input.mpSettings,

      brandName: input.brandName,

      sellerName: input.sellerName,

    });

  }



  throw new Error("Синхронизация для этой площадки пока не поддерживается");

}



export function marketplaceLiveLabel(marketplaceId: AutoRepliesMarketplaceId): string {

  if (marketplaceId === "ozon") return "Live · Ozon";

  if (marketplaceId === "wildberries") return "Live · Wildberries";

  if (marketplaceId === "yandex") return "Live · Яндекс Маркет";

  return "Live";

}

