import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * GET: список уведомлений текущего пользователя + счётчик непрочитанных.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { data: rows, error } = await supabase
    .from("user_notifications")
    .select(
      "id, title, body, image_urls, link_url, category, created_at, read_at, replies_enabled, user_reply_text, user_replied_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[notifications] select:", error);
    if (error.message?.includes("does not exist") || error.code === "42P01") {
      return NextResponse.json(
        {
          error:
            "Таблица уведомлений ещё не создана. Выполните миграцию 20260407_user_notifications.sql в Supabase.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Не удалось загрузить уведомления" }, { status: 500 });
  }

  const list = rows ?? [];
  const unreadCount = list.filter((r) => !r.read_at).length;

  return NextResponse.json({
    success: true,
    notifications: list,
    unreadCount,
  });
}
