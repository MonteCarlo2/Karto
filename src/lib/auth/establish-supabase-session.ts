import { createServerClient as createSupabaseSsrClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createServerClient } from "@/lib/supabase/server";
import { isSupabaseNetworkError } from "@/lib/supabase/network-error";
import { withSupabaseRetry } from "@/lib/supabase/supabase-retry";

type CookieToSet = { name: string; value: string; options: Record<string, unknown> };
type CookieOptions = Parameters<NextResponse["cookies"]["set"]>[2];

/**
 * После custom OAuth (Яндекс): создаёт Supabase-сессию на сервере и пишет cookies в redirect.
 * Редirect на action_link из generateLink не ставит sb-* cookies в Next.js — пользователь «не залогинен».
 */
export async function redirectWithSupabaseSession(
  request: NextRequest,
  baseUrl: string,
  email: string,
  redirectPath: string
): Promise<NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL или NEXT_PUBLIC_SUPABASE_ANON_KEY не заданы");
  }

  const siteBase = baseUrl.replace(/\/$/, "");
  const redirectTo = redirectPath.startsWith("http")
    ? redirectPath
    : `${siteBase}${redirectPath.startsWith("/") ? redirectPath : `/${redirectPath}`}`;

  const admin = createServerClient();
  const { data: linkData, error: linkError } = await withSupabaseRetry(
    "generateLink",
    async () => {
      const result = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });
      if (result.error && isSupabaseNetworkError(result.error)) {
        throw result.error;
      }
      return result;
    }
  );

  const hashedToken = (
    linkData as { properties?: { hashed_token?: string } } | null
  )?.properties?.hashed_token;

  if (linkError || !hashedToken) {
    console.error("[establish-session] generateLink:", linkError);
    throw linkError ?? new Error("Не удалось создать сессию (generateLink)");
  }

  const redirectUrl = new URL(
    redirectPath.startsWith("http") ? redirectPath : redirectPath.startsWith("/") ? redirectPath : `/${redirectPath}`,
    `${siteBase}/`
  );
  const response = NextResponse.redirect(redirectUrl);

  const supabase = createSupabaseSsrClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options as CookieOptions);
        });
      },
    },
  });

  const { data: verifyData, error: verifyError } = await withSupabaseRetry(
    "verifyOtp",
    async () => {
      const result = await supabase.auth.verifyOtp({
        type: "email",
        token_hash: hashedToken,
      });
      if (result.error && isSupabaseNetworkError(result.error)) {
        throw result.error;
      }
      return result;
    }
  );

  if (verifyError || !verifyData.session) {
    console.error("[establish-session] verifyOtp:", verifyError);
    throw verifyError ?? new Error("Не удалось создать сессию (verifyOtp)");
  }

  console.info("[establish-session] OK for", email.slice(0, 3) + "***");
  return response;
}
