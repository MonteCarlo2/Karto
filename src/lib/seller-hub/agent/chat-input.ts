import type { SupabaseClient } from "@supabase/supabase-js";
import { listOrders } from "@/lib/seller-hub/orders/repository";
import { orderSummary, scheduleText } from "@/lib/seller-hub/orders/types";
import { supabaseCacheStore } from "@/lib/seller-hub/data-cache";
import { buildStockAnalytics } from "@/lib/seller-hub/stock-analytics";
import { loadScenarioProducts } from "./scenario-inputs";
import { composeSnapshot } from "@/lib/seller-hub/sync/derive";
import { SyncStore } from "@/lib/seller-hub/sync/store";
import { listSellerHubTasks } from "@/lib/seller-hub/task-engine/repository";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import type { runChatTurn } from "./chat-run";

const MARKETPLACE = "wildberries";

export type ChatTurnInput = Pick<Parameters<typeof runChatTurn>[0], "products" | "tasksByNm" | "taskList" | "stockReport" | "cabinetExtra" | "catalog" | "campaigns">;

/**
 * Всё, что агенту нужно знать о магазине для ответа: товары с фактами, задачи, остатки, поручения, продажи по дням, реклама, акции, отзывы.
 * Один сборщик на сайт и на Telegram: ответы там и там строятся на одних и тех же данных. Только чтение из нашей базы, к WB не обращается.
 * null, если данные кабинета ещё не загружены.
 */
