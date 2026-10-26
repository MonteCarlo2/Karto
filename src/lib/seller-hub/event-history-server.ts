import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyEventsState } from "@/lib/seller-hub/event-engine/compare";
import {
  reconcileAgainstPrevious,
  type EventReconcileInput,
} from "@/lib/seller-hub/event-history";
import {
  EVENT_GROUP,
  type ProductBaseline,
  type SellerEventGroup,
  type SellerEventKind,
  type SellerEventSeverity,
  type SellerEventsState,
  type SellerProductEvent,
  type StoreBaseline,
} from "@/lib/seller-hub/event-engine/types";
import { agentActionEvents, type AgentActionRow } from "@/lib/seller-hub/event-engine/derived-events";
import { DEFAULT_SENSITIVITY, isSensitivity, smartEvents, type ProductDay, type StoreDay } from "@/lib/seller-hub/event-engine/smart-events";
import { parseStoreSignalsBaseline } from "@/lib/seller-hub/event-engine/store-events";
import { createServerClient } from "@/lib/supabase/server";

const STORES = "seller_hub_event_stores";
const SNAPSHOTS = "seller_hub_product_snapshots";
const EVENTS = "seller_hub_product_events";
const PAGE = 1000;
const WRITE_CHUNK = 200;

const KINDS = new Set<SellerEventKind>(Object.keys(EVENT_GROUP) as SellerEventKind[]);

const GROUPS = new Set<SellerEventGroup>(Object.values(EVENT_GROUP));
const SEVERITIES = new Set<SellerEventSeverity>(["critical", "important", "info"]);

type SnapshotRow = {
  nm_id: string;
  item_id: string;
  title: string;
  vendor_code: string;
  price: number | null;
  discount: number | null;
  promo_price: number | null;
  stock: number | null;
  sales_qty: number | null;
  sales_window: string | null;
  content_score: number | null;
  photos_count: number | null;
  cover_days: number | null;
  description_hash: string | null;
  description_length: number | null;
  characteristics_count: number | null;
  has_video: boolean | null;
  absent: boolean;
};

type EventRow = {
  event_key: string;
  created_at: string;
  kind: string;
  event_group: string;
  severity: string;
  title: string;
  detail: string;
  product_title: string | null;
  vendor_code: string | null;
  nm_id: string | null;
  item_id: string | null;
};

type StoreRow = {
  captured: boolean;
  last_sync_at: string | null;
  unanswered_feedbacks: number | null;
  unanswered_questions: number | null;
  signals: unknown;
};

export function isMissingSellerHubHistoryError(message: string): boolean {
  const text = message.toLowerCase();
  const missing =
    text.includes("does not exist") ||
    text.includes("schema cache") ||
    text.includes("could not find the table");
  if (!missing) return false;
  return text.includes("seller_hub_") || text.includes("relation") || text.includes("schema cache");
}

function asInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value);
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function sameBaseline(left: ProductBaseline, right: ProductBaseline): boolean {
  return (
    left.itemId === right.itemId &&
    left.title === right.title &&
    left.vendorCode === right.vendorCode &&
    left.price === right.price &&
    left.discount === right.discount &&
    left.promoPrice === right.promoPrice &&
    left.stock === right.stock &&
    left.salesQty === right.salesQty &&
    left.salesWindow === right.salesWindow &&
    left.contentScore === right.contentScore &&
    left.photoCount === right.photoCount &&
    left.coverDays === right.coverDays &&
    (left.descriptionHash ?? null) === (right.descriptionHash ?? null) &&
    (left.descriptionLength ?? null) === (right.descriptionLength ?? null) &&
    (left.characteristicsCount ?? null) === (right.characteristicsCount ?? null) &&
    (left.hasVideo ?? null) === (right.hasVideo ?? null) &&
    left.absent === right.absent
  );
}

function sameStore(left: StoreBaseline, right: StoreBaseline): boolean {
  return (
    left.captured === right.captured &&
    left.lastSyncAt === right.lastSyncAt &&
    left.unansweredFeedbacks === right.unansweredFeedbacks &&
    left.unansweredQuestions === right.unansweredQuestions &&
    JSON.stringify(left.signals ?? null) === JSON.stringify(right.signals ?? null)
  );
}

