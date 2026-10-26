import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { DEFAULT_TASK_THRESHOLDS, resolveStagnantCapitalRub, type TaskSettings, type TaskSkuOverride } from "./config";
import { reconcileTasks } from "./engine";
import {
  reconcileRowWritable,
  SETTABLE_TASK_STATUSES,
  statusUpdateAllowed,
  taskStatusWriteDecision,
  USER_COMPLETED_RESOLUTION,
  type TaskStatusPatch,
} from "./lifecycle";
import type { TaskReconcileBody } from "./parse";
import type {
  SellerTask,
  TaskActionType,
  TaskBaseline,
  TaskCategory,
  TaskEventRef,
  TaskEvidence,
  TaskImpactType,
  TaskSeverity,
  TaskStatus,
  TaskType,
} from "./types";

const TASKS = "seller_hub_tasks";
const TASK_COLUMNS =
  "id, marketplace_id, nm_id, item_id, product_title, vendor_code, task_type, category, severity, status, title, description, reason, evidence, recommendation, action_type, business_impact_type, score, source_event_id, created_at, updated_at, snooze_until, resolved_at, resolution";
const BASELINES = "seller_hub_task_baselines";
const SETTINGS = "seller_hub_task_settings";
const OVERRIDES = "seller_hub_task_overrides";
const EVENTS = "seller_hub_product_events";
const PAGE = 1000;

const TYPES = new Set<TaskType>([
  "TASK_STOCK_OUT",
  "TASK_LOW_STOCK",
  "TASK_EXCESS_STOCK",
  "TASK_STAGNANT_CAPITAL",
  "TASK_SALES_DROP",
  "TASK_SALES_GROWTH",
  "TASK_CONVERSION_DROP",
  "TASK_LOW_TRAFFIC",
  "TASK_NO_SALES",
  "TASK_NEGATIVE_MARGIN",
  "TASK_MARGIN_NEAR_ZERO",
  "TASK_LOW_MARGIN",
  "TASK_MARGIN_DETERIORATION",
  "TASK_COST_MISSING",
  "TASK_LOW_CONTENT_SCORE",
  "TASK_CONTENT_OPPORTUNITY",
  "TASK_LOW_PHOTO_COUNT",
  "TASK_UNANSWERED_REVIEWS",
  "TASK_UNANSWERED_QUESTIONS",
  "TASK_UNANSWERED_NEGATIVE_REVIEW",
  "TASK_UNANSWERED_QUESTION",
  "TASK_UNANSWERED_POSITIVE_REVIEWS",
  "TASK_NEGATIVE_SHARE_UP",
  "TASK_PROMO_LOSS",
  "TASK_PROMO_OPPORTUNITY",
  "TASK_AD_NO_ORDERS",
  "TASK_AD_DRR_OVER_MARGIN",
  "TASK_AD_CAMPAIGN_STOPPED",
  "TASK_AD_NO_STOCK",
  "TASK_AD_EFFICIENCY_DROP",
  "TASK_AD_WEAK_CARD",
  "TASK_AD_SCALE_UP",
  "TASK_LOW_BUYOUT",
  "TASK_LOW_RATING",
  "TASK_COSTS_EAT_MARGIN",
  "TASK_FEEDBACKS_ACCESS",
  "TASK_FROM_EVENT",
]);

export function isMissingTaskTableError(message: string): boolean {
  const text = message.toLowerCase();
  const missing =
    text.includes("does not exist") ||
    text.includes("schema cache") ||
    text.includes("could not find the table");
  if (!missing) return false;
  return text.includes("seller_hub_task") || text.includes("relation") || text.includes("schema cache");
}

function raise(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function asNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function asInt(value: unknown): number | null {
  const parsed = asNum(value);
  return parsed == null ? null : Math.round(parsed);
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** ISO-время события: строка или Date (чтобы created_at из PostgREST не терялся). */
function asTimestamp(value: unknown): string | null {
  if (typeof value === "string" && value.trim() && Number.isFinite(Date.parse(value))) {
    return value.trim();
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  return null;
}

function evidenceOf(value: unknown): TaskEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const evidence: TaskEvidence = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      evidence[key] = item;
    }
  }
  return evidence;
}

