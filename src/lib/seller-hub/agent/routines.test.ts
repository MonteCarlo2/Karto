import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdQuery } from "./ads-queries";
import { MAX_PAIRS_PER_RUN, MAX_PHRASES_PER_PAIR, MIN_CLICKS_NO_ORDERS, pickMinusCandidates, promoWatchProposals, runMinusRoutine } from "./routines";

const q = (campaignId: string, query: string, clicks: number, orders = 0): AdQuery => ({ campaignId, query, views: clicks * 10, clicks, orders, addToCart: 0 });

describe("регулярная задача: минус-фразы", () => {
  it("берёт только запросы без заказов с достаточным числом кликов, самые затратные, не больше трёх на пару", () => {
    const out = pickMinusCandidates(new Map([["1", [q("10", "a", MIN_CLICKS_NO_ORDERS - 1), q("10", "b", 50), q("10", "c", 40, 1), q("10", "d", 30), q("10", "e", 25), q("10", "f", 22), q("10", "g", 21)]]]));
    assert.deepEqual(out, [{ advertId: "10", nmId: "1", queries: ["b", "d", "e"] }]);
    assert.equal(MAX_PHRASES_PER_PAIR, 3);
  });
  it("за запуск не больше установленного числа пар", () => {
    const rows = new Map<string, AdQuery[]>(Array.from({ length: 8 }, (_, i) => [String(i), [q("10", "x", 30)]] as [string, AdQuery[]]));
    assert.equal(pickMinusCandidates(rows).length, MAX_PAIRS_PER_RUN);
  });
  it("выключенная регулярная задача ничего не делает", async () => {
    const db = { from: () => { const c: Record<string, unknown> = {}; for (const m of ["select", "eq", "in"]) c[m] = () => c; c.maybeSingle = async () => ({ data: { enabled: true, routines: [] } }); return c; } } as unknown as SupabaseClient;
    const r = await runMinusRoutine({ db, userId: "u", nowMs: Date.now(), queries: new Map([["1", [q("10", "b", 50)]]]), dryRun: true });
    assert.equal(r.considered, 0);
  });
  it("включённая считает действия по правилам автопилота (без записи в WB)", async () => {
    const row = { enabled: true, allowed_types: ["minus_phrases"], max_actions_per_day: 1, max_deposit_per_day_rub: 0, routines: ["minus_queries"] };
    const db = { from: (t: string) => { const c: Record<string, unknown> = {}; for (const m of ["select", "eq", "in", "like", "gte"]) c[m] = () => c; c.maybeSingle = async () => ({ data: row }); c.then = (res: (v: { data: unknown[] }) => unknown) => Promise.resolve({ data: t === "seller_hub_agent_proposals" ? [] : [] }).then(res); return c; } } as unknown as SupabaseClient;
    const queries = new Map([["1", [q("10", "a", 50)]], ["2", [q("11", "b", 40)]]]);
    const r = await runMinusRoutine({ db, userId: "u", nowMs: Date.now(), queries, dryRun: true });
    assert.equal(r.executed, 1, "предел одного действия в сутки");
    assert.match(r.skipped[0]!, /суточный предел/);
  });
});

describe("регулярная проверка акций", () => {
  it("предлагает выйти только из акций с отрицательной маржой в акции", () => {
    const product = { nmId: "1", vendorCode: "A1", promos: [
      { promoId: "p1", name: "Осень", endAt: "2026-11-05T00:00:00Z", cohort: "loss", marginPromoPercent: -4, planPrice: 900 },
      { promoId: "p2", name: "Зима", endAt: null, cohort: "hold", marginPromoPercent: 12, planPrice: 1000 },
      { promoId: "p3", name: "Весна", endAt: null, cohort: "loss", marginPromoPercent: null, planPrice: 1000 },
    ] } as unknown as Parameters<typeof promoWatchProposals>[0][number];
    const out = promoWatchProposals([product]);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.action.type, "promo_exit");
    assert.equal(out[0]!.risk, "high");
  });
});
