import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { invalidateSources } from "@/lib/seller-hub/sync/invalidate";
import type { SyncSourceId } from "@/lib/seller-hub/sync/sources";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * «Обновить данные» в фоновом режиме: помечает источники устаревшими, воркер перечитает их на ближайшем проходе (до минуты).
 * Тяжёлые источники (отчёт реализации раз в сутки, платное хранение) не трогаем: их срок не зависит от нажатия кнопки.
 * WB этот маршрут не вызывает, поэтому частые нажатия не расходуют лимит: всё равно читает воркер, по своей очереди.
 */
const REFRESH_SOURCES: SyncSourceId[] = ["base", "ads_stats", "feedbacks", "funnel", "stocks_report", "blocked"];

export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const body = (await request.json().catch(() => ({}))) as { marketplaceId?: unknown };
  const marketplaceId = typeof body.marketplaceId === "string" && body.marketplaceId.trim() ? body.marketplaceId.trim().slice(0, 32) : "wildberries";
  const requestedAt = Date.now();
  const marked = await invalidateSources(createServerClient(), auth.user.id, marketplaceId, REFRESH_SOURCES);
  return NextResponse.json({ ok: marked, requestedAt, reason: marked ? undefined : "background_off" });
}