type TaskRow = {
  id: string;
  marketplace_id: string;
  nm_id: string | null;
  item_id: string | null;
  product_title: string | null;
  vendor_code: string | null;
  task_type: string;
  category: string;
  severity: string;
  status: string;
  title: string;
  description: string;
  reason: string;
  evidence: unknown;
  recommendation: string;
  action_type: string;
  business_impact_type: string;
  score: number;
  source_event_id: string | null;
  created_at: string;
  updated_at: string;
  snooze_until: string | null;
  resolved_at: string | null;
  resolution: string | null;
};

function taskFromRow(row: TaskRow): SellerTask | null {
  if (!TYPES.has(row.task_type as TaskType)) return null;
  return {
    id: row.id,
    storeId: row.marketplace_id,
    nmId: asText(row.nm_id),
    itemId: asText(row.item_id),
    productTitle: asText(row.product_title),
    vendorCode: asText(row.vendor_code),
    type: row.task_type as TaskType,
    category: row.category as TaskCategory,
    severity: row.severity as TaskSeverity,
    status: row.status as TaskStatus,
    title: row.title ?? "",
    description: row.description ?? "",
    reason: row.reason ?? "",
    evidence: evidenceOf(row.evidence),
    recommendation: row.recommendation ?? "",
    actionType: row.action_type as TaskActionType,
    businessImpactType: row.business_impact_type as TaskImpactType,
    score: asInt(row.score) ?? 0,
    sourceEventId: asText(row.source_event_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    snoozeUntil: asText(row.snooze_until),
    resolvedAt: asText(row.resolved_at),
    resolution: asText(row.resolution),
  };
}

async function loadTasks(supabase: SupabaseClient, userId: string, marketplaceId: string): Promise<SellerTask[]> {
  const tasks: SellerTask[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(TASKS)
      .select(TASK_COLUMNS)
      .eq("user_id", userId)
      .eq("marketplace_id", marketplaceId)
      .range(from, from + PAGE - 1);
    raise(error);
    const rows = (data ?? []) as TaskRow[];
    for (const row of rows) {
      const task = taskFromRow(row);
      if (task) tasks.push(task);
    }
    if (rows.length < PAGE) break;
  }
  return tasks;
}

async function loadBaselines(
  supabase: SupabaseClient,
  userId: string,
  marketplaceId: string,
): Promise<Record<string, TaskBaseline>> {
  const baselines: Record<string, TaskBaseline> = {};
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(BASELINES)
      .select("nm_id, stock, promo_price, margin_percent, sales_qty, prior_sales_qty, cover_days, updated_at, stock_out_at")
      .eq("user_id", userId)
      .eq("marketplace_id", marketplaceId)
      .range(from, from + PAGE - 1);
    raise(error);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    for (const row of rows) {
      const nmId = asText(row.nm_id);
      if (!nmId) continue;
      baselines[nmId] = {
        stock: asInt(row.stock),
        promoPrice: asInt(row.promo_price),
        marginPercent: asNum(row.margin_percent),
        salesQty: asInt(row.sales_qty),
        priorSalesQty: asInt(row.prior_sales_qty),
        coverDays: asInt(row.cover_days),
        updatedAt: asText(row.updated_at),
        stockOutAt: asText(row.stock_out_at),
      };
    }
    if (rows.length < PAGE) break;
  }
  return baselines;
}

