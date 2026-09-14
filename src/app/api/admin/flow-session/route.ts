import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  isAdminStatsConfigured,
  isAdminStatsEmail,
  isAdminStatsSecretProvided,
} from "@/lib/admin/stats-access";
import { resolveFlowSessionOwner } from "@/lib/flow/flow-generation-log";
import { createServerClient } from "@/lib/supabase/server";

/**
 * GET ?session_id=uuid — кто владелец сессии Потока (только админы).
 */
export async function GET(request: NextRequest) {
  if (!isAdminStatsConfigured()) {
    return NextResponse.json(
      { error: "Не настроен ADMIN_STATS_EMAILS или ADMIN_STATS_SECRET" },
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

  const sessionId = request.nextUrl.searchParams.get("session_id")?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "session_id обязателен" }, { status: 400 });
  }

  const supabase = createServerClient();
  const owner = await resolveFlowSessionOwner(supabase, sessionId);

  const { data: understanding } = await supabase
    .from("understanding_data")
    .select("product_name, created_at")
    .eq("session_id", sessionId)
    .maybeSingle();

  const { data: subRows } = owner.userId
    ? await supabase
        .from("user_subscriptions")
        .select("plan_type, plan_volume, flows_used, creative_used, period_start")
        .eq("user_id", owner.userId)
    : { data: null };

  return NextResponse.json({
    session: owner,
    product_name: understanding?.product_name ?? null,
    understanding_created_at: understanding?.created_at ?? null,
    subscriptions: subRows ?? [],
  });
}
