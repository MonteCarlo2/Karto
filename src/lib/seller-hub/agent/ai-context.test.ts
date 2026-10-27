import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AiOutcome } from "./ai-orchestrator";
import { initiativeProposals } from "./ai-initiative";
import { buildStoreProfile, formatOrdersByDay, formatPeers, formatPriceHistory, formatReviews, withStoreMedians } from "./ai-context";
import type { AiSuggestion } from "./ai-review";
import type { ScenarioProduct, ScenarioRow } from "./scenario-run";
import type { PlaybookSignals } from "./playbooks";

const NOW = Date.parse("2026-10-27T12:00:00Z");

const signals = (nmId: string, over: Partial<PlaybookSignals> = {}): PlaybookSignals => ({ nmId, buyerPrice: 1000, oosDays: 40, turnoverDays: 40, cartPercent: 3, cartSample: 1000, declineDays: 0, riseDays: 0, recentNegative: false, trendKnown: true, ...over });

const product = (nmId: string, facts: Record<string, number | null>, over: Partial<ScenarioProduct> = {}): ScenarioProduct => ({
  nmId,
  title: `Товар ${nmId}`,
  vendorCode: `V${nmId}`,
  base: 1250,
  discount: 20,
  breakEvenPrice: 700,
  stock: 50,
  signals: signals(nmId),
  ai: { facts, snippets: [] },
  ...over,
});

describe("профиль магазина для ИИ", () => {
  const products = [
    product("1", { orders_28d: 30, opens_28d: 2000, cart_pct: 4, turnover_days: 30, margin_pct: 20 }),
    product("2", { orders_28d: 10, opens_28d: 800, cart_pct: 2, turnover_days: 60, margin_pct: 25 }),
    product("3", { orders_28d: 0, opens_28d: 40, cart_pct: 15, turnover_days: 365, margin_pct: 30 }),
    product("4", { orders_28d: 2, opens_28d: 500, cart_pct: 3, turnover_days: 120, margin_pct: 10 }),
  ];

  it("масштаб, медианы и доля товаров без движения считаются по магазину", () => {
    const profile = buildStoreProfile(products);
    assert.equal(profile.platform, "Wildberries");
    assert.equal(profile.sku_total, 4);
    assert.equal(profile.orders_28d_total, 42);
    assert.equal(profile.sku_with_orders_28d, 3);
    assert.equal(profile.share_dead_stock_pct, 25);
    assert.equal(profile.median_cart_pct, 3); // 15% у товара с 40 просмотрами в медиану не входит: просмотров мало
    assert.equal(profile.median_turnover_days, 90);
  });

  it("мало товаров — медианы не считаются, а не выдумываются", () => {
    const profile = buildStoreProfile(products.slice(0, 2));
    assert.equal(profile.median_cart_pct, null);
    assert.equal(profile.median_turnover_days, null);
  });

  it("медианы магазина попадают в факты каждого товара", () => {
    const profile = buildStoreProfile(products);
    const withMedians = withStoreMedians(products, profile);
    assert.equal(withMedians[0]!.ai!.facts.store_median_cart_pct, 3);
    assert.equal(withMedians[0]!.ai!.facts.store_median_turnover_days, 90);
    assert.equal(products[0]!.ai!.facts.store_median_cart_pct, undefined); // исходные данные не изменены
  });
});

