import type { SupabaseClient } from "@supabase/supabase-js";
import { feedbackCountsOnCard } from "./card-visibility";
import type { FeedbackRatingMismatch, SellerFeedbackRow, SellerQuestionRow } from "./types";

export type FeedbacksMetaRow = {
  status: string;
  error: string | null;
  last_sync_at: string | null;
  full_loaded_at: string | null;
  feedbacks_max_created_at: string | null;
  rating_mismatches: FeedbackRatingMismatch[] | null;
};

export async function loadFeedbacksMeta(
  supabase: SupabaseClient,
  userId: string,
  marketplaceId: string,
): Promise<FeedbacksMetaRow | null> {
  const { data } = await supabase
    .from("seller_hub_feedbacks_meta")
    .select("status, error, last_sync_at, full_loaded_at, feedbacks_max_created_at, rating_mismatches")
    .eq("user_id", userId)
    .eq("marketplace_id", marketplaceId)
    .maybeSingle();
  if (!data) return null;
  return {
    status: String(data.status),
    error: data.error == null ? null : String(data.error),
    last_sync_at: data.last_sync_at == null ? null : String(data.last_sync_at),
    full_loaded_at: data.full_loaded_at == null ? null : String(data.full_loaded_at),
    feedbacks_max_created_at:
      data.feedbacks_max_created_at == null ? null : String(data.feedbacks_max_created_at),
    rating_mismatches: Array.isArray(data.rating_mismatches)
      ? (data.rating_mismatches as FeedbackRatingMismatch[])
      : null,
  };
}

export async function upsertFeedbacksMeta(
  supabase: SupabaseClient,
  userId: string,
  marketplaceId: string,
  patch: Partial<FeedbacksMetaRow> & { status: string },
): Promise<void> {
  await supabase.from("seller_hub_feedbacks_meta").upsert(
    {
      user_id: userId,
      marketplace_id: marketplaceId,
      status: patch.status,
      error: patch.error ?? null,
      last_sync_at: patch.last_sync_at ?? null,
      full_loaded_at: patch.full_loaded_at ?? null,
      feedbacks_max_created_at: patch.feedbacks_max_created_at ?? null,
      rating_mismatches: patch.rating_mismatches ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,marketplace_id" },
  );
}

export async function upsertFeedbackRows(
  supabase: SupabaseClient,
  userId: string,
  marketplaceId: string,
  rows: SellerFeedbackRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const payload = rows.map((row) => ({
    user_id: userId,
    marketplace_id: marketplaceId,
    feedback_id: row.id,
    nm_id: row.nmId,
    rating: row.rating,
    created_at: row.createdAt,
    answered: row.answered,
    answered_at: row.answeredAt,
    body_text: row.text || null,
    pros: row.pros || null,
    cons: row.cons || null,
    order_status: row.orderStatus,
    state: row.state,
    imt_id: row.imtId,
    parent_feedback_id: row.parentFeedbackId,
    child_feedback_id: row.childFeedbackId,
    counts_on_card: row.countsOnCard,
    updated_at: new Date().toISOString(),
  }));
  for (let i = 0; i < payload.length; i += 200) {
    const chunk = payload.slice(i, i + 200);
    const { error } = await supabase.from("seller_hub_feedbacks").upsert(chunk, {
      onConflict: "user_id,marketplace_id,feedback_id",
    });
    if (error) throw new Error(error.message);
  }
}

export async function upsertQuestionRows(
  supabase: SupabaseClient,
  userId: string,
  marketplaceId: string,
  rows: SellerQuestionRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const payload = rows.map((row) => ({
    user_id: userId,
    marketplace_id: marketplaceId,
    question_id: row.id,
    nm_id: row.nmId,
    created_at: row.createdAt,
    answered: row.answered,
    answered_at: row.answeredAt,
    body_text: row.text || null,
    updated_at: new Date().toISOString(),
  }));
  for (let i = 0; i < payload.length; i += 200) {
    const chunk = payload.slice(i, i + 200);
    const { error } = await supabase.from("seller_hub_questions").upsert(chunk, {
      onConflict: "user_id,marketplace_id,question_id",
    });
    if (error) throw new Error(error.message);
  }
}

function mapDbFeedback(row: Record<string, unknown>): SellerFeedbackRow {
  const orderStatus = row.order_status == null ? null : String(row.order_status);
  const childFeedbackId = row.child_feedback_id == null ? null : String(row.child_feedback_id);
  const countsStored = row.counts_on_card;
  const countsOnCard =
    typeof countsStored === "boolean"
      ? countsStored
      : feedbackCountsOnCard({ orderStatus, childFeedbackId });
  return {
    id: String(row.feedback_id),
    nmId: String(row.nm_id),
    rating: Number(row.rating),
    createdAt: String(row.created_at),
    answered: Boolean(row.answered),
    answeredAt: row.answered_at ? String(row.answered_at) : null,
    text: String(row.body_text ?? ""),
    pros: String(row.pros ?? ""),
    cons: String(row.cons ?? ""),
    orderStatus,
    state: row.state == null ? null : String(row.state),
    imtId: row.imt_id == null ? null : String(row.imt_id),
    parentFeedbackId: row.parent_feedback_id == null ? null : String(row.parent_feedback_id),
    childFeedbackId,
    countsOnCard,
  };
}

export async function loadFeedbacksSince(
  supabase: SupabaseClient,
  userId: string,
  marketplaceId: string,
  sinceIso: string,
): Promise<SellerFeedbackRow[]> {
  const { data, error } = await supabase
    .from("seller_hub_feedbacks")
    .select(
      "feedback_id, nm_id, rating, created_at, answered, answered_at, body_text, pros, cons, order_status, state, imt_id, parent_feedback_id, child_feedback_id, counts_on_card",
    )
    .eq("user_id", userId)
    .eq("marketplace_id", marketplaceId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(20_000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapDbFeedback(row as Record<string, unknown>));
}

export async function loadUnansweredQuestions(
  supabase: SupabaseClient,
  userId: string,
  marketplaceId: string,
): Promise<SellerQuestionRow[]> {
  const { data, error } = await supabase
    .from("seller_hub_questions")
    .select("question_id, nm_id, created_at, answered, answered_at, body_text")
    .eq("user_id", userId)
    .eq("marketplace_id", marketplaceId)
    .eq("answered", false)
    .order("created_at", { ascending: true })
    .limit(5_000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.question_id),
    nmId: String(row.nm_id),
    createdAt: String(row.created_at),
    answered: Boolean(row.answered),
    answeredAt: row.answered_at ? String(row.answered_at) : null,
    text: String(row.body_text ?? ""),
  }));
}
