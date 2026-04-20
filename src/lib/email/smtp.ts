import nodemailer from "nodemailer";
import { getSmtpDkimSigningOption } from "@/lib/email/smtp-dkim";

/**
 * Отправка писем через SMTP (Timeweb, Яндекс 360, Mail.ru, свой сервер и т.д.).
 * Без Resend и без сторонних платных API — только то, что вы задаёте в переменных окружения.
 *
 * Обязательно: SMTP_HOST, SMTP_USER, SMTP_PASSWORD
 * Опционально: SMTP_PORT (по умолчанию 587), SMTP_SECURE=true для порта 465,
 *   SMTP_FROM — адрес «От кого» (иначе берётся SMTP_USER или SIGNUP_EMAIL_FROM).
 * DKIM (как в справке Mail.ru — ключ на сервере, публичный ключ в DNS):
 *   SMTP_DKIM_PRIVATE_KEY или SMTP_DKIM_PRIVATE_KEY_PATH, опционально SMTP_DKIM_DOMAIN, SMTP_DKIM_KEY_SELECTOR (по умолчанию mailru).
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

  const dkim = getSmtpDkimSigningOption();
  if (dkim) {
    console.log(
      `[smtp] DKIM включён: селектор ${dkim.keySelector}._domainkey, домен d=${dkim.domainName}`
    );
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: process.env.SMTP_PASSWORD!.trim(),
    },
    ...(dkim ? { dkim } : {}),
    // На хостингах (Timeweb и др.) исходящий SMTP часто фильтруется — без таймаутов
    // nodemailer может висеть минутами, клиент ловит AbortError, а пользователь уже в Supabase.
    connectionTimeout: 12_000,
    greetingTimeout: 10_000,
    socketTimeout: 22_000,
  });

  const from =
    process.env.SMTP_FROM?.trim() ||
    process.env.SIGNUP_EMAIL_FROM?.trim() ||
    process.env.WELCOME_EMAIL_FROM?.trim() ||
    process.env.SMTP_USER!.trim();

  const mail = {
    from: from.includes("<") ? from : `KARTO <${from}>`,
    to,
    subject,
    html,
  };

  const SEND_DEADLINE_MS = 28_000;

  try {
    await Promise.race([
      transporter.sendMail(mail),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                "Почтовый сервер не ответил вовремя. На Timeweb часто блокируют исходящий SMTP — откройте порт к smtp.mail.ru или используйте SMTP самого хостинга."
              )
            ),
          SEND_DEADLINE_MS
        )
      ),
    ]);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("❌ [SMTP]", message);
    return { ok: false, error: message };
  }
}
