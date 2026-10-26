import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareBids } from "./ads-bids";
import type { SellerAdBidRecommendation, SellerAdCampaignRow } from "./types";

const campaign = (patch: Partial<SellerAdCampaignRow> = {}): SellerAdCampaignRow => ({
  id: "9",
  name: "Кампания",
  paymentType: "cpm",
  bids: [{ nmId: "1", searchRub: 300, recommendationsRub: 300 }],
  ...patch,
});

const rec = (patch: Partial<SellerAdBidRecommendation> = {}): SellerAdBidRecommendation => ({
  advertId: "9",
  nmId: "1",
  paymentType: "cpm",
  competitiveRub: 395,
  leadersRub: 669,
  ...patch,
});

describe("compareBids", () => {
  it("ниже конкурентной ставки", () => {
    const [row] = compareBids([campaign()], [rec()]);
    assert.equal(row!.verdict, "below_competitive");
    assert.match(row!.note, /ниже конкурентной/);
  });

  it("между конкурентной и ставкой лидеров", () => {
    const [row] = compareBids([campaign({ bids: [{ nmId: "1", searchRub: 500, recommendationsRub: null }] })], [rec()]);
    assert.equal(row!.verdict, "between");
  });

  it("выше ставки лидеров", () => {
    const [row] = compareBids([campaign({ bids: [{ nmId: "1", searchRub: 900, recommendationsRub: null }] })], [rec()]);
    assert.equal(row!.verdict, "above_leaders");
  });

  it("без рекомендаций WB вердикта нет", () => {
    const [row] = compareBids([campaign()], []);
    assert.equal(row!.verdict, "no_data");
  });

  it("CPC-кампании пропускаем", () => {
    assert.deepEqual(compareBids([campaign({ paymentType: "cpc" })], [rec()]), []);
  });
});
