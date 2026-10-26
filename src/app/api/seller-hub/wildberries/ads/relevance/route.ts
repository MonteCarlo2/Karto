import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { shortHash, supabaseCacheStore } from "@/lib/seller-hub/data-cache";
import { judgeQueryRelevance, RELEVANCE_PROTOCOL_VERSION, type QueryRelevance } from "@/lib/seller-hub/ads-query-relevance";
import { createServerClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/**
 * Только чтение: платный вызов нейросети, который решает, подходят ли запросы товару по смыслу.
 * Результат хранится в базе по товару и набору запросов: повторная проверка того же набора не оплачивается.
 */
export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  let body: { nmId?: unknown; title?: unknown; category?: unknown; description?: unknown; queries?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }
  const nmId = typeof body.nmId === "number" && Number.isInteger(body.nmId) && body.nmId > 0 ? body.nmId : null;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const queries = Array.isArray(body.queries) ? [...new Set(body.queries.filter((q): q is string => typeof q === "string").map((q) => q.trim()).filter(Boolean))].slice(0, 30) : [];
  if (!nmId || !title || queries.length === 0) {
    return NextResponse.json({ ok: false, error: "Нужны артикул, название и список запросов" }, { status: 400 });
  }
  const store = supabaseCacheStore(createServerClient(), auth.user.id);
  const key = `ads-rel:${RELEVANCE_PROTOCOL_VERSION}:${nmId}:${shortHash(`${title}|${[...queries].sort().join("|")}`)}`;
  try {
    const hit = await store.read<{ results: QueryRelevance[] }>(key).catch(() => null);
    if (hit) return NextResponse.json({ ok: true, results: hit.payload.results, reused: true });
    const { results, costUsd } = await judgeQueryRelevance({
      title,
      category: typeof body.category === "string" ? body.category : null,
      description: typeof body.description === "string" ? body.description : null,
      queries,
    });
    await store.write(key, { results, costUsd }).catch(() => undefined);
    return NextResponse.json({ ok: true, results, reused: false, costUsd });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Проверка не получилась" }, { status: 502 });
  }
}
