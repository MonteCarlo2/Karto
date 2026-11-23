import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAutopilot } from "./agent/autopilot";
import { isSandboxOn } from "./sandbox";
import { isValidUserSetting } from "./user-settings";

/** Подмена базы: цепочка запросов возвращает заранее заданные строки по имени таблицы. */
function fakeDb(tables: Record<string, unknown[]>, fail = false): SupabaseClient {
  const make = (name: string) => {
    const rows = tables[name] ?? [];
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "gte", "order", "limit", "like"]) q[m] = () => q;
    q.maybeSingle = async () => (fail ? { data: null, error: { message: "boom" } } : { data: rows[0] ?? null });
    q.then = (res: (v: { data: unknown[] }) => unknown) => Promise.resolve({ data: rows }).then(res);
    return q;
  };
  return { from: (t: string) => make(t) } as unknown as SupabaseClient;
}

describe("тестовый режим агента", () => {
  it("по умолчанию включён, выключается только явным false", async () => {
    assert.equal(await isSandboxOn(fakeDb({}), "u"), true);
    assert.equal(await isSandboxOn(fakeDb({ seller_hub_user_settings: [{ value: true }] }), "u"), true);
    assert.equal(await isSandboxOn(fakeDb({ seller_hub_user_settings: [{ value: false }] }), "u"), false);
  });
  it("сбой чтения настройки считается включённым режимом", async () => {
    assert.equal(await isSandboxOn(fakeDb({}, true), "u"), true);
  });
  it("настройка принимает только true и false", () => {
    assert.equal(isValidUserSetting("agent.sandbox", true), true);
    assert.equal(isValidUserSetting("agent.sandbox", false), true);
    assert.equal(isValidUserSetting("agent.sandbox", "yes"), false);
  });
  it("автопилот в тестовом режиме ничего не отправляет в WB", async () => {
    const db = fakeDb({
      seller_hub_autopilot_settings: [{ enabled: true, allowed_types: ["pause"], max_actions_per_day: 5, max_deposit_per_day_rub: 1000 }],
      seller_hub_ai_findings: [{ id: "p1", autopilot: true, owner_accepted: true, strategy_state: { status: "running" } }],
      seller_hub_agent_proposals: [{ id: "a", action: { type: "pause", campaignId: "1" }, meta: { strategy: { findingId: "p1" } } }],
    });
    let calls = 0;
    const r = await runAutopilot({ db, userId: "u", nowMs: Date.parse("2026-11-12T10:00:00Z"), exec: async () => { calls += 1; return { ok: true }; } });
    assert.equal(calls, 0, "в тестовом режиме запись в WB не вызывается");
    assert.equal(r.executed, 0);
    assert.match(r.skipped[0]!.reason, /тестовый режим/);
  });
});
