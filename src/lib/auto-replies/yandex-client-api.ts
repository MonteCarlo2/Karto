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

export async function verifyYandexConnection(
  apiKey: string,
  campaignId: string,
  businessId: string | undefined,
  sellerNameHint?: string | null
) {
  const token = await getAccessToken();
  if (!token) throw new Error("Войдите в аккаунт KARTO");

  const res = await fetch("/api/auto-replies/yandex/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ apiKey, campaignId, businessId, sellerNameHint }),
  });

  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    sellerName?: string;
    businessId?: string;
    campaignId?: string;
    unansweredCount?: number;
    processedCount?: number;
    verifiedAt?: string;
    retryAfterSec?: number;
    cached?: boolean;
  };

  if (!res.ok || !data.ok) {
    const err = new Error(data.error || "Не удалось проверить подключение Яндекс Маркета") as Error & {
      retryAfterSec?: number;
    };
    err.retryAfterSec = data.retryAfterSec;
    throw err;
  }

  return data;
}

export async function syncYandexInbox(input: {
  apiKey: string;
  campaignId: string;
  businessId: string;
  tab: InboxFeedTab;
  usage: AutoRepliesUsageId;
  shopSettings: AutoRepliesShopSettings;
  mpSettings: AutoRepliesMarketplaceSettings;
  brandName?: string | null;
  sellerName?: string | null;
}): Promise<MarketplaceSyncInboxResult> {
  const token = await getAccessToken();
  if (!token) throw new Error("Войдите в аккаунт KARTO");

  const res = await fetch("/api/auto-replies/yandex/sync-inbox", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      apiKey: input.apiKey,
      campaignId: input.campaignId,
      businessId: input.businessId,
      tab: input.tab,
      usage: input.usage,
      shop: input.shopSettings,
      mp: input.mpSettings,
      brandName: input.brandName,
      sellerName: input.sellerName,
    }),
  });

  const data = (await res.json()) as MarketplaceSyncInboxResult & { error?: string };

  if (!res.ok) {
    throw new Error(data.error || "Не удалось загрузить отзывы Яндекс Маркета");
  }

  return data;
}

export async function sendYandexReply(input: {
  apiKey: string;
  campaignId: string;
  businessId: string;
  feedbackId: string;
  text: string;
}): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error("Войдите в аккаунт KARTO");

  const res = await fetch("/api/auto-replies/yandex/send-reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      apiKey: input.apiKey,
      campaignId: input.campaignId,
      businessId: input.businessId,
      feedbackId: input.feedbackId,
      text: input.text,
    }),
  });

  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Не удалось опубликовать ответ");
  }
}
