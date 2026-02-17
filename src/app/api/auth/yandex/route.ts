import { NextRequest, NextResponse } from "next/server";

/**
 * Редирект на страницу авторизации Яндекса.
 * Callback — наш /api/auth/yandex/callback (без Supabase Edge Function).
 */
export async function GET(request: NextRequest) {
  const clientId = process.env.YANDEX_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "YANDEX_CLIENT_ID не настроен" },
      { status: 500 }
    );
  }

  const origin = request.nextUrl.origin;
  const redirectUri = `${origin}/api/auth/yandex/callback`;
  const state = origin;
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
