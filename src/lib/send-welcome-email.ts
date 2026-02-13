/**
 * Отправка приветственного письма новому пользователю после регистрации.
 * Использует Resend (нужен RESEND_API_KEY в .env).
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.WELCOME_EMAIL_FROM || process.env.RESEND_FROM_EMAIL || "KARTO <onboarding@resend.dev>";
const FROM_NAME = process.env.WELCOME_EMAIL_FROM_NAME || "KARTO";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://karto.pro";

export interface SendWelcomeEmailOptions {
  to: string;
  name?: string | null;
}

/**
 * Отправляет приветственное письмо на email пользователя.
 * Не бросает ошибку при отсутствии RESEND_API_KEY — только логирует.
 */
export async function sendWelcomeEmail(options: SendWelcomeEmailOptions): Promise<{ ok: boolean; error?: string }> {
  const { to, name } = options;
  if (!to || !to.includes("@")) {
    return { ok: false, error: "Некорректный email" };
  }

  if (!RESEND_API_KEY) {
    console.warn("⚠️ [WELCOME EMAIL] RESEND_API_KEY не задан — письмо не отправлено");
    return { ok: false, error: "Email не настроен" };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(RESEND_API_KEY);

    const firstName = name?.trim()?.split(/\s+/)[0] || "друг";
    const subject = "Добро пожаловать в KARTO — сделай свою первую карточку";
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0; padding:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f3ef;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f3ef; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden;">
          <tr>
            <td style="padding: 40px 32px 24px; text-align: center;">
              <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #111827;">KARTO</h1>
              <p style="margin: 0; font-size: 14px; color: #6b7280;">Карточки товаров в одном потоке</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px;">
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #374151;">Привет, ${firstName}!</p>
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #374151;">Спасибо за регистрацию. Мы рады, что ты теперь часть нашего сервиса KARTO.</p>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #374151;">У тебя уже есть <strong>3 бесплатные генерации</strong> в разделе «Свободное творчество». Давай сделаем твою первую карточку!</p>
              <p style="margin: 0 0 24px; text-align: center;">
                <a href="${APP_URL}" style="display: inline-block; padding: 14px 28px; background-color: #1F4E3D; color: #ffffff !important; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 12px;">Перейти на KARTO</a>
              </p>
              <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #6b7280;">Если кнопка не работает, скопируй ссылку в браузер:<br/><a href="${APP_URL}" style="color: #1F4E3D;">${APP_URL}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px; background: #f9fafb; font-size: 12px; color: #9ca3af; text-align: center;">
              Это письмо отправлено сервисом KARTO. Ты получил его, потому что зарегистрировался на сайте.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

    const from = FROM_EMAIL.includes("<") ? FROM_EMAIL : `${FROM_NAME} <${FROM_EMAIL}>`;
    const { data, error } = await resend.emails.send({
      from,
      to: [to],
      subject,
      html,
    });

    if (error) {
      console.error("❌ [WELCOME EMAIL] Resend error:", error);
      return { ok: false, error: error.message };
    }
    console.log("✅ [WELCOME EMAIL] Отправлено на", to, data?.id ? `(id: ${data.id})` : "");
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ [WELCOME EMAIL]", message);
    return { ok: false, error: message };
  }
}
