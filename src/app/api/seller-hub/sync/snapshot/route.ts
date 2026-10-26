import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { serverSnapshotVersion } from "@/lib/seller-hub/sync/version";
import { composeSnapshot } from "@/lib/seller-hub/sync/derive";
import { readSnapshotCache, writeSnapshotCache } from "@/lib/seller-hub/sync/snapshot-cache";
import { SyncStore } from "@/lib/seller-hub/sync/store";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Готовый снимок кабинета, собранный фоновым сбором. WB не трогает: только читает сохранённое в нашей базе.
 * Интерфейс берёт отсюда данные вместо того, чтобы при каждом открытии заново читать кабинет.
 * Отвечает ok:false, если фон выключен или снимка ещё нет: тогда интерфейс работает по-старому.
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
    .select("background_enabled, status")
    .eq("user_id", auth.user.id)
    .eq("marketplace_id", marketplaceId)
    .maybeSingle();
  if (cabinet.error) return NextResponse.json({ ok: false, error: "Не удалось прочитать состояние кабинета" }, { status: 500 });
  if (!cabinet.data?.background_enabled) return NextResponse.json({ ok: false, reason: "background_off" });

  // Версия данных: время последнего успешного чтения каждого источника (один лёгкий запрос).
  const states = await db
    .from("seller_hub_sync_state")
    .select("source, last_ok_at, last_started_at")
    .eq("user_id", auth.user.id)
    .eq("marketplace_id", marketplaceId);
  const loadedAt: Record<string, string | null> = {};
  let lastActivityAt: string | null = null;
  for (const row of states.data ?? []) {
    loadedAt[row.source as string] = (row.last_ok_at as string | null) ?? null;
    const started = row.last_started_at as string | null;
    if (started && (!lastActivityAt || started > lastActivityAt)) lastActivityAt = started;
  }
  const version = serverSnapshotVersion(loadedAt);

  type Cached = { snapshot: unknown; sources: string[] };
  let composed = readSnapshotCache<Cached>(auth.user.id, marketplaceId, version);
  if (!composed) {
    const built = await composeSnapshot(new SyncStore(db), db, { userId: auth.user.id, marketplaceId });
    if (!built) return NextResponse.json({ ok: false, reason: "no_snapshot" });
    composed = { snapshot: built.snapshot, sources: built.sources };
    writeSnapshotCache(auth.user.id, marketplaceId, version, composed);
  }
  return NextResponse.json({
    ok: true,
    snapshot: composed.snapshot,
    sources: composed.sources,
    loadedAt,
    lastActivityAt,
    cabinetStatus: cabinet.data.status,
    // Время сервера: браузер сверяет свои часы, чтобы сравнение «до действия / после действия» не зависело от их расхождения.
    serverNow: Date.now(),
  });
}
