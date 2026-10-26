import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AD_BID_MAX_RUB, checkBidSafety, parseAdBidRequest, rubToKopecks } from "./ads-bid";

describe("parseAdBidRequest", () => {
  const base = { advertId: 1, nmId: 2, bidRub: 250.5, confirmRub: 250.5 };

  it("принимает ставку с копейками и подтверждением", () => {
    assert.deepEqual(parseAdBidRequest(base), { ok: true, request: { advertId: 1, nmId: 2, bidRub: 250.5 } });
  });

  it("не принимает без подтверждения, с другой суммой, нулевую, отрицательную, с долями копейки и слишком большую", () => {
    for (const patch of [
      { confirmRub: undefined },
      { confirmRub: 100 },
      { bidRub: 0, confirmRub: 0 },
      { bidRub: -5, confirmRub: -5 },
      { bidRub: 250.555, confirmRub: 250.555 },
      { bidRub: AD_BID_MAX_RUB + 1, confirmRub: AD_BID_MAX_RUB + 1 },
      { bidRub: "250", confirmRub: "250" },
    ]) {
      assert.equal(parseAdBidRequest({ ...base, ...patch }).ok, false, JSON.stringify(patch));
    }
  });

  it("не принимает плохие id", () => {
    assert.equal(parseAdBidRequest({ ...base, advertId: 0 }).ok, false);
    assert.equal(parseAdBidRequest({ ...base, nmId: 1.5 }).ok, false);
    assert.equal(parseAdBidRequest(null).ok, false);
  });

  it("рубли переводятся в копейки без ошибок округления", () => {
    assert.equal(rubToKopecks(250.5), 25050);
    assert.equal(rubToKopecks(0.29), 29);
    assert.equal(rubToKopecks(1.15), 115);
  });
});

describe("checkBidSafety", () => {
  it("ниже минимальной ставки отклоняем", () => {
    const r = checkBidSafety({ newKopecks: 100, currentKopecks: 30000, minKopecks: 150 });
    assert.equal(r.ok, false);
  });

  it("подъём больше чем втрое отклоняем, втрое ровно — можно", () => {
    assert.equal(checkBidSafety({ newKopecks: 90001, currentKopecks: 30000, minKopecks: null }).ok, false);
    assert.equal(checkBidSafety({ newKopecks: 90000, currentKopecks: 30000, minKopecks: null }).ok, true);
  });

  it("снижение всегда допустимо, неизвестные текущая и минимальная — решает WB", () => {
    assert.equal(checkBidSafety({ newKopecks: 20000, currentKopecks: 30000, minKopecks: 150 }).ok, true);
    assert.equal(checkBidSafety({ newKopecks: 99999, currentKopecks: null, minKopecks: null }).ok, true);
    assert.equal(checkBidSafety({ newKopecks: 5000, currentKopecks: 0, minKopecks: null }).ok, true);
  });
});