function baselineFromRow(row: SnapshotRow): ProductBaseline {
  return {
    itemId: row.item_id ?? "",
    title: row.title ?? "",
    vendorCode: row.vendor_code ?? "",
    price: asInt(row.price),
    discount: asInt(row.discount),
    promoPrice: asInt(row.promo_price),
    stock: asInt(row.stock),
    salesQty: asInt(row.sales_qty),
    salesWindow: asText(row.sales_window),
    contentScore: asInt(row.content_score),
    photoCount: asInt(row.photos_count),
    coverDays: asInt(row.cover_days),
    descriptionHash: asText(row.description_hash),
    descriptionLength: asInt(row.description_length),
    characteristicsCount: asInt(row.characteristics_count),
    hasVideo: typeof row.has_video === "boolean" ? row.has_video : null,
    absent: Boolean(row.absent),
  };
}

function eventFromRow(row: EventRow): SellerProductEvent | null {
  if (!KINDS.has(row.kind as SellerEventKind)) return null;
  if (!GROUPS.has(row.event_group as SellerEventGroup)) return null;
  if (!SEVERITIES.has(row.severity as SellerEventSeverity)) return null;
  if (!row.event_key || !row.created_at) return null;
  return {
    id: row.event_key,
    createdAt: row.created_at,
    kind: row.kind as SellerEventKind,
    group: row.event_group as SellerEventGroup,
    severity: row.severity as SellerEventSeverity,
    title: row.title ?? "",
    detail: row.detail ?? "",
    productTitle: asText(row.product_title),
    vendorCode: asText(row.vendor_code),
    nmId: asText(row.nm_id),
    itemId: asText(row.item_id),
  };
}

function raise(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

async function loadStore(
  supabase: SupabaseClient,
  userId: string,
  marketplaceId: string,
): Promise<StoreBaseline | null> {
  const { data, error } = await supabase
    .from(STORES)
    .select("captured, last_sync_at, unanswered_feedbacks, unanswered_questions, signals")
    .eq("user_id", userId)
    .eq("marketplace_id", marketplaceId)
    .maybeSingle();
  raise(error);
  if (!data) return null;
  const row = data as StoreRow;
  return {
    captured: Boolean(row.captured),
    lastSyncAt: asText(row.last_sync_at),
    unansweredFeedbacks: asInt(row.unanswered_feedbacks),
    unansweredQuestions: asInt(row.unanswered_questions),
    signals: parseStoreSignalsBaseline(row.signals),
  };
}

async function loadProducts(
  supabase: SupabaseClient,
  userId: string,
  marketplaceId: string,
): Promise<Record<string, ProductBaseline>> {
  const products: Record<string, ProductBaseline> = {};
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(SNAPSHOTS)
      .select(
        "nm_id, item_id, title, vendor_code, price, discount, promo_price, stock, sales_qty, sales_window, content_score, photos_count, cover_days, description_hash, description_length, characteristics_count, has_video, absent",
      )
      .eq("user_id", userId)
      .eq("marketplace_id", marketplaceId)
      .range(from, from + PAGE - 1);
    raise(error);
    const rows = (data ?? []) as SnapshotRow[];
    for (const row of rows) {
      if (!row.nm_id) continue;
      products[row.nm_id] = baselineFromRow(row);
    }
    if (rows.length < PAGE) break;
  }
  return products;
}

async function loadEvents(
  supabase: SupabaseClient,
  userId: string,
  marketplaceId: string,
): Promise<SellerProductEvent[]> {
  const { data, error } = await supabase
    .from(EVENTS)
    .select(
      "event_key, created_at, kind, event_group, severity, title, detail, product_title, vendor_code, nm_id, item_id",
    )
    .eq("user_id", userId)
    .eq("marketplace_id", marketplaceId)
    .order("created_at", { ascending: false })
    .limit(300);
  raise(error);
  const events: SellerProductEvent[] = [];
  for (const row of (data ?? []) as EventRow[]) {
    const event = eventFromRow(row);
    if (event) events.push(event);
  }
  return events;
}

