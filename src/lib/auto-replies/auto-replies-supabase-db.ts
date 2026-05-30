import type { SupabaseClient } from "@supabase/supabase-js";
import type { AutoRepliesMarketplaceId } from "./types";
import type { AutoRepliesSettingsRoot } from "./settings-types";
import type { AutoRepliesWorkspacePrefs } from "./workspace-prefs";
import type { ComposeDraft, ReplyHistoryEntry } from "./reply-history-store";
import { sanitizeSettingsJsonForSupabase } from "./settings-sanitize";
import type { InboxReviewItem } from "./inbox-demo-data";

const USER_STATE_TABLE = "auto_reply_user_state";
const HISTORY_TABLE = "auto_reply_history";
const INBOX_TABLE = "auto_reply_inbox_snapshots";

export type AutoReplyUserStateRow = {
  user_id: string;
  email: string | null;
  shop_id: string;
  shop_name: string | null;
  workspace_prefs: AutoRepliesWorkspacePrefs | Record<string, unknown>;
  settings_json: AutoRepliesSettingsRoot;
  compose_drafts: Record<string, ComposeDraft>;
  updated_at: string;
};

export type AutoReplyHistoryRow = {
  id: string;
  user_id: string;
  shop_id: string;
  marketplace_id: AutoRepliesMarketplaceId;
  usage_mode: string;
  usage_mode_label: string;
  star_rating: string;
  review_text: string;
  reply_text: string;
  generation_source: string;
  product_name: string | null;
  buyer_label: string | null;
  created_at: string;
};

function isMissingTableError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("could not find") ||
    m.includes("schema cache") ||
    (m.includes("relation") && m.includes("auto_reply"))
  );
}

function normalizeWorkspacePrefs(raw: unknown): AutoRepliesWorkspacePrefs | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = raw as Partial<AutoRepliesWorkspacePrefs>;
  return {
    marketplace: (data.marketplace as AutoRepliesWorkspacePrefs["marketplace"]) ?? null,
    connectedMarketplaces: Array.isArray(data.connectedMarketplaces)
      ? (data.connectedMarketplaces as AutoRepliesMarketplaceId[])
      : [],
    usage: (data.usage as AutoRepliesWorkspacePrefs["usage"]) ?? null,
    shopId: typeof data.shopId === "string" && data.shopId.trim() ? data.shopId.trim() : "main",
    savedAt: typeof data.savedAt === "string" ? data.savedAt : new Date().toISOString(),
  };
}

export function mapHistoryRow(row: AutoReplyHistoryRow): ReplyHistoryEntry {
  return {
    id: row.id,
    shopId: row.shop_id,
    marketplaceId: row.marketplace_id,
    usageMode: row.usage_mode as ReplyHistoryEntry["usageMode"],
    usageModeLabel: row.usage_mode_label || "",
    starRating: row.star_rating as ReplyHistoryEntry["starRating"],
    reviewText: row.review_text,
    replyText: row.reply_text,
    generationSource: row.generation_source as ReplyHistoryEntry["generationSource"],
    createdAt: row.created_at,
  };
}

export async function fetchAutoReplyUserState(
  supabase: SupabaseClient,
  userId: string
): Promise<AutoReplyUserStateRow | null> {
  const { data, error } = await supabase
    .from(USER_STATE_TABLE)
    .select(
      "user_id,email,shop_id,shop_name,workspace_prefs,settings_json,compose_drafts,updated_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error.message)) return null;
    console.warn("[auto_reply_user_state] fetch:", error.message);
    return null;
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    user_id: String(row.user_id),
    email: typeof row.email === "string" ? row.email : null,
    shop_id: typeof row.shop_id === "string" ? row.shop_id : "main",
    shop_name: typeof row.shop_name === "string" ? row.shop_name : null,
    workspace_prefs: normalizeWorkspacePrefs(row.workspace_prefs) ?? {},
    settings_json: sanitizeSettingsJsonForSupabase(row.settings_json),
    compose_drafts:
      row.compose_drafts && typeof row.compose_drafts === "object" && !Array.isArray(row.compose_drafts)
        ? (row.compose_drafts as Record<string, ComposeDraft>)
        : {},
    updated_at: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
  };
}

