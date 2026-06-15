import { isSmtpConfigured, sendHtmlEmailSmtp } from "@/lib/email/smtp";

export async function sendTelegramLinkVerificationEmail(options: {
  to: string;
  code: string;
}): Promise<{ ok: boolean; error?: string; devLogged?: boolean }> {
  const { to, code } = options;
  if (!to?.includes("@")) {
    return { ok: false, error: "Некорректный email" };
  }

  const subject = "Код для привязки Telegram — KARTO";
  const html = `
<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;background:#f5f3ef;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
    <h2 style="margin:0 0 12px">KARTO · Telegram</h2>
    <p style="color:#374151;line-height:1.6">Введите этот код в боте KARTO для привязки аккаунта:</p>
    <p style="font-size:32px;font-weight:800;letter-spacing:0.2em;text-align:center;margin:24px 0">${code}</p>
    <p style="color:#6b7280;font-size:14px">Код действует 10 минут. Если вы не запрашивали привязку — проигнорируйте письмо.</p>
  </div>
</body></html>`;

  if (!isSmtpConfigured()) {
    if (process.env.NODE_ENV === "development") {
      console.info(`[telegram-link] dev code for ${to}: ${code}`);
      return { ok: true, devLogged: true };
    }
    return { ok: false, error: "SMTP не настроен" };
  }

  const result = await sendHtmlEmailSmtp({ to, subject, html });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
