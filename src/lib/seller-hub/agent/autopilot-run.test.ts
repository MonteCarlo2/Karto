import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAutopilot } from "./autopilot";

/** Простейшая подмена базы: цепочка select/eq/in/like/gte возвращает заранее заданные строки по имени таблицы. Запись не поддерживается: запуск идёт в режиме «только решения». */
function fakeDb(tables: Record<string, unknown[]>): SupabaseClient {
  const make = (name: string) => {
    let rows = tables[name] ?? [];
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "gte", "order", "limit"]) q[m] = () => q;
    // Запрос «что автопилот уже сделал сегодня» отличается условием like по заметке решения.
    q.like = () => {
      rows = tables[`${name}:done`] ?? [];
      return q;
    };
    q.maybeSingle = async () => ({ data: rows[0] ?? null });
    q.then = (res: (v: { data: unknown[] }) => unknown) => Promise.resolve({ data: rows }).then(res);
    return q;
  };
  return { from: (t: string) => make(t) } as unknown as SupabaseClient;
}

const settingsOn = [{ enabled: true, allowed_types: ["pause", "minus_phrases"], max_actions_per_day: 2, max_deposit_per_day_rub: 1000 }];
const planOn = { id: "p1", autopilot: true, owner_accepted: true, strategy_state: { status: "running" } };
const proposal = (id: string, action: unknown, planId = "p1") => ({ id, action, meta: { strategy: { findingId: planId } } });
const now = Date.parse("2026-10-30T10:00:00Z");

describe("автопилот: проход по предложениям (без записи в WB)", () => {
  it("выключенный автопилот ничего не рассматривает", async () => {
    const db = fakeDb({ seller_hub_autopilot_settings: [{ ...settingsOn[0], enabled: false }], seller_hub_agent_proposals: [proposal("a", { type: "pause", campaignId: "1" })] });
    assert.deepEqual(await runAutopilot({ db, userId: "u", nowMs: now, dryRun: true }), { considered: 0, executed: 0, failed: 0, skipped: [] });
  });
  it("разрешённые шаги засчитываются, цена и неразрешённые виды остаются владельцу, предел суток соблюдается", async () => {
    const db = fakeDb({
      seller_hub_autopilot_settings: settingsOn,
      seller_hub_ai_findings: [planOn, { id: "p2", autopilot: false, owner_accepted: true, strategy_state: { status: "running" } }],
      seller_hub_agent_proposals: [
        proposal("pause1", { type: "pause", campaignId: "1" }),
        proposal("minus1", { type: "minus_phrases", advertId: "2", nmId: "3", queries: ["a"] }),
        proposal("pause2", { type: "pause", campaignId: "4" }),
        proposal("other-plan", { type: "pause", campaignId: "5" }, "p2"),
        proposal("price", { type: "price", nmId: "1", targetRub: 900 }),
        proposal("deposit", { type: "deposit", campaignId: "1", sumRub: 500 }),
      ],
    });
    const r = await runAutopilot({ db, userId: "u", nowMs: now, dryRun: true });
    assert.equal(r.executed, 2);
    const reasons = Object.fromEntries(r.skipped.map((s) => [s.id, s.reason]));
    assert.match(reasons["pause2"]!, /суточный предел/);
    assert.match(reasons["other-plan"]!, /у плана автопилот не включён/);
    assert.match(reasons["deposit"]!, /не разрешил/);
    assert.equal(reasons["price"], undefined, "цена даже не рассматривается автопилотом");
  });
  it("регулярные задачи выполняют предложения рекламного агента только своего правила", async () => {
    const db = fakeDb({
      seller_hub_autopilot_settings: [{ enabled: true, allowed_types: ["pause", "deposit"], max_actions_per_day: 5, max_deposit_per_day_rub: 1000, routines: ["waste_guard"] }],
      seller_hub_agent_proposals: [
        { id: "w1", rule: "waste_guard", action: { type: "pause", campaignId: "1" }, meta: null },
        { id: "d1", rule: "drr_guard", action: { type: "pause", campaignId: "2" }, meta: null },
        { id: "a1", rule: "autopay", action: { type: "deposit", campaignId: "3", sumRub: 500 }, meta: null },
      ],
    });
    const r = await runAutopilot({ db, userId: "u", nowMs: now, dryRun: true });
    assert.equal(r.considered, 1, "только предложение правила waste_guard: drr_guard не включён, autopay не отмечен");
    assert.equal(r.executed, 1);
  });
});
