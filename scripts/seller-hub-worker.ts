/**
 * Фоновый сбор данных Seller Hub как отдельный процесс (локально или на сервере рядом с приложением).
 *
 *   npx tsx --env-file=.env.local scripts/seller-hub-worker.ts            (цикл, остановка Ctrl+C)
 *   npx tsx --env-file=.env.local scripts/seller-hub-worker.ts --once     (один проход и итог по запросам к WB)
 *   npx tsx --env-file=.env.local scripts/seller-hub-worker.ts --enable <userId>   (включить фон для кабинета с согласием владельца)
 *   npx tsx --env-file=.env.local scripts/seller-hub-worker.ts --status
 *
 * Тот же цикл выполняет cron-маршрут /api/cron/seller-hub-sync (см. docs/seller-hub/background-sync.md, раздел «Запуск»).
 * Токены не печатаются. Все запросы к WB идут через шлюз лимитов (src/lib/seller-hub/wb-limits).
 */
import { randomUUID } from "node:crypto";
import { openSellerHubWbToken } from "@/lib/seller-hub/wb-token";
import { supabaseSellerHubSecretDb } from "@/lib/seller-hub/wb-token-store";
import { createServerClient } from "@/lib/supabase/server";
import { installWbGate } from "@/lib/seller-hub/wb-limits/gated-fetch";
import { createSyncRunner } from "@/lib/seller-hub/sync/runner";

const TICK_MS = 30_000;
const CONSENT_VERSION = "owner-local-2026-10-22";

const db = createServerClient();
const owner = `local-${process.pid}-${randomUUID().slice(0, 8)}`;
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const valueOf = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const calls = new Map<string, number>();
const waited = new Map<string, number>();
const statuses = new Map<string, number>();
const restore = installWbGate({
  onRequest: (info) => {
    calls.set(info.key, (calls.get(info.key) ?? 0) + 1);
    if (info.waitedMs > 0) waited.set(info.key, (waited.get(info.key) ?? 0) + info.waitedMs);
    if (!info.known) console.log(`  ! метод без лимита в спецификации: ${info.method} ${info.path} (используется осторожный запасной лимит)`);
  },
  onResponse: (info) => {
    if (info.status >= 400) statuses.set(`${info.key} → ${info.status}`, (statuses.get(`${info.key} → ${info.status}`) ?? 0) + 1);
  },
});

const stamp = () => new Date().toLocaleTimeString("ru-RU", { timeZone: "Europe/Moscow" });
const log = (message: string) => console.log(`[${stamp()}] ${message}`);
const runner = createSyncRunner({ db, owner, log });

async function enable(userId: string): Promise<void> {
  const secrets = await openSellerHubWbToken(userId, supabaseSellerHubSecretDb(db));
  if (!secrets.ok) throw new Error(`У пользователя нет читаемого токена кабинета (${secrets.reason}): фон включать не на чем`);
  const now = new Date().toISOString();
  const { error } = await db.from("seller_hub_cabinets").upsert(
    { user_id: userId, marketplace_id: "wildberries", name: "Основной кабинет", status: "ok", background_enabled: true, consent_at: now, consent_version: CONSENT_VERSION, updated_at: now },
    { onConflict: "user_id,marketplace_id" },
  );
  if (error) throw new Error(error.message);
  log("Фон включён для кабинета (токен не напечатан). Дальше: --once или запуск цикла.");
}

async function status(): Promise<void> {
  const { data, error } = await db.from("seller_hub_v_cabinet_health").select("cabinet, status, background_on, source, last_success, data_age_minutes, failures_in_a_row, last_error, next_read_at").order("source");
  if (error) throw new Error(error.message);
  console.table(data);
}

function printUsage(): void {
  if (calls.size === 0) return;
  const rows = [...calls.entries()].sort((a, b) => b[1] - a[1]).map(([key, n]) => ({ "лимит WB (ключ)": key, запросов: n, "ждали, с": Math.round((waited.get(key) ?? 0) / 1000) }));
  console.table(rows);
  if (statuses.size > 0) console.log("Ответы с ошибкой:", Object.fromEntries(statuses));
}

async function main(): Promise<void> {
  const enableId = valueOf("--enable");
  if (enableId) return enable(enableId);
  if (flag("--status")) return status();
  if (flag("--once")) {
    const { cabinets, running } = await runner.tick();
    if (cabinets === 0) log("Нет кабинетов с включённым фоном (--enable <userId>)");
    await Promise.all(running);
    printUsage();
    return;
  }
  log(`Воркер запущен (${owner}), проверка каждые ${TICK_MS / 1000} с. Остановка: Ctrl+C`);
  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
    log("Останавливаюсь: дожидаюсь текущих заданий…");
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });
  while (!stopping) {
    try {
      await runner.tick();
    } catch (error) {
      log(`Проверка не удалась: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, TICK_MS));
  }
  while (runner.busyCount() > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
  printUsage();
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => restore());
