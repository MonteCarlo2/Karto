import { NextRequest, NextResponse } from "next/server";

/**
 * Базовый URL сайта. На сервере всегда должен быть продакшен-URL, не localhost.
 * redirect_uri должен ТОЧНО совпадать с Callback URL в настройках приложения в OAuth Яндекса.
 */
function getBaseUrl(request: NextRequest): string {
  const fromEnv = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  const origin = request.nextUrl.origin;
  // На проде никогда не редиректим на localhost: приоритет у явного URL с сервера
  if (fromEnv && !fromEnv.includes("localhost")) return fromEnv;
  if (origin.includes("localhost") && fromEnv) return fromEnv;
  return origin;
}

export async function GET(request: NextRequest) {
  const clientId = process.env.YANDEX_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "YANDEX_CLIENT_ID не настроен" },
      { status: 500 }
    );
  }

  const baseUrl = getBaseUrl(request);
  const redirectUri = `${baseUrl}/api/auth/yandex/callback`;
  const state = baseUrl;
  const scope = "login:email login:info";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state,
  });

  const authUrl = `https://oauth.yandex.ru/authorize?${params.toString()}`;
  return NextResponse.redirect(authUrl);
}
