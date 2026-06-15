import { NextRequest, NextResponse } from "next/server";
import { parseApiKey, requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import {
  cooldownRetryAfterSec,
  getCachedOzonVerify,
  getOzonVerifyCooldown,
  ozonCredentialsKey,
  setCachedOzonVerify,
  setOzonVerifyCooldown,
} from "@/lib/services/ozon/server-cache";
import { OzonApiError, parseOzonCredentials, verifyOzonCredentials } from "@/lib/services/ozon/client";
import { createServerClient } from "@/lib/supabase/server";
import { persistServerMarketplaceSecret, persistServerMarketplaceSecretBestEffort } from "@/lib/auto-replies/persist-server-marketplace-secret";

export const runtime = "nodejs";
export const maxDuration = 30;

const VERIFY_OK_TTL_MS = 30 * 60 * 1000;
const VERIFY_429_COOLDOWN_SEC = 2 * 60;

function scheduleOzonSecretPersist(
  userId: string,
  credentials: { clientId: string; apiKey: string },
  shopId?: string
) {
  const supabase = createServerClient();
  void persistServerMarketplaceSecretBestEffort(supabase, userId, {
    shopId,
    marketplaceId: "ozon",
    apiKey: credentials.apiKey,
    clientId: credentials.clientId,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { clientId?: string; apiKey?: string; sellerNameHint?: string | null; shopId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Нужен JSON-тело запроса" }, { status: 400 });
  }

  const credentials = parseOzonCredentials({
    clientId: body.clientId,
    apiKey: parseApiKey(body.apiKey),
  });
  if (!credentials) {
    return NextResponse.json({ error: "Укажите Client ID и API Key Ozon" }, { status: 400 });
  }

  const cacheKey = ozonCredentialsKey(credentials.clientId, credentials.apiKey);
  const cooldown = getOzonVerifyCooldown(cacheKey);
  if (cooldown) {
    return NextResponse.json(
      {
        ok: false,
        error: `${cooldown.message} Повтор через ~${Math.ceil(cooldownRetryAfterSec(cooldown) / 60)} мин.`,
        retryAfterSec: cooldownRetryAfterSec(cooldown),
      },
      { status: 429 }
    );
  }

  const cached = getCachedOzonVerify<{
    sellerName: string;
    unansweredCount: number;
    processedCount: number;
    premiumPlus: boolean;
    reviewApiAvailable: boolean;
    reviewSubscriptionHint?: string;
  }>(cacheKey);
  if (cached) {
    scheduleOzonSecretPersist(auth.user.id, credentials, body.shopId);
    return NextResponse.json({
      ok: true,
      ...cached,
      verifiedAt: new Date().toISOString(),
      cached: true,
    });
  }

  try {
    const result = await verifyOzonCredentials(credentials, body.sellerNameHint);
    setCachedOzonVerify(cacheKey, result, VERIFY_OK_TTL_MS);

    const supabase = createServerClient();
    const persisted = await persistServerMarketplaceSecret(supabase, auth.user.id, {
      shopId: body.shopId,
      marketplaceId: "ozon",
      apiKey: credentials.apiKey,
      clientId: credentials.clientId,
    });
    if (!persisted.ok) {
      console.warn("[ozon/verify] server secret not saved:", persisted.error);
    }

    return NextResponse.json({
      ok: true,
      sellerName: result.sellerName,
      unansweredCount: result.unansweredCount,
      processedCount: result.processedCount,
      premiumPlus: result.premiumPlus,
      reviewApiAvailable: result.reviewApiAvailable,
      reviewSubscriptionHint: result.reviewSubscriptionHint,
      verifiedAt: new Date().toISOString(),
    });
  } catch (e) {
    const message =
      e instanceof OzonApiError ? e.message : e instanceof Error ? e.message : "Не удалось проверить ключи";

    const status = e instanceof OzonApiError && e.status >= 400 && e.status < 500 ? e.status : 502;

    if (status === 429) {
      setOzonVerifyCooldown(cacheKey, VERIFY_429_COOLDOWN_SEC, "Ozon временно ограничивает запросы.");
    }

    return NextResponse.json(
      {
        ok: false,
        error: message,
        ozonMessage: e instanceof OzonApiError ? e.ozonMessage : undefined,
        premiumPlusRequired: e instanceof OzonApiError ? e.premiumPlusRequired : undefined,
        retryAfterSec: status === 429 ? VERIFY_429_COOLDOWN_SEC : undefined,
      },
      { status }
    );
  }
}
