import { handleTelegramWebhookUpdate } from "./webhook-handler";

let offset = 0;
let burstActive = false;

const seenUpdateIds = new Map<number, number>();
const SEEN_UPDATE_TTL_MS = 10 * 60_000;

export function isDuplicateTelegramUpdate(updateId: unknown): boolean {
  if (typeof updateId !== "number") return false;
  const now = Date.now();
  const prev = seenUpdateIds.get(updateId);
  if (prev != null && now - prev < SEEN_UPDATE_TTL_MS) return true;
  seenUpdateIds.set(updateId, now);
  for (const [id, ts] of seenUpdateIds) {
    if (now - ts > SEEN_UPDATE_TTL_MS) seenUpdateIds.delete(id);
  }
  return false;
}

export async function processPendingTelegramUpdates(pollTimeoutSec = 0): Promise<number> {
  const { telegramGetUpdates } = await import("./bot-api");
  const { createServerClient } = await import("@/lib/supabase/server");

  const updates = await telegramGetUpdates({ offset, timeout: pollTimeoutSec });
  let processed = 0;
  const supabase = createServerClient();

  for (const update of updates) {
    if (typeof update.update_id === "number") {
      offset = update.update_id + 1;
      if (isDuplicateTelegramUpdate(update.update_id)) continue;
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

/** Локальная разработка: после «Подключить» забираем /start из очереди (polling). На проде — только webhook. */
export function kickTelegramAfterLink() {
  if (process.env.NODE_ENV !== "development") return;
  if (burstActive) return;
  burstActive = true;

  void (async () => {
    try {
      const { telegramDeleteWebhook } = await import("./bot-api");
      await telegramDeleteWebhook();
      console.info("[telegram] webhook cleared for local polling burst");
    } catch (e) {
      console.warn("[telegram] deleteWebhook on link:", e);
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
