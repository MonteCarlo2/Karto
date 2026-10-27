import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CacheStore } from "@/lib/seller-hub/data-cache";
import { AI_BATCH, runAiReview, type AiAsk } from "./ai-orchestrator";
import type { AiProductInput } from "./ai-review";

const product = (nmId: string): AiProductInput => ({
  nmId,
  title: `Товар ${nmId}`,
  facts: { opens_28d: 1000, cart_pct: 2 },
  candidate: { stepPercent: -1, rules: ["trend_down"], playbook: "grow_no_price_war" },
  reviewSnippets: [],
});

function memoryStore(): CacheStore & { size: () => number } {
  const m = new Map<string, unknown>();
  return {
    async read<T>(key: string) {
      return m.has(key) ? { payload: m.get(key) as T, loadedAt: "2026-10-27T00:00:00Z" } : null;
    },
    async write(key: string, payload: unknown) {
      m.set(key, payload);
    },
    size: () => m.size,
  };
}

/** Поддельная нейросеть: аналитик и проверяющий отвечают по фиксированным правилам, считаем вызовы. */
function fakeAsk(onCall?: () => void, mode: "agree" | "oppose" = "agree", opts: { needFirst?: boolean; suggest?: boolean } = {}): AiAsk {
  return async ({ system, user }) => {
    onCall?.();
    const payload = JSON.parse(user) as { tovary: Array<{ nmId: string; extra_data?: unknown }> };
    const nms = payload.tovary.map((t) => t.nmId);
    if (/аналитик/i.test(system.slice(0, 80))) {
      return {
        text: JSON.stringify({
          analysis: payload.tovary.map(({ nmId, extra_data }) =>
            opts.needFirst && !extra_data
              ? { nmId, cause: "not_enough_data", confidence: "low", summary: "Нужны данные", evidence: [], stance: "neutral", stanceReason: "", humanAdvice: "", need: [{ tool: "orders_by_day", nmId, days: 28 }], suggestion: null }
              : { nmId, cause: "price_too_high", confidence: "medium", summary: "Конверсия в корзину 2% при 1000 просмотрах.", evidence: [{ key: "cart_pct", value: 2 }], stance: mode === "agree" ? "support" : "oppose", stanceReason: "ok", humanAdvice: "", need: [], suggestion: opts.suggest ? { direction: "lower", stepPercent: 2, reason: "конверсия низкая", evidence: [{ key: "cart_pct", value: 2 }] } : null },
          ),
        }),
        costUsd: 0.001,
      };
    }
    return { text: JSON.stringify({ review: nms.map((nmId) => ({ nmId, verdict: mode === "agree" ? "approve" : "reject", reasons: mode === "agree" ? [] : ["Цена не причина"], evidence: [{ key: "opens_28d", value: 1000 }], missing: [] })) }), costUsd: 0.001 };
  };
}

describe("запрос данных по требованию ИИ и инициатива", () => {
  it("аналитик просит данные: выдаём из базы только запрошенное, второй круг один, оба ИИ видят данные", async () => {
    const fetched: string[] = [];
    let calls = 0;
    const res = await runAiReview({
      products: [product("1")],
      ask: fakeAsk(() => (calls += 1), "agree", { needFirst: true }),
      store: memoryStore(),
      takeBudget: () => true,
      fetchData: async (req) => {
        fetched.push(`${req.tool}:${req.nmId}:${req.days}`);
        return "2026-10-20: 3; 2026-10-21: 2";
      },
    });
    assert.deepEqual(fetched, ["orders_by_day:1:28"]);
    assert.equal(calls, 4); // два круга по два вызова
    const out = res.byNm.get("1")!;
    assert.equal(out.consensus.state, "agreed");
    assert.equal(out.dataUsed.length, 1);
    assert.equal(out.analysis!.needs.length, 0);
  });

  it("без источника данных запрос остаётся без ответа: второго круга нет, результат не кэшируется", async () => {
    const store = memoryStore();
    let calls = 0;
    const res = await runAiReview({ products: [product("1")], ask: fakeAsk(() => (calls += 1), "agree", { needFirst: true }), store, takeBudget: () => true });
    assert.equal(calls, 2);
    assert.equal(store.size(), 0);
    assert.equal(res.byNm.get("1")!.analysis!.needs.length, 1);
  });

  it("данные, которых нет в базе, отдаются честно: «данных нет», а не выдумываются", async () => {
    const seen: string[] = [];
    const ask: AiAsk = async (input) => {
      seen.push(input.user);
      return fakeAsk(undefined, "agree", { needFirst: true })(input);
    };
    await runAiReview({ products: [product("1")], ask, store: memoryStore(), takeBudget: () => true, fetchData: async () => null });
    assert.ok(seen.some((u) => u.includes("данных нет")));
  });

  it("инициатива ИИ: нет предложения алгоритма, аналитик предлагает, проверяющий одобряет — рекомендация", async () => {
    const noCandidate: AiProductInput = { ...product("1"), candidate: null };
    const res = await runAiReview({ products: [noCandidate], ask: fakeAsk(undefined, "agree", { suggest: true }), store: memoryStore(), takeBudget: () => true });
    const out = res.byNm.get("1")!;
    assert.equal(out.initiative?.state, "recommended");
    assert.equal(out.initiative?.suggestion?.stepPercent, 2);
  });

  it("инициатива ИИ без одобрения проверяющего не показывается", async () => {
    const noCandidate: AiProductInput = { ...product("1"), candidate: null };
    const res = await runAiReview({ products: [noCandidate], ask: fakeAsk(undefined, "oppose", { suggest: true }), store: memoryStore(), takeBudget: () => true });
    assert.equal(res.byNm.get("1")!.initiative?.state, "dropped");
  });

  it("у предложений алгоритма поля инициативы нет", async () => {
    const res = await runAiReview({ products: [product("1")], ask: fakeAsk(), store: memoryStore(), takeBudget: () => true });
    assert.equal(res.byNm.get("1")!.initiative, null);
  });

  it("профиль магазина попадает в запрос, но мелкий дрейф профиля не запускает платный повтор", async () => {
    const store = memoryStore();
    const seen: string[] = [];
    const ask: AiAsk = async (input) => {
      seen.push(input.user);
      return fakeAsk()(input);
    };
    await runAiReview({ products: [product("1")], ask, store, takeBudget: () => true, profile: { sku_total: 44 } });
    assert.ok(seen[0]!.includes('"sku_total":44'));
    const again = await runAiReview({ products: [product("1")], ask, store, takeBudget: () => true, profile: { sku_total: 45 } });
    assert.equal(again.reused, 1);
  });
});

