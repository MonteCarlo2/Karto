import { installWbGate } from "@/lib/seller-hub/wb-limits/gated-fetch";
import { createServerClient } from "@/lib/supabase/server";
import { createSyncRunner, type SyncRunner } from "./runner";

/**
 * Один воркер фонового сбора на процесс сервера. Его используют и встроенный планировщик (instrumentation.ts),
 * и cron-маршрут: оба вызывают один и тот же экземпляр, поэтому не плодят дублирующих проходов.
 * При первом обращении ставит шлюз лимитов WB: с этого момента любые запросы к WB из этого процесса делят лимит токена с воркером.
 */

type Holder = { runner: SyncRunner | null; restoreGate: (() => void) | null };

const holder: Holder = ((globalThis as { __sellerHubSync?: Holder }).__sellerHubSync ??= { runner: null, restoreGate: null });

export function getSyncRunner(): SyncRunner {
  if (!holder.runner) {
    holder.restoreGate = installWbGate();
    holder.runner = createSyncRunner({
      db: createServerClient(),
      owner: `server-${process.pid}`,
      log: (message) => console.info(`[seller-hub-sync] ${message}`),
    });
  }
  return holder.runner;
}
