import type { User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { createServerClientWithAuth } from "@/lib/supabase/server-auth";
import {
  getUserFromBearerToken,
  isTransientAuthFailureHint,
} from "@/lib/supabase/get-user-from-bearer";

export type ApiUserResult =
  | { user: User; error: null; status: 200 }
  | { user: null; error: string; status: 401 | 503 };

export const AUTH_REQUIRED_MESSAGE = "Войдите в аккаунт или зарегистрируйтесь, чтобы пользоваться KARTO.";

/**
 * Bearer (мобильные/явные запросы) или cookies Supabase SSR (студия в браузере).
 */
export async function requireApiUser(request: NextRequest): Promise<ApiUserResult> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (token) {
    const { user, failureHint } = await getUserFromBearerToken(token);
    if (user) {
      return { user, error: null, status: 200 };
    }
    if (isTransientAuthFailureHint(failureHint)) {
      return {
        user: null,
        error:
          failureHint ??
          "Сервис авторизации временно недоступен. Обновите страницу и попробуйте снова.",
        status: 503,
      };
    }
    return { user: null, error: AUTH_REQUIRED_MESSAGE, status: 401 };
  }

  const supabaseAuth = await createServerClientWithAuth();
  if (supabaseAuth) {
    const {
      data: { user },
      error,
    } = await supabaseAuth.auth.getUser();
    if (user) {
      return { user, error: null, status: 200 };
    }
    if (error && isTransientAuthFailureHint(error.message)) {
      return {
        user: null,
        error: "Сервис авторизации временно недоступен. Обновите страницу и попробуйте снова.",
        status: 503,
      };
    }
  }

  return { user: null, error: AUTH_REQUIRED_MESSAGE, status: 401 };
}

export function apiUnauthorizedResponse(
  auth: Exclude<ApiUserResult, { user: User }>
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: auth.error,
      code: auth.status === 503 ? "AUTH_SERVICE_UNAVAILABLE" : "AUTH_REQUIRED",
    },
    { status: auth.status }
  );
}
