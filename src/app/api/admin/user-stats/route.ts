import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import {
  isAdminStatsConfigured,
  isAdminStatsEmail,
  isAdminStatsSecretProvided,
} from "@/lib/admin/stats-access";

type DailyRow = { day: string; new_users: number };

function fillDailySeries(rows: DailyRow[], days: number): DailyRow[] {
  const map = new Map(rows.map((r) => [r.day, r.new_users]));
  const out: DailyRow[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, new_users: map.get(key) ?? 0 });
  }
  return out;
}

/**
 * GET: агрегаты по auth.users (только для админов из env или секрета).
 */
export async function GET(request: NextRequest) {
  if (!isAdminStatsConfigured()) {
    return NextResponse.json(
      {
        error:
          "Статистика не настроена. Добавьте ADMIN_STATS_EMAILS (ваши email через запятую) в .env на сервере.",
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
    const { data: { user }, error } = await userClient.auth.getUser(token);
    if (error || !user?.email || !isAdminStatsEmail(user.email)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
  }

  try {
    const supabase = createServerClient();
    const days = Math.min(90, Math.max(7, parseInt(request.nextUrl.searchParams.get("days") || "30", 10) || 30));

    const { data: summary, error: e1 } = await supabase.rpc("admin_user_stats_summary");
    if (e1) {
      console.error("[admin/user-stats] summary:", e1);
      return NextResponse.json(
        {
          error:
            "Не удалось получить сводку. Примените миграцию supabase/migrations/20260404_admin_user_stats.sql в проекте Supabase (SQL Editor).",
          details: e1.message,
        },
        { status: 500 }
      );
    }

    const { data: dailyRaw, error: e2 } = await supabase.rpc("admin_user_signups_daily", {
      p_days: days,
    });
    if (e2) {
      console.error("[admin/user-stats] daily:", e2);
      return NextResponse.json({ error: e2.message }, { status: 500 });
    }

    const normalized: DailyRow[] = (dailyRaw || []).map((r: { day: string; new_users: number }) => ({
      day: typeof r.day === "string" ? r.day.slice(0, 10) : String(r.day).slice(0, 10),
      new_users: Number(r.new_users) || 0,
    }));

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      summary: summary as Record<string, number>,
      daily: fillDailySeries(normalized, days),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[admin/user-stats]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
