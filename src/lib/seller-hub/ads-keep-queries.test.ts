import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidKeepQueries, keepKey, parseKeepQueries, serializeKeepQueries } from "./ads-keep-queries";
import { isValidUserSetting } from "./user-settings";

describe("белый список запросов", () => {
  it("ключ не зависит от регистра и пробелов", () => {
    assert.equal(keepKey(123, "  Кашпо "), "123:кашпо");
  });
  it("разбор и запись: дубли убираются, мусор отбрасывается", () => {
    assert.deepEqual(parseKeepQueries('["1:а","1:а","2:б"]'), ["1:а", "1:а", "2:б"]);
    assert.equal(serializeKeepQueries(["1:а", "1:а", "2:б"]), '["1:а","2:б"]');
    assert.deepEqual(parseKeepQueries("не json"), []);
    assert.deepEqual(parseKeepQueries('{"a":1}'), []);
  });
  it("проверка значения настройки", () => {
    assert.equal(isValidKeepQueries('["1:а"]'), true);
    assert.equal(isValidKeepQueries('[1]'), false);
    assert.equal(isValidKeepQueries("не json"), false);
    assert.equal(isValidUserSetting("ads.keepQueries", '["1:а"]'), true);
    assert.equal(isValidUserSetting("ads.keepQueries", 5), false);
  });
});
