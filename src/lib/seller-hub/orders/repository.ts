import type { SupabaseClient } from "@supabase/supabase-js";
import { firstRun } from "./schedule";
import { validateOrderInput, type Order, type OrderInput, type OrderRun, type OrderStatus } from "./types";

const ORDERS = "seller_hub_orders";
const RUNS = "seller_hub_order_runs";
export const MAX_ORDERS_PER_USER = 30;

type OrderRow = {
  id: string;
  title: string;
  kind: Order["kind"];
  params: Order["params"];
  schedule: Order["schedule"];
  limits: Order["limits"];
  mode: Order["mode"];
  status: OrderStatus;
  created_from: Order["createdFrom"];
  next_run_at: string | null;
  last_run_at: string | null;
  runs_count: number;
  last_status: string | null;
  last_summary: string | null;
  created_at: string;
};

const COLS = "id, title, kind, params, schedule, limits, mode, status, created_from, next_run_at, last_run_at, runs_count, last_status, last_summary, created_at";

export const toOrder = (r: OrderRow): Order => ({
  id: r.id,
  title: r.title,
  kind: r.kind,
  params: r.params,
  schedule: r.schedule,
  limits: r.limits ?? {},
  mode: r.mode,
  status: r.status,
  createdFrom: r.created_from,
  nextRunAt: r.next_run_at,
  lastRunAt: r.last_run_at,
  runsCount: r.runs_count,
  lastStatus: r.last_status,
  lastSummary: r.last_summary,
  createdAt: r.created_at,
});

export async function listOrders(db: SupabaseClient, userId: string): Promise<Order[]> {
  const { data, error } = await db.from(ORDERS).select(COLS).eq("user_id", userId).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error("Поручения не прочитались");
  return ((data ?? []) as unknown as OrderRow[]).map(toOrder);
}

export async function createOrder(db: SupabaseClient, userId: string, input: OrderInput, nowMs: number): Promise<Order> {
  const { count } = await db.from(ORDERS).select("id", { count: "exact", head: true }).eq("user_id", userId).neq("status", "done");
  if ((count ?? 0) >= MAX_ORDERS_PER_USER) throw new Error(`Поручений слишком много (больше ${MAX_ORDERS_PER_USER}). Удалите ненужные.`);
  const next = firstRun(input.schedule, nowMs);
  if (!next) throw new Error("Это время уже прошло: выберите будущее");
  const { data, error } = await db
    .from(ORDERS)
    .insert({ user_id: userId, title: input.title, kind: input.kind, params: input.params, schedule: input.schedule, limits: input.limits, mode: input.mode, created_from: input.createdFrom ?? "form", next_run_at: next })
    .select(COLS)
    .single();
  if (error || !data) throw new Error("Поручение не сохранилось");
  return toOrder(data as unknown as OrderRow);
}

/** Правка: статус (пауза/включить) или полная замена содержимого. Расписание пересчитывается. */
export async function updateOrder(db: SupabaseClient, userId: string, id: string, patch: { status?: OrderStatus; input?: unknown }, nowMs: number): Promise<Order> {
  const update: Record<string, unknown> = { updated_at: new Date(nowMs).toISOString() };
  if (patch.input !== undefined) {
    const v = validateOrderInput(patch.input);
    if (!v.ok) throw new Error(v.error);
    const next = firstRun(v.value.schedule, nowMs);
    if (!next) throw new Error("Это время уже прошло: выберите будущее");
    // Правка не включает поручение, которое стояло на паузе: пауза остаётся, пока владелец сам её не снимет.
    let status: OrderStatus = "active";
    if (!patch.status) {
      const { data: cur } = await db.from(ORDERS).select("status").eq("id", id).eq("user_id", userId).maybeSingle();
      if ((cur as { status?: OrderStatus } | null)?.status === "paused") status = "paused";
    }
    Object.assign(update, { title: v.value.title, kind: v.value.kind, params: v.value.params, schedule: v.value.schedule, limits: v.value.limits, mode: v.value.mode, next_run_at: next, status, runs_count: 0 });
  }
  if (patch.status) {
    update.status = patch.status;
    if (patch.status === "active" && patch.input === undefined) {
      const { data: cur } = await db.from(ORDERS).select("schedule, runs_count").eq("id", id).eq("user_id", userId).maybeSingle();
      const next = cur ? firstRun((cur as { schedule: Order["schedule"] }).schedule, nowMs) : null;
      update.next_run_at = next;
      if (!next) update.status = "done";
    }
  }
  const { data, error } = await db.from(ORDERS).update(update).eq("id", id).eq("user_id", userId).select(COLS).maybeSingle();
  if (error || !data) throw new Error("Поручение не найдено");
  return toOrder(data as unknown as OrderRow);
}

export async function deleteOrder(db: SupabaseClient, userId: string, id: string): Promise<void> {
  const { error } = await db.from(ORDERS).delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error("Поручение не удалилось");
}

export async function listRuns(db: SupabaseClient, userId: string, limit = 40): Promise<OrderRun[]> {
  const { data, error } = await db.from(RUNS).select("id, order_id, at, status, summary, read").eq("user_id", userId).order("at", { ascending: false }).limit(limit);
  if (error) throw new Error("История запусков не прочиталась");
  const rows = (data ?? []) as Array<{ id: string; order_id: string; at: string; status: OrderRun["status"]; summary: string; read: boolean }>;
  const ids = [...new Set(rows.map((r) => r.order_id))];
  const titles = new Map<string, string>();
  if (ids.length > 0) {
    const { data: t } = await db.from(ORDERS).select("id, title").in("id", ids);
    for (const o of (t ?? []) as Array<{ id: string; title: string }>) titles.set(o.id, o.title);
  }
  return rows.map((r) => ({ id: r.id, orderId: r.order_id, orderTitle: titles.get(r.order_id), at: r.at, status: r.status, summary: r.summary, read: r.read }));
}

export async function markRunsRead(db: SupabaseClient, userId: string): Promise<void> {
  await db.from(RUNS).update({ read: true }).eq("user_id", userId).eq("read", false);
}
