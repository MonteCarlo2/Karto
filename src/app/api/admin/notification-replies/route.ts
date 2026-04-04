import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import {
  isAdminStatsConfigured,
  isAdminStatsEmail,
  isAdminStatsSecretProvided,
} from "@/lib/admin/stats-access";

/**
 * GET: последние ответы пользователей на уведомления с replies_enabled.
 */
export async function GET(request: NextRequest) {
  if (!isAdminStatsConfigured()) {
    return NextResponse.json(
      {
        error:
          "Админка не настроена. Задайте ADMIN_STATS_EMAILS или ADMIN_STATS_SECRET на сервере.",
      },
      { status: 503 }
    );
  }

  const secretOk = isAdminStatsSecretProvided(request.headers.get("x-admin-stats-secret"));
  if (!secretOk) {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json({ error: "Нужна авторизация или секрет" }, { status: 401 });
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });
    }
    const userClient = createClient(url, anon);
    const {
      data: { user },
      error,
    } = await userClient.auth.getUser(token);
    if (error || !user?.email || !isAdminStatsEmail(user.email)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
  }

  const supabase = createServerClient();
  const { data: rows, error } = await supabase
    .from("user_notifications")
    .select(
      "id, user_id, title, body, category, created_at, user_reply_text, user_replied_at, replies_enabled"
    )
    .eq("replies_enabled", true)
    .order("created_at", { ascending: false })
    .limit(250);

  if (error) {
    console.error("[admin/notification-replies]", error);
    if (error.message?.includes("does not exist") || error.code === "42P01") {
      return NextResponse.json(
        { error: "Примените миграцию 20260408_notification_replies.sql в Supabase." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Не удалось загрузить ответы" }, { status: 500 });
  }

  const withReply = (rows ?? [])
    .filter((r) => typeof r.user_reply_text === "string" && r.user_reply_text.trim().length > 0)
    .sort((a, b) => {
      const ta = a.user_replied_at ? new Date(a.user_replied_at).getTime() : 0;
      const tb = b.user_replied_at ? new Date(b.user_replied_at).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 100);

  return NextResponse.json({ success: true, replies: withReply });
}
