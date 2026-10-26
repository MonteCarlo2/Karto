import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Состояние фонового сбора кабинета для интерфейса: включён ли он и насколько свежи данные.
 * Токены и тексты ошибок WB не отдаются, только статус и возраст.
 */
export async function GET(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const marketplaceId = request.nextUrl.searchParams.get("marketplaceId")?.trim() || "wildberries";
  const db = createServerClient();
  const cabinet = await db
    .from("seller_hub_cabinets")
    .select("status, background_enabled")
    .eq("user_id", auth.user.id)
    .eq("marketplace_id", marketplaceId)
    .maybeSingle();
  if (cabinet.error) return NextResponse.json({ ok: false }, { status: 500 });
  if (!cabinet.data || !cabinet.data.background_enabled) {
    return NextResponse.json({ ok: true, backgroundEnabled: false, status: cabinet.data?.status ?? "pending_consent", sources: [] });
  }
  const states = await db
    .from("seller_hub_sync_state")
    .select("source, last_ok_at, fail_count, last_error")
    .eq("user_id", auth.user.id)
    .eq("marketplace_id", marketplaceId);
  if (states.error) return NextResponse.json({ ok: false }, { status: 500 });
  const now = Date.now();
  return NextResponse.json({
    ok: true,
    backgroundEnabled: true,
    status: cabinet.data.status,
    sources: (states.data ?? []).map((row) => ({
      source: row.source as string,
      lastOkAt: (row.last_ok_at as string | null) ?? null,
      ageMinutes: row.last_ok_at ? Math.round((now - Date.parse(row.last_ok_at as string)) / 60_000) : null,
      failures: (row.fail_count as number) ?? 0,
      // Текст ошибки воркера уже очищен от токенов и обрезан; показываем его, чтобы человек видел причину, а не просто «не обновилось».
      lastError: ((row.fail_count as number) ?? 0) > 0 ? ((row.last_error as string | null) ?? null) : null,
    })),
  });
}
