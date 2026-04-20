import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  COMMUNITY_SURVEY_FEATURE_OPTIONS,
  COMMUNITY_SURVEY_PROBLEM_OPTIONS,
  COMMUNITY_SURVEY_VERSION,
  type FeatureSwipeVote,
} from "@/lib/community-survey/options";

/**
 * GET: полная сводка для владельца (агрегаты + построчно по пользователям).
 * Заголовок: x-community-survey-admin-secret = COMMUNITY_SURVEY_ADMIN_SECRET
 *
 * В Supabase смотрите также представления:
 * - community_survey_summary
 * - community_survey_feature_aggregates
 * - community_survey_problem_aggregates
 */
export async function GET(request: NextRequest) {
  const expected = process.env.COMMUNITY_SURVEY_ADMIN_SECRET?.trim();
  const got = request.headers.get("x-community-survey-admin-secret")?.trim();
  if (!expected || got !== expected) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const version = COMMUNITY_SURVEY_VERSION;

  try {
    const supabase = createServerClient();

    const [summaryRes, featRes, probRes, rowsRes] = await Promise.all([
      supabase.from("community_survey_summary").select("*").eq("survey_version", version).maybeSingle(),
      supabase.from("community_survey_feature_aggregates").select("*").eq("survey_version", version),
      supabase.from("community_survey_problem_aggregates").select("*").eq("survey_version", version),
      supabase
        .from("community_survey_responses")
        .select(
          "user_id, survey_version, feature_option_ids, feature_swipe_votes, problem_option_ids, reward_generations_applied, created_at, updated_at"
        )
        .eq("survey_version", version)
        .order("created_at", { ascending: true }),
    ]);

    if (rowsRes.error) {
      if (rowsRes.error.code === "42703" || rowsRes.error.message?.includes("column")) {
        return NextResponse.json(
          {
            error:
              "В таблице нет колонок feature_swipe_votes / reward_generations_applied. Выполните миграцию 20260421_community_survey_swipe_votes_bonus.sql.",
          },
          { status: 503 }
        );
      }
      console.error("[community-survey/admin] responses:", rowsRes.error);
      return NextResponse.json({ error: "Не удалось загрузить ответы" }, { status: 500 });
    }

    const viewsMissing = [summaryRes.error, featRes.error, probRes.error].some(
      (e) => e && (e.code === "42P01" || (e.message?.includes("does not exist") ?? false))
    );

    const list = rowsRes.data ?? [];

    const titleByFeature = Object.fromEntries(COMMUNITY_SURVEY_FEATURE_OPTIONS.map((o) => [o.id, o.title]));
    const titleByProblem = Object.fromEntries(COMMUNITY_SURVEY_PROBLEM_OPTIONS.map((o) => [o.id, o.title]));

    let overview: {
      totalRespondents: number;
      lastResponseAt: string | null;
    };
    let featuresRanked: Array<{
      id: string;
      title: string;
      votesVery: number;
      votesNeed: number;
      votesLater: number;
      pointsKarto: number;
      pointsSimple: number;
    }>;
    let problemsRanked: Array<{
      id: string;
      title: string;
      respondentsCount: number;
    }>;

    if (viewsMissing) {
      const built = buildAggregatesFromRows(list);
      overview = {
        totalRespondents: list.length,
        lastResponseAt: list.length ? maxIso(list.map((r) => r.updated_at)) : null,
      };
      featuresRanked = COMMUNITY_SURVEY_FEATURE_OPTIONS.map((o) => {
        const c = built.featureVoteCounts[o.id] ?? { very: 0, need: 0, later: 0 };
        return {
          id: o.id,
          title: o.title,
          votesVery: c.very,
          votesNeed: c.need,
          votesLater: c.later,
          pointsKarto: c.very * 3 + c.need * 2 + c.later * 1,
          pointsSimple: c.very * 2 + c.need * 1 + c.later * 1,
        };
      }).sort((a, b) => b.pointsKarto - a.pointsKarto);
      problemsRanked = COMMUNITY_SURVEY_PROBLEM_OPTIONS.map((o) => ({
        id: o.id,
        title: o.title,
        respondentsCount: built.problemVoteCounts[o.id] ?? 0,
      })).sort((a, b) => b.respondentsCount - a.respondentsCount);
    } else {
      overview = {
        totalRespondents: Number(summaryRes.data?.total_respondents ?? 0),
        lastResponseAt: summaryRes.data?.last_response_at ?? null,
      };
      const feats = featRes.data ?? [];
      featuresRanked = feats
        .map((row) => ({
          id: row.feature_id,
          title: titleByFeature[row.feature_id] ?? row.feature_id,
          votesVery: Number(row.votes_very),
          votesNeed: Number(row.votes_need),
          votesLater: Number(row.votes_later),
          pointsKarto: Number(row.points_karto),
          pointsSimple: Number(row.points_simple),
        }))
        .sort((a, b) => b.pointsKarto - a.pointsKarto);
      const probs = probRes.data ?? [];
      problemsRanked = probs
        .map((row) => ({
          id: row.problem_id,
          title: titleByProblem[row.problem_id] ?? row.problem_id,
          respondentsCount: Number(row.respondents_count),
        }))
        .sort((a, b) => b.respondentsCount - a.respondentsCount);
    }

    const respondents = list.map((row) => {
      const swipe = (row.feature_swipe_votes ?? {}) as Record<string, FeatureSwipeVote>;
      return {
        userId: row.user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        featureRanking: row.feature_option_ids ?? [],
        featureSwipeVotes: swipe,
        problems: row.problem_option_ids ?? [],
        rewardGenerationsApplied: row.reward_generations_applied === true,
      };
    });

    const featureVoteCounts = Object.fromEntries(
      featuresRanked.map((f) => [f.id, { very: f.votesVery, need: f.votesNeed, later: f.votesLater }])
    );
    const problemVoteCounts = Object.fromEntries(problemsRanked.map((p) => [p.id, p.respondentsCount]));

    return NextResponse.json({
      surveyVersion: version,
      overview,
      featuresRanked,
      problemsRanked,
      featureVoteCounts,
      problemVoteCounts,
      respondents,
      publicResultsUrl: "/api/community-survey/results",
      scoringNote:
        "pointsKarto: очень=3, нужно=2, позже=1 (как в приложении). pointsSimple: 2/1/1 для наглядных отчётов.",
      supabaseViewsHint:
        "В SQL Editor / Table Editor откройте представления community_survey_summary, community_survey_feature_aggregates, community_survey_problem_aggregates — там та же сводка.",
      viewsApplied: !viewsMissing && !summaryRes.error,
      note: "userId — id в Supabase Auth (почта в Dashboard → Authentication). Slug функций/проблем совпадают с options.ts.",
    });
  } catch (e) {
    console.error("[community-survey/admin]", e);
    return NextResponse.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }
}

