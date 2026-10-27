import type { SupabaseClient } from "@supabase/supabase-js";
import { CACHE_TTL_MS, cachedFetch, supabaseCacheStore } from "@/lib/seller-hub/data-cache";
import { moscowDateKey } from "@/lib/seller-hub/complete-days";
import { openSellerHubWbToken } from "@/lib/seller-hub/wb-token";
import { supabaseSellerHubSecretDb } from "@/lib/seller-hub/wb-token-store";
import { fetchWbClusterStats } from "@/lib/services/wildberries/advert-client";
import type { SellerAdClusterStat } from "@/lib/seller-hub/types";
import type { ScenarioProduct } from "./scenario-run";

/**
 * Поисковые запросы рекламы по товарам для плана ИИ: из них он выбирает минус-фразы (запросы с показами и кликами, но без заказов).
 * Данные читаются из WB токеном кабинета (тот же кэш на 30 минут, что у экрана рекламы), только чтение. Любой сбой даёт пустой ответ: план строится без запросов.
 */

export type AdQuery = { campaignId: string; query: string; views: number; clicks: number; orders: number; addToCart: number };

const MAX_PRODUCTS = 6;
const WINDOW_DAYS = 14;
const MAX_QUERIES_PER_PRODUCT = 25;

/** Запросы без заказов, но с трафиком, сначала самые затратные по кликам. Остальное ИИ не получает: убрать полезные запросы по ошибке нельзя. */
export function pickWasteQueries(rows: SellerAdClusterStat[]): AdQuery[] {
  return rows
    .filter((r) => r.orders === 0 && r.clicks >= 2)
    .sort((a, b) => b.clicks - a.clicks || b.views - a.views)
    .slice(0, MAX_QUERIES_PER_PRODUCT)
    .map((r) => ({ campaignId: r.advertId, query: r.query, views: r.views, clicks: r.clicks, orders: r.orders, addToCart: r.addToCart }));
}

export async function loadAdQueries(db: SupabaseClient, userId: string, products: ScenarioProduct[], nowMs: number): Promise<Map<string, AdQuery[]>> {
  const out = new Map<string, AdQuery[]>();
  const withAds = products.filter((p) => (p.ads ?? []).length > 0).slice(0, MAX_PRODUCTS);
  if (withAds.length === 0) return out;
  try {
    const opened = await openSellerHubWbToken(userId, supabaseSellerHubSecretDb(db));
    if (!opened.ok) return out;
    const pairs = withAds.flatMap((p) => (p.ads ?? []).map((c) => ({ advertId: Number(c.campaignId), nmId: Number(p.nmId) }))).filter((x) => Number.isInteger(x.advertId) && Number.isInteger(x.nmId));
    if (pairs.length === 0) return out;
    const to = moscowDateKey(nowMs - 86_400_000);
    const from = moscowDateKey(nowMs - WINDOW_DAYS * 86_400_000);
    const result = await cachedFetch({
      store: supabaseCacheStore(db, userId),
      key: `ads-clusters:${pairs.map((p) => `${p.advertId}:${p.nmId}`).sort().join(",")}|${from}|${to}`,
      ttlMs: CACHE_TTL_MS.adsClusters,
      refresh: false,
      fetcher: () => fetchWbClusterStats(opened.token, pairs, from, to),
    });
    const byNm = new Map<string, SellerAdClusterStat[]>();
    for (const row of result.value.rows) byNm.set(row.nmId, [...(byNm.get(row.nmId) ?? []), row]);
    for (const [nmId, rows] of byNm) {
      const waste = pickWasteQueries(rows);
      if (waste.length > 0) out.set(nmId, waste);
    }
  } catch (error) {
    console.error("[seller-hub-agent] поисковые запросы рекламы не прочитались:", error instanceof Error ? error.message : String(error));
  }
  return out;
}
