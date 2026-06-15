import { handleTelegramWebhookUpdate } from "./webhook-handler";

let offset = 0;
let burstActive = false;

export async function processPendingTelegramUpdates(pollTimeoutSec = 0): Promise<number> {
  const { telegramGetUpdates } = await import("./bot-api");
  const { createServerClient } = await import("@/lib/supabase/server");

  const updates = await telegramGetUpdates({ offset, timeout: pollTimeoutSec });
  let processed = 0;
  const supabase = createServerClient();

  for (const update of updates) {
    if (typeof update.update_id === "number") {
      offset = update.update_id + 1;
    }
    try {
      await handleTelegramWebhookUpdate(
        supabase,
        update as Parameters<typeof handleTelegramWebhookUpdate>[1]
      );
      processed += 1;
    } catch (e) {
      console.error("[telegram] process update failed", e);
    }
  }

  if (processed > 0) {
    console.info(`[telegram] processed ${processed} update(s), offset=${offset}`);
  }
  return processed;
}

/** После «Подключить Telegram» — активно забираем /start из очереди (~2 мин). */
export function kickTelegramAfterLink() {
  if (burstActive) return;
  burstActive = true;

  void (async () => {
    if (process.env.NODE_ENV !== "development") {
      try {
        const { telegramDeleteWebhook } = await import("./bot-api");
        await telegramDeleteWebhook();
        console.info("[telegram] webhook cleared, processing queue after link-token");
      } catch (e) {
        console.warn("[telegram] deleteWebhook on link:", e);
      }
    }

    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      try {
        await processPendingTelegramUpdates();
      } catch (e) {
        console.warn("[telegram] burst tick failed", e);
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    burstActive = false;
  })();
}
