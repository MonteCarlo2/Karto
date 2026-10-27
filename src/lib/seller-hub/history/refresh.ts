import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSalesFunnelDay, fetchStocksReport } from "@/lib/services/wildberries/analytics-client";
import { HISTORY_HORIZON_DAYS, missingDays, rowsFromFunnelDay, SNAPSHOT_METRIC_KEYS, STORE_NM_ID, stockByNm, type DailyMetrics } from "@/lib/seller-hub/metric-history";

/**
 * Накопление истории показателей по дням (воронка и остаток) в нашей базе. Общая часть для маршрута (ручной запуск из браузера)
 * и для фонового сбора: история копится на сервере, пока интерфейс закрыт.
 */

const MARKETPLACE = "wildberries";

/** Один пользователь — одна докачка за раз: у WB общий лимит на эти методы. */
const running = new Map<string, Promise<string[]>>();

export function moscowToday(now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
}

/** Из строки дня берём только то, что пришло не из воронки (остаток, цена, скидка): при записи воронки за день это сохраняется. */
export function pickSnapshotFields(metrics: Partial<DailyMetrics> | null | undefined): Partial<DailyMetrics> {
  const out: Record<string, unknown> = {};
  for (const key of SNAPSHOT_METRIC_KEYS) {
    const value = metrics?.[key];
    if (value != null) out[key] = value;
  }
  return out as Partial<DailyMetrics>;
}

export type StoredMetricRow = { metric_date: string; nm_id: string; metrics: DailyMetrics };

