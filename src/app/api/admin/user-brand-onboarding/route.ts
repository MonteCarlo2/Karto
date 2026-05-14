import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  normalizeBrandOnboardingListRow,
} from "@/lib/brand/user-brand-onboarding-db";
import { createServerClient } from "@/lib/supabase/server";
import {
  isAdminStatsConfigured,
  isAdminStatsEmail,
  isAdminStatsSecretProvided,
} from "@/lib/admin/stats-access";

/**
 * GET: все сохранённые профили бренда пользователей (черновик + флаги мастера).
 * Доступ: x-admin-stats-secret или Bearer-сессия с email из ADMIN_STATS_EMAILS (как остальная админ-статистика).
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

  try {
    const supabase = createServerClient();
    const limit = Math.min(
      500,
      Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") || "200", 10) || 200)
    );

    const full = await supabase
      .from("user_brand_onboarding")
      .select(
        "user_id,draft_json,active_step,show_name_gen,wizard_completed_at,landing_spec_json,landing_generated_at,updated_at"
      )
      .order("updated_at", { ascending: false })
      .limit(limit);

    let data = full.data as Record<string, unknown>[] | null;
    let error = full.error;

    if (
      error &&
      (error.message.includes("does not exist") ||
        error.message.includes("schema cache"))
    ) {
      const legacy = await supabase
        .from("user_brand_onboarding")
        .select("user_id,draft_json,active_step,show_name_gen,updated_at")
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (!legacy.error && legacy.data) {
        data = (legacy.data as Record<string, unknown>[]).map(
          normalizeBrandOnboardingListRow
        );
        error = null;
      }
    }

    if (error) {
      console.error("[admin/user-brand-onboarding]", error);
      return NextResponse.json(
        {
          error: error.message,
          hint:
            "Примените миграции user_brand_onboarding и wizard_completed_at в Supabase.",
        },
        { status: 500 }
      );
    }

    const normalizedRows = (data ?? []).map((r) =>
      normalizeBrandOnboardingListRow(r as Record<string, unknown>)
    );

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      count: normalizedRows.length,
      rows: normalizedRows,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[admin/user-brand-onboarding]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
