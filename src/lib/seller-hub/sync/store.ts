import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncStateRow } from "./schedule";
import { SYNC_SOURCES, type SyncSourceId } from "./sources";

/**
 * Работа воркера с базой: кабинеты, расписание источников, аренда, журнал прогонов, серверные снимки.
 * Все запросы идут от имени service role и всегда ограничены парой user_id + marketplace_id.
 */

export type CabinetKey = { userId: string; marketplaceId: string };

const CABINETS = "seller_hub_cabinets";
const STATE = "seller_hub_sync_state";
const RUNS = "seller_hub_sync_runs";
const SNAPSHOTS = "seller_hub_snapshots";
const AD_DAILY = "seller_hub_ad_daily";

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

const iso = (ms: number) => new Date(ms).toISOString();

/**
 * Поля со временем чтения. Они меняются при каждом прогоне, хотя данные те же, поэтому в сравнении содержимого не участвуют:
 * иначе снимок «менялся» бы каждые 15 минут, лишний раз перезаписывался и вызывал пересчёт событий и задач.
 */
const VOLATILE_KEYS = new Set(["syncedAt", "loadedAt", "capturedAt", "fetchedAt"]);

/** Хэш содержимого без времени чтения: если снимок не изменился, события и задачи заново считать не нужно. */
export function hashPayload(payload: unknown): string {
  const text = JSON.stringify(payload, (key, value) => (VOLATILE_KEYS.has(key) ? undefined : value));
  return createHash("sha1").update(text ?? "").digest("hex");
}

export class SyncStore {
  constructor(private readonly db: SupabaseClient) {}

  /** Кабинеты с включённым фоном и записанным согласием. */
  async enabledCabinets(): Promise<CabinetKey[]> {
    const { data, error } = await this.db
      .from(CABINETS)
      .select("user_id, marketplace_id")
      .eq("background_enabled", true)
      .not("consent_at", "is", null)
      .eq("status", "ok");
    fail("кабинеты", error);
    return (data ?? []).map((row) => ({ userId: row.user_id as string, marketplaceId: row.marketplace_id as string }));
  }

  /** Создаёт строки состояния для источников, которых ещё нет (кабинет только что включили или появился новый источник). */
  async ensureState(key: CabinetKey): Promise<void> {
    const rows = SYNC_SOURCES.map((s) => ({ user_id: key.userId, marketplace_id: key.marketplaceId, source: s.id }));
    const { error } = await this.db.from(STATE).upsert(rows, { onConflict: "user_id,marketplace_id,source", ignoreDuplicates: true });
    fail("состояние источников", error);
  }

  async loadState(key: CabinetKey): Promise<SyncStateRow[]> {
    const { data, error } = await this.db
      .from(STATE)
      .select("source, next_due_at, fail_count, lease_until, lease_owner")
      .eq("user_id", key.userId)
      .eq("marketplace_id", key.marketplaceId);
    fail("чтение расписания", error);
    return (data ?? []).map((row) => ({
      source: row.source as SyncSourceId,
      nextDueAt: Date.parse(row.next_due_at as string),
      failCount: (row.fail_count as number) ?? 0,
      leaseUntil: row.lease_until ? Date.parse(row.lease_until as string) : null,
      leaseOwner: (row.lease_owner as string | null) ?? null,
    }));
  }

  /**
   * Занимает источник за этим воркером. Условие «аренды нет или она истекла» проверяет сама база в одном запросе,
   * поэтому два воркера не получат один источник. true — источник наш.
   */
  async claim(key: CabinetKey, source: SyncSourceId, owner: string, now: number, leaseMs: number): Promise<boolean> {
    const { data, error } = await this.db
      .from(STATE)
      .update({ lease_until: iso(now + leaseMs), lease_owner: owner, last_started_at: iso(now) })
      .eq("user_id", key.userId)
      .eq("marketplace_id", key.marketplaceId)
      .eq("source", source)
      .or(`lease_until.is.null,lease_until.lte.${iso(now)}`)
      .select("source");
    fail("захват источника", error);
    return (data ?? []).length === 1;
  }

