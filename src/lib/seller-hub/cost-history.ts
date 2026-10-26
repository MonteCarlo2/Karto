import type { SupabaseClient } from "@supabase/supabase-js";
import type { SellerCatalogItem, SellerCatalogSnapshot } from "./types";

/** Последняя себестоимость по nmId из seller_hub_cost_history. */
export async function loadLatestCostPrices(
  supabase: SupabaseClient,
  userId: string,
  marketplaceId = "wildberries",
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("seller_hub_cost_history")
    .select("nm_id, cost_price, effective_from")
    .eq("user_id", userId)
    .eq("marketplace_id", marketplaceId)
    .order("effective_from", { ascending: false });
  if (error || !data) return new Map();

  const out = new Map<string, number>();
  for (const row of data) {
    const nmId = typeof row.nm_id === "string" ? row.nm_id.trim() : "";
    if (!nmId || out.has(nmId)) continue;
    const cost = typeof row.cost_price === "number" ? row.cost_price : Number(row.cost_price);
    if (!Number.isFinite(cost) || cost < 0) continue;
    out.set(nmId, cost);
  }
  return out;
}

/**
 * Подмешать себестоимость с сервера в items.
 * serverWins: если nm есть на сервере — всегда сервер; иначе оставить локальный кэш.
 */
export function applyCostPricesToCatalog(
  items: SellerCatalogItem[],
  costs: Map<string, number>,
  opts?: { serverWins?: boolean },
): SellerCatalogItem[] {
  const serverWins = opts?.serverWins !== false;
  if (costs.size === 0 && !serverWins) return items;
  return items.map((item) => {
    if (costs.has(item.externalId)) {
      return { ...item, costPrice: costs.get(item.externalId)! };
    }
    // Нет на сервере: кэш localStorage оставляем (пока не уйдёт POST), иначе null.
    if (serverWins && item.costPrice != null && !costs.has(item.externalId)) {
      return item;
    }
    return item;
  });
}

export function applyCostPricesToSnapshot(
  snapshot: SellerCatalogSnapshot,
  costs: Map<string, number>,
): SellerCatalogSnapshot {
  return {
    ...snapshot,
    items: applyCostPricesToCatalog(snapshot.items, costs),
  };
}

/** nmId с локальной себестоимостью, которых ещё нет на сервере (миграция кэша → history). */
export function localOnlyCostEntries(
  items: SellerCatalogItem[],
  serverCosts: Map<string, number>,
): Array<{ nmId: string; costPrice: number }> {
  const out: Array<{ nmId: string; costPrice: number }> = [];
  for (const item of items) {
    if (item.costPrice == null || !(item.costPrice >= 0)) continue;
    if (serverCosts.has(item.externalId)) continue;
    out.push({ nmId: item.externalId, costPrice: item.costPrice });
  }
  return out;
}

export function costMapFromRecord(costs: Record<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [nmId, cost] of Object.entries(costs)) {
    if (!nmId || !Number.isFinite(cost) || cost < 0) continue;
    out.set(nmId, cost);
  }
  return out;
}
