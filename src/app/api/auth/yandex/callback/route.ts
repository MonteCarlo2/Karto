import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { findAuthUserByEmail } from "@/lib/auth/find-auth-user-by-email";
import { markDemoFlowEligibleOnRegistration } from "@/lib/demo-flow-server";
import {
  parseRegistrationDeviceId,
  recordWelcomePerkRegistration,
  welcomePerksBlockedMessageRu,
} from "@/lib/welcome-perks/registration-server";
import {
  WELCOME_REGISTRATION_DEVICE_COOKIE,
  WELCOME_PERKS_NOTICE_COOKIE,
  WELCOME_PERKS_NOTICE_COOKIE_MAX_AGE_SEC,
} from "@/lib/welcome-perks/constants";
import {
  PRODUCT_TOUR_PENDING_COOKIE,
  PRODUCT_TOUR_PENDING_COOKIE_MAX_AGE_SEC,
} from "@/lib/onboarding/product-tour-constants";
import { getYandexRedirectUri } from "@/lib/auth/yandex-redirect-uri";
import { isSupabaseNetworkError } from "@/lib/supabase/network-error";
import { resilientFetch } from "@/lib/supabase/resilient-fetch";
import {
  supabaseAuthNetworkErrorMessage,
  withSupabaseRetry,
} from "@/lib/supabase/supabase-retry";
import { redirectWithSupabaseSession } from "@/lib/auth/establish-supabase-session";

const YANDEX_TOKEN_URL = "https://oauth.yandex.ru/token";
const YANDEX_USER_INFO_URL = "https://login.yandex.ru/info?format=json";

function loginRedirect(baseUrl: string, message: string): NextResponse {
  return NextResponse.redirect(`${baseUrl}/login?error=${encodeURIComponent(message)}`);
}

/**
 * Callback после авторизации в Яндексе.
 * Обменивает code на токен, создаёт/находит пользователя в Supabase, выдаёт сессию (cookies на сервере).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const baseUrl = (() => {
    const fromEnv = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
    const origin = request.nextUrl.origin;
    if (fromEnv && !fromEnv.includes("localhost")) return fromEnv;
    if (origin.includes("localhost") && fromEnv) return fromEnv;
    return origin;
  })();

  if (process.env.NODE_ENV === "production" && baseUrl.includes("localhost")) {
    console.error("Yandex callback: baseUrl is localhost in production. Set NEXT_PUBLIC_APP_URL to https://karto.pro on the server.");
    return loginRedirect(
      request.nextUrl.origin,
      "Ошибка настройки: на сервере задайте NEXT_PUBLIC_APP_URL=https://karto.pro"
    );
  }

  const redirectUri = getYandexRedirectUri(baseUrl);

  if (error) {
    const desc = searchParams.get("error_description") || error;
    return loginRedirect(baseUrl, desc);
  }

  if (!code) {
    return loginRedirect(baseUrl, "Нет кода от Яндекса");
  }

  const clientId = process.env.YANDEX_CLIENT_ID;
  const clientSecret = process.env.YANDEX_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return loginRedirect(baseUrl, "OAuth не настроен (YANDEX_CLIENT_ID/SECRET)");
  }

  try {
    const tokenRes = await resilientFetch(YANDEX_TOKEN_URL, {
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
      return loginRedirect(baseUrl, "Ошибка обмена кода на токен");
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string };
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return loginRedirect(baseUrl, "Яндекс не вернул токен");
    }

    const userRes = await resilientFetch(YANDEX_USER_INFO_URL, {
      headers: { Authorization: `OAuth ${accessToken}` },
    });

    if (!userRes.ok) {
      return loginRedirect(baseUrl, "Не удалось получить данные пользователя");
    }

    const yandexUser = (await userRes.json()) as {
      default_email?: string;
      emails?: string[];
      first_name?: string;
      last_name?: string;
      display_name?: string;
      login?: string;
      default_avatar_id?: string;
    };

    const emailRaw = yandexUser.default_email || yandexUser.emails?.[0];
    if (!emailRaw) {
      return loginRedirect(baseUrl, "У аккаунта Яндекс нет email");
    }
    const email = emailRaw.trim().toLowerCase();

    const fullName = [yandexUser.first_name, yandexUser.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || yandexUser.display_name || yandexUser.login || "";

    const supabase = createServerClient();

    const existingUser = await withSupabaseRetry("findAuthUserByEmail", async () => {
      const user = await findAuthUserByEmail(supabase, email);
      return user;
    });

    let isExistingUser = Boolean(existingUser?.id);
    let newUserId: string | null = existingUser?.id ?? null;

    if (!existingUser) {
      const { data: createdData, error: createError } = await withSupabaseRetry(
        "createUser",
        async () => {
          const result = await supabase.auth.admin.createUser({
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
          if (result.error && isSupabaseNetworkError(result.error)) {
            throw result.error;
          }
          return result;
        }
      );

      const duplicate =
        createError?.message &&
        /already|already registered|already exists|duplicate/i.test(createError.message);

      if (createError && !duplicate) {
        console.error("Supabase createUser error:", createError);
        if (isSupabaseNetworkError(createError)) {
          return loginRedirect(baseUrl, supabaseAuthNetworkErrorMessage());
        }
        return loginRedirect(baseUrl, createError.message);
      }

      if (duplicate) {
        isExistingUser = true;
        const again = await withSupabaseRetry("findAuthUserByEmail-after-duplicate", () =>
          findAuthUserByEmail(supabase, email)
        );
        newUserId = again?.id ?? null;
      } else {
        newUserId = createdData?.user?.id ?? null;
      }
    }

    let welcomePerksNotice: string | null = null;

    if (!isExistingUser && newUserId) {
      const cookieRaw = request.cookies.get(WELCOME_REGISTRATION_DEVICE_COOKIE)?.value;
      let deviceId: string | null = null;
      if (cookieRaw) {
        try {
          deviceId = parseRegistrationDeviceId(decodeURIComponent(cookieRaw));
        } catch {
          deviceId = parseRegistrationDeviceId(cookieRaw);
        }
      }
      const welcomeResult = await withSupabaseRetry("recordWelcomePerkRegistration", () =>
        recordWelcomePerkRegistration(supabase, newUserId!, deviceId)
      );
      if (welcomeResult.eligible) {
        await withSupabaseRetry("markDemoFlowEligibleOnRegistration", () =>
          markDemoFlowEligibleOnRegistration(supabase, newUserId!)
        );
      } else {
        welcomePerksNotice = welcomePerksBlockedMessageRu(welcomeResult.retryAfterDays);
      }
    }

    const redirectPath = isExistingUser ? "/?welcome_back=1" : "/";

    const response = await redirectWithSupabaseSession(request, baseUrl, email, redirectPath);
    if (welcomePerksNotice) {
      response.cookies.set(WELCOME_PERKS_NOTICE_COOKIE, encodeURIComponent(welcomePerksNotice), {
        path: "/",
        maxAge: WELCOME_PERKS_NOTICE_COOKIE_MAX_AGE_SEC,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
    if (!isExistingUser) {
      response.cookies.set(PRODUCT_TOUR_PENDING_COOKIE, "1", {
        path: "/",
        maxAge: PRODUCT_TOUR_PENDING_COOKIE_MAX_AGE_SEC,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
    return response;
  } catch (e) {
    console.error("Yandex callback error:", e);
    if (isSupabaseNetworkError(e)) {
      return loginRedirect(baseUrl, supabaseAuthNetworkErrorMessage());
    }
    return loginRedirect(baseUrl, "Ошибка входа через Яндекс");
  }
}