async function loadSettings(supabase: SupabaseClient, userId: string, marketplaceId: string): Promise<TaskSettings> {
  const { data, error } = await supabase
    .from(SETTINGS)
    .select(
      "low_stock_days, sales_change_percent, sales_change_min_units, excess_stock_days, no_sales_days, low_content_score, low_margin_percent, target_margin_percent, tax_rate_percent, stagnant_capital_rub, margin_drop_points, full_photo_count, disabled_types, lead_time_days, supply_cover_days, reorder_review_days, excess_cover_days",
    )
    .eq("user_id", userId)
    .eq("marketplace_id", marketplaceId)
    .maybeSingle();
  raise(error);
  const row = (data ?? null) as Record<string, unknown> | null;
  const thresholds = { ...DEFAULT_TASK_THRESHOLDS };
  if (row) {
    thresholds.lowStockDays = asInt(row.low_stock_days) ?? thresholds.lowStockDays;
    thresholds.salesChangePercent = asInt(row.sales_change_percent) ?? thresholds.salesChangePercent;
    thresholds.salesChangeMinUnits = asInt(row.sales_change_min_units) ?? thresholds.salesChangeMinUnits;
    thresholds.excessStockDays = asInt(row.excess_stock_days) ?? thresholds.excessStockDays;
    thresholds.noSalesDays = asInt(row.no_sales_days) ?? thresholds.noSalesDays;
    thresholds.lowContentScore = asInt(row.low_content_score) ?? thresholds.lowContentScore;
    const target =
      row.target_margin_percent == null ? null : asInt(row.target_margin_percent);
    const legacyLow = row.low_margin_percent == null ? null : asInt(row.low_margin_percent);
    thresholds.lowMarginPercent = target ?? legacyLow;
    thresholds.stagnantCapitalRub = resolveStagnantCapitalRub(asInt(row.stagnant_capital_rub));
    thresholds.marginDropPoints = asInt(row.margin_drop_points) ?? thresholds.marginDropPoints;
    thresholds.fullPhotoCount = asInt(row.full_photo_count) ?? thresholds.fullPhotoCount;
    thresholds.leadTimeDays = asInt(row.lead_time_days) ?? thresholds.leadTimeDays;
    thresholds.supplyCoverDays = asInt(row.supply_cover_days) ?? thresholds.supplyCoverDays;
    thresholds.reorderReviewDays = asInt(row.reorder_review_days) ?? thresholds.reorderReviewDays;
    thresholds.excessCoverDays = asInt(row.excess_cover_days) ?? thresholds.excessCoverDays;
  }
  const taxRatePercent = row?.tax_rate_percent == null ? null : asNum(row.tax_rate_percent);
  const disabled = Array.isArray(row?.disabled_types)
    ? row.disabled_types.filter((item): item is TaskType => typeof item === "string" && TYPES.has(item as TaskType))
    : [];
  const { data: overrideRows, error: overrideError } = await supabase
    .from(OVERRIDES)
    .select("nm_id, task_type, disabled, low_stock_days, excess_stock_days, low_content_score, low_margin_percent")
    .eq("user_id", userId)
    .eq("marketplace_id", marketplaceId);
  raise(overrideError);
  const skuOverrides: TaskSkuOverride[] = [];
  for (const item of (overrideRows ?? []) as Array<Record<string, unknown>>) {
    const nmId = asText(item.nm_id);
    const type = asText(item.task_type);
    if (!nmId || !type || !TYPES.has(type as TaskType)) continue;
    const override: TaskSkuOverride = {
      nmId,
      type: type as TaskType,
      disabled: Boolean(item.disabled),
    };
    const lowStockDays = asInt(item.low_stock_days);
    const excessStockDays = asInt(item.excess_stock_days);
    const lowContentScore = asInt(item.low_content_score);
    if (lowStockDays != null) override.lowStockDays = lowStockDays;
    if (excessStockDays != null) override.excessStockDays = excessStockDays;
    if (lowContentScore != null) override.lowContentScore = lowContentScore;
    if (item.low_margin_percent != null) override.lowMarginPercent = asInt(item.low_margin_percent);
    skuOverrides.push(override);
  }
  return { thresholds, disabledTypes: disabled, skuOverrides, taxRatePercent };
}

async function loadEvents(supabase: SupabaseClient, userId: string, marketplaceId: string): Promise<TaskEventRef[]> {
  const { data, error } = await supabase
    .from(EVENTS)
    .select("event_key, kind, nm_id, created_at")
    .eq("user_id", userId)
    .eq("marketplace_id", marketplaceId)
    .order("created_at", { ascending: false })
    .limit(300);
  raise(error);
  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((row) => ({
      id: asText(row.event_key) ?? "",
      kind: asText(row.kind) ?? "",
      nmId: asText(row.nm_id),
      createdAt: asTimestamp(row.created_at),
    }))
    .filter((event) => event.id && event.kind);
}

const PRODUCT_SNAPSHOTS = "seller_hub_product_snapshots";

