import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const YANDEX_TOKEN_URL = "https://oauth.yandex.ru/token";
const YANDEX_USER_INFO_URL = "https://login.yandex.ru/info?format=json";

/**
 * Callback после авторизации в Яндексе.
 * Обменивает code на токен, получает данные пользователя, создаёт/находит пользователя в Supabase и выдаёт сессию через magic link.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // Базовый URL для редиректов: на сервере не должен быть localhost (иначе после входа уведёт на localhost)
  const baseUrl = (() => {
    const fromEnv = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
    const origin = request.nextUrl.origin;
    if (fromEnv && !fromEnv.includes("localhost")) return fromEnv;
    if (origin.includes("localhost") && fromEnv) return fromEnv;
    return origin;
  })();

  // На проде редирект на localhost ломает вход — требуем явный URL
  if (process.env.NODE_ENV === "production" && baseUrl.includes("localhost")) {
    console.error("Yandex callback: baseUrl is localhost in production. Set NEXT_PUBLIC_APP_URL to https://karto.pro on the server.");
    return NextResponse.redirect(
      `${request.nextUrl.origin}/login?error=${encodeURIComponent("Ошибка настройки: на сервере задайте NEXT_PUBLIC_APP_URL=https://karto.pro")}`
    );
  }

  const redirectUri = `${baseUrl}/api/auth/yandex/callback`;

  if (error) {
    const desc = searchParams.get("error_description") || error;
    return NextResponse.redirect(
      `${baseUrl}/login?error=${encodeURIComponent(desc)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${baseUrl}/login?error=${encodeURIComponent("Нет кода от Яндекса")}`
    );
  }

  const clientId = process.env.YANDEX_CLIENT_ID;
  const clientSecret = process.env.YANDEX_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${baseUrl}/login?error=${encodeURIComponent("OAuth не настроен (YANDEX_CLIENT_ID/SECRET)")}`
    );
  }

  // 1) Обмен code на access_token
  const tokenRes = await fetch(YANDEX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    console.error("Yandex token error:", tokenRes.status, errBody);
    return NextResponse.redirect(
      `${baseUrl}/login?error=${encodeURIComponent("Ошибка обмена кода на токен")}`
    );
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    return NextResponse.redirect(
      `${baseUrl}/login?error=${encodeURIComponent("Яндекс не вернул токен")}`
    );
  }

  // 2) Данные пользователя
  const userRes = await fetch(YANDEX_USER_INFO_URL, {
    headers: { Authorization: `OAuth ${accessToken}` },
  });

  if (!userRes.ok) {
    return NextResponse.redirect(
      `${baseUrl}/login?error=${encodeURIComponent("Не удалось получить данные пользователя")}`
    );
  }

  const yandexUser = await userRes.json();
  const email = yandexUser.default_email || yandexUser.emails?.[0];
  if (!email) {
    return NextResponse.redirect(
      `${baseUrl}/login?error=${encodeURIComponent("У аккаунта Яндекс нет email")}`
    );
  }

  const fullName = [yandexUser.first_name, yandexUser.last_name]
    .filter(Boolean)
    .join(" ")
    .trim() || yandexUser.display_name || yandexUser.login || "";

  // 3) Supabase: создать пользователя (если нет), иначе просто войти — один аккаунт на один Яндекс
  const supabase = createServerClient();

  try {
    const { error: createError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: fullName || undefined,
        avatar_url: yandexUser.default_avatar_id
          ? `https://avatars.yandex.net/get-yapic/${yandexUser.default_avatar_id}/islands-200`
          : undefined,
        provider: "yandex",
      },
    });

    const isExistingUser =
      createError?.message && /already|already registered|already exists|duplicate/i.test(createError.message);

    if (createError && !isExistingUser) {
      console.error("Supabase createUser error:", createError);
      return NextResponse.redirect(
        `${baseUrl}/login?error=${encodeURIComponent(createError.message)}`
      );
    }

    // Для уже зарегистрированного — редирект на главную с параметром «С возвращением»
    const redirectTo = isExistingUser ? `${baseUrl}/?welcome_back=1` : `${baseUrl}/`;

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });

    const actionLink = (linkData as { properties?: { action_link?: string } } | null)?.properties?.action_link;
    if (linkError || !actionLink) {
      console.error("generateLink error:", linkError);
      return NextResponse.redirect(
        `${baseUrl}/login?error=${encodeURIComponent("Не удалось создать сессию")}`
      );
    }

    return NextResponse.redirect(actionLink);
  } catch (e) {
    console.error("Yandex callback error:", e);
    return NextResponse.redirect(
      `${baseUrl}/login?error=${encodeURIComponent("Ошибка входа")}`
    );
  }
}