  /**
   * Завершает источник после успеха. Следующий срок ставится, только если за время чтения источник не пометили
   * «перечитать сейчас» (действие в интерфейсе): такая пометка имеет срок позже начала чтения и не должна теряться.
   */
  async finishOk(key: CabinetKey, source: SyncSourceId, now: number, nextDueAt: number, startedAt: number): Promise<void> {
    const done = { lease_until: null, lease_owner: null, last_ok_at: iso(now), fail_count: 0, last_error: null };
    const scheduled = await this.db
      .from(STATE)
      .update({ ...done, next_due_at: iso(nextDueAt) })
      .eq("user_id", key.userId)
      .eq("marketplace_id", key.marketplaceId)
      .eq("source", source)
      .lte("next_due_at", iso(startedAt))
      .select("source");
    fail("завершение источника", scheduled.error);
    if ((scheduled.data ?? []).length === 0) {
      const kept = await this.db.from(STATE).update(done).eq("user_id", key.userId).eq("marketplace_id", key.marketplaceId).eq("source", source);
      fail("завершение источника (срок сохранён)", kept.error);
    }
    const cab = await this.db.from(CABINETS).update({ last_ok_at: iso(now), last_error: null, updated_at: iso(now) }).eq("user_id", key.userId).eq("marketplace_id", key.marketplaceId);
    fail("здоровье кабинета", cab.error);
  }

  async finishFail(key: CabinetKey, source: SyncSourceId, nextDueAt: number, failCount: number, message: string, startedAt: number): Promise<void> {
    const failed = { lease_until: null, lease_owner: null, fail_count: failCount, last_error: message.slice(0, 500) };
    const scheduled = await this.db
      .from(STATE)
      .update({ ...failed, next_due_at: iso(nextDueAt) })
      .eq("user_id", key.userId)
      .eq("marketplace_id", key.marketplaceId)
      .eq("source", source)
      .lte("next_due_at", iso(startedAt))
      .select("source");
    fail("запись ошибки источника", scheduled.error);
    if ((scheduled.data ?? []).length === 0) {
      const kept = await this.db.from(STATE).update(failed).eq("user_id", key.userId).eq("marketplace_id", key.marketplaceId).eq("source", source);
      fail("запись ошибки источника (срок сохранён)", kept.error);
    }
  }

  /** Токен потерян или нет прав: кабинет останавливается до ручного исправления. */
  async markTokenLost(key: CabinetKey, message: string): Promise<void> {
    const { error } = await this.db
      .from(CABINETS)
      .update({ status: "token_lost", last_error: message.slice(0, 500), updated_at: new Date().toISOString() })
      .eq("user_id", key.userId)
      .eq("marketplace_id", key.marketplaceId);
    fail("статус кабинета", error);
  }

  /** Курсор источника: что нужно помнить между проходами (например, сколько шагов уже сделано). */
  async readCursor(key: CabinetKey, source: SyncSourceId): Promise<Record<string, unknown>> {
    const { data, error } = await this.db
      .from(STATE)
      .select("cursor")
      .eq("user_id", key.userId)
      .eq("marketplace_id", key.marketplaceId)
      .eq("source", source)
      .maybeSingle();
    fail("чтение курсора", error);
    return (data?.cursor as Record<string, unknown> | null) ?? {};
  }

  async writeCursor(key: CabinetKey, source: SyncSourceId, cursor: Record<string, unknown>): Promise<void> {
    const { error } = await this.db
      .from(STATE)
      .update({ cursor })
      .eq("user_id", key.userId)
      .eq("marketplace_id", key.marketplaceId)
      .eq("source", source);
    fail("запись курсора", error);
  }

  async startRun(key: CabinetKey, source: SyncSourceId, owner: string): Promise<string> {
    const { data, error } = await this.db
      .from(RUNS)
      .insert({ user_id: key.userId, marketplace_id: key.marketplaceId, source, owner, status: "running" })
      .select("id")
      .single();
    fail("начало прогона", error);
    return data!.id as string;
  }

