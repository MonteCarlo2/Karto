import crypto from "crypto";

export function generateFourDigitCode(): string {
  return String(crypto.randomInt(0, 10000)).padStart(4, "0");
}

export function hashSignupCode(email: string, code: string): string {
  const secret = process.env.SIGNUP_CODE_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SIGNUP_CODE_SECRET не задан или слишком короткий. Добавьте в .env.local случайную строку минимум 16 символов."
    );
  }
  return crypto
    .createHmac("sha256", secret)
    .update(`${email.trim().toLowerCase()}|${code}`)
    .digest("hex");
}

export const SIGNUP_CODE_TTL_MS = 15 * 60 * 1000;
export const MAX_SIGNUP_CODE_ATTEMPTS = 8;
export const MAX_RESEND_CLICKS = 2;
export const RESEND_COOLDOWN_MS = 60 * 1000;