function maxIso(dates: string[]): string | null {
  if (!dates.length) return null;
  return dates.reduce((a, b) => (a > b ? a : b));
}

function buildAggregatesFromRows(
  list: Array<{ feature_swipe_votes: unknown; problem_option_ids: string[] | null }>
) {
  const featureVoteCounts: Record<string, { very: number; need: number; later: number }> = {};
  for (const o of COMMUNITY_SURVEY_FEATURE_OPTIONS) {
    featureVoteCounts[o.id] = { very: 0, need: 0, later: 0 };
  }
  const problemVoteCounts: Record<string, number> = {};
  for (const o of COMMUNITY_SURVEY_PROBLEM_OPTIONS) {
    problemVoteCounts[o.id] = 0;
  }
  for (const row of list) {
    const swipe = (row.feature_swipe_votes ?? {}) as Record<string, FeatureSwipeVote>;
    for (const [fid, v] of Object.entries(swipe)) {
      const bucket = featureVoteCounts[fid];
      if (bucket && (v === "very" || v === "need" || v === "later")) {
        bucket[v]++;
      }
    }
    for (const pid of row.problem_option_ids ?? []) {
      if (problemVoteCounts[pid] !== undefined) {
        problemVoteCounts[pid]++;
      }
    }
  }
  return { featureVoteCounts, problemVoteCounts };
}
