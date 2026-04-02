import nodemailer from "nodemailer";

/**
 * Отправка писем через SMTP (Timeweb, Яндекс 360, Mail.ru, свой сервер и т.д.).
 * Без Resend и без сторонних платных API — только то, что вы задаёте в переменных окружения.
 *
 * Обязательно: SMTP_HOST, SMTP_USER, SMTP_PASSWORD
 * Опционально: SMTP_PORT (по умолчанию 587), SMTP_SECURE=true для порта 465,
 *   SMTP_FROM — адрес «От кого» (иначе берётся SMTP_USER или SIGNUP_EMAIL_FROM).
 */
export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASSWORD?.trim()
  );
}

export async function sendHtmlEmailSmtp(options: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { to, subject, html } = options;
  if (!isSmtpConfigured()) {
    return { ok: false, error: "SMTP не настроен (нужны SMTP_HOST, SMTP_USER, SMTP_PASSWORD)" };
  }

  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: process.env.SMTP_PASSWORD!.trim(),
    },
  });

  const from =
    process.env.SMTP_FROM?.trim() ||
    process.env.SIGNUP_EMAIL_FROM?.trim() ||
    process.env.WELCOME_EMAIL_FROM?.trim() ||
    process.env.SMTP_USER!.trim();

  try {
    await transporter.sendMail({
      from: from.includes("<") ? from : `KARTO <${from}>`,
      to,
      subject,
      html,
    });
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("❌ [SMTP]", message);
    return { ok: false, error: message };
  }
}
