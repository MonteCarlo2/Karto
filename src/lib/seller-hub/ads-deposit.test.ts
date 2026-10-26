import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adDepositWbBody, AD_DEPOSIT_MAX_RUB, parseAdDepositRequest } from "./ads-deposit";

describe("parseAdDepositRequest", () => {
  it("принимает корректный запрос с подтверждённой суммой", () => {
    const parsed = parseAdDepositRequest({ campaignId: 40678420, sum: 3000, confirmSum: 3000 });
    assert.deepEqual(parsed, { ok: true, request: { campaignId: 40678420, sum: 3000 } });
  });

  it("не принимает сумму без подтверждения или с другим подтверждением", () => {
    assert.equal(parseAdDepositRequest({ campaignId: 1, sum: 3000 }).ok, false);
    assert.equal(parseAdDepositRequest({ campaignId: 1, sum: 3000, confirmSum: 300 }).ok, false);
  });

  it("не принимает дробные, нулевые, отрицательные и слишком большие суммы", () => {
    for (const sum of [0, -5, 10.5, AD_DEPOSIT_MAX_RUB + 1, Number.NaN, "100"]) {
      assert.equal(parseAdDepositRequest({ campaignId: 1, sum, confirmSum: sum }).ok, false, String(sum));
    }
  });

  it("не принимает плохой id кампании и пустое тело", () => {
    assert.equal(parseAdDepositRequest({ campaignId: 0, sum: 100, confirmSum: 100 }).ok, false);
    assert.equal(parseAdDepositRequest({ campaignId: "1", sum: 100, confirmSum: 100 }).ok, false);
    assert.equal(parseAdDepositRequest(null).ok, false);
  });

  it("в WB уходит только сумма, источник «счёт» и флаг возврата бюджета", () => {
    assert.deepEqual(adDepositWbBody({ campaignId: 1, sum: 500 }), { sum: 500, type: 0, return: true });
  });
});
