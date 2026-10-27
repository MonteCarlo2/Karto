import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adDailyLimitWbBody, parseAdDailyLimitRequest } from "./ads-daily-limit";

const ok = { advertId: 10, enabled: true, dailyLimit: 2000, carryOver: false, confirm: "10:true:2000" };

describe("дневной лимит кампании: проверка запроса", () => {
  it("принимает подтверждённый запрос и строит тело для WB", () => {
    const r = parseAdDailyLimitRequest(ok);
    assert.ok(r.ok);
    assert.deepEqual(adDailyLimitWbBody(r.ok ? r.request : (null as never)), { advertIds: [10], enabled: true, dailyLimit: 2000, carryOverEnabled: false });
  });
  it("отклоняет лимит меньше 1000, дробный, без подтверждения и без кампании", () => {
    assert.equal(parseAdDailyLimitRequest({ ...ok, dailyLimit: 999, confirm: "10:true:999" }).ok, false);
    assert.equal(parseAdDailyLimitRequest({ ...ok, dailyLimit: 1500.5, confirm: "10:true:1500.5" }).ok, false);
    assert.equal(parseAdDailyLimitRequest({ ...ok, confirm: "x" }).ok, false);
    assert.equal(parseAdDailyLimitRequest({ ...ok, advertId: 0 }).ok, false);
    assert.equal(parseAdDailyLimitRequest(null).ok, false);
  });
});
