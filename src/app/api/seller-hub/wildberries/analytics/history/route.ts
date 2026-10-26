import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubWbToken } from "@/lib/seller-hub/wb-token-http";
import { safeSellerHubMessage } from "@/lib/seller-hub/wb-token";
import { createServerClient } from "@/lib/supabase/server";
import { missingFunnelDays, moscowToday, readStoreMetricRows, refreshMetricHistory } from "@/lib/seller-hub/history/refresh";
import { storeSeries } from "@/lib/seller-hub/metric-history";

export const maxDuration = 180;

/**
 * История показателей. POST докачивает до трёх законченных дней воронки (по одному запросу WB на день) и пишет остаток на сегодня.
 * Ответ — ряд магазина по дням из базы и сколько дней ещё не сохранено. Данные только из WB, пропущенные дни остаются пропущенными.
 * При включённом фоновом сборе то же делает сервер сам, а интерфейс только читает (readOnly).
 */
export async function POST(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;
  // readOnly: только прочитать накопленное из базы, без обращений к WB (так читает раздел «События»).
  let readOnly = false;
  try {
    const body = (await request.json()) as { readOnly?: unknown };
    readOnly = body?.readOnly === true;
  } catch {
    readOnly = false;
  }
  const db = createServerClient();
  const today = moscowToday();
  try {
    let notes: string[] = [];
    if (!readOnly) notes = await refreshMetricHistory({ db, userId: access.userId, token: access.token, today });
    const stored = await readStoreMetricRows(db, access.userId, today);
    return NextResponse.json({
      ok: true,
      series: storeSeries(stored),
      missing: missingFunnelDays(stored, today),
      notes: notes.map((n) => safeSellerHubMessage(n, access.token)),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: safeSellerHubMessage(e instanceof Error ? e.message : "История не прочиталась", access.token) }, { status: 502 });
  }
}