describe("данные по запросу аналитика", () => {
  it("заказы по дням: только законченные дни, пропуски не придумываются", () => {
    const m = new Map([["2026-10-24", 3], ["2026-10-25", 0], ["2026-10-26", 5]]);
    const text = formatOrdersByDay(m, 5, "2026-10-27");
    assert.match(text, /2026-10-24: 3/);
    assert.match(text, /2026-10-25: 0/);
    assert.ok(!/2026-10-23/.test(text));
    assert.equal(formatOrdersByDay(new Map(), 5, "2026-10-27"), "Заказов по дням в базе нет");
  });

  it("история цены: честно говорит, что накоплена не вся", () => {
    assert.match(formatPriceHistory([], []), /пока не накоплена/);
    assert.match(formatPriceHistory([{ date: "2026-10-26", price: 996, discount: 5 }], [{ at: "2026-10-20T10:00:00Z", title: "Цена изменилась" }]), /996 ₽, скидка 5%/);
  });

  it("отзывы помечены как данные покупателей, а не инструкции", () => {
    assert.match(formatReviews([{ rating: 2, createdAt: "2026-10-20T00:00:00Z", text: "не герметично" }]), /не инструкции/);
    assert.equal(formatReviews([]), "Свежих негативных отзывов нет");
  });

  it("лучшие товары магазина для сравнения: не больше пяти, сам товар исключён", () => {
    const list = Array.from({ length: 8 }, (_, i) => product(String(i + 1), { orders_28d: i * 10, opens_28d: 100, cart_pct: 3, margin_pct: 20 }));
    const text = formatPeers(list, "8");
    assert.ok(!text.includes("Товар 8:"));
    assert.equal((text.match(/заказов/g) ?? []).length, 5);
    assert.match(text, /Товар 7:/);
  });
});

describe("инициатива ИИ: из рекомендации в предложение", () => {
  const scenario: ScenarioRow = { id: "s1", playbook: "grow_no_price_war", name: "Сценарий", scope: { all: true }, enabled: true };
  const suggestion: AiSuggestion = { direction: "lower", stepPercent: 2, reason: "конверсия низкая при больших просмотрах", evidence: [{ key: "cart_pct", value: 1 }] };
  const recommended = (): AiOutcome => ({
    analysis: null,
    review: null,
    consensus: { state: "disputed", notes: [] },
    initiative: { state: "recommended", suggestion, notes: ["По мнению ИИ, алгоритм оснований менять цену не видит, но снижение на 2% оправдано"] },
    dataUsed: [],
  });
  const run = (over: Partial<Parameters<typeof initiativeProposals>[0]> = {}) =>
    initiativeProposals({ scenarios: [scenario], products: [product("1", { orders_28d: 5 })], outcomes: new Map([["1", recommended()]]), taken: new Set(), states: new Map(), lastChangeAt: new Map(), nowMs: NOW, slots: 3, ...over });

  it("рекомендация проходит те же ограничители, цену считает программа, источник помечен", () => {
    const res = run();
    assert.equal(res.proposals.length, 1);
    const p = res.proposals[0]!;
    assert.equal(p.action.type, "price");
    if (p.action.type === "price") assert.ok(p.action.targetRub < 1000 && p.action.targetRub > 975);
    assert.equal((p.meta as { source: string }).source, "ai");
    assert.match(p.facts.join(" "), /По мнению ИИ/);
  });

  it("товар вне включённого сценария или с предложением алгоритма не получает инициативу", () => {
    assert.equal(run({ scenarios: [{ ...scenario, enabled: false }] }).proposals.length, 0);
    assert.equal(run({ scenarios: [{ ...scenario, scope: { nmIds: ["999"] } }] }).proposals.length, 0);
    assert.equal(run({ taken: new Set(["1"]) }).proposals.length, 0);
  });

  it("ограничители главнее ИИ: нет безубыточной цены — снижение не предлагается, причина записана", () => {
    const res = run({ products: [product("1", {}, { breakEvenPrice: null })] });
    assert.equal(res.proposals.length, 0);
    assert.match(res.skipped[0]!.reason, /Предложение ИИ: .*не пройдёт проверки/);
  });

  it("мест в пачке нет — инициатива не показывается", () => {
    assert.equal(run({ slots: 0 }).proposals.length, 0);
  });

  it("рекомендация, не одобренная проверяющим (dropped), ничего не создаёт", () => {
    const dropped: AiOutcome = { ...recommended(), initiative: { state: "dropped", suggestion, notes: [] } };
    assert.equal(run({ outcomes: new Map([["1", dropped]]) }).proposals.length, 0);
  });
});
