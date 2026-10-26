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

  // Фон Seller Hub не ждём: пока register() не вернулся, сервер не отвечает на запросы (в том числе на проверку здоровья).
  // Тяжёлые модули подгружаются в стороне, после старта сервера.
  void import("@/lib/seller-hub/sync/scheduler")
    .then(({ startSellerHubBackgroundScheduler }) => startSellerHubBackgroundScheduler())
    .catch((e) => console.error("[instrumentation] seller-hub scheduler failed to start:", e));

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
