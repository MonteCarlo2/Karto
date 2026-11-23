import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adCreateWbBody, defaultAdCampaignName, parseAdCreateRequest } from "./ads-create";

describe("parseAdCreateRequest", () => {
  it("принимает артикул, название и подтверждение артикула", () => {
    const parsed = parseAdCreateRequest({ nmId: 123, name: "  Тест  ", confirmNmId: 123 });
    assert.deepEqual(parsed, { ok: true, request: { nmId: 123, name: "Тест" } });
  });

  it("не принимает без подтверждения, с чужим артикулом, пустым или слишком длинным названием", () => {
    assert.equal(parseAdCreateRequest({ nmId: 123, name: "Тест" }).ok, false);
    assert.equal(parseAdCreateRequest({ nmId: 123, name: "Тест", confirmNmId: 124 }).ok, false);
    assert.equal(parseAdCreateRequest({ nmId: 123, name: "   ", confirmNmId: 123 }).ok, false);
    assert.equal(parseAdCreateRequest({ nmId: 123, name: "а".repeat(101), confirmNmId: 123 }).ok, false);
    assert.equal(parseAdCreateRequest({ nmId: 0, name: "Тест", confirmNmId: 0 }).ok, false);
    assert.equal(parseAdCreateRequest(null).ok, false);
  });
});

describe("adCreateWbBody / defaultAdCampaignName", () => {
  it("тело для WB: один товар, ручная ставка, CPM, поиск", () => {
    assert.deepEqual(adCreateWbBody({ nmId: 5, name: "Х" }), {
      name: "Х",
      nms: [5],
      bid_type: "manual",
      payment_type: "cpm",
      placement_types: ["search"],
    });
  });

  it("кампания с оплатой за клик: тип оплаты уходит в WB, название помечено", () => {
    const parsed = parseAdCreateRequest({ nmId: 5, name: "Х", confirmNmId: 5, paymentType: "cpc" });
    assert.deepEqual(parsed, { ok: true, request: { nmId: 5, name: "Х", paymentType: "cpc" } });
    assert.equal(adCreateWbBody({ nmId: 5, name: "Х", paymentType: "cpc" }).payment_type, "cpc");
    assert.equal(parseAdCreateRequest({ nmId: 5, name: "Х", confirmNmId: 5, paymentType: "free" }).ok, false);
    assert.equal(defaultAdCampaignName("Ведро", "cpc"), "KARTO клики: Ведро");
  });

  it("название по умолчанию обрезается и всегда непустое", () => {
    assert.equal(defaultAdCampaignName("Ведро  10л"), "KARTO тест: Ведро 10л");
    assert.equal(defaultAdCampaignName(""), "KARTO тест: товар");
    assert.ok(defaultAdCampaignName("я".repeat(300)).length <= 100);
  });
});