/** Самый ранний снимок остатков кабинета — начало истории отслеживания. */
async function loadStockHistorySince(
  supabase: SupabaseClient,
  userId: string,
  marketplaceId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from(PRODUCT_SNAPSHOTS)
    .select("created_at")
    .eq("user_id", userId)
    .eq("marketplace_id", marketplaceId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  raise(error);
  return asTimestamp((data as { created_at?: unknown } | null)?.created_at);
}

function taskRow(userId: string, marketplaceId: string, task: SellerTask): Record<string, unknown> {
  return {
    id: task.id,
    user_id: userId,
    marketplace_id: marketplaceId,
    nm_id: task.nmId,
    item_id: task.itemId,
    product_title: task.productTitle,
    vendor_code: task.vendorCode,
    task_type: task.type,
    category: task.category,
    severity: task.severity,
    status: task.status,
    title: task.title,
    description: task.description,
    reason: task.reason,
    evidence: task.evidence,
    recommendation: task.recommendation,
    action_type: task.actionType,
    business_impact_type: task.businessImpactType,
    score: task.score,
    source_event_id: task.sourceEventId,
    snooze_until: task.snoozeUntil,
    resolved_at: task.resolvedAt,
    resolution: task.resolution,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  };
}

async function readUpdatedAt(
  supabase: SupabaseClient,
  userId: string,
  marketplaceId: string,
  ids: string[],
): Promise<Map<string, string>> {
  const fresh = new Map<string, string>();
  for (let index = 0; index < ids.length; index += 200) {
    const part = ids.slice(index, index + 200);
    const { data, error } = await supabase
      .from(TASKS)
      .select("id, updated_at")
      .eq("user_id", userId)
      .eq("marketplace_id", marketplaceId)
      .in("id", part);
    raise(error);
    for (const row of (data ?? []) as Array<{ id: string; updated_at: string }>) {
      fresh.set(row.id, row.updated_at);
    }
  }
  return fresh;
}

async function loadTasksByIds(
  supabase: SupabaseClient,
  userId: string,
  marketplaceId: string,
  ids: string[],
): Promise<SellerTask[]> {
  const tasks: SellerTask[] = [];
  for (let index = 0; index < ids.length; index += 200) {
    const part = ids.slice(index, index + 200);
    const { data, error } = await supabase
      .from(TASKS)
      .select(TASK_COLUMNS)
      .eq("user_id", userId)
      .eq("marketplace_id", marketplaceId)
      .in("id", part);
    raise(error);
    for (const row of (data ?? []) as TaskRow[]) {
      const task = taskFromRow(row);
      if (task) tasks.push(task);
    }
  }
  return tasks;
}

export type TaskStatusWrite =
  | { ok: true; task: SellerTask }
  | { ok: false; reason: "missing" | "closed" | "conflict" };

/** Меняет статус одной задачи. userId только из сессии, чужая строка не обновляется. */
export async function updateSellerHubTaskStatus(
  userId: string,
  marketplaceId: string,
  taskId: string,
  patch: TaskStatusPatch,
): Promise<TaskStatusWrite> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from(TASKS)
    .select(`user_id, ${TASK_COLUMNS}`)
    .eq("id", taskId)
    .eq("user_id", userId)
    .eq("marketplace_id", marketplaceId)
    .maybeSingle();
  raise(error);
  const row = (data ?? null) as (TaskRow & { user_id: string }) | null;
  const task = row ? taskFromRow(row) : null;
  const decision = taskStatusWriteDecision(
    task && row ? { userId: row.user_id, marketplaceId: row.marketplace_id, status: task.status } : null,
    { userId, marketplaceId },
  );
  if (decision !== "apply" || !task || !row || !statusUpdateAllowed(row.user_id, userId)) {
    return { ok: false, reason: decision === "closed" ? "closed" : "missing" };
  }

  const now = new Date().toISOString();
  const fields =
    patch.status === "completed"
      ? {
          status: "completed",
          resolved_at: now,
          resolution: USER_COMPLETED_RESOLUTION,
          snooze_until: null,
          updated_at: now,
        }
      : {
          status: "snoozed",
          snooze_until: patch.snoozeUntil,
          resolved_at: null,
          resolution: null,
          updated_at: now,
        };

  const { data: saved, error: updateError } = await supabase
    .from(TASKS)
    .update(fields)
    .eq("id", taskId)
    .eq("user_id", userId)
    .eq("marketplace_id", marketplaceId)
    .in("status", [...SETTABLE_TASK_STATUSES])
    .select(`user_id, ${TASK_COLUMNS}`)
    .maybeSingle();
  if (updateError && updateError.code !== "PGRST116") raise(updateError);
  const savedRow = (saved ?? null) as (TaskRow & { user_id: string }) | null;
  if (savedRow && statusUpdateAllowed(savedRow.user_id, userId)) {
    const savedTask = taskFromRow(savedRow);
    if (savedTask) return { ok: true, task: savedTask };
  }

  const { data: current, error: currentError } = await supabase
    .from(TASKS)
    .select("user_id, status")
    .eq("id", taskId)
    .eq("user_id", userId)
    .eq("marketplace_id", marketplaceId)
    .maybeSingle();
  raise(currentError);
  const currentRow = (current ?? null) as { user_id: string; status: string } | null;
  if (!currentRow || !statusUpdateAllowed(currentRow.user_id, userId)) return { ok: false, reason: "missing" };
  if (!SETTABLE_TASK_STATUSES.includes(currentRow.status as TaskStatus)) return { ok: false, reason: "closed" };
  return { ok: false, reason: "conflict" };
}

