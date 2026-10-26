import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSalesFunnelDay, fetchStocksReport } from "@/lib/services/wildberries/analytics-client";
import { HISTORY_HORIZON_DAYS, missingDays, rowsFromFunnelDay, STORE_NM_ID, stockByNm, type DailyMetrics } from "@/lib/seller-hub/metric-history";

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
      const oldStock = new Map((old ?? []).map((o) => [o.nm_id as string, (o.metrics as DailyMetrics).stock]));
      const payload = rows.map((r) => {
        const stock = oldStock.get(r.nmId);
        return { user_id: userId, marketplace_id: MARKETPLACE, metric_date: r.metricDate, nm_id: r.nmId, metrics: stock == null ? r.metrics : { ...r.metrics, stock }, source: "wb-funnel" };
      });
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
