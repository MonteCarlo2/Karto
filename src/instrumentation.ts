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

  // Соединение с базой держим тёплым: новое рукопожатие с удалённым Supabase стоит около секунды, а иногда зависает.
  void import("@/lib/supabase/resilient-fetch")
    .then(({ resilientFetch }) => {
      const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!base) return;
      const ping = () => void resilientFetch(`${base}/auth/v1/health`).then((r) => r.arrayBuffer()).catch(() => undefined);
      ping();
      setInterval(ping, 30_000).unref?.();
    })
    .catch(() => undefined);

  // Фон Seller Hub не ждём: пока register() не вернулся, сервер не отвечает на запросы (в том числе на проверку здоровья).
  // Тяжёлые модули подгружаются в стороне, после старта сервера.
  void import("@/lib/seller-hub/sync/scheduler")
    .then(({ startSellerHubBackgroundScheduler }) => startSellerHubBackgroundScheduler())
    .catch((e) => console.error("[instrumentation] seller-hub scheduler failed to start:", e));

  // База знаний: ежедневная сверка со справкой Wildberries (не чаще раза в 20 часов, отметка о проходе хранится в базе).
  void import("@/lib/seller-hub/knowledge/wb-help-sync")
    .then(({ startWbHelpScheduler }) => startWbHelpScheduler())
    .catch((e) => console.error("[instrumentation] kb wb-help scheduler failed to start:", e));

  // Локальная работа: бот получает сообщения опросом (TELEGRAM_POLLING=1). Запускаем его при старте сервера, а не только после «Подключить Telegram»,
  // иначе после перезапуска бот молчит, пока не нажмёшь кнопку. На боевом сайте работает webhook, опрос там не включается.
  if (process.env.NODE_ENV !== "production" && (process.env.TELEGRAM_POLLING === "1" || process.env.TELEGRAM_POLLING === "true")) {
    setTimeout(() => {
      void import("@/lib/telegram/telegram-polling")
        .then(({ ensureTelegramPollingStarted }) => ensureTelegramPollingStarted())
        .catch((e) => console.error("[instrumentation] telegram polling failed to start:", e));
    }, 5_000).unref?.();
  }

  // Также опрос запускается из link-token и process-updates.

  try {
    const { ensureTelegramWebhookRegistered } = await import(
      "@/lib/telegram/telegram-webhook-setup"
    );
    void ensureTelegramWebhookRegistered();
  } catch (e) {
    console.error("[instrumentation] telegram webhook setup failed", e);
  }
}
