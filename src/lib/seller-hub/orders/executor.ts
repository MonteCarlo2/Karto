import type { SupabaseClient } from "@supabase/supabase-js";
import { moscowDateKey } from "@/lib/seller-hub/complete-days";
import { recordAction } from "@/lib/seller-hub/action-log";
import { evaluateAutopay } from "@/lib/seller-hub/ads-agent";
import { parseAdDepositRequest } from "@/lib/seller-hub/ads-deposit";
import { isSandboxOn } from "@/lib/seller-hub/sandbox";
import { openSellerHubWbToken, safeSellerHubMessage } from "@/lib/seller-hub/wb-token";
import { supabaseSellerHubSecretDb } from "@/lib/seller-hub/wb-token-store";
import { fetchWbAdsSnapshot } from "@/lib/services/wildberries/advert-client";
import { depositWbAdBudget } from "@/lib/services/wildberries/ads-write-client";
import { fetchPricesByNmIds } from "@/lib/services/wildberries/content-client";
import { updateWbPrices } from "@/lib/services/wildberries/prices-write-client";
import { computeNextRun } from "./schedule";
import { toOrder } from "./repository";
import { notifyOrderRun } from "@/lib/seller-hub/notify/sources";
import { supabaseCacheStore } from "@/lib/seller-hub/data-cache";
import type { AdsDepositParams, Order, OrderRun, PriceStepParams, RemindParams, WhenOrdersParams } from "./types";

/**
 * Исполнитель поручений: раз в минуту берёт поручения, которым пора, и выполняет их.
 * Правила безопасности:
 * — тестовый режим: ничего не уходит в Wildberries, запуск помечается «тест» и пишет, что было бы сделано;
 * — режим «напомнить»: только запись для владельца, без действий в кабинете;
 * — деньги и цены двигаются только в рамках поручения (суточный лимит, нижняя и верхняя граница цены);
 * — любая ошибка WB останавливает этот запуск, ничего не повторяется вслепую.
 */

export type RunOutcome = { status: OrderRun["status"]; summary: string; detail?: Record<string, unknown> };

const REMINDER_PAUSE_MS = 12 * 3_600_000;

/** Всё, что исполнитель берёт снаружи (кабинет WB, база, журнал). В тестах подставляются заглушки, в работе настоящие. */
export type ExecutorDeps = {
  openToken: (userId: string) => ReturnType<typeof openSellerHubWbToken>;
  adsSnapshot: typeof fetchWbAdsSnapshot;
  deposit: typeof depositWbAdBudget;
  prices: typeof fetchPricesByNmIds;
  updatePrices: typeof updateWbPrices;
  sandboxOn: (userId: string) => Promise<boolean>;
  record: typeof recordAction;
  completeDays: (userId: string, nowMs: number) => Promise<Array<{ date: string; orders: number }> | null>;
  depositedToday: (order: Order, nowMs: number) => Promise<number>;
  lastReminderAt: (order: Order) => Promise<number>;
  firedToday: (order: Order, nowMs: number) => Promise<number>;
};

/** Заказы по дням (без отменённых) из серверного кэша отчёта «Заказы»; только полные сутки по Москве, самые свежие в конце. */
async function completeDaysFromCache(db: SupabaseClient, userId: string, nowMs: number): Promise<Array<{ date: string; orders: number }> | null> {
  const store = supabaseCacheStore(db, userId);
  for (const days of [28, 14, 56]) {
    const hit = await store.read<{ daily?: Array<{ date: string; orders: number; cancelled: number }> }>(`region-orders:v4:${days}`);
    if (hit?.payload?.daily && hit.payload.daily.length >= 3) {
      const today = moscowDateKey(nowMs);
      return hit.payload.daily.filter((d) => d.date < today).map((d) => ({ date: d.date, orders: d.orders - d.cancelled }));
    }
  }
  return null;
}

