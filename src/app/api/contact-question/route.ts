import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const MAX_QUESTION_LENGTH = 2000;

/**
 * POST: отправить вопрос от авторизованного пользователя.
 * Токен передаётся в заголовке Authorization: Bearer <access_token> (сессия не зависит от cookies).
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Войдите в аккаунт, чтобы задать вопрос" },
        { status: 401 }
      );
    }

    const supabase = createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Войдите в аккаунт, чтобы задать вопрос" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question) {
      return NextResponse.json(
        { success: false, error: "Напишите ваш вопрос" },
        { status: 400 }
      );
    }
    if (question.length > MAX_QUESTION_LENGTH) {
      return NextResponse.json(
        { success: false, error: `Вопрос не должен быть длиннее ${MAX_QUESTION_LENGTH} символов` },
        { status: 400 }
      );
    }

    const userEmail = user.email ?? "";
    const userName =
      user.user_metadata?.name ||
      user.user_metadata?.full_name ||
      userEmail.split("@")[0] ||
      "Пользователь";

    const { data, error } = await supabase
      .from("user_questions")
      .insert({
        user_id: user.id,
        user_email: userEmail,
        user_name: userName,
        question,
        status: "new",
      })
      .select("id")
      .single();

    if (error) {
      console.error("❌ [CONTACT-QUESTION] Ошибка сохранения:", error);
      return NextResponse.json(
        { success: false, error: "Не удалось отправить вопрос", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: { id: data?.id } });
  } catch (err: unknown) {
    console.error("❌ [CONTACT-QUESTION] Критическая ошибка:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Внутренняя ошибка сервера",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
