import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAdPlacementsRequest, placementsLabel } from "./ads-placements";

describe("зоны показов", () => {
  it("принимает подтверждённое изменение", () => {
    const r = parseAdPlacementsRequest({ advertId: 1, search: true, recommendations: false, confirm: "true:false" });
    assert.equal(r.ok, true);
  });
  it("нельзя отключить обе зоны, нужно подтверждение, плохие данные отклоняются", () => {
    assert.equal(parseAdPlacementsRequest({ advertId: 1, search: false, recommendations: false, confirm: "false:false" }).ok, false);
    assert.equal(parseAdPlacementsRequest({ advertId: 1, search: true, recommendations: true }).ok, false);
    assert.equal(parseAdPlacementsRequest({ advertId: 1, search: true, recommendations: true, confirm: "true:false" }).ok, false);
    assert.equal(parseAdPlacementsRequest({ advertId: 0, search: true, recommendations: true, confirm: "true:true" }).ok, false);
    assert.equal(parseAdPlacementsRequest({ advertId: 1, search: "да", recommendations: true, confirm: "x" }).ok, false);
    assert.equal(parseAdPlacementsRequest(null).ok, false);
  });
  it("подписи", () => {
    assert.equal(placementsLabel({ search: true, recommendations: true }), "поиск и рекомендации");
    assert.equal(placementsLabel({ search: false, recommendations: true }), "только рекомендации");
  });
});