/** Ряд магазина за горизонт истории, как он лежит в базе. */
export async function readStoreMetricRows(db: SupabaseClient, userId: string, today: string): Promise<StoredMetricRow[]> {
  const since = new Date(`${today}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - HISTORY_HORIZON_DAYS);
  const { data, error } = await db
    .from("seller_hub_metric_daily")
    .select("metric_date, nm_id, metrics")
    .eq("user_id", userId)
    .eq("marketplace_id", MARKETPLACE)
    .eq("nm_id", STORE_NM_ID)
    .gte("metric_date", since.toISOString().slice(0, 10))
    .order("metric_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as StoredMetricRow[];
}

/** Сколько законченных дней воронки ещё не сохранено. */
export function missingFunnelDays(stored: StoredMetricRow[], today: string): number {
  const have = new Set(stored.filter((r) => r.metrics.orders !== undefined).map((r) => r.metric_date));
  return missingDays(have, today, HISTORY_HORIZON_DAYS, HISTORY_HORIZON_DAYS).length;
}

/**
 * Докачивает до трёх законченных дней воронки (по одному запросу WB на день) и пишет остаток на сегодня.
 * Возвращает замечания (что не удалось). Данные только из WB, пропущенные дни остаются пропущенными.
 */
export async function refreshMetricHistory(input: { db: SupabaseClient; userId: string; token: string; today?: string }): Promise<string[]> {
  const { db, userId, token } = input;
  const today = input.today ?? moscowToday();
  const flying = running.get(userId);
  // Параллельный вызов ждёт первый и берёт его замечания, а не получает пустой ответ.
  if (flying) return flying;
  const work = (async () => {
    const out: string[] = [];
    const stored = await readStoreMetricRows(db, userId, today);
    // День считается сохранённым, только если есть воронка: строка с одним остатком (снимок «сегодня») докачку не отменяет.
    const funnelStored = stored.filter((r) => r.metrics.orders !== undefined).map((r) => r.metric_date);
    for (const day of missingDays(funnelStored, today)) {
      const funnel = await fetchSalesFunnelDay(token, day);
      const rows = rowsFromFunnelDay(funnel, day);
      if (rows.length === 0) {
        // Ошибку не кэшируем как «пустой день»: остановились, в следующий раз попробуем снова.
        out.push(funnel.error ?? "WB не отдал воронку");
        break;
      }
      // Если за этот день уже есть остаток (снимок, сделанный в тот день), переносим его в новую строку, а не затираем.
      const { data: old } = await db.from("seller_hub_metric_daily").select("nm_id, metrics").eq("user_id", userId).eq("marketplace_id", MARKETPLACE).eq("metric_date", day);
      const oldSnapshotFields = new Map((old ?? []).map((o) => [o.nm_id as string, pickSnapshotFields(o.metrics as DailyMetrics)]));
      const payload = rows.map((r) => ({
        user_id: userId,
        marketplace_id: MARKETPLACE,
        metric_date: r.metricDate,
        nm_id: r.nmId,
        metrics: { ...r.metrics, ...(oldSnapshotFields.get(r.nmId) ?? {}) },
        source: "wb-funnel",
      }));
      const { error } = await db.from("seller_hub_metric_daily").upsert(payload, { onConflict: "user_id,marketplace_id,metric_date,nm_id" });
      if (error) throw new Error(error.message);
    }
    // Остаток на сегодня: один раз за день, пока записи нет.
    const hasToday = stored.some((r) => r.metric_date === today);
    if (!hasToday) {
      const report = await fetchStocksReport(token, 1);
      const stocks = stockByNm(report);
      if (stocks.size > 0) {
        const total = [...stocks.values()].reduce((s, v) => s + v, 0);
        const payload = [
          { user_id: userId, marketplace_id: MARKETPLACE, metric_date: today, nm_id: STORE_NM_ID, metrics: { stock: total }, source: "wb-stocks" },
          ...[...stocks].map(([nm, stock]) => ({ user_id: userId, marketplace_id: MARKETPLACE, metric_date: today, nm_id: nm, metrics: { stock }, source: "wb-stocks" })),
        ];
        const { error } = await db.from("seller_hub_metric_daily").upsert(payload, { onConflict: "user_id,marketplace_id,metric_date,nm_id" });
        if (error) throw new Error(error.message);
      } else if (report.error) out.push(report.error);
    }
    return out;
  })();
  running.set(userId, work);
  try {
    return await work;
  } finally {
    running.delete(userId);
  }
}

/**
 * Записывает в историю дня цену и скидку каждого товара по последнему снимку каталога. WB не вызывается.
 * Цена за день хранится одна (последняя): ночью это цена на конец дня, и по ней потом видно, как смена цены повлияла на заказы.
 * Другие показатели дня (воронка, остаток) сохраняются: строка читается и дополняется, а не заменяется.
 */
export async function recordDailyPrices(input: {
  db: SupabaseClient;
  userId: string;
  today: string;
  items: Array<{ nmId: string; price: number | null; discountPercent: number | null }>;
}): Promise<number> {
  const { db, userId, today, items } = input;
  const known = items.filter((item) => item.nmId && (item.price != null || item.discountPercent != null));
  if (known.length === 0) return 0;
  const { data, error } = await db
    .from("seller_hub_metric_daily")
    .select("nm_id, metrics")
    .eq("user_id", userId)
    .eq("marketplace_id", MARKETPLACE)
    .eq("metric_date", today)
    .in("nm_id", known.map((item) => item.nmId));
  if (error) throw new Error(error.message);
  const existing = new Map((data ?? []).map((row) => [row.nm_id as string, (row.metrics ?? {}) as Record<string, unknown>]));
  const payload = known.map((item) => ({
    user_id: userId,
    marketplace_id: MARKETPLACE,
    metric_date: today,
    nm_id: item.nmId,
    metrics: { ...(existing.get(item.nmId) ?? {}), price: item.price, discount: item.discountPercent ?? 0 },
    source: "wb-price",
  }));
  const { error: writeError } = await db.from("seller_hub_metric_daily").upsert(payload, { onConflict: "user_id,marketplace_id,metric_date,nm_id" });
  if (writeError) throw new Error(writeError.message);
  return payload.length;
}
