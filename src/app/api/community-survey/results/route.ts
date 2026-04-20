import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  COMMUNITY_SURVEY_FEATURE_OPTIONS,
  COMMUNITY_SURVEY_PROBLEM_OPTIONS,
  COMMUNITY_SURVEY_VERSION,
} from "@/lib/community-survey/options";

/**
 * GET: публичные итоги голосования (только агрегаты, без персональных данных).
 * Для блока на сайте «как проголосовало сообщество». Кэш на краю — короткий.
 */
export async function GET() {
  const version = COMMUNITY_SURVEY_VERSION;

  try {
    const supabase = createServerClient();

    const [summaryRes, featRes, probRes] = await Promise.all([
      supabase.from("community_survey_summary").select("*").eq("survey_version", version).maybeSingle(),
      supabase.from("community_survey_feature_aggregates").select("*").eq("survey_version", version),
      supabase.from("community_survey_problem_aggregates").select("*").eq("survey_version", version),
    ]);

    if (summaryRes.error?.code === "42P01" || summaryRes.error?.message?.includes("does not exist")) {
      return NextResponse.json(
        {
          error:
            "Представления отчётности не созданы. Выполните миграцию 20260422_community_survey_reporting_views.sql в Supabase.",
        },
        { status: 503 }
      );
    }
    if (summaryRes.error || featRes.error || probRes.error) {
      console.error("[community-survey/results]", summaryRes.error, featRes.error, probRes.error);
      return NextResponse.json({ error: "Не удалось загрузить итоги" }, { status: 500 });
    }

    const titleByFeature = Object.fromEntries(COMMUNITY_SURVEY_FEATURE_OPTIONS.map((o) => [o.id, o.title]));
    const titleByProblem = Object.fromEntries(COMMUNITY_SURVEY_PROBLEM_OPTIONS.map((o) => [o.id, o.title]));

    const featuresRaw = featRes.data ?? [];
    const features = featuresRaw
      .map((row) => ({
        id: row.feature_id,
        title: titleByFeature[row.feature_id] ?? row.feature_id,
        votes: {
          very: Number(row.votes_very),
          need: Number(row.votes_need),
          later: Number(row.votes_later),
          labels: {
            very: "Очень нужно!",
            need: "Нужно!",
            later: "Пока не актуально",
          },
        },
        pointsKarto: Number(row.points_karto),
        pointsSimple: Number(row.points_simple),
      }))
      .sort((a, b) => b.pointsKarto - a.pointsKarto);

    const problemsRaw = probRes.data ?? [];
    const problems = problemsRaw
      .map((row) => ({
        id: row.problem_id,
        title: titleByProblem[row.problem_id] ?? row.problem_id,
        respondentsCount: Number(row.respondents_count),
      }))
      .sort((a, b) => b.respondentsCount - a.respondentsCount);

    const totalRespondents = Number(summaryRes.data?.total_respondents ?? 0);

    return NextResponse.json(
      {
        surveyVersion: version,
        overview: {
          totalRespondents,
          lastResponseAt: summaryRes.data?.last_response_at ?? null,
        },
        scoringNote:
          "pointsKarto — веса как при приоритизации в продукте (очень=3, нужно=2, позже=1). pointsSimple — упрощённо (2/1/1) для наглядности.",
        features,
        problems,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
        },
      }
    );
  } catch (e) {
    console.error("[community-survey/results]", e);
    return NextResponse.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }
}
