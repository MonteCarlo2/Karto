/**
 * Текст для пользователя при сбое SMTP на регистрации (451, ratelimit, Message failed…).
 * Техническую причину пишем только в лог сервера.
 */
export const SIGNUP_EMAIL_TEMPORARY_FAILURE_MESSAGE =
  "Сейчас отправка письма с кодом временно недоступна: ведутся технические работы или почтовая служба перегружена. Попробуйте через несколько часов или завтра. Приносим извинения за неудобства.";

export const SIGNUP_EMAIL_INVALID_MAILBOX_MESSAGE =
  "Указанный email не существует или недоступен для доставки. Проверьте адрес и попробуйте снова с существующим почтовым ящиком.";

/** SMTP 550 «mailbox unavailable / user not found» и похожие — не «техработы». */
export function mapSignupSmtpErrorToUserMessage(rawError: string): string {
  const lower = rawError.toLowerCase();
  const invalidMailbox =
    /\b550\b/.test(lower) ||
    lower.includes("invalid mailbox") ||
    lower.includes("mailbox unavailable") ||
    lower.includes("user not found") ||
    lower.includes("recipient rejected") ||
    lower.includes("no such user") ||
    lower.includes("does not exist") ||
    lower.includes("unknown user") ||
    lower.includes("address rejected") ||
    (lower.includes("mailbox") && lower.includes("unavailable"));

  if (invalidMailbox) {
    return SIGNUP_EMAIL_INVALID_MAILBOX_MESSAGE;
  }

  return SIGNUP_EMAIL_TEMPORARY_FAILURE_MESSAGE;
}