describe("запуск двух нейросетей над предложениями", () => {
  it("два независимых вызова на пачку, итог по каждому товару, стоимость считается", async () => {
    let calls = 0;
    const res = await runAiReview({ products: [product("1"), product("2")], ask: fakeAsk(() => (calls += 1)), store: memoryStore(), takeBudget: () => true });
    assert.equal(calls, 2);
    assert.equal(res.calls, 2);
    assert.equal(res.byNm.get("1")!.consensus.state, "agreed");
    assert.ok(Math.abs(res.costUsd - 0.002) < 1e-9);
  });

  it("оба против — предложение скрывается", async () => {
    const res = await runAiReview({ products: [product("1")], ask: fakeAsk(undefined, "oppose"), store: memoryStore(), takeBudget: () => true });
    assert.equal(res.byNm.get("1")!.consensus.state, "hidden");
  });

  it("повтор с теми же фактами берётся из кэша и не оплачивается", async () => {
    const store = memoryStore();
    let calls = 0;
    const ask = fakeAsk(() => (calls += 1));
    await runAiReview({ products: [product("1")], ask, store, takeBudget: () => true });
    const again = await runAiReview({ products: [product("1")], ask, store, takeBudget: () => true });
    assert.equal(calls, 2);
    assert.equal(again.reused, 1);
    assert.equal(again.calls, 0);
    assert.equal(again.byNm.get("1")!.consensus.state, "agreed");
  });

  it("изменились факты — повторная проверка", async () => {
    const store = memoryStore();
    let calls = 0;
    const ask = fakeAsk(() => (calls += 1));
    await runAiReview({ products: [product("1")], ask, store, takeBudget: () => true });
    const changed = product("1");
    changed.facts = { ...changed.facts, cart_pct: 2 };
    changed.candidate = { stepPercent: -2, rules: ["trend_down"], playbook: "grow_no_price_war" };
    await runAiReview({ products: [changed], ask, store, takeBudget: () => true });
    assert.equal(calls, 4);
  });

  it("пачки не больше заданного размера", async () => {
    let calls = 0;
    const products = Array.from({ length: AI_BATCH + 2 }, (_, i) => product(String(i + 1)));
    await runAiReview({ products, ask: fakeAsk(() => (calls += 1)), store: memoryStore(), takeBudget: () => true });
    assert.equal(calls, 4); // две пачки по два вызова
  });

  it("суточный предел исчерпан — оставшиеся товары без ИИ, ошибка записана", async () => {
    let budget = 1;
    const products = Array.from({ length: AI_BATCH + 1 }, (_, i) => product(String(i + 1)));
    const res = await runAiReview({ products, ask: fakeAsk(), store: memoryStore(), takeBudget: () => budget-- > 0 });
    assert.equal(res.byNm.size, AI_BATCH);
    assert.match(res.errors[0]!, /предел/);
  });

  it("сбой нейросети не ломает предложение: без разбора итог «ИИ-проверка не выполнена»", async () => {
    const broken: AiAsk = async () => {
      throw new Error("OpenRouter не отвечает");
    };
    const store = memoryStore();
    const res = await runAiReview({ products: [product("1")], ask: broken, store, takeBudget: () => true });
    assert.equal(res.byNm.get("1")!.consensus.state, "no_ai");
    assert.equal(res.errors.length, 2);
    assert.equal(store.size(), 0); // неполный результат в кэш не попадает
  });

  it("если ответил только один ИИ, учитывается он один, кэш не заполняется", async () => {
    const half: AiAsk = async (input) => {
      if (/проверяющий/i.test(input.system.slice(0, 40))) throw new Error("сбой");
      return fakeAsk()(input);
    };
    const store = memoryStore();
    const res = await runAiReview({ products: [product("1")], ask: half, store, takeBudget: () => true });
    assert.equal(res.byNm.get("1")!.consensus.state, "agreed");
    assert.equal(store.size(), 0);
  });
});
