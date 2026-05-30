import { NextRequest, NextResponse } from "next/server";
import { parseApiKey, requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import {
  cooldownRetryAfterSec,
  getWildberriesSyncCooldown,
  wildberriesTokenKey,
} from "@/lib/services/wildberries/server-cache";
import {
  fetchWildberriesUnansweredCount,
  WildberriesApiError,
} from "@/lib/services/wildberries/client";

export const runtime = "nodejs";
export const maxDuration = 15;

/** Лёгкий опрос WB: только счётчик неотвеченных (1 запрос). */
export async function POST(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { apiKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Нужен JSON-тело запроса" }, { status: 400 });
  }

  const apiKey = parseApiKey(body.apiKey);
  if (!apiKey) {
    return NextResponse.json({ error: "Укажите API-токен Wildberries" }, { status: 400 });
  }

  const cacheKey = `${wildberriesTokenKey(apiKey)}:inbox`;
  const cooldown = getWildberriesSyncCooldown(cacheKey);
  if (cooldown) {
    return NextResponse.json(
      {
        ok: false,
        throttled: true,
        retryAfterSec: cooldownRetryAfterSec(cooldown),
        message: cooldown.message,
      },
      { status: 429 }
    );
  }

  try {
    const countUnanswered = await fetchWildberriesUnansweredCount(apiKey);
    return NextResponse.json({
      ok: true,
      countUnanswered,
      polledAt: new Date().toISOString(),
    });
  } catch (e) {
    const message =
      e instanceof WildberriesApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Не удалось проверить отзывы";

    const status =
      e instanceof WildberriesApiError && e.status >= 400 && e.status < 500 ? e.status : 502;

    return NextResponse.json(
      {
        ok: false,
        error: message,
        retryAfterSec:
          e instanceof WildberriesApiError && e.retryAfterSec ? e.retryAfterSec : undefined,
      },
      { status }
    );
  }
}
