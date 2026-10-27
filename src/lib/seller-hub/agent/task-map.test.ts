import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ACTION_SPECS } from "./actions";
import { PLAYBOOKS } from "./playbooks";
import { TASK_AGENT_MAP } from "./task-map";

describe("карта «задача → что делает агент»", () => {
  const entries = Object.entries(TASK_AGENT_MAP);

  it("у каждой задачи есть пояснение", () => {
    assert.ok(entries.length >= 35);
    for (const [type, rule] of entries) assert.ok(rule.note.length > 10, type);
  });

  it("только человеку и другому разделу действий агента не назначается", () => {
    for (const [type, rule] of entries) {
      if (rule.mode === "human" || rule.mode === "elsewhere") assert.equal(rule.actions.length, 0, type);
    }
  });

  it("«выполнит» означает, что есть хотя бы одно действие, и все действия из реестра", () => {
    for (const [type, rule] of entries) {
      if (rule.mode === "execute") assert.ok(rule.actions.length > 0, type);
      for (const action of rule.actions) assert.ok(action in ACTION_SPECS, `${type}: ${action}`);
      if (rule.playbook) assert.ok(rule.playbook in PLAYBOOKS, `${type}: ${rule.playbook}`);
    }
  });

  it("задача без себестоимости остаётся за человеком: агент не снижает цену без безубыточности", () => {
    assert.equal(TASK_AGENT_MAP.TASK_COST_MISSING.mode, "human");
  });

  it("цену агент меняет только через сценарии или расчёт пола: действие «цена» есть лишь там, где описана логика", () => {
    for (const [type, rule] of entries) {
      if (!rule.actions.includes("price")) continue;
      assert.ok(rule.playbook || /безубыточ|пол|маж|пересчитан|цен/i.test(rule.note), type);
    }
  });
});
