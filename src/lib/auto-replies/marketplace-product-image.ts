import type { AutoRepliesMarketplaceId } from "./types";
import { buildWbProductImageCandidates, fetchWbBasketRoutes } from "./wb-basket-routes";

export function parseWildberriesNmId(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.trunc(n);
}

export function getWildberriesProductImageCandidates(nmId?: number): string[] {
  if (!nmId || nmId <= 0) return [];
  return buildWbProductImageCandidates(nmId, []);
}

export async function getWildberriesProductImageCandidatesAsync(nmId?: number): Promise<string[]> {
  if (!nmId || nmId <= 0) return [];
  const routes = await fetchWbBasketRoutes();
  return buildWbProductImageCandidates(nmId, routes);
}

export function getWildberriesProductImageProxyUrl(nmId?: number): string | undefined {
  if (!nmId || nmId <= 0) return undefined;
  return `/api/auto-replies/wb-product-image?nmId=${nmId}`;
}

export function getWildberriesProductImageUrl(nmId?: number): string | undefined {
  return getWildberriesProductImageProxyUrl(nmId);
}

export function getWildberriesProductPageUrl(nmId?: number): string | undefined {
  if (!nmId || nmId <= 0) return undefined;
  return `https://www.wildberries.ru/catalog/${nmId}/detail.aspx`;
}

export function getMarketplaceProductImageUrl(
  marketplaceId: AutoRepliesMarketplaceId,
  nmId?: number
): string | undefined {
  if (marketplaceId === "wildberries") return getWildberriesProductImageProxyUrl(nmId);
  return undefined;
}

export function getMarketplaceProductPageUrl(
  marketplaceId: AutoRepliesMarketplaceId,
  nmId?: number
): string | undefined {
  if (marketplaceId === "wildberries") return getWildberriesProductPageUrl(nmId);
  return undefined;
}

export function formatInboxBuyerName(item: {
  buyerName?: string;
  buyerLabel?: string;
}): string {
  if (item.buyerName?.trim()) return item.buyerName.trim();
  const label = item.buyerLabel?.trim() ?? "";
  if (label.startsWith("Покупатель ")) return label.replace(/^Покупатель\s+/, "");
  return label || "Покупатель";
}
