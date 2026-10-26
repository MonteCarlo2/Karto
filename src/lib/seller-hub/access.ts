import type { NextRequest } from "next/server";
import { requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";

/**
 * Кому открыт Seller Hub, пока раздел не готов для всех.
 *
 *  * SELLER_HUB_ALLOWED_USER_IDS — id аккаунтов через запятую. Только им раздел открыт.
 *  * SELLER_HUB_PUBLIC=1 — раздел открыт всем (когда будет готов к запуску).
 *  * Ничего не задано: на боевом сервере (NODE_ENV=production) раздел закрыт для всех, на компьютере разработчика открыт.
 *
 * Так выкладка кода на сервер не показывает недоделанный раздел остальным пользователям сайта.
 */

type Env = Record<string, string | undefined>;

export function sellerHubAllowedIds(env: Env = process.env): string[] {
  return (env.SELLER_HUB_ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isSellerHubAllowed(userId: string, env: Env = process.env): boolean {
  if (env.SELLER_HUB_PUBLIC === "1") return true;
  const allowed = sellerHubAllowedIds(env);
  if (allowed.length > 0) return allowed.includes(userId);
  return env.NODE_ENV !== "production";
}

export const SELLER_HUB_CLOSED_MESSAGE = "Seller Hub пока закрыт: раздел в разработке.";

/** Как requireAutoRepliesUser, но пускает только тех, кому открыт Seller Hub. Для маршрутов /api/seller-hub. */
export async function requireSellerHubUser(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) return auth;
  if (!isSellerHubAllowed(auth.user.id)) {
    return { error: SELLER_HUB_CLOSED_MESSAGE, status: 403 as const, user: null };
  }
  return auth;
}
