export type WildberriesTokenType = "personal" | "service" | "base" | "test" | "unknown";

export type WildberriesTokenMeta = {
  type: WildberriesTokenType;
  label: string;
  autoRepliesOk: boolean;
  rateLimitHint: string;
  warning?: string;
};

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const normalized = token.replace(/^Bearer\s+/i, "").trim();
  const parts = normalized.split(".");
  if (parts.length < 2) return null;

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json =
      typeof Buffer !== "undefined"
        ? Buffer.from(padded, "base64").toString("utf8")
        : atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** По документации WB: acc/t/test в payload JWT. */
export function detectWildberriesTokenType(token: string): WildberriesTokenType {
  const payload = decodeJwtPayload(token);
  if (!payload) return "unknown";

  const acc = Number(payload.acc);
  const t = typeof payload.t === "string" ? payload.t : "";
  const isTest = payload.test === true;

  if (acc === 4 || t.startsWith("asid:")) return "service";
  if (acc === 3 || t === "self") return "personal";
  if (acc === 2 || isTest) return "test";
  if (acc === 1) return "base";
  return "unknown";
}

/** Бит 7 в маске s — доступ к «Вопросы и отзывы». */
export function wildberriesTokenHasFeedbacksAccess(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return true;
  const s = Number(payload.s);
  if (!Number.isFinite(s)) return true;
  return (s & (1 << 6)) !== 0;
}

const TOKEN_LABELS: Record<WildberriesTokenType, string> = {
  personal: "Персональный",
  service: "Сервисный",
  base: "Базовый",
  test: "Тестовый",
  unknown: "Неизвестный",
};

export function describeWildberriesTokenMeta(token: string): WildberriesTokenMeta {
  const type = detectWildberriesTokenType(token);
  const label = TOKEN_LABELS[type];
  const hasFeedbacks = wildberriesTokenHasFeedbacksAccess(token);

  if (type === "base") {
    return {
      type,
      label,
      autoRepliesOk: false,
      rateLimitHint: "5 запросов в час (интервал ~12 мин)",
      warning:
        "Базовый токен не подходит для автоответов. Создайте персональный токен с категорией «Вопросы и отзывы».",
    };
  }

  if (type === "test") {
    return {
      type,
      label,
      autoRepliesOk: false,
      rateLimitHint: "Только песочница",
      warning: "Тестовый токен работает только в sandbox WB, не с реальными отзывами.",
    };
  }

  if (!hasFeedbacks) {
    return {
      type,
      label,
      autoRepliesOk: false,
      rateLimitHint: "—",
      warning: "У токена нет доступа к категории «Вопросы и отзывы». Пересоздайте токен с этой категорией.",
    };
  }

  return {
    type,
    label,
    autoRepliesOk: type === "personal" || type === "service",
    rateLimitHint: "до 3 запросов в секунду (интервал 333 мс)",
  };
}