/** Уже посчитанные задачи магазина. Правила здесь не запускаются. */
export async function listSellerHubTasks(userId: string, marketplaceId: string): Promise<SellerTask[]> {
  return loadTasks(createServerClient(), userId, marketplaceId);
}

/** userId только из сессии. Чтение и запись фильтруются по нему и marketplace_id. */
export async function reconcileSellerHubTasks(userId: string, input: TaskReconcileBody): Promise<SellerTask[]> {
  const supabase = createServerClient();
  const now = new Date().toISOString();
  const [tasks, baselines, settings, events, stockHistorySince] = await Promise.all([
    loadTasks(supabase, userId, input.marketplaceId),
    loadBaselines(supabase, userId, input.marketplaceId),
    loadSettings(supabase, userId, input.marketplaceId),
    loadEvents(supabase, userId, input.marketplaceId),
    loadStockHistorySince(supabase, userId, input.marketplaceId),
  ]);
  const result = reconcileTasks({
    now,
    storeId: input.marketplaceId,
    facts: input.products,
    baselines,
    store: input.store,
    settings,
    tasks,
    events,
    stockHistorySince,
    createId: () => crypto.randomUUID(),
  });
  const loadedAt = new Map(tasks.map((task) => [task.id, task.updatedAt]));
  const dirty = result.tasks.filter((task) => task.updatedAt === now);
  const existingIds = dirty.map((task) => task.id).filter((id) => loadedAt.has(id));
  const freshAt = await readUpdatedAt(supabase, userId, input.marketplaceId, existingIds);
  const writable = dirty.filter((task) => {
    if (!loadedAt.has(task.id)) return reconcileRowWritable(undefined, null);
    return reconcileRowWritable(loadedAt.get(task.id), freshAt.get(task.id) ?? null);
  });
  const writableIds = new Set(writable.map((task) => task.id));
  const skippedIds = dirty.filter((task) => !writableIds.has(task.id)).map((task) => task.id);
  for (let index = 0; index < writable.length; index += 200) {
    const part = writable.slice(index, index + 200).map((task) => taskRow(userId, input.marketplaceId, task));
    const { error } = await supabase.from(TASKS).upsert(part, { onConflict: "id" });
    raise(error);
  }
  let merged = result.tasks;
  if (skippedIds.length > 0) {
    const current = await loadTasksByIds(supabase, userId, input.marketplaceId, skippedIds);
    const byId = new Map(current.map((task) => [task.id, task]));
    merged = result.tasks.flatMap((task) => {
      if (!skippedIds.includes(task.id)) return [task];
      const fresh = byId.get(task.id);
      return fresh ? [fresh] : [];
    });
  }
  const baselineRows = Object.entries(result.baselines)
    .filter(([nmId, row]) => {
      const previous = baselines[nmId];
      if (!previous) return true;
      return (
        previous.stock !== row.stock ||
        previous.promoPrice !== row.promoPrice ||
        previous.marginPercent !== row.marginPercent ||
        previous.salesQty !== row.salesQty ||
        previous.priorSalesQty !== row.priorSalesQty ||
        previous.coverDays !== row.coverDays ||
        previous.stockOutAt !== row.stockOutAt
      );
    })
    .map(([nmId, row]) => ({
    user_id: userId,
    marketplace_id: input.marketplaceId,
    nm_id: nmId,
    stock: row.stock,
    promo_price: row.promoPrice,
    margin_percent: row.marginPercent,
    sales_qty: row.salesQty,
    prior_sales_qty: row.priorSalesQty,
    cover_days: row.coverDays,
    stock_out_at: row.stockOutAt ?? null,
    updated_at: new Date().toISOString(),
  }));
  for (let index = 0; index < baselineRows.length; index += 200) {
    const { error } = await supabase.from(BASELINES).upsert(baselineRows.slice(index, index + 200), {
      onConflict: "user_id,marketplace_id,nm_id",
    });
    raise(error);
  }
  return merged.filter((task) => task.status === "active" || task.status === "in_progress" || task.status === "snoozed");
}
