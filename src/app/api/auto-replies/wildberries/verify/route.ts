import { NextRequest, NextResponse } from "next/server";
import { parseApiKey, requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import {
  cooldownRetryAfterSec,
  coalesceWildberriesVerify,
  getCachedWildberriesVerify,
  getStaleWildberriesVerify,
  getWildberriesVerifyCooldown,
  setCachedWildberriesVerify,
  setWildberriesVerifyCooldown,
  wildberriesTokenKey,
} from "@/lib/services/wildberries/server-cache";
import { verifyWildberriesToken, WildberriesApiError } from "@/lib/services/wildberries/client";
import { createServerClient } from "@/lib/supabase/server";
import { persistServerMarketplaceSecret, persistServerMarketplaceSecretBestEffort } from "@/lib/auto-replies/persist-server-marketplace-secret";

export const runtime = "nodejs";
export const maxDuration = 30;

const VERIFY_OK_TTL_MS = 30 * 60 * 1000;
const VERIFY_429_COOLDOWN_SEC = 30;

function fallbackSellerName(hint?: string | null) {
  return hint?.trim() || "Продавец Wildberries";
}

function scheduleWildberriesSecretPersist(
  userId: string,
  apiKey: string,
  shopId?: string
) {
  const supabase = createServerClient();
  void persistServerMarketplaceSecretBestEffort(supabase, userId, {
    shopId,
    marketplaceId: "wildberries",
    apiKey,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { apiKey?: string; sellerNameHint?: string | null; shopId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Нужен JSON-тело запроса" }, { status: 400 });
  }

  const apiKey = parseApiKey(body.apiKey);
  if (!apiKey) {
    return NextResponse.json({ error: "Укажите API-токен Wildberries" }, { status: 400 });
  }

  const cacheKey = wildberriesTokenKey(apiKey);

  const cooldown = getWildberriesVerifyCooldown(cacheKey);
  if (cooldown) {
    const retryAfterSec = cooldownRetryAfterSec(cooldown);
    const stale = getCachedWildberriesVerify(cacheKey) ?? getStaleWildberriesVerify(cacheKey);
    if (stale) {
      scheduleWildberriesSecretPersist(auth.user.id, apiKey, body.shopId);
      return NextResponse.json({
        ok: true,
        sellerName: stale.sellerName,
        unansweredCount: stale.unansweredCount,
        unansweredToday: stale.unansweredToday,
        verifiedAt: new Date().toISOString(),
        cached: true,
        warning: `${cooldown.message} Показаны сохранённые данные.`,
        retryAfterSec,
      });
    }
    scheduleWildberriesSecretPersist(auth.user.id, apiKey, body.shopId);
    return NextResponse.json({
      ok: true,
      sellerName: fallbackSellerName(body.sellerNameHint),
      unansweredCount: 0,
      unansweredToday: 0,
      verifiedAt: new Date().toISOString(),
      warning: `${cooldown.message} Повтор через ~${Math.ceil(retryAfterSec / 60)} мин.`,
      retryAfterSec,
    });
  }

  const cached = getCachedWildberriesVerify(cacheKey);
  if (cached) {
    scheduleWildberriesSecretPersist(auth.user.id, apiKey, body.shopId);
    return NextResponse.json({
      ok: true,
      sellerName: cached.sellerName,
      unansweredCount: cached.unansweredCount,
      unansweredToday: cached.unansweredToday,
      verifiedAt: new Date().toISOString(),
      cached: true,
    });
  }

  try {
    const result = await coalesceWildberriesVerify(cacheKey, () =>
      verifyWildberriesToken(apiKey, {
        sellerNameHint: body.sellerNameHint,
      })
    );
    setCachedWildberriesVerify(cacheKey, result, VERIFY_OK_TTL_MS);

    const supabase = createServerClient();
    const persisted = await persistServerMarketplaceSecret(supabase, auth.user.id, {
      shopId: body.shopId,
      marketplaceId: "wildberries",
      apiKey,
    });
    if (!persisted.ok) {
      console.warn("[wildberries/verify] server secret not saved:", persisted.error);
    }

    return NextResponse.json({
      ok: true,
      sellerName: result.sellerName,
      unansweredCount: result.unansweredCount,
      unansweredToday: result.unansweredToday,
      verifiedAt: new Date().toISOString(),
      tokenType: result.tokenType,
      tokenTypeLabel: result.tokenTypeLabel,
      tokenRateLimitHint: result.tokenRateLimitHint,
      tokenWarning: result.tokenWarning,
    });
  } catch (e) {
    const message =
      e instanceof WildberriesApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Не удалось проверить токен";

    const status = e instanceof WildberriesApiError && e.status >= 400 && e.status < 500 ? e.status : 502;

    if (status === 429) {
      const retrySec =
        e instanceof WildberriesApiError && e.retryAfterSec && e.retryAfterSec > 0
          ? Math.min(120, e.retryAfterSec)
          : VERIFY_429_COOLDOWN_SEC;
      setWildberriesVerifyCooldown(
        cacheKey,
        retrySec,
        "Wildberries временно ограничивает запросы для этого токена."
      );

      const stale = getStaleWildberriesVerify(cacheKey);
      if (stale) {
        return NextResponse.json({
          ok: true,
          sellerName: stale.sellerName,
          unansweredCount: stale.unansweredCount,
          unansweredToday: stale.unansweredToday,
          verifiedAt: new Date().toISOString(),
          cached: true,
          warning: message,
          retryAfterSec: retrySec,
        });
      }

      return NextResponse.json({
        ok: true,
        sellerName: fallbackSellerName(body.sellerNameHint),
        unansweredCount: 0,
        unansweredToday: 0,
        verifiedAt: new Date().toISOString(),
        warning: message,
        retryAfterSec: retrySec,
      });
    }

    console.error("[auto-replies/wildberries/verify]", message);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
