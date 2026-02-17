import { NextRequest, NextResponse } from "next/server";

/**
 * Редирект на страницу авторизации Яндекса.
 * Callback — наш /api/auth/yandex/callback.
 * redirect_uri должен ТОЧНО совпадать с Callback URL в настройках приложения в OAuth Яндекса.
 */
function getBaseUrl(request: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv && fromEnv.trim()) return fromEnv.replace(/\/$/, "");
  return request.nextUrl.origin;
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
