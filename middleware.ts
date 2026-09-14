import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { ATTR_COOKIE_NAME, pickAttributionFromRequest } from "@/lib/attribution";
import { AUTH_REQUIRED_MESSAGE } from "@/lib/auth/require-api-user";
import { requiresAuthApi, requiresAuthPage } from "@/lib/auth/protected-routes";

async function resolveMiddlewareUser(
  request: NextRequest,
  response: NextResponse
): Promise<{ userId: string | null; response: NextResponse }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return { userId: null, response };
  }

  let nextResponse = response;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]
      ) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        nextResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          nextResponse.cookies.set(
            name,
            value,
            options as Parameters<typeof nextResponse.cookies.set>[2]
          )
        );
      },
    },
  });

  const {
    data: { user: cookieUser },
  } = await supabase.auth.getUser();
  if (cookieUser?.id) {
    return { userId: cookieUser.id, response: nextResponse };
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (token) {
    const {
      data: { user: bearerUser },
    } = await supabase.auth.getUser(token);
    if (bearerUser?.id) {
      return { userId: bearerUser.id, response: nextResponse };
    }
  }

  return { userId: null, response: nextResponse };
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const payload = pickAttributionFromRequest(request);
  if (payload) {
    response.cookies.set({
      name: ATTR_COOKIE_NAME,
      value: JSON.stringify(payload),
      expires: new Date(payload.expiresAt),
      maxAge: 60 * 24 * 60 * 60,
      path: "/",
      sameSite: "lax",
      secure: true,
      httpOnly: false,
    });
  }

  const { pathname } = request.nextUrl;

  if (requiresAuthPage(pathname)) {
    const { userId, response: refreshed } = await resolveMiddlewareUser(request, response);
    response = refreshed;
    if (!userId) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  if (requiresAuthApi(pathname)) {
    const { userId, response: refreshed } = await resolveMiddlewareUser(request, response);
    response = refreshed;
    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: AUTH_REQUIRED_MESSAGE,
          code: "AUTH_REQUIRED",
        },
        { status: 401 }
      );
    }
    return response;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
