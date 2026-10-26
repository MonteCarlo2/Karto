import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adRemoveNmWbBody, parseAdRemoveNmRequest } from "./ads-nms";

describe("parseAdRemoveNmRequest", () => {
  it("принимает кампанию, артикул и подтверждение артикула", () => {
    assert.deepEqual(parseAdRemoveNmRequest({ advertId: 5, nmId: 7, confirmNmId: 7 }), {
      ok: true,
      request: { advertId: 5, nmId: 7 },
    });
  });

  it("не принимает без подтверждения, с чужим подтверждением и с плохими id", () => {
    assert.equal(parseAdRemoveNmRequest({ advertId: 5, nmId: 7 }).ok, false);
    assert.equal(parseAdRemoveNmRequest({ advertId: 5, nmId: 7, confirmNmId: 8 }).ok, false);
    assert.equal(parseAdRemoveNmRequest({ advertId: 0, nmId: 7, confirmNmId: 7 }).ok, false);
    assert.equal(parseAdRemoveNmRequest({ advertId: 5, nmId: "7", confirmNmId: "7" }).ok, false);
    assert.equal(parseAdRemoveNmRequest(null).ok, false);
  });

  it("в WB уходит только удаление одного артикула", () => {
    assert.deepEqual(adRemoveNmWbBody({ advertId: 5, nmId: 7 }), { nms: [{ advert_id: 5, nms: { delete: [7] } }] });
  });
});
