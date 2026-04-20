import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { creditSubscription } from "@/lib/payment-credit";
import {
  COMMUNITY_SURVEY_REWARD_GENERATIONS,
  COMMUNITY_SURVEY_VERSION,
  isValidFeatureRanking,
  isValidFeatureSwipeVotes,
  isValidProblemSelection,
} from "@/lib/community-survey/options";

function bearerUserId(request: NextRequest): Promise<{ userId: string } | null> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return Promise.resolve(null);
  const supabase = createServerClient();
  return supabase.auth.getUser(token).then(({ data: { user }, error }) => {
    if (error || !user) return null;
    return { userId: user.id };
  });
}

/**
 * GET: есть ли уже ответ на текущую версию голосования (для UI «уже голосовали»).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await bearerUserId(request);
    if (!auth) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("community_survey_responses")
      .select(
        "feature_option_ids, feature_swipe_votes, problem_option_ids, reward_generations_applied, created_at, updated_at"
      )
      .eq("user_id", auth.userId)
      .eq("survey_version", COMMUNITY_SURVEY_VERSION)
      .maybeSingle();

    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        return NextResponse.json(
          {
            error:
              "Таблица голосования не создана. Выполните миграцию 20260416_community_survey_responses.sql в Supabase.",
          },
          { status: 503 }
        );
      }
      console.error("[community-survey] GET:", error);
      return NextResponse.json({ error: "Не удалось загрузить статус голосования" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({
        success: true,
        submitted: false,
        surveyVersion: COMMUNITY_SURVEY_VERSION,
      });
    }

    return NextResponse.json({
      success: true,
      submitted: true,
      surveyVersion: COMMUNITY_SURVEY_VERSION,
      featureOptionIds: data.feature_option_ids ?? [],
      featureSwipeVotes: data.feature_swipe_votes ?? {},
      problemOptionIds: data.problem_option_ids ?? [],
      rewardGenerationsApplied: data.reward_generations_applied === true,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
  } catch (e) {
    console.error("[community-survey] GET:", e);
    return NextResponse.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }
}

/**
 * POST: сохранить или обновить голос (мультивыбор на обоих шагах).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await bearerUserId(request);
    if (!auth) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const featureOptionIds = body.featureOptionIds as string[] | undefined;
    const problemOptionIds = body.problemOptionIds as string[] | undefined;
    const featureSwipeVotes = body.featureSwipeVotes;

    if (!isValidFeatureSwipeVotes(featureSwipeVotes)) {
      return NextResponse.json(
        {
          error:
            "Некорректные ответы по функциям: нужен полный набор из 7 карточек с вариантами very / need / later.",
        },
        { status: 400 }
      );
    }

    if (!isValidFeatureRanking(featureOptionIds ?? [])) {
      return NextResponse.json(
        {
          error:
            "Некорректный приоритет функций: нужен полный список из 7 пунктов без повторов. Вернитесь к итогам и пройдите карточки ещё раз.",
        },
        { status: 400 }
      );
    }
    if (!isValidProblemSelection(problemOptionIds ?? [])) {
      return NextResponse.json(
        {
          error:
            "Выберите хотя бы один пункт в блоке «Что мешает» (корректные варианты из списка).",
        },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { data: prior } = await supabase
      .from("community_survey_responses")
      .select("reward_generations_applied")
      .eq("user_id", auth.userId)
      .eq("survey_version", COMMUNITY_SURVEY_VERSION)
      .maybeSingle();

    const wasRewardGranted = prior?.reward_generations_applied === true;

    const { data, error } = await supabase
      .from("community_survey_responses")
      .upsert(
        {
          user_id: auth.userId,
          survey_version: COMMUNITY_SURVEY_VERSION,
          feature_option_ids: featureOptionIds,
          feature_swipe_votes: featureSwipeVotes,
          problem_option_ids: problemOptionIds,
          reward_generations_applied: wasRewardGranted,
        },
        { onConflict: "user_id,survey_version" }
      )
      .select("id, updated_at");

    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        return NextResponse.json(
          {
            error:
              "Таблица голосования не создана. Выполните миграцию 20260416_community_survey_responses.sql в Supabase.",
          },
          { status: 503 }
        );
      }
      console.error("[community-survey] POST upsert:", error.code, error.message, error.details, error.hint);
      const devHint =
        process.env.NODE_ENV === "development"
          ? ` (${error.code ?? "no code"}: ${error.message ?? ""})`
          : "";
      const msg =
        error.code === "42501" || error.message?.toLowerCase().includes("permission")
          ? `Нет прав на запись в базу. Проверьте, что в API используется SUPABASE_SERVICE_ROLE_KEY и миграция применена.${devHint}`
          : `Не удалось сохранить голос.${devHint}`;
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (!wasRewardGranted) {
      const credit = await creditSubscription(
        supabase,
        auth.userId,
        "creative",
        COMMUNITY_SURVEY_REWARD_GENERATIONS
      );
      if (credit.ok) {
        const { error: flagErr } = await supabase
          .from("community_survey_responses")
          .update({ reward_generations_applied: true })
          .eq("user_id", auth.userId)
          .eq("survey_version", COMMUNITY_SURVEY_VERSION);
        if (flagErr) {
          console.error("[community-survey] POST reward flag update:", flagErr);
        }
      } else {
        console.error("[community-survey] POST bonus credit failed:", credit.error);
      }
    }

    return NextResponse.json({
      success: true,
      id: row?.id,
      updatedAt: row?.updated_at,
      rewardGenerationsGranted: !wasRewardGranted,
    });
  } catch (e) {
    console.error("[community-survey] POST:", e);
    return NextResponse.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }
}
