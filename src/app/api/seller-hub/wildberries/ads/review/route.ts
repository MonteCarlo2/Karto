import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { shortHash, supabaseCacheStore } from "@/lib/seller-hub/data-cache";
import type { CampaignFacts, CampaignReview } from "@/lib/seller-hub/ads-review";
import { REVIEW_CACHE_VERSION, reviewCampaignsWithAi } from "@/lib/seller-hub/ads-review-server";
import { takeAiBudget } from "@/lib/seller-hub/ai-budget";
import { createServerClient } from "@/lib/supabase/server";

export const maxDuration = 90;

/**
 * Только чтение: платный разбор рекламных кампаний нейросетью. Факты считает клиент по данным WB, сервер лишь передаёт их модели.
 * Результат хранится в базе по отпечатку фактов: тот же набор цифр повторно не оплачивается.
 */
export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  let body: { facts?: unknown; saved?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }
  const facts = Array.isArray(body.facts) ? (body.facts as CampaignFacts[]).filter((f) => f && typeof f.id === "string" && Array.isArray(f.products)).slice(0, 12) : [];
  if (facts.length === 0) return NextResponse.json({ ok: false, error: "Нет кампаний для разбора" }, { status: 400 });

  const store = supabaseCacheStore(createServerClient(), auth.user.id);
  const key = `ads-review:${REVIEW_CACHE_VERSION}:${shortHash(JSON.stringify(facts))}`;
  try {
    const hit = await store.read<{ reviews: CampaignReview[] }>(key).catch(() => null);
    if (hit) return NextResponse.json({ ok: true, reviews: hit.payload.reviews, reused: true, loadedAt: hit.loadedAt });
    if (body.saved === true) return NextResponse.json({ ok: true, reviews: null });
    const budget = takeAiBudget(auth.user.id, "ads-review", 40);
    if (!budget.ok) return NextResponse.json({ ok: false, error: budget.error }, { status: 429 });
    const { reviews, costUsd } = await reviewCampaignsWithAi(facts);
    await store.write(key, { reviews, costUsd }).catch(() => undefined);
    return NextResponse.json({ ok: true, reviews, reused: false, costUsd, loadedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Разбор не получился" }, { status: 502 });
  }
}
