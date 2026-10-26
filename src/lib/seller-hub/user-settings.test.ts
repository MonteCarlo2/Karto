import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidUserSetting, pickValidSettings } from "./user-settings";

describe("isValidUserSetting", () => {
  it("принимает допустимые значения известных ключей", () => {
    assert.equal(isValidUserSetting("ads.days", "14"), true);
    assert.equal(isValidUserSetting("ads.compare", true), true);
    assert.equal(isValidUserSetting("logistics.days", "90"), true);
    assert.equal(isValidUserSetting("logistics.coverDays", 45), true);
    assert.equal(isValidUserSetting("logistics.multiple", 12), true);
  });

  it("отклоняет неизвестные ключи и недопустимые значения", () => {
    assert.equal(isValidUserSetting("unknown.key", 1), false);
    assert.equal(isValidUserSetting("ads.days", "15"), false);
    assert.equal(isValidUserSetting("ads.compare", "true"), false);
    assert.equal(isValidUserSetting("logistics.coverDays", 0), false);
    assert.equal(isValidUserSetting("logistics.coverDays", 366), false);
    assert.equal(isValidUserSetting("logistics.coverDays", 45.5), false);
    assert.equal(isValidUserSetting("logistics.multiple", 1001), false);
    assert.equal(isValidUserSetting("__proto__", 1), false);
  });
});

describe("pickValidSettings", () => {
  it("оставляет только известные ключи с допустимыми значениями", () => {
    assert.deepEqual(
      pickValidSettings([
        { setting_key: "ads.days", value: "7" },
        { setting_key: "ads.days2", value: "7" },
        { setting_key: "logistics.coverDays", value: "много" },
        { setting_key: "logistics.multiple", value: 6 },
      ]),
      { "ads.days": "7", "logistics.multiple": 6 },
    );
  });
});