export function realDeps(db: SupabaseClient): ExecutorDeps {
  const dayStart = (nowMs: number) => new Date(`${moscowDateKey(nowMs)}T00:00:00+03:00`).toISOString();
  return {
    openToken: (userId) => openSellerHubWbToken(userId, supabaseSellerHubSecretDb(db)),
    adsSnapshot: fetchWbAdsSnapshot,
    deposit: depositWbAdBudget,
    prices: fetchPricesByNmIds,
    updatePrices: updateWbPrices,
    sandboxOn: (userId) => isSandboxOn(db, userId),
    record: recordAction,
    completeDays: (userId, nowMs) => completeDaysFromCache(db, userId, nowMs),
    depositedToday: async (order, nowMs) => {
      const { data } = await db.from("seller_hub_order_runs").select("detail, status").eq("order_id", order.id).gte("at", dayStart(nowMs)).in("status", ["done", "simulated"]);
      return ((data ?? []) as Array<{ detail: { sumRub?: unknown } | null }>).reduce((a, r) => a + (typeof r.detail?.sumRub === "number" ? r.detail.sumRub : 0), 0);
    },
    lastReminderAt: async (order) => {
      const { data } = await db.from("seller_hub_order_runs").select("at").eq("order_id", order.id).eq("status", "reminder").order("at", { ascending: false }).limit(1).maybeSingle();
      return data ? Date.parse((data as { at: string }).at) : 0;
    },
    firedToday: async (order, nowMs) => {
      const { count } = await db.from("seller_hub_order_runs").select("id", { count: "exact", head: true }).eq("order_id", order.id).gte("at", dayStart(nowMs)).in("status", ["done", "simulated", "reminder"]);
      return count ?? 0;
    },
  };
}

async function runRemind(order: Order): Promise<RunOutcome> {
  return { status: "reminder", summary: (order.params as RemindParams).text };
}

async function runAdsDeposit(deps: ExecutorDeps, userId: string, order: Order, nowMs: number): Promise<RunOutcome> {
  const p = order.params as AdsDepositParams;
  const cap = order.limits.maxPerDayRub ?? 0;
  const opened = await deps.openToken(userId);
  if (!opened.ok) return { status: "skipped", summary: "Кабинет Wildberries не подключён или токен недоступен" };
  const snapshot = await deps.adsSnapshot(opened.token);
  const campaign = snapshot.campaigns.find((c) => String(c.id) === p.campaignId);
  if (!campaign) return { status: "skipped", summary: "Кампания не найдена в кабинете: возможно, её удалили. Измените поручение и выберите другую" };
  const campaignName = campaign.name || `Кампания ${campaign.id}`;
  if (campaign.status !== 9) return { status: "skipped", summary: `${campaignName}: кампания сейчас не запущена, пополнять нечего` };
  if (campaign.budget == null) return { status: "skipped", summary: `${campaignName}: Wildberries не показал остаток бюджета, проверка пропущена` };
  const already = await deps.depositedToday(order, nowMs);
  const { deposits, skipped } = evaluateAutopay({
    params: { minBudgetRub: p.belowRub, topUpRub: p.topUpRub, dailyCapRub: cap },
    campaigns: snapshot.campaigns.filter((c) => String(c.id) === p.campaignId),
    depositedTodayRub: { [p.campaignId]: already },
    accountRub: snapshot.accountNet ?? null,
  });
  const d = deposits[0];
  if (!d) return { status: "skipped", summary: skipped[0] ? `${skipped[0].campaignName}: ${skipped[0].reason}` : "Остаток в норме, пополнять не нужно" };
  if (already + d.sumRub > cap) return { status: "skipped", summary: `Суточный лимит ${cap} ₽ исчерпан, пополнение не сделано` };

  if (order.mode === "ask") {
    if (nowMs - (await deps.lastReminderAt(order)) < REMINDER_PAUSE_MS) return { status: "skipped", summary: "Напоминание уже было недавно" };
    return { status: "reminder", summary: `Пора пополнить рекламу на ${d.sumRub} ₽: ${d.reason}`, detail: { sumRub: 0 } };
  }
  if (await deps.sandboxOn(userId)) return { status: "simulated", summary: `Тестовый режим: пополнил бы кампанию на ${d.sumRub} ₽ (${d.reason})`, detail: { sumRub: d.sumRub } };

  const parsed = parseAdDepositRequest({ campaignId: Number(d.campaignId), sum: d.sumRub, confirmSum: d.sumRub });
  if (!parsed.ok) return { status: "failed", summary: parsed.error };
  const res = await deps.deposit(opened.token, parsed.request);
  await deps.record({ userId, agent: "ads", action: "ad_deposit", targetId: Number(d.campaignId), request: { campaignId: Number(d.campaignId), sum: d.sumRub, rule: `order:${order.id}` }, result: res.ok ? "ok" : "error", message: res.ok ? null : res.error ?? null, initiator: "agent" });
  return res.ok ? { status: "done", summary: `Пополнил кампанию на ${d.sumRub} ₽`, detail: { sumRub: d.sumRub } } : { status: "failed", summary: res.error ?? "Wildberries не принял пополнение" };
}

