import type { User } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Собирает текст из Error и цепочки cause (Node fetch часто кладёт ECONNRESET в cause). */
function networkErrorFingerprint(e: unknown): string {
  const parts: string[] = [];
  let cur: unknown = e;
  for (let depth = 0; depth < 6 && cur != null; depth += 1) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      cur = cur.cause;
      continue;
    }
    if (typeof cur === "object") {
      const o = cur as Record<string, unknown>;
      if (typeof o.message === "string") parts.push(o.message);
      if (typeof o.code === "string" || typeof o.code === "number") parts.push(String(o.code));
      if (typeof o.errno === "number") parts.push(`errno_${o.errno}`);
      if (typeof o.syscall === "string") parts.push(o.syscall);
      cur = o.cause;
      continue;
    }
    parts.push(String(cur));
    break;
  }
  return parts.join(" ").toLowerCase();
}

/** Сетевые сбои при запросе к Supabase Auth (Windows/VPN/прокси часто дают ECONNRESET). */
export function isTransientSupabaseAuthFailure(e: unknown): boolean {
  const fp = networkErrorFingerprint(e);
  return /econnreset|etimedout|econnrefused|fetch failed|socket hang up|und_err_socket|enotfound|eai_again|network|4077|-4077/.test(
    fp
  );
}

/** Текст ошибки после getUser — похоже на обрыв сети/Supabase, а не на «сессия протухла». */
export function isTransientAuthFailureHint(hint: string | undefined): boolean {
  if (!hint?.trim()) return false;
  if (/авторизации|связаться|проверить сессию/i.test(hint)) return true;
  return isTransientSupabaseAuthFailure({ message: hint });
}

type BearerResult = {
  user: User | null;
  /** Сообщение для логов или ответа клиенту при полном отказе */
  failureHint?: string;
};

/** Сколько проверенный токен считается проверенным: каждая страница делает десятки запросов, а поход в Supabase Auth стоит ~1 с и иногда зависает. */
const USER_CACHE_TTL_MS = 120_000;
const USER_CACHE_MAX = 500;
const userCache = new Map<string, { user: User; until: number }>();
const userInFlight = new Map<string, Promise<BearerResult>>();

/** Срок жизни токена из самого токена (exp): кэш никогда не живёт дольше него. */
function tokenExpiresAtMs(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { exp?: number };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Проверка токена с памятью: один раз сходили в Supabase, дальше две минуты отвечаем из памяти, а параллельные запросы
 * с тем же токеном ждут один общий ответ. После выхода из аккаунта токен перестаёт действовать не позже чем через эти две минуты.
 */
export async function getUserFromBearerToken(accessToken: string): Promise<BearerResult> {
  const now = Date.now();
  const hit = userCache.get(accessToken);
  if (hit && hit.until > now) return { user: hit.user };
  const flying = userInFlight.get(accessToken);
  if (flying) return flying;
  const promise = fetchUserFromSupabase(accessToken)
    .then((result) => {
      if (result.user) {
        const exp = tokenExpiresAtMs(accessToken);
        const until = Math.min(Date.now() + USER_CACHE_TTL_MS, exp != null ? exp - 30_000 : Infinity);
        if (until > Date.now()) {
          if (userCache.size >= USER_CACHE_MAX) {
            for (const [key, value] of userCache) if (value.until <= Date.now()) userCache.delete(key);
            if (userCache.size >= USER_CACHE_MAX) userCache.clear();
          }
          userCache.set(accessToken, { user: result.user, until });
        }
      }
      return result;
    })
    .finally(() => userInFlight.delete(accessToken));
  userInFlight.set(accessToken, promise);
  return promise;
}

/**
 * Обёртка над supabase.auth.getUser(accessToken): несколько попыток с backoff,
 * чтобы не отдавать ложный 401 при обрыве соединения с Supabase.
 */
async function fetchUserFromSupabase(accessToken: string): Promise<BearerResult> {
  const supabase = createServerClient();
  const maxAttempts = 6;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(accessToken);

      if (user) return { user };

      if (error) {
        if (attempt < maxAttempts - 1 && isTransientSupabaseAuthFailure(error)) {
          const backoff = 400 + attempt * 450;
          console.warn(`[getUserFromBearer] auth error, retry ${attempt + 1}/${maxAttempts} in ${backoff}ms:`, error.message);
          await sleep(backoff);
          continue;
        }
        return { user: null, failureHint: error.message };
      }

      return { user: null };
    } catch (e) {
      if (attempt < maxAttempts - 1 && isTransientSupabaseAuthFailure(e)) {
        const backoff = 400 + attempt * 450;
        console.warn(`[getUserFromBearer] exception, retry ${attempt + 1}/${maxAttempts} in ${backoff}ms`);
        await sleep(backoff);
        continue;
      }
      console.warn(
        "[getUserFromBearer] все попытки исчерпаны (сеть/Supabase). Колокольчик уведомлений временно без данных; голосовой ввод не зависит от этого запроса.",
        networkErrorFingerprint(e)
      );
      return {
        user: null,
        failureHint: isTransientSupabaseAuthFailure(e)
          ? "Не удалось связаться с сервисом авторизации. Обновите страницу и попробуйте ещё раз."
          : String(e),
      };
    }
  }

  return { user: null, failureHint: "Не удалось проверить сессию" };
}
