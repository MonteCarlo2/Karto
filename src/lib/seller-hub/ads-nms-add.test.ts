import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adAddNmWbBody, parseAdAddNmRequest } from "./ads-nms";

describe("добавление товара в кампанию", () => {
  it("нужен подтверждённый артикул", () => {
    assert.equal(parseAdAddNmRequest({ advertId: 1, nmId: 2 }).ok, false);
    assert.equal(parseAdAddNmRequest({ advertId: 1, nmId: 2, confirmNmId: 3 }).ok, false);
    const ok = parseAdAddNmRequest({ advertId: 1, nmId: 2, confirmNmId: 2 });
    assert.equal(ok.ok, true);
  });
  it("плохие id и не-JSON отклоняются", () => {
    assert.equal(parseAdAddNmRequest({ advertId: 0, nmId: 2, confirmNmId: 2 }).ok, false);
    assert.equal(parseAdAddNmRequest({ advertId: 1, nmId: "2", confirmNmId: "2" }).ok, false);
    assert.equal(parseAdAddNmRequest(null).ok, false);
  });
  it("тело для WB содержит только добавление", () => {
    assert.deepEqual(adAddNmWbBody({ advertId: 5, nmId: 77 }), { nms: [{ advert_id: 5, nms: { add: [77] } }] });
  });
});
