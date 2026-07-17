import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { burnFlowSessionCredits } from "@/lib/flow/flow-session-credits";

/**
 * POST { sessionId } — сжечь остаток кредитов Потока при завершении на странице результатов.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Войдите в аккаунт" },
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
        { success: false, error: "Войдите в аккаунт" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "sessionId обязателен" },
        { status: 400 }
      );
    }

    const { data: sessionRow, error: sessionError } = await supabase
      .from("product_sessions")
      .select("user_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError || !sessionRow) {
      return NextResponse.json(
        { success: false, error: "Сессия Потока не найдена" },
        { status: 404 }
      );
    }

    if (sessionRow.user_id !== user.id) {
      return NextResponse.json(
        { success: false, error: "Нет доступа к этой сессии" },
        { status: 403 }
      );
    }

    await burnFlowSessionCredits(supabase, sessionId);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[burn-credits]", error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
