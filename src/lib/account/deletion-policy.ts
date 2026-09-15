/** Минимальный возраст аккаунта перед удалением (защита от delete → re-register). */
export const ACCOUNT_DELETION_MIN_AGE_DAYS = 14;
export const ACCOUNT_DELETION_MIN_AGE_MS =
  ACCOUNT_DELETION_MIN_AGE_DAYS * 24 * 60 * 60 * 1000;

export type AccountDeletionStatus = {
  allowed: boolean;
  daysRemaining: number;
  unlockAt: string | null;
  accountCreatedAt: string | null;
  minAccountAgeDays: number;
};

export function daysLabelRu(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "дней";
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дня";
  return "дней";
}

export function getAccountDeletionStatus(
  createdAt: string | Date | null | undefined,
  nowMs = Date.now()
): AccountDeletionStatus {
  const base = {
    minAccountAgeDays: ACCOUNT_DELETION_MIN_AGE_DAYS,
  };

  if (!createdAt) {
    return {
      ...base,
      allowed: true,
      daysRemaining: 0,
      unlockAt: null,
      accountCreatedAt: null,
    };
  }

  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) {
    return {
      ...base,
      allowed: true,
      daysRemaining: 0,
      unlockAt: null,
      accountCreatedAt: String(createdAt),
    };
  }

  const accountCreatedAt = new Date(createdMs).toISOString();
  const unlockMs = createdMs + ACCOUNT_DELETION_MIN_AGE_MS;
  const diffMs = unlockMs - nowMs;

  if (diffMs <= 0) {
    return {
      ...base,
      allowed: true,
      daysRemaining: 0,
      unlockAt: null,
      accountCreatedAt,
    };
  }

  return {
    ...base,
    allowed: false,
    daysRemaining: Math.ceil(diffMs / (24 * 60 * 60 * 1000)),
    unlockAt: new Date(unlockMs).toISOString(),
    accountCreatedAt,
  };
}

export function accountDeletionBlockedMessageRu(
  daysRemaining: number,
  unlockAt: string | null
): string {
  const daysPart =
    daysRemaining > 0
      ? `Удаление будет доступно через ${daysRemaining} ${daysLabelRu(daysRemaining)}.`
      : "Удаление пока недоступно.";
  const datePart =
    unlockAt != null
      ? ` Дата: ${new Date(unlockAt).toLocaleDateString("ru-RU", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}.`
      : "";
  return `${daysPart}${datePart}`.trim();
}
