import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clusterBidKey, parseClusterBidReset, parseClusterBidSet } from "./ads-cluster-bid";

const ok = { advertId: 10, nmId: 20, query: "  кашпо ", bidRub: 300, confirmRub: 300 };

describe("parseClusterBidSet", () => {
  it("принимает целую подтверждённую ставку и чистит запрос", () => {
    const r = parseClusterBidSet(ok);
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.request, { advertId: 10, nmId: 20, query: "кашпо", bidRub: 300 });
  });
  it("отклоняет дробную, нулевую, слишком большую и неподтверждённую ставку", () => {
    assert.equal(parseClusterBidSet({ ...ok, bidRub: 300.5, confirmRub: 300.5 }).ok, false);
    assert.equal(parseClusterBidSet({ ...ok, bidRub: 0, confirmRub: 0 }).ok, false);
    assert.equal(parseClusterBidSet({ ...ok, bidRub: 25_000, confirmRub: 25_000 }).ok, false);
    assert.equal(parseClusterBidSet({ ...ok, confirmRub: 310 }).ok, false);
  });
  it("отклоняет пустой запрос, плохие id и не-JSON", () => {
    assert.equal(parseClusterBidSet({ ...ok, query: " " }).ok, false);
    assert.equal(parseClusterBidSet({ ...ok, advertId: -1 }).ok, false);
    assert.equal(parseClusterBidSet({ ...ok, nmId: "20" }).ok, false);
    assert.equal(parseClusterBidSet(null).ok, false);
  });
});

describe("parseClusterBidReset", () => {
  it("нужно подтверждение запроса", () => {
    assert.equal(parseClusterBidReset({ advertId: 1, nmId: 2, query: "кашпо" }).ok, false);
    assert.equal(parseClusterBidReset({ advertId: 1, nmId: 2, query: "кашпо", confirmQuery: "кашпо" }).ok, true);
  });
});

describe("clusterBidKey", () => {
  it("не зависит от регистра и типа id", () => {
    assert.equal(clusterBidKey("10", 20, " Кашпо "), clusterBidKey(10, "20", "кашпо"));
  });
});
