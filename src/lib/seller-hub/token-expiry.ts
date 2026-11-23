import type { SellerProductEvent } from "./event-engine/types";

/**
 * Срок действия токена Wildberries. Токен выдаётся на ограниченное время (на портале WB он живёт 180 дней, для части токенов 90),
 * поэтому считаем остаток по настоящей дате из самого токена и заранее предупреждаем: когда токен истечёт, данные кабинета перестанут обновляться.
 */

const DAY_MS = 86_400_000;

export type TokenExpiryLevel = "ok" | "soon" | "urgent" | "expired";

/** Целых дней до истечения (округление вверх: «осталось 3 дня» значит до трёх суток). Меньше нуля: уже истёк. */
export function tokenDaysLeft(expiresAt: string | null | undefined, nowMs: number): number | null {
  if (!expiresAt) return null;
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - nowMs) / DAY_MS);
}

export function tokenExpiryLevel(days: number | null): TokenExpiryLevel {
  if (days == null) return "ok";
  if (days <= 0) return "expired";
  if (days <= 3) return "urgent";
  if (days <= 14) return "soon";
  return "ok";
}

export function tokenDaysText(days: number): string {
  if (days <= 0) return "истёк";
  const mod10 = days % 10;
  const mod100 = days % 100;
  const word = mod10 === 1 && mod100 !== 11 ? "день" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "дня" : "дней";
  return `${days} ${word}`;
}

/** Уведомление для «Событий»: появляется за 14 дней, срочным становится за 3 и после истечения. Номер ступени в id, чтобы каждая новая ступень снова считалась непрочитанной. */
export function tokenExpiryEvent(expiresAt: string | null | undefined, nowMs: number): SellerProductEvent | null {
  const days = tokenDaysLeft(expiresAt, nowMs);
  const level = tokenExpiryLevel(days);
  if (days == null || level === "ok") return null;
  const step = days <= 0 ? 0 : days <= 1 ? 1 : days <= 3 ? 3 : days <= 7 ? 7 : 14;
  const when = expiresAt ? new Date(expiresAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "";
  return {
    id: `token-expiring-${step}`,
    createdAt: new Date(nowMs).toISOString(),
    kind: "token_expiring",
    group: "system",
    severity: level === "soon" ? "important" : "critical",
    title: days <= 0 ? "Токен Wildberries истёк" : `Токен Wildberries истекает через ${tokenDaysText(days)}`,
    detail: days <= 0 ? "Данные кабинета перестали обновляться. Создайте новый токен в кабинете Wildberries и замените его в разделе «Кабинет и API»." : `Действует до ${when}. Создайте новый токен заранее и замените его в разделе «Кабинет и API»: после истечения данные кабинета перестанут обновляться.`,
    productTitle: null,
    vendorCode: null,
    nmId: null,
    itemId: null,
  };
}

/** Срок действия из самого токена (JWT, поле exp в секундах), в браузере: чтобы показать срок до отправки на сервер. Сам токен нигде не сохраняется. */
export function jwtExpiresAt(token: string): string | null {
  const parts = token.trim().split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const exp = (JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="))) as { exp?: unknown }).exp;
    if (typeof exp !== "number" || !Number.isFinite(exp) || exp <= 0) return null;
    return new Date(exp * 1000).toISOString();
  } catch {
    return null;
  }
}
