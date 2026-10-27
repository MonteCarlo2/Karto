import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentAction } from "@/lib/seller-hub/ads-agent-engine";
import { DEFAULT_AUTOPILOT, decideAutopilot, normalizeSettings, type AutopilotSettings } from "./autopilot";

const on: AutopilotSettings = { ...DEFAULT_AUTOPILOT, enabled: true };
const usage = { actionsToday: 0, depositToday: 0 };
const pause: AgentAction = { type: "pause", campaignId: "10" } as AgentAction;
const deposit = (sumRub: number) => ({ type: "deposit", campaignId: "10", sumRub }) as AgentAction;
const price: AgentAction = { type: "price", nmId: "1", targetRub: 950, baseRub: 1188, discount: 20, currentRub: 1000, currentBaseRub: 1250 };
const base = { action: pause, planAutopilot: true, planRunning: true, settings: on, usage };

describe("автопилот: решение по шагу", () => {
  it("по умолчанию выключен", () => {
    assert.equal(DEFAULT_AUTOPILOT.enabled, false);
    assert.equal(decideAutopilot({ ...base, settings: DEFAULT_AUTOPILOT }).run, false);
  });
  it("выполняет безопасный шаг, когда всё включено", () => {
    assert.deepEqual(decideAutopilot(base), { run: true });
  });
  it("не выполняет, если автопилот не включён у плана или план не идёт", () => {
    assert.equal(decideAutopilot({ ...base, planAutopilot: false }).run, false);
    assert.equal(decideAutopilot({ ...base, planRunning: false }).run, false);
  });
  it("цена и другие небезопасные виды не выполняются никогда, даже если их вписали в разрешённые", () => {
    const forced = { ...on, allowedTypes: ["price"] as unknown as AutopilotSettings["allowedTypes"] };
    assert.equal(decideAutopilot({ ...base, action: price, settings: forced }).run, false);
  });
  it("не выполняет вид, который владелец не разрешил", () => {
    assert.equal(decideAutopilot({ ...base, settings: { ...on, allowedTypes: ["deposit"] } }).run, false);
  });
  it("соблюдает суточный предел действий", () => {
    assert.equal(decideAutopilot({ ...base, usage: { actionsToday: on.maxActionsPerDay, depositToday: 0 } }).run, false);
  });
  it("пополнение ограничено суточной суммой", () => {
    assert.equal(decideAutopilot({ ...base, action: deposit(500), usage: { actionsToday: 0, depositToday: 400 } }).run, true);
    assert.equal(decideAutopilot({ ...base, action: deposit(1000), usage: { actionsToday: 0, depositToday: 500 } }).run, false);
  });
});

describe("автопилот: настройки", () => {
  it("без записи в базе берутся значения по умолчанию, выключен", () => {
    assert.deepEqual(normalizeSettings(null), DEFAULT_AUTOPILOT);
  });
  it("неизвестные виды отбрасываются, пределы подрезаются", () => {
    const s = normalizeSettings({ enabled: true, allowed_types: ["pause", "price", "pause"], max_actions_per_day: 999, max_deposit_per_day_rub: -5 });
    assert.deepEqual(s, { enabled: true, allowedTypes: ["pause"], maxActionsPerDay: 50, maxDepositPerDayRub: 0, routines: [] });
    assert.deepEqual(normalizeSettings({ routines: ["minus_queries", "hack", "minus_queries"] }).routines, ["minus_queries"]);
  });
  it("включён только при явном true", () => {
    assert.equal(normalizeSettings({ enabled: "yes" }).enabled, false);
  });
});
