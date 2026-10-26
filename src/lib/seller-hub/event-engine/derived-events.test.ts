import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agentActionEvents } from "./derived-events";

const NOW = "2026-10-21T12:00:00Z";

describe("действия агентов в событиях", () => {
  it("показывает выполненное, ошибки и предложения, пропущенное прячет", () => {
    const row = (over: Partial<Parameters<typeof agentActionEvents>[0][number]>) => ({ id: "1", agent: "ads", action: "set_bid", result: "ok", message: "Ставка 120 → 130 ₽", initiator: "agent", nm_id: 5, created_at: NOW, ...over });
    const out = agentActionEvents([row({}), row({ id: "2", result: "error", message: "WB отказал" }), row({ id: "3", result: "skipped" }), row({ id: "4", result: "suggested", initiator: "user" })]);
    assert.equal(out.length, 3);
    assert.equal(out[0]!.title, "Агент (реклама): выполнено");
    assert.equal(out[1]!.severity, "important");
    assert.equal(out[2]!.title, "Действие вручную: предложение");
    assert.equal(out[0]!.nmId, "5");
  });
});
