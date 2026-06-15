export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { startAutoReplyBackgroundScheduler } = await import(
      "@/lib/auto-replies/inbox-scheduler"
    );
    startAutoReplyBackgroundScheduler();
  } catch (e) {
    console.error("[instrumentation] auto-reply scheduler failed to start:", e);
  }

  // Telegram polling не стартуем здесь — иначе Turbopack залипает на старом bot-api без прокси.
  // Polling/process запускается из link-token и process-updates.

  try {
    const { ensureTelegramWebhookRegistered } = await import(
      "@/lib/telegram/telegram-webhook-setup"
    );
    void ensureTelegramWebhookRegistered();
  } catch (e) {
    console.error("[instrumentation] telegram webhook setup failed", e);
  }
}