export async function upsertAutoReplyUserState(
  supabase: SupabaseClient,
  payload: {
    userId: string;
    email?: string | null;
    shopId?: string;
    shopName?: string | null;
    workspacePrefs: AutoRepliesWorkspacePrefs | Record<string, unknown>;
    settings: AutoRepliesSettingsRoot;
    composeDrafts?: Record<string, ComposeDraft>;
  }
): Promise<boolean> {
  const body = {
    user_id: payload.userId,
    email: payload.email ?? null,
    shop_id: payload.shopId ?? "main",
    shop_name: payload.shopName ?? null,
    workspace_prefs: payload.workspacePrefs,
    settings_json: sanitizeSettingsJsonForSupabase(payload.settings),
    compose_drafts: payload.composeDrafts ?? {},
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from(USER_STATE_TABLE).upsert(body, {
    onConflict: "user_id",
  });

  if (error) {
    if (isMissingTableError(error.message)) return false;
    console.warn("[auto_reply_user_state] upsert:", error.message);
    return false;
  }
  return true;
}

export async function fetchAutoReplyHistory(
  supabase: SupabaseClient,
  userId: string,
  limit = 300
): Promise<ReplyHistoryEntry[]> {
  const { data, error } = await supabase
    .from(HISTORY_TABLE)
    .select(
      "id,user_id,shop_id,marketplace_id,usage_mode,usage_mode_label,star_rating,review_text,reply_text,generation_source,product_name,buyer_label,created_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error.message)) return [];
    console.warn("[auto_reply_history] fetch:", error.message);
    return [];
  }

  return (data ?? []).map((row) => mapHistoryRow(row as AutoReplyHistoryRow));
}

export async function insertAutoReplyHistoryRow(
  supabase: SupabaseClient,
  userId: string,
  entry: ReplyHistoryEntry,
  extra?: { productName?: string | null; buyerLabel?: string | null }
): Promise<boolean> {
  const { error } = await supabase.from(HISTORY_TABLE).upsert(
    {
      id: entry.id,
      user_id: userId,
      shop_id: entry.shopId,
      marketplace_id: entry.marketplaceId,
      usage_mode: entry.usageMode,
      usage_mode_label: entry.usageModeLabel,
      star_rating: entry.starRating,
      review_text: entry.reviewText,
      reply_text: entry.replyText,
      generation_source: entry.generationSource,
      product_name: extra?.productName ?? null,
      buyer_label: extra?.buyerLabel ?? null,
      created_at: entry.createdAt,
    },
    { onConflict: "id" }
  );

  if (error) {
    if (isMissingTableError(error.message)) return false;
    console.warn("[auto_reply_history] insert:", error.message);
    return false;
  }
  return true;
}

export async function upsertAutoReplyInboxSnapshot(
  supabase: SupabaseClient,
  payload: {
    userId: string;
    shopId: string;
    marketplaceId: AutoRepliesMarketplaceId;
    items: InboxReviewItem[];
    sellerName?: string;
    unansweredCount?: number;
  }
): Promise<boolean> {
  const trimmedItems = payload.items.slice(0, 120).map((item) => ({
    id: item.id,
    feed: item.feed,
    status: item.status,
    starRating: item.starRating,
    productName: item.productName,
    productArticle: item.productArticle,
    marketplaceId: item.marketplaceId,
    buyerLabel: item.buyerLabel,
    shopName: item.shopName,
    reviewText: item.reviewText,
    replyDraft: item.replyDraft,
    timeLabel: item.timeLabel,
    dateLabel: item.dateLabel,
    listDateLabel: item.listDateLabel,
    sentAtLabel: item.sentAtLabel,
    reviewPublishedAt: item.reviewPublishedAt,
    autoSent: item.autoSent,
    externalId: item.externalId,
  }));

  const { error } = await supabase.from(INBOX_TABLE).upsert(
    {
      user_id: payload.userId,
      shop_id: payload.shopId,
      marketplace_id: payload.marketplaceId,
      items_json: trimmedItems,
      seller_name: payload.sellerName ?? null,
      unanswered_count:
        typeof payload.unansweredCount === "number" ? payload.unansweredCount : null,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "user_id,shop_id,marketplace_id" }
  );

  if (error) {
    if (isMissingTableError(error.message)) return false;
    console.warn("[auto_reply_inbox_snapshots] upsert:", error.message);
    return false;
  }
  return true;
}

export async function deleteAutoReplyInboxSnapshot(
  supabase: SupabaseClient,
  payload: { userId: string; shopId: string; marketplaceId: AutoRepliesMarketplaceId }
): Promise<boolean> {
  const { error } = await supabase
    .from(INBOX_TABLE)
    .delete()
    .eq("user_id", payload.userId)
    .eq("shop_id", payload.shopId)
    .eq("marketplace_id", payload.marketplaceId);

  if (error) {
    if (isMissingTableError(error.message)) return false;
    console.warn("[auto_reply_inbox_snapshots] delete:", error.message);
    return false;
  }
  return true;
}

export async function deleteAutoReplyHistoryForMarketplace(
  supabase: SupabaseClient,
  payload: { userId: string; shopId: string; marketplaceId: AutoRepliesMarketplaceId }
): Promise<boolean> {
  const { error } = await supabase
    .from(HISTORY_TABLE)
    .delete()
    .eq("user_id", payload.userId)
    .eq("shop_id", payload.shopId)
    .eq("marketplace_id", payload.marketplaceId);

  if (error) {
    if (isMissingTableError(error.message)) return false;
    console.warn("[auto_reply_history] delete:", error.message);
    return false;
  }
  return true;
}

export async function deleteAutoReplyHistoryForShop(
  supabase: SupabaseClient,
  payload: { userId: string; shopId: string }
): Promise<boolean> {
  const { error } = await supabase
    .from(HISTORY_TABLE)
    .delete()
    .eq("user_id", payload.userId)
    .eq("shop_id", payload.shopId);

  if (error) {
    if (isMissingTableError(error.message)) return false;
    console.warn("[auto_reply_history] delete shop:", error.message);
    return false;
  }
  return true;
}

export async function deleteAutoReplyInboxSnapshotsForShop(
  supabase: SupabaseClient,
  payload: { userId: string; shopId: string }
): Promise<boolean> {
  const { error } = await supabase
    .from(INBOX_TABLE)
    .delete()
    .eq("user_id", payload.userId)
    .eq("shop_id", payload.shopId);

  if (error) {
    if (isMissingTableError(error.message)) return false;
    console.warn("[auto_reply_inbox_snapshots] delete shop:", error.message);
    return false;
  }
  return true;
}