async function loadPrevious(
  supabase: SupabaseClient,
  userId: string,
  marketplaceId: string,
): Promise<SellerEventsState> {
  const store = await loadStore(supabase, userId, marketplaceId);
  if (!store?.captured) return emptyEventsState();
  const [products, events] = await Promise.all([
    loadProducts(supabase, userId, marketplaceId),
    loadEvents(supabase, userId, marketplaceId),
  ]);
  return { version: 1, products, store, events };
}

async function writeChunks(
  rows: Record<string, unknown>[],
  write: (part: Record<string, unknown>[]) => Promise<void>,
): Promise<void> {
  for (let index = 0; index < rows.length; index += WRITE_CHUNK) {
    await write(rows.slice(index, index + WRITE_CHUNK));
  }
}

async function saveNext(
  supabase: SupabaseClient,
  userId: string,
  marketplaceId: string,
  previous: SellerEventsState,
  next: SellerEventsState,
): Promise<void> {
  const known = new Set(previous.events.map((event) => event.id));
  const fresh = next.events.filter((event) => !known.has(event.id));
  if (fresh.length > 0) {
    const eventRows = fresh.map((event) => ({
      user_id: userId,
      marketplace_id: marketplaceId,
      event_key: event.id,
      created_at: event.createdAt,
      kind: event.kind,
      event_group: event.group,
      severity: event.severity,
      title: event.title,
      detail: event.detail,
      product_title: event.productTitle,
      vendor_code: event.vendorCode,
      nm_id: event.nmId,
      item_id: event.itemId,
    }));
    await writeChunks(eventRows, async (part) => {
      const { error } = await supabase.from(EVENTS).upsert(part, {
        onConflict: "user_id,marketplace_id,event_key",
        ignoreDuplicates: true,
      });
      raise(error);
    });
  }

  const changed: Record<string, unknown>[] = [];
  for (const [nmId, row] of Object.entries(next.products)) {
    const prior = previous.products[nmId];
    if (prior && sameBaseline(prior, row)) continue;
    changed.push({
      user_id: userId,
      marketplace_id: marketplaceId,
      nm_id: nmId,
      item_id: row.itemId,
      title: row.title,
      vendor_code: row.vendorCode,
      price: row.price,
      discount: row.discount,
      promo_price: row.promoPrice,
      stock: row.stock,
      sales_qty: row.salesQty,
      sales_window: row.salesWindow,
      content_score: row.contentScore,
      photos_count: row.photoCount,
      cover_days: row.coverDays,
      description_hash: row.descriptionHash ?? null,
      description_length: row.descriptionLength ?? null,
      characteristics_count: row.characteristicsCount ?? null,
      has_video: row.hasVideo ?? null,
      absent: row.absent,
      updated_at: new Date().toISOString(),
    });
  }
  await writeChunks(changed, async (part) => {
    const { error } = await supabase.from(SNAPSHOTS).upsert(part, {
      onConflict: "user_id,marketplace_id,nm_id",
    });
    raise(error);
  });

  if (!sameStore(previous.store, next.store)) {
    const { error } = await supabase.from(STORES).upsert(
      {
        user_id: userId,
        marketplace_id: marketplaceId,
        captured: next.store.captured,
        last_sync_at: next.store.lastSyncAt,
        unanswered_feedbacks: next.store.unansweredFeedbacks,
        unanswered_questions: next.store.unansweredQuestions,
        signals: next.store.signals ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,marketplace_id" },
    );
    raise(error);
  }
}

async function loadSensitivity(supabase: SupabaseClient, userId: string): Promise<ReturnType<typeof parseSensitivity>> {
  const { data } = await supabase.from("seller_hub_user_settings").select("value").eq("user_id", userId).eq("setting_key", "events.sensitivity").maybeSingle();
  return parseSensitivity((data as { value?: unknown } | null)?.value);
}

function parseSensitivity(value: unknown) {
  return isSensitivity(value) ? value : DEFAULT_SENSITIVITY;
}

type MetricRow = { metric_date: string; nm_id: string; metrics: { orders?: unknown; opens?: unknown; carts?: unknown } };
const asNum = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** События по накопленным данным: умные уведомления по истории (просадки, тенденции, конверсии, «замолчавшие» товары) и журнал агентов. Ошибка источника не ломает остальные события. */
async function loadDerivedEvents(
  supabase: SupabaseClient,
  userId: string,
  marketplaceId: string,
  products: Record<string, ProductBaseline>,
): Promise<SellerProductEvent[]> {
  const out: SellerProductEvent[] = [];
  const now = new Date();
  try {
    const since = new Date(now.getTime() - 45 * 86_400_000).toISOString().slice(0, 10);
    const rows: MetricRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("seller_hub_metric_daily")
        .select("metric_date, nm_id, metrics")
        .eq("user_id", userId)
        .eq("marketplace_id", marketplaceId)
        .gte("metric_date", since)
        .order("metric_date", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const part = (data ?? []) as MetricRow[];
      rows.push(...part);
      if (part.length < PAGE) break;
    }
    const store: StoreDay[] = rows.filter((r) => r.nm_id === "").map((r) => ({ date: r.metric_date, orders: asNum(r.metrics?.orders), opens: asNum(r.metrics?.opens), carts: asNum(r.metrics?.carts) }));
    const productDays: ProductDay[] = rows.filter((r) => r.nm_id !== "").map((r) => ({ date: r.metric_date, nmId: r.nm_id, orders: asNum(r.metrics?.orders) }));
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" }).format(now);
    out.push(
      ...smartEvents({
        now: now.toISOString(),
        todayKey: today,
        store,
        products: productDays,
        titleOf: (nmId) => products[nmId]?.title || null,
        outOfStock: new Set(Object.entries(products).filter(([, p]) => p.stock != null && p.stock <= 0).map(([nm]) => nm)),
        sensitivity: await loadSensitivity(supabase, userId),
      }),
    );
  } catch {
    // нет таблицы истории или сети: остальные события отдаём как есть
  }
  try {
    const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const { data, error } = await supabase
      .from("seller_hub_agent_actions")
      .select("id, agent, action, result, message, initiator, nm_id, created_at")
      .eq("user_id", userId)
      .eq("marketplace_id", marketplaceId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error) out.push(...agentActionEvents((data ?? []) as AgentActionRow[]));
  } catch {
    // журнала нет: не страшно
  }
  return out;
}

/** userId только из проверенной сессии. Запросы ниже всегда фильтруются по нему. */
export async function reconcileSellerHubEventHistory(
  userId: string,
  input: EventReconcileInput,
): Promise<SellerProductEvent[]> {
  const supabase = createServerClient();
  const previous = await loadPrevious(supabase, userId, input.marketplaceId);
  const next = reconcileAgainstPrevious({
    now: new Date().toISOString(),
    previous,
    products: input.products,
    store: input.store,
  });
  const known = new Set(next.events.map((event) => event.id));
  const derived = (await loadDerivedEvents(supabase, userId, input.marketplaceId, next.products)).filter((event) => !known.has(event.id));
  const merged: SellerEventsState = { ...next, events: [...next.events, ...derived].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
  await saveNext(supabase, userId, input.marketplaceId, previous, merged);
  return merged.events;
}

/**
 * Только чтение: события, уже посчитанные фоновым сбором. Ничего не пересчитывает и не пишет,
 * поэтому интерфейс с устаревшим снимком не может затереть то, что насчитал сервер.
 */
export async function readSellerHubEventHistory(userId: string, marketplaceId: string): Promise<SellerProductEvent[]> {
  const supabase = createServerClient();
  const previous = await loadPrevious(supabase, userId, marketplaceId);
  const known = new Set(previous.events.map((event) => event.id));
  const derived = (await loadDerivedEvents(supabase, userId, marketplaceId, previous.products)).filter((event) => !known.has(event.id));
  return [...previous.events, ...derived].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
