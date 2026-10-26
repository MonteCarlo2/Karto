import { after, NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { loadLatestCostPrices } from "@/lib/seller-hub/cost-history";
import { rederiveAfterCostChange } from "@/lib/seller-hub/sync/invalidate";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Последняя себестоимость по nmId — источник правды (не localStorage). */
export async function GET(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const marketplaceId =
    request.nextUrl.searchParams.get("marketplaceId")?.trim() || "wildberries";
  const map = await loadLatestCostPrices(createServerClient(), auth.user.id, marketplaceId);
  const costs: Record<string, number> = {};
  for (const [nmId, cost] of map) costs[nmId] = cost;
  return NextResponse.json({ ok: true, costs, count: map.size });
}

/** Запись себестоимости в историю при изменении продавцом. */
export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 });
  const nmId = typeof body.nmId === "string" ? body.nmId.trim() : "";
  const cost = typeof body.costPrice === "number" ? body.costPrice : Number(body.costPrice);
  const marketplaceId =
    typeof body.marketplaceId === "string" && body.marketplaceId.trim()
      ? body.marketplaceId.trim()
      : "wildberries";
  if (!nmId || !Number.isFinite(cost) || cost < 0) {
    return NextResponse.json({ ok: false, error: "Нужны nmId и себестоимость ≥ 0" }, { status: 400 });
  }
  const supabase = createServerClient();
  const { error } = await supabase.from("seller_hub_cost_history").insert({
    user_id: auth.user.id,
    marketplace_id: marketplaceId,
    nm_id: nmId,
    cost_price: cost,
    effective_from: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  // Фоновый режим: маржа и задачи зависят от себестоимости, пересчитываем по сохранённым снимкам после ответа (WB не трогаем).
  after(() => rederiveAfterCostChange(auth.user!.id, marketplaceId));
  return NextResponse.json({ ok: true });
}
