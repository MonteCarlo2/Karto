import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LEVERS } from "./capabilities";
import { capabilityGroups, doableLeverCount, LEVER_LABEL } from "./capability-labels";

describe("подписи возможностей агента", () => {
  it("у каждого рычага без Джема есть подпись", () => {
    const missing = LEVERS.filter((l) => !l.jam && !LEVER_LABEL[l.id]).map((l) => l.id);
    assert.deepEqual(missing, []);
  });

  it("нет подписей для несуществующих рычагов", () => {
    const ids = new Set(LEVERS.map((l) => l.id));
    assert.deepEqual(Object.keys(LEVER_LABEL).filter((id) => !ids.has(id)), []);
  });

  it("Джем в интерфейсе не упоминается", () => {
    const text = JSON.stringify(capabilityGroups()) + JSON.stringify(LEVER_LABEL);
    assert.ok(!/джем/i.test(text));
  });

  it("группы повторяют реестр: каждое действие попадает в свою колонку", () => {
    const groups = capabilityGroups();
    const total = groups.reduce((n, g) => n + g.action.length + g.human.length + g.advice.length, 0);
    assert.equal(total, LEVERS.filter((l) => !l.jam).length);
    assert.equal(groups.reduce((n, g) => n + g.action.length, 0), doableLeverCount());
    const ads = groups.find((g) => g.area === "Реклама");
    assert.ok(ads && ads.action.length >= 5 && ads.human.length === 1);
  });
});
