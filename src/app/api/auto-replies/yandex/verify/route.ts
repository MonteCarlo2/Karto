import { NextRequest, NextResponse } from "next/server";
import { parseApiKey, requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import {
  cooldownRetryAfterSec,
  getCachedYandexVerify,
  getYandexVerifyCooldown,
  setCachedYandexVerify,
  setYandexVerifyCooldown,
  yandexCredentialsKey,
} from "@/lib/services/yandex/server-cache";
import { parseYandexCredentials, verifyYandexCredentials, YandexApiError } from "@/lib/services/yandex/client";
import { createServerClient } from "@/lib/supabase/server";
import { persistServerMarketplaceSecret } from "@/lib/auto-replies/persist-server-marketplace-secret";

export const runtime = "nodejs";
export const maxDuration = 30;

const VERIFY_OK_TTL_MS = 30 * 60 * 1000;
const VERIFY_429_COOLDOWN_SEC = 2 * 60;

export async function POST(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    apiKey?: string;
    campaignId?: string;
    businessId?: string;
    sellerNameHint?: string | null;
    shopId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Нужен JSON-тело запроса" }, { status: 400 });
  }

  const parsed = parseYandexCredentials({
    apiKey: parseApiKey(body.apiKey),
    campaignId: body.campaignId,
    businessId: body.businessId,
  });
  if (!parsed) {
    return NextResponse.json({ error: "Укажите токен и Campaign ID Яндекс Маркета" }, { status: 400 });
  }

  const cacheKey = yandexCredentialsKey(parsed.apiKey, parsed.campaignId);
  const cooldown = getYandexVerifyCooldown(cacheKey);
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

  const cached = getCachedYandexVerify<{
    sellerName: string;
    businessId: string;
    campaignId: string;
    unansweredCount: number;
    processedCount: number;
  }>(cacheKey);
  if (cached) {
    return NextResponse.json({
      ok: true,
      ...cached,
      verifiedAt: new Date().toISOString(),
      cached: true,
    });
  }

  try {
    const result = await verifyYandexCredentials(parsed, body.sellerNameHint);
    setCachedYandexVerify(cacheKey, result, VERIFY_OK_TTL_MS);

    const supabase = createServerClient();
    const persisted = await persistServerMarketplaceSecret(supabase, auth.user.id, {
      shopId: body.shopId,
      marketplaceId: "yandex",
      apiKey: parsed.apiKey,
      campaignId: result.campaignId,
      businessId: result.businessId,
    });
    if (!persisted.ok) {
      console.warn("[yandex/verify] server secret not saved:", persisted.error);
    }

    return NextResponse.json({
      ok: true,
      sellerName: result.sellerName,
      businessId: result.businessId,
      campaignId: result.campaignId,
      unansweredCount: result.unansweredCount,
      processedCount: result.processedCount,
      verifiedAt: new Date().toISOString(),
    });
  } catch (e) {
    const message =
      e instanceof YandexApiError ? e.message : e instanceof Error ? e.message : "Не удалось проверить подключение";

    const status = e instanceof YandexApiError && e.status >= 400 && e.status < 500 ? e.status : 502;

    if (status === 429) {
      setYandexVerifyCooldown(cacheKey, VERIFY_429_COOLDOWN_SEC, "Яндекс Маркет временно ограничивает запросы.");
    }

    return NextResponse.json(
      {
        ok: false,
        error: message,
        retryAfterSec: status === 429 ? VERIFY_429_COOLDOWN_SEC : undefined,
      },
      { status }
    );
  }
}