export async function buildChatInput(db: SupabaseClient, userId: string): Promise<{ input: ChatTurnInput; snapshot: SellerCatalogSnapshot } | null> {
  const built = await composeSnapshot(new SyncStore(db), db, { userId: userId, marketplaceId: MARKETPLACE });
  if (!built) return null;
  const nowMs = Date.now();
  const [products, tasks] = await Promise.all([loadScenarioProducts(db, userId, built.snapshot, nowMs), listSellerHubTasks(userId, MARKETPLACE)]);
  const tasksByNm = new Map<string, string[]>();
  for (const t of tasks) {
    if (!t.nmId || (t.status !== "active" && t.status !== "in_progress")) continue;
    tasksByNm.set(t.nmId, [...(tasksByNm.get(t.nmId) ?? []), t.title]);
  }
  const taskList = tasks
    .filter((t) => t.status === "active" || t.status === "in_progress")
    .map((t) => ({ id: t.id, nmId: t.nmId, title: t.title, severity: t.severity, category: t.category }));
  const stock = buildStockAnalytics(built.snapshot.stocksReport, built.snapshot.items);
  const stockReport = stock
    ? {
        out_or_low_count: stock.rows.filter((r) => r.status === "out" || r.status === "low").length,
        overstock_count: stock.rows.filter((r) => r.status === "over").length,
        fewest_days_left: stock.rows.filter((r) => r.saleRateDays != null && !r.noSales).sort((a, b) => a.saleRateDays! - b.saleRateDays!).slice(0, 6).map((r) => ({ title: r.title.slice(0, 50), days_left: Math.round(r.saleRateDays!), stock: r.stock, status: r.status })),
        most_overstocked: stock.rows.filter((r) => r.status === "over").sort((a, b) => (b.saleRateDays ?? 1e9) - (a.saleRateDays ?? 1e9)).slice(0, 6).map((r) => ({ title: r.title.slice(0, 50), days_left: r.saleRateDays != null ? Math.round(r.saleRateDays) : null, stock: r.stock, no_sales: r.noSales })),
      }
    : undefined;
  const snap = built.snapshot;
  const ordersForChat = await (async () => {
    try {
      const list = await listOrders(db, userId);
      return list.filter((o) => o.status !== "done").slice(0, 20).map((o) => ({ id: o.id, title: o.title, what: orderSummary(o), when: scheduleText(o.schedule), status: o.status === "active" ? "идёт" : "на паузе", kind: o.kind, mode: o.mode, params: o.params, schedule: o.schedule, limits: o.limits }));
    } catch {
      return [];
    }
  })();
  // Заказы по дням из серверного кэша отчёта «Заказы» (только чтение, к WB не обращаемся): нужны для сравнения недель и вопросов про конкретный день.
  const dailySeries = await (async () => {
    try {
      const store = supabaseCacheStore(db, userId);
      for (const days of [56, 28, 14]) {
        const hit = await store.read<{ daily?: Array<{ date: string; orders: number; cancelled: number; sum: number }> }>(`region-orders:v4:${days}`);
        if (hit?.payload?.daily && hit.payload.daily.length >= 7) {
          const todayKey = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
          const done = hit.payload.daily.filter((d) => d.date < todayKey).slice(-28).map((d) => ({ date: d.date, orders: d.orders - d.cancelled, revenue_rub: Math.round(d.sum) }));
          const last7 = done.slice(-7);
          const prev7 = done.slice(-14, -7);
          const tot = (rows: typeof done) => ({ orders: rows.reduce((a, r) => a + r.orders, 0), revenue_rub: rows.reduce((a, r) => a + r.revenue_rub, 0) });
          return { daily_complete_days: done, last_7_complete_days: tot(last7), previous_7_complete_days: prev7.length === 7 ? tot(prev7) : null };
        }
      }
    } catch {
      // без кэша ряда по дням не будет, остальные данные на месте
    }
    return null;
  })();

  const cabinetExtra = {
    // Поручения владельца: чтобы агент мог ответить «что у меня запланировано» и не создавал дубли.
    standing_orders: ordersForChat,
    orders_by_day: dailySeries,
    sales_last_7_days: snap.analytics ? { period: `${snap.analytics.periodStart} — ${snap.analytics.periodEnd}`, orders: snap.analytics.ordersTotal, revenue_rub: Math.round(snap.analytics.revenueTotal), avg_order_value_rub: snap.analytics.avgOrderValue != null ? Math.round(snap.analytics.avgOrderValue) : null, buyouts: snap.analytics.buyoutsTotal } : null,
    daily_sales_last_7_days: (snap.analytics?.daily ?? []).map((d) => ({ date: d.date, orders: d.orders, revenue_rub: Math.round(d.revenue) })),
    ads_last_7_days: snap.adsStats
      ? (() => {
          const names = new Map((snap.ads?.campaigns ?? []).map((c) => [String(c.id), c.name || `Кампания ${c.id}`]));
          const rows = snap.adsStats.campaigns.map((c) => ({ name: (names.get(c.advertId) ?? `Кампания ${c.advertId}`).slice(0, 40), spend_rub: Math.round(c.spend), orders: c.orders, order_sum_rub: Math.round(c.orderSum), drr_pct: c.orderSum > 0 ? Math.round((c.spend / c.orderSum) * 1000) / 10 : null }));
          const spend = rows.reduce((a, r) => a + r.spend_rub, 0);
          const sum = rows.reduce((a, r) => a + r.order_sum_rub, 0);
          return { period: `${snap.adsStats.dateFrom} — ${snap.adsStats.dateTo}`, spend_rub: spend, orders: rows.reduce((a, r) => a + r.orders, 0), order_sum_rub: sum, drr_pct: sum > 0 ? Math.round((spend / sum) * 1000) / 10 : null, campaigns: rows.sort((a, b) => b.spend_rub - a.spend_rub).slice(0, 6) };
        })()
      : null,
    unanswered_negative_reviews: Object.entries(snap.feedbacks?.byNm ?? {})
      .flatMap(([nm, st]) => st.staleNegatives.map((r) => ({ nmId: r.nmId || nm, rating: r.rating, date: r.createdAt.slice(0, 10), text: (r.cons || r.text || "").replace(/\s+/g, " ").slice(0, 240), answered: r.answered })))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8),
    unanswered_reviews: snap.comms?.unansweredFeedbacks ?? null,
    unanswered_questions: snap.comms?.unansweredQuestions ?? null,
    promotions: (snap.promotions ?? []).slice(0, 8).map((p) => ({ name: p.name.slice(0, 60), starts: p.startAt ?? null, ends: p.endAt ?? null, products_in: p.participatingSkuCount ?? null })),
    supplies: snap.supplies ? { open: snap.supplies.openCount, closed: snap.supplies.closedCount } : null,
    fbs_orders: snap.orders ? { new: snap.orders.newCount, in_assembly: snap.orders.inAssembly, in_delivery: snap.orders.inDelivery, canceled: snap.orders.canceled } : null,
  };
  return {
    snapshot: built.snapshot,
    input: { products, tasksByNm, taskList, stockReport, cabinetExtra, catalog: built.snapshot.items.map((i) => ({ nmId: String(i.externalId), title: i.title })), campaigns: (built.snapshot.ads?.campaigns ?? []).map((c) => ({ id: String(c.id), name: c.name || `Кампания ${c.id}`, status: c.status ?? null, statusLabel: c.statusLabel ?? "", paymentType: c.paymentType ?? null, bids: (c.bids ?? []).map((b) => ({ nmId: b.nmId, searchRub: b.searchRub })), dailyLimit: c.dailyLimit ? { limitRub: c.dailyLimit.limitRub, carryOver: c.dailyLimit.carryOver } : null })) },
  };
}