async function runPriceStep(deps: ExecutorDeps, userId: string, order: Order): Promise<RunOutcome> {
  const p = order.params as PriceStepParams;
  const floor = order.limits.minBuyerPriceRub ?? null;
  const ceil = order.limits.maxBuyerPriceRub ?? null;
  const opened = await deps.openToken(userId);
  if (!opened.ok) return { status: "skipped", summary: "Кабинет Wildberries не подключён или токен недоступен" };
  const rows = await deps.prices(opened.token, p.nmIds.map(Number));

  const changes: Array<{ nmId: number; from: number; to: number; buyerFrom: number; buyerTo: number }> = [];
  const notes: string[] = [];
  for (const id of p.nmIds) {
    const row = rows.get(Number(id));
    if (!row || row.price == null) {
      notes.push(`${id}: цена не прочиталась`);
      continue;
    }
    const k = 1 - (row.discountPercent ?? 0) / 100;
    const buyerNow = row.price * k;
    let base = Math.round(row.price * (1 + (p.direction === "down" ? -p.pct : p.pct) / 100));
    if (p.direction === "down" && floor != null && base * k < floor) base = Math.ceil(floor / k);
    if (p.direction === "up" && ceil != null && base * k > ceil) base = Math.floor(ceil / k);
    const moved = p.direction === "down" ? base < row.price : base > row.price;
    if (!moved || Math.abs(base - row.price) < 1) {
      notes.push(`${id}: уже на границе, цену не меняю`);
      continue;
    }
    changes.push({ nmId: Number(id), from: row.price, to: base, buyerFrom: Math.round(buyerNow), buyerTo: Math.round(base * k) });
  }
  if (changes.length === 0) return { status: "skipped", summary: notes.join("; ") || "Менять нечего" };
  const line = changes.map((c) => `${c.nmId}: ${c.buyerFrom} → ${c.buyerTo} ₽`).join("; ");

  if (order.mode === "ask") return { status: "reminder", summary: `Пора менять цену: ${line}`, detail: { changes } };
  if (await deps.sandboxOn(userId)) return { status: "simulated", summary: `Тестовый режим: изменил бы цену (${line})`, detail: { changes } };

  const res = await deps.updatePrices(opened.token, changes.map((c) => ({ nmId: c.nmId, price: c.to })));
  for (const c of changes) await deps.record({ userId, agent: "prices", action: "price_update", nmId: c.nmId, request: { nmId: c.nmId, from: c.from, to: c.to, rule: `order:${order.id}` }, result: res.ok ? "ok" : "error", message: res.ok ? null : res.error ?? null, initiator: "agent" });
  return res.ok ? { status: "done", summary: `Изменил цену: ${line}`, detail: { changes } } : { status: "failed", summary: res.error ?? "Wildberries не принял цены" };
}

async function runWhenOrders(deps: ExecutorDeps, userId: string, order: Order, nowMs: number): Promise<RunOutcome> {
  const w = order.params as WhenOrdersParams;
  const days = await deps.completeDays(userId, nowMs);
  if (!days || days.length < w.days) return { status: "skipped", summary: "Данных по заказам пока мало для проверки" };
  const last = days.slice(-w.days);
  if (!last.every((d) => d.orders < w.belowOrders)) return { status: "skipped", summary: "Условие не наступило" };

  // Один раз в сутки: если уже срабатывало сегодня, повторять не нужно.
  if ((await deps.firedToday(order, nowMs)) > 0) return { status: "skipped", summary: "Сегодня уже сработало" };

  const series = last.map((d) => `${d.date.slice(8, 10)}.${d.date.slice(5, 7)}: ${d.orders}`).join(", ");
  if (w.then === "notify" || order.mode === "ask") {
    const what = w.then === "deposit" ? `Пора пополнить рекламу на ${w.topUpRub} ₽` : (w.text ?? "Заказов мало");
    return { status: "reminder", summary: `${what}. Заказов по дням: ${series}.`, detail: { sumRub: 0 } };
  }
  const topUp = w.topUpRub ?? 0;
  const cap = order.limits.maxPerDayRub ?? 0;
  const already = await deps.depositedToday(order, nowMs);
  if (already + topUp > cap) return { status: "skipped", summary: `Суточный лимит ${cap} ₽ исчерпан` };
  if (await deps.sandboxOn(userId)) return { status: "simulated", summary: `Тестовый режим: пополнил бы рекламу на ${topUp} ₽ (заказов по дням: ${series})`, detail: { sumRub: topUp } };
  const opened = await deps.openToken(userId);
  if (!opened.ok) return { status: "failed", summary: "Кабинет Wildberries не подключён или токен недоступен" };
  const parsed = parseAdDepositRequest({ campaignId: Number(w.campaignId), sum: topUp, confirmSum: topUp });
  if (!parsed.ok) return { status: "failed", summary: parsed.error };
  const res = await deps.deposit(opened.token, parsed.request);
  await deps.record({ userId, agent: "ads", action: "ad_deposit", targetId: Number(w.campaignId), request: { campaignId: Number(w.campaignId), sum: topUp, rule: `order:${order.id}` }, result: res.ok ? "ok" : "error", message: res.ok ? null : res.error ?? null, initiator: "agent" });
  return res.ok ? { status: "done", summary: `Пополнил рекламу на ${topUp} ₽ (заказов по дням: ${series})`, detail: { sumRub: topUp } } : { status: "failed", summary: res.error ?? "Wildberries не принял пополнение" };
}

