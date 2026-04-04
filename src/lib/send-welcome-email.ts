/**
 * Раньше отправлялось приветственное письмо через внешний API — отключено по запросу.
 * Подписка и бонусы начисляются как раньше; вызов оставлен, чтобы не трогать /api/subscription.
 */

export interface SendWelcomeEmailOptions {
  to: string;
  name?: string | null;
}

export async function sendWelcomeEmail(
  _options: SendWelcomeEmailOptions
): Promise<{ ok: boolean; error?: string }> {
  return { ok: false };
}
