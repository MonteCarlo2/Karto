import type { SupabaseClient } from "@supabase/supabase-js";
import { openSellerHubWbToken, safeSellerHubMessage } from "@/lib/seller-hub/wb-token";
import { supabaseSellerHubSecretDb } from "@/lib/seller-hub/wb-token-store";
import { deriveForCabinet } from "./derive";
import { JOBS, type JobContext } from "./jobs";
import { LEASE_MS } from "./schedule";
import type { SyncLane } from "./sources";
import { SyncStore, type CabinetKey } from "./store";
import { runCabinetPass, type PassReport, type WorkerDeps } from "./worker";

/**
 * Общий цикл фонового сбора. Его запускают и локальный скрипт (scripts/seller-hub-worker.ts), и cron-маршрут на сервере:
 * логика одна, отличается только тем, кто и как часто вызывает `tick`.
 */

/** Пересчёт задач и событий не реже, чем раз в столько, даже если данные не менялись: часть правил зависит от времени. */
const DERIVE_EVERY_MS = 10 * 60_000;
const PRUNE_EVERY_MS = 24 * 3_600_000;

export type TickResult = {
  cabinets: number;
  /** Запущенные проходы: для --once их нужно дождаться, cron-маршруту ждать не нужно. */
  running: Array<Promise<void>>;
};

export type SyncRunner = {
  tick: () => Promise<TickResult>;
  /** Идёт ли сейчас хоть один проход (для аккуратной остановки). */
  busyCount: () => number;
};

export function describeReport(report: PassReport): string[] {
  const lines: string[] = [];
  for (const r of report.ran) {
    const changed = r.changed === undefined ? "" : r.changed ? " (изменился)" : " (без изменений)";
    lines.push(`  ${r.source}: ${r.status}${changed} за ${(r.ms / 1000).toFixed(1)} с${r.note ? ` — ${r.note}` : ""}`);
  }
  for (const s of report.skipped) lines.push(`  ${s.source}: пропущен (${s.why})`);
  if (report.stopped) lines.push(`  кабинет остановлен: ${report.stopped}`);
  return lines;
}

export function createSyncRunner(input: { db: SupabaseClient; owner: string; log: (message: string) => void }): SyncRunner {
  const { db, owner, log } = input;
  const store = new SyncStore(db);
  const lastDerive = new Map<string, number>();
  /** Полосы и пересчёты, которые сейчас выполняются: одну и ту же не запускаем второй раз, пока она не закончилась. */
  const busy = new Set<string>();
  let lastPrune = 0;

  const deps = (): WorkerDeps => ({
    store,
    jobs: JOBS,
    owner,
    now: Date.now,
    log,
    scrub: safeSellerHubMessage,
    openToken: (k) => openSellerHubWbToken(k.userId, supabaseSellerHubSecretDb(db)),
    makeContext: (k, token, now, failCount): JobContext => ({ key: k, token, store, db, now, failCount }),
  });

  /** Пересчёт событий и задач по свежим снимкам: только базой, WB не трогает. Не чаще одного за раз на кабинет. */
  async function derive(key: CabinetKey, force: boolean): Promise<void> {
    const id = `${key.userId}:${key.marketplaceId}`;
    const lock = `derive:${id}`;
    if (busy.has(lock)) return;
    if (!force && Date.now() - (lastDerive.get(id) ?? 0) < DERIVE_EVERY_MS) return;
    busy.add(lock);
    try {
      const result = await deriveForCabinet(store, db, key);
      lastDerive.set(id, Date.now());
      if (result) log(`  события и задачи пересчитаны: задач ${result.tasks}, событий ${result.events} (источники: ${result.sources.join(", ")})`);
    } catch (error) {
      log(`  пересчёт событий и задач не удался: ${safeSellerHubMessage(error instanceof Error ? error.message : String(error), "")}`);
    } finally {
      busy.delete(lock);
    }
  }

  async function lanePass(key: CabinetKey, lane: SyncLane): Promise<void> {
    const id = `${key.userId}:${key.marketplaceId}:${lane}`;
    if (busy.has(id)) return;
    busy.add(id);
    try {
      const report = await runCabinetPass(deps(), key, lane);
      if (report.ran.length > 0 || report.skipped.length > 0 || report.stopped) {
        log(`Кабинет ${key.userId.slice(0, 8)}…, полоса «${lane === "fast" ? "быстрая" : "медленная"}»`);
        for (const line of describeReport(report)) log(line);
      }
      if (!report.stopped) await derive(key, report.changed);
    } catch (error) {
      log(`Проход не удался (${lane}): ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      busy.delete(id);
    }
  }

  async function tick(): Promise<TickResult> {
    const cabinets = await store.enabledCabinets();
    if (cabinets.length === 0) return { cabinets: 0, running: [] };
    const closed = await store.closeStaleRuns(LEASE_MS);
    if (closed > 0) log(`Закрыто прерванных прогонов в журнале: ${closed}`);
    const running = cabinets.flatMap((key) => (["fast", "slow"] as const).map((lane) => lanePass(key, lane)));
    if (Date.now() - lastPrune >= PRUNE_EVERY_MS) {
      lastPrune = Date.now();
      try {
        const pruned = (await store.prune()).filter((r) => r.deleted > 0);
        if (pruned.length > 0) log(`Очистка по срокам: ${pruned.map((r) => `${r.table_name} −${r.deleted}`).join(", ")}`);
      } catch (error) {
        log(`Очистка по срокам не удалась: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { cabinets: cabinets.length, running };
  }

  return { tick, busyCount: () => [...busy].filter((id) => !id.startsWith("derive:")).length };
}
