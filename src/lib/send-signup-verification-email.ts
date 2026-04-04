import { isSmtpConfigured, sendHtmlEmailSmtp } from "@/lib/email/smtp";

/**
 * Письмо с 4-значным кодом подтверждения email — только SMTP (переменные SMTP_*).
 *
 * Локально (NODE_ENV=development): если SMTP не задан, код пишется в консоль сервера.
 * В продакшене нужен рабочий SMTP из среды, где крутится Node (не путать с почтой в Supabase).
 */

export async function sendSignupVerificationEmail(options: {
  to: string;
  code: string;
  name?: string | null;
}): Promise<{ ok: boolean; error?: string; devLogged?: boolean }> {
  const { to, code, name } = options;
  if (!to?.includes("@")) {
    return { ok: false, error: "Некорректный email" };
  }

  const firstName = name?.trim()?.split(/\s+/)[0] || "друг";
  const subject = "Код подтверждения KARTO";

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
            <td style="padding: 40px 32px 16px; text-align: center;">
              <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #111827;">KARTO</h1>
              <p style="margin: 0; font-size: 14px; color: #6b7280;">Подтверждение email</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 24px;">
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #374151;">Привет, ${firstName}!</p>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #374151;">
                Введите этот <strong>четырёхзначный код</strong> на странице регистрации в поле подтверждения:
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <span style="display: inline-block; font-size: 42px; font-weight: 800; letter-spacing: 0.35em; color: #111827; font-family: ui-monospace, 'SF Mono', Menlo, monospace; padding: 20px 28px; background: #f9fafb; border-radius: 16px; border: 2px solid #e5e7eb;">
                  ${code}
                </span>
              </div>
              <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #6b7280;">
                Код действует 15 минут. Если вы не регистрировались в KARTO, просто проигнорируйте это письмо.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px; background: #f9fafb; font-size: 12px; color: #9ca3af; text-align: center;">
              Письмо отправлено сервисом KARTO
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  if (isSmtpConfigured()) {
    const result = await sendHtmlEmailSmtp({ to, subject, html });
    if (result.ok) {
      console.log("✅ [SIGNUP EMAIL] SMTP отправлено на", to);
    }
    return result;
  }

  if (process.env.NODE_ENV === "development") {
    console.warn(
      "⚠️ [SIGNUP EMAIL] SMTP не настроен — код только для локальной отладки (не уходит на почту):",
      code,
      "→",
      to
    );
    return { ok: true, devLogged: true };
  }

  return {
    ok: false,
    error:
      "Почта не настроена. Добавьте SMTP_HOST, SMTP_USER, SMTP_PASSWORD (и при необходимости SMTP_PORT, SMTP_FROM) в переменные окружения на сервере.",
  };
}
