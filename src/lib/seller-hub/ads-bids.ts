import type { SellerAdBidRecommendation, SellerAdCampaignRow } from "@/lib/seller-hub/types";

export type BidVerdict = "below_competitive" | "between" | "above_leaders" | "no_data";

export type BidRow = {
  advertId: string;
  campaignName: string;
  nmId: string;
  /** Текущая ставка в поиске, ₽ за 1000 показов (CPM). */
  currentRub: number | null;
  competitiveRub: number | null;
  leadersRub: number | null;
  verdict: BidVerdict;
  /** Короткое пояснение по вердикту, с цифрами. */
  note: string;
};

const rub = (value: number) => `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;

/**
 * Сопоставление текущих ставок с рекомендованными WB.
 * Только CPM-кампании: у CPC другая шкала рекомендаций (по позициям). Не выдаём вердикт без данных.
 */
export function compareBids(
  campaigns: SellerAdCampaignRow[],
  recommendations: SellerAdBidRecommendation[],
): BidRow[] {
  const recByPair = new Map(recommendations.map((r) => [`${r.advertId}:${r.nmId}`, r]));
  const rows: BidRow[] = [];
  for (const campaign of campaigns) {
    if (campaign.paymentType && campaign.paymentType !== "cpm") continue;
    for (const bid of campaign.bids ?? []) {
      const rec = recByPair.get(`${campaign.id}:${bid.nmId}`);
      const current = bid.searchRub;
      const competitive = rec?.competitiveRub ?? null;
      const leaders = rec?.leadersRub ?? null;
      let verdict: BidVerdict = "no_data";
      let note = "WB не вернул рекомендованные ставки для этого товара.";
      if (current != null && current > 0 && competitive != null) {
        if (current < competitive) {
          verdict = "below_competitive";
          note = `Ставка ${rub(current)} ниже конкурентной ${rub(competitive)}: показов может быть меньше, чем у конкурентов.`;
        } else if (leaders != null && current > leaders) {
          verdict = "above_leaders";
          note = `Ставка ${rub(current)} выше ставки лидеров ${rub(leaders)}: возможна переплата, проверьте, что растут заказы.`;
        } else {
          verdict = "between";
          note = `Ставка ${rub(current)} не ниже конкурентной ${rub(competitive)}${leaders != null ? ` и не выше ставки лидеров ${rub(leaders)}` : ""}.`;
        }
      } else if (current == null || current <= 0) {
        note = "Ставка в поиске у этого товара не задана.";
      }
      rows.push({
        advertId: campaign.id,
        campaignName: campaign.name ?? campaign.id,
        nmId: bid.nmId,
        currentRub: current,
        competitiveRub: competitive,
        leadersRub: leaders,
        verdict,
        note,
      });
    }
  }
  return rows;
}
