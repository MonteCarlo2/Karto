import { getSyncRunner } from "./holder";

/**
 * Встроенный планировщик фонового сбора Seller Hub: запускается вместе с сервером (instrumentation.ts),
 * как планировщик Автоотзывов. Работает и на TimeWeb, и локально при `npm run dev`; внешний cron не нужен.
 *
 * Отключить: SELLER_HUB_SYNC=0. Нужен SUPABASE_SERVICE_ROLE_KEY. Читает только кабинеты, где фон включён с согласием владельца.
 * Если одновременно запущен ещё один воркер (скрипт или другой сервер), источник читает тот, кто успел занять его в базе.
 */

const INTERVAL_MS = 30_000;
const STARTUP_DELAY_MS = 15_000;

declare global {
  var __kartoSellerHubSchedulerStarted: boolean | undefined;
}

export function startSellerHubBackgroundScheduler(): void {
  if (globalThis.__kartoSellerHubSchedulerStarted) return;
  globalThis.__kartoSellerHubSchedulerStarted = true;

  const off = process.env.SELLER_HUB_SYNC === "0" || process.env.SELLER_HUB_SYNC === "false";
  const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  const hasSupabaseUrl = Boolean((process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim());
  if (off || !hasServiceRole || !hasSupabaseUrl) {
    console.info("[seller-hub-sync] планировщик выключен (SELLER_HUB_SYNC=0 или нет ключей Supabase)");
    return;
  }

  console.info("[seller-hub-sync] планировщик запущен (проверка каждые 30 с, первая через 15 с)");
  // Шлюз лимитов WB ставим сразу при старте, а не при первой проверке: запросы интерфейса к WB с первой секунды делят лимит с воркером.
  getSyncRunner();

  let ticking = false;
  const tick = async () => {
    // tick() только запускает проходы и сразу возвращается; повторный вход защищён и здесь, и внутри воркера.
    if (ticking) return;
    ticking = true;
    try {
      await getSyncRunner().tick();
    } catch (error) {
      console.error("[seller-hub-sync] проверка не удалась:", error instanceof Error ? error.message : String(error));
    } finally {
      ticking = false;
    }
  };

  setTimeout(() => void tick(), STARTUP_DELAY_MS);
  setInterval(() => void tick(), INTERVAL_MS);
}