  async finishRun(
    runId: string,
    result: { status: "ok" | "partial" | "failed" | "rate_limited" | "skipped"; httpStatus?: number | null; rows?: number | null; durationMs: number; error?: string | null },
  ): Promise<void> {
    const { error } = await this.db
      .from(RUNS)
      .update({
        status: result.status,
        http_status: result.httpStatus ?? null,
        rows_count: result.rows ?? null,
        duration_ms: Math.round(result.durationMs),
        error: result.error ? result.error.slice(0, 500) : null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
    fail("конец прогона", error);
  }

  /**
   * Публикует снимок источника: заменяет прежний. Вызывать только для полного снимка.
   * Возвращает true, если содержимое изменилось (по хэшу); если нет, обновляется только время загрузки.
   */
  async publishSnapshot(key: CabinetKey, source: SyncSourceId, payload: unknown, window?: { from?: string; to?: string }): Promise<boolean> {
    const hash = hashPayload(payload);
    const prev = await this.db
      .from(SNAPSHOTS)
      .select("payload_hash")
      .eq("user_id", key.userId)
      .eq("marketplace_id", key.marketplaceId)
      .eq("source", source)
      .maybeSingle();
    fail("чтение хэша снимка", prev.error);
    const unchanged = prev.data?.payload_hash === hash;
    if (unchanged) {
      const touch = await this.db
        .from(SNAPSHOTS)
        .update({ loaded_at: new Date().toISOString() })
        .eq("user_id", key.userId)
        .eq("marketplace_id", key.marketplaceId)
        .eq("source", source);
      fail("обновление времени снимка", touch.error);
      return false;
    }
    const { error } = await this.db.from(SNAPSHOTS).upsert(
      {
        user_id: key.userId,
        marketplace_id: key.marketplaceId,
        source,
        payload,
        payload_hash: hash,
        data_from: window?.from ?? null,
        data_to: window?.to ?? null,
        loaded_at: new Date().toISOString(),
      },
      { onConflict: "user_id,marketplace_id,source" },
    );
    fail("публикация снимка", error);
    return true;
  }

  async readSnapshot<T>(key: CabinetKey, source: SyncSourceId): Promise<{ payload: T; loadedAt: number } | null> {
    const { data, error } = await this.db
      .from(SNAPSHOTS)
      .select("payload, loaded_at")
      .eq("user_id", key.userId)
      .eq("marketplace_id", key.marketplaceId)
      .eq("source", source)
      .maybeSingle();
    fail("чтение снимка", error);
    return data ? { payload: data.payload as T, loadedAt: Date.parse(data.loaded_at as string) } : null;
  }

  /** Все нужные снимки одним запросом: меньше обращений к базе, быстрее ответ интерфейсу. */
  async readSnapshots(key: CabinetKey, sources: SyncSourceId[]): Promise<Map<SyncSourceId, { payload: unknown; loadedAt: number }>> {
    const { data, error } = await this.db
      .from(SNAPSHOTS)
      .select("source, payload, loaded_at")
      .eq("user_id", key.userId)
      .eq("marketplace_id", key.marketplaceId)
      .in("source", sources);
    fail("чтение снимков", error);
    return new Map(
      (data ?? []).map((row) => [row.source as SyncSourceId, { payload: row.payload as unknown, loadedAt: Date.parse(row.loaded_at as string) }]),
    );
  }

  /** Реклама по дням: перезаписывает те же ключи (день, кампания, товар), старые дни остаются. */
  async upsertAdDaily(
    key: CabinetKey,
    rows: Array<{ date: string; advertId: number; nmId: number; views: number; clicks: number; spend: number; orders: number; orderSum: number }>,
  ): Promise<number> {
    let written = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const part = rows.slice(i, i + 500).map((r) => ({
        user_id: key.userId,
        marketplace_id: key.marketplaceId,
        metric_date: r.date,
        advert_id: r.advertId,
        nm_id: r.nmId,
        views: Math.round(r.views),
        clicks: Math.round(r.clicks),
        spend: Math.round(r.spend * 100) / 100,
        orders: Math.round(r.orders),
        order_sum: Math.round(r.orderSum * 100) / 100,
        captured_at: new Date().toISOString(),
      }));
      const { error } = await this.db.from(AD_DAILY).upsert(part, { onConflict: "user_id,marketplace_id,metric_date,advert_id,nm_id" });
      fail("реклама по дням", error);
      written += part.length;
    }
    return written;
  }

  /**
   * Закрывает строки журнала, которые остались «выполняется» после остановки или падения воркера.
   * Аренда у таких источников истекает сама, но журнал без этого показывал бы вечный прогон.
   */
  async closeStaleRuns(olderThanMs: number): Promise<number> {
    const { data, error } = await this.db
      .from(RUNS)
      .update({ status: "failed", finished_at: new Date().toISOString(), error: "Прерван: воркер остановился до завершения" })
      .eq("status", "running")
      .lt("started_at", new Date(Date.now() - olderThanMs).toISOString())
      .select("id");
    fail("закрытие зависших прогонов", error);
    return (data ?? []).length;
  }

  /** Ежедневная очистка по срокам хранения (функция в базе). */
  async prune(): Promise<Array<{ table_name: string; deleted: number }>> {
    const { data, error } = await this.db.rpc("seller_hub_prune_all");
    fail("очистка", error);
    return (data ?? []) as Array<{ table_name: string; deleted: number }>;
  }
}
