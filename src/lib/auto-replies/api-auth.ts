import { NextRequest } from "next/server";
import {
  getUserFromBearerToken,
  isTransientAuthFailureHint,
} from "@/lib/supabase/get-user-from-bearer";

export async function requireAutoRepliesUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return { error: "Не авторизован", status: 401 as const, user: null };
  }

  const { user, failureHint } = await getUserFromBearerToken(token);
  if (user) {
    return { error: null, status: 200 as const, user };
  }

  if (isTransientAuthFailureHint(failureHint)) {
    return {
      error:
        failureHint ??
        "Сервис авторизации временно недоступен. Обновите страницу и попробуйте снова.",
      status: 503 as const,
      user: null,
    };
  }

  return { error: "Не авторизован", status: 401 as const, user: null };
}

export function parseApiKey(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  return value.length > 0 ? value : null;
}
