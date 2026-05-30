import { createBrowserClient } from "@/lib/supabase/client";
import type { InboxFeedTab } from "./inbox-demo-data";
import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings } from "./settings-types";
import type { AutoRepliesUsageId } from "./types";
import type { MarketplaceSyncInboxResult } from "./marketplace-live";

async function getAccessToken(): Promise<string | null> {
  const supabase = createBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function verifyOzonConnection(
  clientId: string,
  apiKey: string,
  sellerNameHint?: string | null
) {
  const token = await getAccessToken();
  if (!token) throw new Error("Войдите в аккаунт KARTO");

  const res = await fetch("/api/auto-replies/ozon/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ clientId, apiKey, sellerNameHint }),
  });

  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    sellerName?: string;
    unansweredCount?: number;
    processedCount?: number;
    premiumPlus?: boolean;
    reviewApiAvailable?: boolean;
    reviewSubscriptionHint?: string;
    verifiedAt?: string;
    retryAfterSec?: number;
    premiumPlusRequired?: boolean;
    cached?: boolean;
  };

  if (!res.ok || !data.ok) {
    const err = new Error(data.error || "Не удалось проверить ключи Ozon") as Error & {
      retryAfterSec?: number;
      premiumPlusRequired?: boolean;
    };
    err.retryAfterSec = data.retryAfterSec;
    err.premiumPlusRequired = data.premiumPlusRequired;
    throw err;
  }

  return data;
}

export async function syncOzonInbox(input: {
  clientId: string;
  apiKey: string;
  tab: InboxFeedTab;
  usage: AutoRepliesUsageId;
  shopSettings: AutoRepliesShopSettings;
  mpSettings: AutoRepliesMarketplaceSettings;
  brandName?: string | null;
  sellerName?: string | null;
  force?: boolean;
}): Promise<MarketplaceSyncInboxResult> {
  const token = await getAccessToken();
  if (!token) throw new Error("Войдите в аккаунт KARTO");

  const res = await fetch("/api/auto-replies/ozon/sync-inbox", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      clientId: input.clientId,
      apiKey: input.apiKey,
      tab: input.tab,
      usage: input.usage,
      shop: input.shopSettings,
      mp: input.mpSettings,
      brandName: input.brandName,
      sellerName: input.sellerName,
      force: input.force === true,
    }),
  });

  const data = (await res.json()) as MarketplaceSyncInboxResult & {
    error?: string;
    premiumPlusRequired?: boolean;
  };

  if (!res.ok) {
    const err = new Error(data.error || "Не удалось загрузить отзывы Ozon") as Error & {
      premiumPlusRequired?: boolean;
    };
    err.premiumPlusRequired = data.premiumPlusRequired;
    throw err;
  }

  return data;
}

export async function sendOzonReply(input: {
  clientId: string;
  apiKey: string;
  reviewId: string;
  text: string;
}): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error("Войдите в аккаунт KARTO");

  const res = await fetch("/api/auto-replies/ozon/send-reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      clientId: input.clientId,
      apiKey: input.apiKey,
      reviewId: input.reviewId,
      text: input.text,
    }),
  });

  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    premiumPlusRequired?: boolean;
  };

  if (!res.ok || !data.ok) {
    const err = new Error(data.error || "Не удалось опубликовать ответ") as Error & {
      premiumPlusRequired?: boolean;
    };
    err.premiumPlusRequired = data.premiumPlusRequired;
    throw err;
  }
}