/** Выполняет одно поручение (без записи результата). Любая ошибка превращается в понятный запуск «Ошибка». */
export async function executeOrder(deps: ExecutorDeps, order: Order, userId: string, nowMs: number): Promise<RunOutcome> {
  try {
    if (order.kind === "remind") return await runRemind(order);
    if (order.kind === "ads_deposit") return await runAdsDeposit(deps, userId, order, nowMs);
    if (order.kind === "when_orders") return await runWhenOrders(deps, userId, order, nowMs);
    return await runPriceStep(deps, userId, order);
  } catch (e) {
    console.error("[seller-hub-orders] поручение не выполнилось:", order.kind, e instanceof Error ? e.stack : String(e));
    return { status: "failed", summary: e instanceof Error ? safeSellerHubMessage(e.message, "") : "Не удалось выполнить поручение" };
  }
}

let running = false;

/** Один проход: выполняет все поручения, которым пора. Вызывается планировщиком раз в минуту. */
export async function runDueOrders(db: SupabaseClient, nowMs = Date.now()): Promise<{ ran: number }> {
  if (running) return { ran: 0 };
  running = true;
  let ran = 0;
  try {
    const deps = realDeps(db);
    const { data } = await db
      .from("seller_hub_orders")
      .select("id, user_id, title, kind, params, schedule, limits, mode, status, created_from, next_run_at, last_run_at, runs_count, last_status, last_summary, created_at")
      .eq("status", "active")
      .lte("next_run_at", new Date(nowMs).toISOString())
      .order("next_run_at", { ascending: true })
      .limit(40);
    for (const row of (data ?? []) as Array<Parameters<typeof toOrder>[0] & { user_id: string }>) {
      const order = toOrder(row);
      // Аренда: переносим следующий запуск на 5 минут вперёд только если он всё ещё прежний. Кто успел первым, тот и исполняет;
      // второй сервер получит 0 строк и пропустит поручение. Если исполнитель упал, поручение вернётся само через 5 минут.
      const lease = await db.from("seller_hub_orders").update({ next_run_at: new Date(nowMs + 5 * 60_000).toISOString() }).eq("id", order.id).eq("next_run_at", row.next_run_at ?? "").select("id");
      if (lease.error || (lease.data?.length ?? 0) === 0) continue;
      const outcome = await executeOrder(deps, order, row.user_id, nowMs);
      // Проверочные запуски («условие не наступило») в историю не пишем, чтобы она не заполнялась пустыми строками; остальное пишем.
      const isCheck = order.schedule.type === "check";
      // «Условие не наступило» у сценария по заказам тоже не пишем, даже если он проверяет раз в день в выбранное время.
      if (!((isCheck || order.kind === "when_orders") && outcome.status === "skipped")) {
        await db.from("seller_hub_order_runs").insert({ order_id: order.id, user_id: row.user_id, status: outcome.status, summary: outcome.summary.slice(0, 500), detail: outcome.detail ?? null });
        // Результат запуска идёт и в Telegram, если владелец подключил его и не выключил такие уведомления. Сбой доставки запуск не ломает.
        await notifyOrderRun(db, row.user_id, { id: `${order.id}:${nowMs}`, orderTitle: order.title, status: outcome.status, summary: outcome.summary, at: new Date(nowMs).toISOString() });
      }
      const counted = outcome.status === "skipped" && isCheck ? order.runsCount : order.runsCount + 1;
      const next = computeNextRun(order.schedule, nowMs, counted);
      await db
        .from("seller_hub_orders")
        .update({ last_run_at: new Date(nowMs).toISOString(), runs_count: counted, last_status: outcome.status, last_summary: outcome.summary.slice(0, 300), next_run_at: next, status: next ? "active" : "done", updated_at: new Date(nowMs).toISOString() })
        .eq("id", order.id);
      ran += 1;
    }
  } finally {
    running = false;
  }
  return { ran };
}

export const ORDERS_TICK_MS = 60_000;
