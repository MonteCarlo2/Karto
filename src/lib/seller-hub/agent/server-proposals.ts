import { buildAdAdvice, type AdvisorProduct } from "@/lib/seller-hub/ads-advisor";
import { buildAgentProposals, type AgentAction, type AgentProposal, type AgentRule } from "@/lib/seller-hub/ads-agent-engine";
import { adsByProduct, summarizeAds } from "@/lib/seller-hub/ads-metrics";
import { taskFactsFromSnapshot } from "@/lib/seller-hub/task-engine/facts";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";

/**
 * Предложения агента, посчитанные на сервере по снимку кабинета. Те же правила и тот же движок, что на экране «Агенты»:
 * сервер лишь считает их сам, без открытого интерфейса, чтобы предложения копились и были готовы к приходу человека.
 * Деньги и кабинет здесь не трогаются: это только расчёт того, что агент мог бы предложить.
 */

/** Окно статистики рекламы в снимке: семь последних законченных дней. */
export const SERVER_PROPOSAL_DAYS = 7;

export function advisorProductsFromSnapshot(snapshot: SellerCatalogSnapshot): AdvisorProduct[] {
  if (snapshot.items.length === 0) return [];
  return taskFactsFromSnapshot(snapshot).products.map((fact) => ({
    nmId: fact.nmId,
    title: fact.title,
    marginRub: fact.marginRub,
    marginPercent: fact.marginPercent,
    stock: fact.stockFbo != null || fact.stockFbs != null ? (fact.stockFbo ?? 0) + (fact.stockFbs ?? 0) : null,
    orders28: fact.orders,
  }));
}

export type ServerProposalResult = {
  proposals: AgentProposal[];
  skipped: Array<{ rule: string; text: string }>;
  /** Почему расчёта нет совсем (правила выключены, нет кампаний). null — расчёт шёл. */
  unavailable: string | null;
  /** Статистики рекламы в снимке нет: расчёт неполный, пропавшие предложения по расходам закрывать нельзя. */
  statsMissing: boolean;
};

export function proposalsFromSnapshot(input: { snapshot: SellerCatalogSnapshot; rules: AgentRule[]; depositedTodayRub: Record<string, number> }): ServerProposalResult {
  const { snapshot, rules, depositedTodayRub } = input;
  if (!rules.some((rule) => rule.enabled)) return { proposals: [], skipped: [], unavailable: "Ни одно правило агента не включено", statsMissing: false };
  const campaigns = snapshot.ads?.campaigns ?? [];
  if (campaigns.length === 0) return { proposals: [], skipped: [], unavailable: "В кабинете нет рекламных кампаний", statsMissing: false };

  const stats = snapshot.adsStats;
  const products = advisorProductsFromSnapshot(snapshot);
  const titles = new Map(products.map((p) => [p.nmId, p.title]));
  const productRows = stats ? adsByProduct(stats.campaigns) : [];
  const summary = stats ? summarizeAds(stats.campaigns) : null;
  const advice = stats
    ? buildAdAdvice({ days: SERVER_PROPOSAL_DAYS, campaigns, campaignStats: stats.campaigns, products, adsByProduct: productRows, storeCpo: summary?.cpo ?? null })
    : [];

  const result = buildAgentProposals({
    rules,
    campaigns,
    adsByProduct: productRows,
    products,
    advice,
    // Рекомендованные ставки WB читаются отдельным запросом по конкретным парам: фоном не берём, подъём ставки считает экран.
    bids: [],
    accountRub: snapshot.ads?.accountNet ?? null,
    depositedTodayRub,
    titles,
  });
  return { proposals: result.proposals, skipped: result.skipped, unavailable: null, statsMissing: !stats };
}

/**
 * Ключ предложения: одно и то же действие над одной целью. По нему предложения не плодятся при каждом пересчёте
 * и по нему видно, что человек уже отклонил именно это.
 */
export function proposalKey(action: AgentAction): string {
  switch (action.type) {
    case "deposit":
      return `deposit:${action.campaignId}`;
    case "pause":
      return `pause:${action.campaignId}`;
    case "resume":
      return `resume:${action.campaignId}`;
    case "add_nm":
      return `add_nm:${action.campaignId}:${action.nmId}`;
    case "remove_nm":
      return `remove_nm:${action.campaignId}:${action.nmId}`;
    case "create_campaign":
      return `create_campaign:${action.nmId}`;
    case "bid":
      return `bid:${action.advertId}:${action.nmId}`;
    case "price":
      return `price:${action.nmId}`;
    case "content":
      return `content:${action.nmId}:${action.field}`;
    case "minus_phrases":
      return `minus:${action.advertId}:${action.nmId}:${[...action.queries].sort().join("|").slice(0, 80)}`;
    case "placements":
      return `placements:${action.advertId}`;
    case "daily_limit":
      return `daily_limit:${action.campaignId}`;
    case "characteristics":
      return `characteristics:${action.nmId}:${action.changes.map((c) => c.charcId).sort((a, b) => a - b).join(",")}`;
    case "promo_exit":
      return `promo_exit:${action.promoId}:${action.nmId}`;
    case "promo_join":
      return `promo_join:${action.promoId}:${action.nmId}`;
    case "club_discount":
      return `club_discount:${action.nmId}`;
  }
}
