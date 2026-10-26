import type { SupabaseClient } from "@supabase/supabase-js";
import { buildFeedbacksSnapshot, SPAN_DAYS } from "./build-snapshot";
import { mapWbFeedback, mapWbQuestion } from "./map";
import {
  loadFeedbacksMeta,
  loadFeedbacksSince,
  loadUnansweredQuestions,
  upsertFeedbackRows,
  upsertFeedbacksMeta,
  upsertQuestionRows,
} from "./store";
import {
  SELLER_FEEDBACKS_SNAPSHOT_VERSION,
  type SellerFeedbacksSnapshot,
} from "./types";
import {
  FeedbacksReadError,
  fetchFeedbacksWindow,
  fetchUnansweredQuestions,
  probeFeedbacksAccess,
} from "./wb-read";

const MIN_SYNC_GAP_MS = 60 * 60 * 1000; // 1 час

function moscowDay(offsetDays: number): string {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function unixFromIso(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

function emptyForbidden(nowIso: string, dateFrom: string, dateTo: string): SellerFeedbacksSnapshot {
  return {
    loadedAt: nowIso,
    version: SELLER_FEEDBACKS_SNAPSHOT_VERSION,
    status: "forbidden",
    dateFrom,
    dateTo,
    byNm: {},
    unansweredPositiveCount: 0,
    unansweredPositiveProductCount: 0,
    ratingMismatches: [],
    error: "В токене нет категории «Вопросы и отзывы».",
  };
}

/**
 * Лёгкая синхронизация отзывов/вопросов для Seller Hub.
 * Не чаще раза в час; после полной загрузки — только новые; при 429 — без ретраев.
 */
export async function syncSellerHubFeedbacks(input: {
  supabase: SupabaseClient;
  userId: string;
  token: string;
  marketplaceId?: string;
  force?: boolean;
  /** feedbackRating воронки для сверки → meta.rating_mismatches. */
  wbFeedbackRatingByNm?: Record<string, number | null>;
}): Promise<SellerFeedbacksSnapshot> {
  const marketplaceId = input.marketplaceId ?? "wildberries";
  const nowIso = new Date().toISOString();
  const dateTo = moscowDay(0);
  const dateFrom = moscowDay(-(SPAN_DAYS - 1));
  const meta = await loadFeedbacksMeta(input.supabase, input.userId, marketplaceId);
  const wbRatings = input.wbFeedbackRatingByNm;

  if (
    !input.force &&
    meta?.last_sync_at &&
    Date.now() - Date.parse(meta.last_sync_at) < MIN_SYNC_GAP_MS
  ) {
    const since = new Date(Date.now() - SPAN_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const [feedbacks, questions] = await Promise.all([
      loadFeedbacksSince(input.supabase, input.userId, marketplaceId, since),
      loadUnansweredQuestions(input.supabase, input.userId, marketplaceId),
    ]);
    const snapshot = buildFeedbacksSnapshot({
      feedbacks,
      questions,
      nowIso,
      status: (meta.status as SellerFeedbacksSnapshot["status"]) || "ok",
      error: meta.error ?? undefined,
      dateFrom,
      dateTo,
      wbFeedbackRatingByNm: wbRatings,
    });
    if (wbRatings) {
      await upsertFeedbacksMeta(input.supabase, input.userId, marketplaceId, {
        status: snapshot.status,
        error: snapshot.error ?? null,
        last_sync_at: meta.last_sync_at,
        full_loaded_at: meta.full_loaded_at,
        feedbacks_max_created_at: meta.feedbacks_max_created_at,
        rating_mismatches: snapshot.ratingMismatches,
      });
    }
    return snapshot;
  }

  const access = await probeFeedbacksAccess(input.token);
  if (access === "forbidden") {
    await upsertFeedbacksMeta(input.supabase, input.userId, marketplaceId, {
      status: "forbidden",
      error: "В токене нет категории «Вопросы и отзывы».",
      last_sync_at: nowIso,
      full_loaded_at: meta?.full_loaded_at ?? null,
      feedbacks_max_created_at: meta?.feedbacks_max_created_at ?? null,
      rating_mismatches: [],
    });
    return emptyForbidden(nowIso, dateFrom, dateTo);
  }

  // force или первая полная загрузка — окно 180д; иначе инкремент от max created.
  const fullDone = Boolean(meta?.full_loaded_at) && !input.force;
  const dateFromUnix = fullDone
    ? unixFromIso(
        meta?.feedbacks_max_created_at
          ? new Date(Date.parse(meta.feedbacks_max_created_at) - 2 * 24 * 60 * 60 * 1000).toISOString()
          : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      )
    : unixFromIso(new Date(Date.now() - SPAN_DAYS * 24 * 60 * 60 * 1000).toISOString());

  try {
    const unansweredFb = await fetchFeedbacksWindow(input.token, false, dateFromUnix);
    const answeredFb = await fetchFeedbacksWindow(input.token, true, dateFromUnix);
    const questions = await fetchUnansweredQuestions(input.token);

    const mappedFb = [...unansweredFb.rows, ...answeredFb.rows]
      .map(mapWbFeedback)
      .filter((row): row is NonNullable<typeof row> => row != null);
    const mappedQ = questions.rows
      .map(mapWbQuestion)
      .filter((row): row is NonNullable<typeof row> => row != null);

    await upsertFeedbackRows(input.supabase, input.userId, marketplaceId, mappedFb);
    await upsertQuestionRows(input.supabase, input.userId, marketplaceId, mappedQ);

    const rateLimited =
      unansweredFb.rateLimited || answeredFb.rateLimited || questions.rateLimited;
    const complete =
      unansweredFb.complete && answeredFb.complete && questions.complete && !rateLimited;
    const status = rateLimited ? "rate_limited" : complete ? "ok" : "partial";

    let maxCreated = input.force ? null : (meta?.feedbacks_max_created_at ?? null);
    for (const row of mappedFb) {
      if (!maxCreated || row.createdAt > maxCreated) maxCreated = row.createdAt;
    }

    const fullLoadedAt =
      meta?.full_loaded_at ??
      (complete || mappedFb.length > 0 ? nowIso : null);

    const since = new Date(Date.now() - SPAN_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const [feedbacksDb, questionsDb] = await Promise.all([
      loadFeedbacksSince(input.supabase, input.userId, marketplaceId, since),
      loadUnansweredQuestions(input.supabase, input.userId, marketplaceId),
    ]);

    const snapshot = buildFeedbacksSnapshot({
      feedbacks: feedbacksDb,
      questions: questionsDb,
      nowIso,
      status,
      error: rateLimited ? "WB вернул 429 — следующая попытка не раньше часа." : undefined,
      dateFrom,
      dateTo,
      wbFeedbackRatingByNm: wbRatings,
    });

    await upsertFeedbacksMeta(input.supabase, input.userId, marketplaceId, {
      status,
      error: rateLimited ? "WB вернул 429 — следующая попытка не раньше часа." : null,
      last_sync_at: nowIso,
      full_loaded_at: fullLoadedAt,
      feedbacks_max_created_at: maxCreated,
      rating_mismatches: snapshot.ratingMismatches,
    });

    return snapshot;
  } catch (e) {
    if (e instanceof FeedbacksReadError && (e.status === 401 || e.status === 403)) {
      await upsertFeedbacksMeta(input.supabase, input.userId, marketplaceId, {
        status: "forbidden",
        error: "В токене нет категории «Вопросы и отзывы».",
        last_sync_at: nowIso,
        full_loaded_at: meta?.full_loaded_at ?? null,
        feedbacks_max_created_at: meta?.feedbacks_max_created_at ?? null,
        rating_mismatches: [],
      });
      return emptyForbidden(nowIso, dateFrom, dateTo);
    }
    const message = e instanceof Error ? e.message : "Отзывы не загрузились.";
    await upsertFeedbacksMeta(input.supabase, input.userId, marketplaceId, {
      status: "error",
      error: message,
      last_sync_at: nowIso,
      full_loaded_at: meta?.full_loaded_at ?? null,
      feedbacks_max_created_at: meta?.feedbacks_max_created_at ?? null,
      rating_mismatches: [],
    });
    return {
      loadedAt: nowIso,
      version: SELLER_FEEDBACKS_SNAPSHOT_VERSION,
      status: "error",
      dateFrom,
      dateTo,
      byNm: {},
      unansweredPositiveCount: 0,
      unansweredPositiveProductCount: 0,
      ratingMismatches: [],
      error: message,
    };
  }
}
