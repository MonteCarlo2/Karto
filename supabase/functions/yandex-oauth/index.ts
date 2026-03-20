// Supabase Edge Function: callback после авторизации в Яндексе.
// Redirect URI в приложении Яндекс: https://ТВОЙ_ПРОЕКТ.supabase.co/functions/v1/yandex-oauth

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const YANDEX_TOKEN_URL = "https://oauth.yandex.ru/token";
const YANDEX_USER_INFO_URL = "https://login.yandex.ru/info?format=json";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // URL сайта для redirect_to (например https://karto.pro)
  const error = url.searchParams.get("error");

  const siteOrigin = state || "https://karto.pro";

  if (error) {
    const desc = url.searchParams.get("error_description") || error;
    return Response.redirect(`${siteOrigin}/login?error=${encodeURIComponent(desc)}`);
  }

  if (!code) {
    return Response.redirect(`${siteOrigin}/login?error=${encodeURIComponent("Нет кода от Яндекса")}`);
  }

  const clientId = Deno.env.get("YANDEX_CLIENT_ID");
  const clientSecret = Deno.env.get("YANDEX_CLIENT_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!clientId || !clientSecret) {
    return Response.redirect(`${siteOrigin}/login?error=${encodeURIComponent("OAuth не настроен")}`);
  }

  const redirectUri = `${supabaseUrl}/functions/v1/yandex-oauth`;

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
    return Response.redirect(`${siteOrigin}/login?error=${encodeURIComponent("Ошибка обмена кода")}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    return Response.redirect(`${siteOrigin}/login?error=${encodeURIComponent("Яндекс не вернул токен")}`);
  }

  // 2) Данные пользователя
  const userRes = await fetch(YANDEX_USER_INFO_URL, {
    headers: { Authorization: `OAuth ${accessToken}` },
  });

  if (!userRes.ok) {
    return Response.redirect(`${siteOrigin}/login?error=${encodeURIComponent("Не удалось получить данные")}`);
  }

  const yandexUser = await userRes.json();
  const email = yandexUser.default_email || yandexUser.emails?.[0];
  if (!email) {
    return Response.redirect(`${siteOrigin}/login?error=${encodeURIComponent("У аккаунта нет email")}`);
  }

  const fullName = [yandexUser.first_name, yandexUser.last_name].filter(Boolean).join(" ").trim() ||
    yandexUser.display_name || yandexUser.login || "";

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

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
    if (createError && !String(createError.message).toLowerCase().includes("already")) {
      console.error("createUser error:", createError);
      return Response.redirect(`${siteOrigin}/login?error=${encodeURIComponent(createError.message)}`);
    }

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${siteOrigin}/` },
    });

    const actionLink = (linkData as { properties?: { action_link?: string } })?.properties?.action_link;
    if (linkError || !actionLink) {
      console.error("generateLink error:", linkError);
      return Response.redirect(`${siteOrigin}/login?error=${encodeURIComponent("Не удалось создать сессию")}`);
    }

    return Response.redirect(actionLink);
  } catch (e) {
    console.error("yandex-oauth error:", e);
    return Response.redirect(`${siteOrigin}/login?error=${encodeURIComponent("Ошибка входа")}`);
  }
});
