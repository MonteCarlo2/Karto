/**
 * Фоновый long polling — только TELEGRAM_POLLING=1.
 * bot-api импортируется динамически, чтобы не залипать на старом бандле без прокси.
 */
import { getTelegramProxyLabel, isTelegramConfigured } from "./config";
import { processPendingTelegramUpdates } from "./process-updates";

declare global {
  // eslint-disable-next-line no-var
  var __kartoTelegramPollingStarted: boolean | undefined;
}

function pollingEnabled(): boolean {
  if (!isTelegramConfigured()) return false;
  return process.env.TELEGRAM_POLLING === "1" || process.env.TELEGRAM_POLLING === "true";
}

let running = false;
let pollFailures = 0;

async function pollTick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await processPendingTelegramUpdates(5);
    pollFailures = 0;
  } catch (e) {
    pollFailures += 1;
    if (pollFailures <= 3) {
      console.warn("[telegram] poll tick failed", e);
    }
  } finally {
    running = false;
  }
}

function startPollingLoop() {
  if (!pollingEnabled()) return;
  if (globalThis.__kartoTelegramPollingStarted) return;
  globalThis.__kartoTelegramPollingStarted = true;

  const proxy = getTelegramProxyLabel();
  console.info(
    "[telegram] long polling started (TELEGRAM_POLLING=1)",
    proxy ? `proxy: ${proxy}` : "proxy: не задан"
  );

  void (async () => {
    try {
      const { telegramDeleteWebhook } = await import("./bot-api");
      await telegramDeleteWebhook();
      console.info("[telegram] webhook cleared for polling");
    } catch (e) {
      console.warn("[telegram] deleteWebhook failed:", e);
    }
    void processPendingTelegramUpdates();
    setInterval(() => {
      if (!globalThis.__kartoTelegramPollingStarted) return;
      void pollTick();
    }, 2500);
  })();
}

export function ensureTelegramPollingStarted() {
  startPollingLoop();
}

export function startTelegramPolling() {
  ensureTelegramPollingStarted();
}
