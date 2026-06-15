/**
 * Фоновый планировщик для TimeWebCloud и других VPS без Vercel Cron.
 * Запускается из instrumentation.ts при старте Node-сервера.
 */
const INTERVAL_MS = 5 * 60 * 1000;

declare global {
  // eslint-disable-next-line no-var
  var __kartoAutoReplyCronStarted: boolean | undefined;
}

export function startAutoReplyBackgroundScheduler() {
  if (globalThis.__kartoAutoReplyCronStarted) return;
  globalThis.__kartoAutoReplyCronStarted = true;

  const isDev = process.env.NODE_ENV === "development";
  const explicitlyOff = process.env.AUTO_REPLY_CRON === "0" || process.env.AUTO_REPLY_CRON === "false";
  const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

  /** Фоновый cron: prod и dev (отключить в dev: AUTO_REPLY_CRON=0). */
  const enabled = hasServiceRole && !explicitlyOff;

  if (!enabled) {
    console.info(
      "[auto-reply] background scheduler off (нужен SUPABASE_SERVICE_ROLE_KEY; в dev: AUTO_REPLY_CRON=0 чтобы выключить)"
    );
    return;
  }

  if (isDev) {
    console.info("[auto-reply] background scheduler on in dev (every 5 min)");
  }

  console.info("[auto-reply] background scheduler started (every 5 min)");

  let running = false;

  const tick = async () => {
    if (running) return;
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return;
    if (!process.env.SUPABASE_URL?.trim() && !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
      return;
    }
    running = true;
    try {
      const { createServerClient } = await import("@/lib/supabase/server");
      const { processAutoReplyInboxCron } = await import("@/lib/auto-replies/inbox-sync-cron");
      const { processDueAutoReplyRenewals } = await import("@/lib/auto-replies-billing");
      const supabase = createServerClient();
      const [inbox, renew] = await Promise.all([
        processAutoReplyInboxCron(supabase),
        processDueAutoReplyRenewals(supabase),
      ]);
      console.info("[auto-reply] background tick", { inbox, renew });
    } catch (e) {
      console.error("[auto-reply] background tick failed", e);
    } finally {
      running = false;
    }
  };

  void tick();
  setInterval(() => void tick(), INTERVAL_MS);
}
