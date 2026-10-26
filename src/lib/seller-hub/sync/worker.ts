import { dueSources, isAuthFailure, LEASE_MS, nextDueAfterFailure, nextDueAfterSuccess } from "./schedule";
import { syncSource, type SyncLane, type SyncSource, type SyncSourceId } from "./sources";
import type { CabinetKey, SyncStore } from "./store";
import type { Job, JobContext } from "./jobs";

/**
 * Один проход воркера по кабинету: какие источники пора читать, прочитать их по очереди, записать результат.
 * Все зависимости (база, WB, время) передаются снаружи, поэтому логика проверяется тестами без сети и без базы.
 */

export type StoreLike = Pick<
  SyncStore,
  "ensureState" | "loadState" | "claim" | "finishOk" | "finishFail" | "markTokenLost" | "startRun" | "finishRun" | "readSnapshot"
>;

export type TokenResult = { ok: true; token: string } | { ok: false; reason: "missing" | "unavailable" | "unreadable" };

export type WorkerDeps = {
  store: StoreLike;
  /** Нужен только заданиям. */
  makeContext: (key: CabinetKey, token: string, now: number, failCount: number) => JobContext;
  jobs: Record<SyncSourceId, Job>;
  openToken: (key: CabinetKey) => Promise<TokenResult>;
  now: () => number;
  owner: string;
  /** Предельное время одного задания; должно быть меньше аренды, иначе источник заберёт другой воркер, пока этот ещё читает. */
  jobTimeoutMs?: number;
  log: (message: string) => void;
  /** Убирает из текста ошибки токен и подобное. */
  scrub: (message: string, token: string) => string;
};

export type PassReport = {
  cabinet: CabinetKey;
  ran: Array<{ source: SyncSourceId; status: "ok" | "partial" | "failed" | "rate_limited"; changed?: boolean; ms: number; note?: string }>;
  skipped: Array<{ source: SyncSourceId; why: string }>;
  stopped: "token_lost" | "no_token" | null;
  /** Хотя бы один источник обновился и изменился: пора пересчитывать события и задачи. */
  changed: boolean;
};

type ErrorLike = { message?: string; status?: number; retryAfterSec?: number };

/** Задание дольше этого считается зависшим: его ошибка записывается, источник пробуется снова позже. */
export const JOB_TIMEOUT_MS = 8 * 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`Превышено время ожидания ${Math.round(ms / 60_000)} мин`), { status: 504 })), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

export async function runCabinetPass(deps: WorkerDeps, key: CabinetKey, lane?: SyncLane): Promise<PassReport> {
  const report: PassReport = { cabinet: key, ran: [], skipped: [], stopped: null, changed: false };
  await deps.store.ensureState(key);
  const states = await deps.store.loadState(key);
  const due = dueSources(states, deps.now()).filter((source) => !lane || source.lane === lane);
  if (due.length === 0) return report;

  const opened = await deps.openToken(key);
  if (!opened.ok) {
    if (opened.reason === "missing") {
      await deps.store.markTokenLost(key, "Токен кабинета не найден");
      report.stopped = "token_lost";
    } else {
      // Ключ шифрования недоступен или токен не читается: это проблема сервера, а не кабинета. Кабинет не останавливаем.
      report.stopped = "no_token";
    }
    return report;
  }
  const token = opened.token;
  const failCounts = new Map(states.map((s) => [s.source, s.failCount]));

  for (const source of due) {
    const missing = await missingNeeds(deps.store, key, source);
    if (missing) {
      report.skipped.push({ source: source.id, why: `нет данных: ${missing}` });
      continue;
    }
    const startedAt = deps.now();
    const claimed = await deps.store.claim(key, source.id, deps.owner, startedAt, LEASE_MS);
    if (!claimed) {
      report.skipped.push({ source: source.id, why: "занят другим воркером" });
      continue;
    }
    const failCount = failCounts.get(source.id) ?? 0;
    let runId: string | null = null;
    try {
      runId = await deps.store.startRun(key, source.id, deps.owner);
      const outcome = await withTimeout(deps.jobs[source.id](deps.makeContext(key, token, startedAt, failCount)), deps.jobTimeoutMs ?? JOB_TIMEOUT_MS);
      const finishedAt = deps.now();
      const ms = finishedAt - startedAt;
      if (outcome.status === "ok") {
        const nextDue = outcome.retryInMs ? finishedAt + outcome.retryInMs : nextDueAfterSuccess(source, finishedAt, seedOf(key, source.id, finishedAt));
        await deps.store.finishOk(key, source.id, finishedAt, nextDue, startedAt);
        await deps.store.finishRun(runId, { status: "ok", rows: outcome.rows ?? null, durationMs: ms });
        report.ran.push({ source: source.id, status: "ok", changed: outcome.changed, ms });
        if (outcome.changed) report.changed = true;
      } else {
        await deps.store.finishFail(key, source.id, nextDueAfterFailure(source, failCount + 1, finishedAt), failCount + 1, outcome.reason, startedAt);
        await deps.store.finishRun(runId, { status: "partial", durationMs: ms, error: outcome.reason });
        report.ran.push({ source: source.id, status: "partial", ms, note: outcome.reason });
      }
    } catch (error) {
      const finishedAt = deps.now();
      const err = error as ErrorLike;
      const message = deps.scrub(err.message ?? String(error), token);
      const status = typeof err.status === "number" ? err.status : null;
      const retryAfterMs = err.retryAfterSec ? err.retryAfterSec * 1000 : null;
      const runStatus = status === 429 ? "rate_limited" : "failed";
      // Запись итога ошибки тоже может не пройти (база недоступна): не даём этому оборвать проход, аренда истечёт сама.
      await bestEffort(deps, () => deps.store.finishFail(key, source.id, nextDueAfterFailure(source, failCount + 1, finishedAt, retryAfterMs), failCount + 1, message, startedAt));
      if (runId) {
        const id = runId;
        await bestEffort(deps, () => deps.store.finishRun(id, { status: runStatus, httpStatus: status, durationMs: finishedAt - startedAt, error: message }));
      }
      report.ran.push({ source: source.id, status: runStatus, ms: finishedAt - startedAt, note: message });
      if (isAuthFailure(status)) {
        // Токен не принят или нет прав: остальные источники читать бессмысленно.
        await bestEffort(deps, () => deps.store.markTokenLost(key, message));
        report.stopped = "token_lost";
        break;
      }
    }
  }
  return report;
}

async function bestEffort(deps: WorkerDeps, action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (error) {
    deps.log(`  не удалось записать итог в базу: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function missingNeeds(store: StoreLike, key: CabinetKey, source: SyncSource): Promise<string | null> {
  for (const need of source.needs) {
    const snap = await store.readSnapshot(key, need);
    if (!snap) return syncSource(need).title;
  }
  return null;
}

/** Детерминированный разброс для расписания: стабилен для пары «кабинет, источник, время». */
function seedOf(key: CabinetKey, source: string, now: number): number {
  let h = 7;
  for (const ch of `${key.userId}${source}`) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h + Math.floor(now / 60_000);
}
