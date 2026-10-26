import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { shortHash, supabaseCacheStore } from "@/lib/seller-hub/data-cache";
import { PRODUCT_ADVICE_PROTOCOL_VERSION, type ProductAdvice, type ProductFacts } from "@/lib/seller-hub/product-advice";
import { adviseProductsWithAi } from "@/lib/seller-hub/product-advice-server";
import { takeAiBudget } from "@/lib/seller-hub/ai-budget";
import { createServerClient } from "@/lib/supabase/server";

export const maxDuration = 90;

/**
 * Только чтение: платный план действий по товарам от нейросети. Факты собирает клиент по данным WB, оценкам и себестоимости.
 * Результат хранится по отпечатку фактов: тот же набор цифр повторно не оплачивается.
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
  const facts = Array.isArray(body.facts) ? (body.facts as ProductFacts[]).filter((f) => f && typeof f.nmId === "string" && f.pillars).slice(0, 10) : [];
  if (facts.length === 0) return NextResponse.json({ ok: false, error: "Нет товаров для плана" }, { status: 400 });

  const store = supabaseCacheStore(createServerClient(), auth.user.id);
  const key = `product-advice:${PRODUCT_ADVICE_PROTOCOL_VERSION}:${shortHash(JSON.stringify(facts))}`;
  try {
    const hit = await store.read<{ advice: ProductAdvice[] }>(key).catch(() => null);
    if (hit) return NextResponse.json({ ok: true, advice: hit.payload.advice, reused: true });
    if (body.saved === true) return NextResponse.json({ ok: true, advice: null });
    const budget = takeAiBudget(auth.user.id, "product-advice", 40);
    if (!budget.ok) return NextResponse.json({ ok: false, error: budget.error }, { status: 429 });
    const { advice, costUsd } = await adviseProductsWithAi(facts);
    await store.write(key, { advice, costUsd }).catch(() => undefined);
    return NextResponse.json({ ok: true, advice, reused: false, costUsd });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "План не получился" }, { status: 502 });
  }
}
