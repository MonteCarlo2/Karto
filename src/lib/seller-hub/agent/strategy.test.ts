import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DAY_MS, dueProgramSteps, effectReport, planBrief, evaluateStrategy, humanizeKeys, parseStrategy, trackedMetrics, stepCompliance, type Strategy, type StrategyState } from "./strategy";

const T0 = Date.parse("2026-10-28T10:00:00Z");
const price = (day: number, direction: "lower" | "raise" = "lower", stepPercent = 2) => ({ day, when: `день ${day}`, by: "program", step: "шаг цены", action: { type: "price", direction, stepPercent, reason: "r" } });
const human = (day: number, step = "сделать вручную") => ({ day, when: day === 0 ? "сразу" : `через ${day} дн.`, by: "human", step, action: null });
const base = (over: Record<string, unknown> = {}) => ({ goal: "Вернуть заказы", steps: [human(0)], ...over });

const full = (): Strategy =>
  parseStrategy(
    base({
      steps: [price(0), human(3), price(7)],
      checks: [{ day: 3, label: "первые итоги", look: [{ metric: "cart_pct", expect: "up" }] }, { day: 10, label: "эффект цены", look: [{ metric: "cart_pct", expect: "up" }, { metric: "margin_pct", expect: "hold" }] }],
      success: [{ metric: "orders_28d", op: ">=", value: 5 }],
      guards: [{ metric: "margin_pct", op: ">=", value: 10 }],
      reviewAfterDays: 14,
    }),
  )!;
const accepted = (): StrategyState => ({ status: "running", acceptedAt: new Date(T0).toISOString(), baseline: { cart_pct: 8, margin_pct: 20, orders_28d: 2 } });

describe("решение ИИ: гибкая форма и границы", () => {
  it("минимальное решение: цель и один шаг, без проверок и итога", () => {
    const s = parseStrategy(base())!;
    assert.equal(s.steps.length, 1);
    assert.deepEqual(s.checks, []);
    assert.equal(s.reviewAfterDays, null);
  });
  it("без цели или без шагов не принимается", () => {
    assert.equal(parseStrategy({ goal: "", steps: [human(0)] }), null);
    assert.equal(parseStrategy({ goal: "g", steps: [] }), null);
  });
  it("до десяти шагов, сроки до 60 дней, шаги отсортированы по дням", () => {
    const s = parseStrategy(base({ steps: Array.from({ length: 14 }, (_, i) => human(i === 0 ? 90 : i)), reviewAfterDays: 300 }))!;
    assert.equal(s.steps.length, 10);
    assert.equal(s.reviewAfterDays, 60);
    assert.ok(s.steps.every((p, i, a) => i === 0 || a[i - 1]!.day <= p.day));
  });
  it("общий предел изменения цены в одну сторону 10%: лишние шаги цены становятся шагами для человека", () => {
    const s = parseStrategy(base({ steps: [price(0, "lower", 3), price(2, "lower", 3), price(4, "lower", 3), price(6, "lower", 3)] }))!;
    assert.equal(s.steps.filter((p) => p.action).length, 3);
    assert.equal(s.steps[3]!.by, "human");
  });
  it("шаги цены не чаще раза в сутки", () => {
    const s = parseStrategy(base({ steps: [price(0), price(0)] }))!;
    assert.equal(s.steps.filter((p) => p.action).length, 1);
  });
  it("неверная ступень цены или неизвестная метрика отбрасываются, остальное остаётся", () => {
    const s = parseStrategy(base({ steps: [price(0, "lower", 9)], success: [{ metric: "unknown", op: ">=", value: 1 }, { metric: "stock", op: "<=", value: 50 }] }))!;
    assert.equal(s.steps[0]!.action, null);
    assert.equal(s.success.length, 1);
  });
  it("контрольные точки: любые дни и метрики по ситуации, но не позже итога", () => {
    const s = parseStrategy(base({ checks: [{ day: 2, label: "рано", look: [{ metric: "opens_28d", expect: "up" }] }, { day: 40, label: "поздно", look: [] }], reviewAfterDays: 10 }))!;
    assert.deepEqual(s.checks.map((c) => c.day), [2]);
  });
  it("следим за метриками успеха, ограничителей и контрольных точек", () => {
    assert.deepEqual(trackedMetrics(full()).sort(), ["cart_pct", "margin_pct", "orders_28d"]);
  });
});

describe("решение ИИ: ход и итог", () => {
  it("критерии выполнены после первой контрольной точки, ограничитель цел: сработало", () => {
    const s = full();
    assert.equal(evaluateStrategy(s, accepted(), { orders_28d: 6, cart_pct: 12, margin_pct: 18 }, T0 + 1 * DAY_MS).status, "running");
    const done = evaluateStrategy(s, accepted(), { orders_28d: 6, cart_pct: 12, margin_pct: 18 }, T0 + 4 * DAY_MS);
    assert.equal(done.status, "worked");
    assert.equal(done.checkpoints![0]!.looksMet, true);
  });
  it("ограничитель нарушен (маржа упала ниже порога): план останавливается как неудачный", () => {
    const res = evaluateStrategy(full(), accepted(), { orders_28d: 6, cart_pct: 12, margin_pct: 5 }, T0 + 4 * DAY_MS);
    assert.equal(res.status, "not_worked");
    assert.match(res.reason ?? "", /ограничитель/);
  });
  it("срок итога вышел, критерии не выполнены: не сработало; раньше срока итог не объявляется", () => {
    const s = full();
    assert.equal(evaluateStrategy(s, accepted(), { orders_28d: 2, cart_pct: 8, margin_pct: 20 }, T0 + 10 * DAY_MS).status, "running");
    assert.equal(evaluateStrategy(s, accepted(), { orders_28d: 2, cart_pct: 8, margin_pct: 20 }, T0 + 15 * DAY_MS).status, "not_worked");
  });
  it("критериев успеха нет: по сроку статус «наблюдение», вердикта нет", () => {
    const s = parseStrategy(base({ reviewAfterDays: 7, checks: [{ day: 7, label: "смотрим", look: [{ metric: "opens_28d", expect: "up" }] }] }))!;
    const res = evaluateStrategy(s, { status: "running", acceptedAt: new Date(T0).toISOString(), baseline: { opens_28d: 100 } }, { opens_28d: 140 }, T0 + 8 * DAY_MS);
    assert.equal(res.status, "observed");
    assert.equal(res.checkpoints![0]!.looksMet, true);
  });
  it("нет данных по метрике: критерий не считается выполненным", () => {
    assert.equal(evaluateStrategy(full(), accepted(), { orders_28d: null, cart_pct: 12, margin_pct: 20 }, T0 + 20 * DAY_MS).status, "not_worked");
  });
  it("контрольные точки не дублируются при повторных вычислениях, текущие метрики сохраняются", () => {
    const s = full();
    const a = evaluateStrategy(s, accepted(), { orders_28d: 2, cart_pct: 8, margin_pct: 20 }, T0 + 4 * DAY_MS);
    const b = evaluateStrategy(s, a, { orders_28d: 2, cart_pct: 8, margin_pct: 20 }, T0 + 5 * DAY_MS);
    assert.equal(b.checkpoints!.length, 1);
    assert.equal(b.current!.orders_28d, 2);
  });
  it("итог уже объявлен: состояние не меняется", () => {
    const done: StrategyState = { ...accepted(), status: "worked" };
    assert.equal(evaluateStrategy(full(), done, { orders_28d: 0 }, T0 + 30 * DAY_MS).status, "worked");
  });
});

describe("эффект: было → стало", () => {
  it("считает изменение и оценивает по смыслу метрики; нейтральные метрики без оценки", () => {
    const s = full();
    const rows = effectReport(s, accepted(), { orders_28d: 6, cart_pct: 7, margin_pct: 20 });
    const by = Object.fromEntries(rows.map((r) => [r.metric, r]));
    assert.equal(by.orders_28d!.change, 4);
    assert.equal(by.orders_28d!.better, true);
    assert.equal(by.cart_pct!.better, false);
    assert.equal(by.margin_pct!.better, null);
    assert.equal(by.orders_28d!.changePct, 200);
  });
});

describe("шаги программы по плану: когда предложить", () => {
  const s = full();
  const T = (days: number) => T0 + days * DAY_MS;
  it("первый шаг цены в свой день; пока он не выполнен, второй шаг цены не предлагается", () => {
    const first = dueProgramSteps(s, { doneSteps: [], lastPriceDoneAtMs: null, acceptedAtMs: T0, nowMs: T(0) });
    assert.deepEqual(first.map((r) => r.index), [0]);
    const later = dueProgramSteps(s, { doneSteps: [], lastPriceDoneAtMs: null, acceptedAtMs: T0, nowMs: T(8) });
    assert.deepEqual(later.map((r) => r.index), [0]);
  });
  it("после выполненного шага цены следующий ждёт свой день и сутки", () => {
    assert.deepEqual(dueProgramSteps(s, { doneSteps: [0], lastPriceDoneAtMs: T(0), acceptedAtMs: T0, nowMs: T(6) }), []);
    const next = dueProgramSteps(s, { doneSteps: [0], lastPriceDoneAtMs: T(1), acceptedAtMs: T0, nowMs: T(7) });
    assert.deepEqual(next.map((r) => r.index), [2]);
    assert.deepEqual(dueProgramSteps(s, { doneSteps: [0], lastPriceDoneAtMs: T(7), acceptedAtMs: T0, nowMs: T(7) + 3600_000 }), []);
  });
  it("все шаги выполнены, или плана без шагов программы нет: предлагать нечего", () => {
    assert.deepEqual(dueProgramSteps(s, { doneSteps: [0, 2], lastPriceDoneAtMs: T(7), acceptedAtMs: T0, nowMs: T(99) }), []);
    assert.deepEqual(dueProgramSteps(parseStrategy(base())!, { doneSteps: [], lastPriceDoneAtMs: null, acceptedAtMs: T0, nowMs: T(1) }), []);
  });
});

describe("действия по рекламе в плане", () => {
  const ctx = { campaignIds: new Set(["111"]) };
  const ads = (action: Record<string, unknown>, day = 0) => ({ day, when: "сразу", by: "program", step: "шаг рекламы", action });
  it("пауза, запуск и ставка принимаются только по кампании товара; чужая кампания превращает шаг в шаг для человека", () => {
    const ok = parseStrategy(base({ steps: [ads({ type: "ads_pause", campaignId: "111", reason: "ДРР выше маржи" }), ads({ type: "ads_bid", campaignId: "111", direction: "lower", stepPercent: 10, reason: "r" }, 3)] }), ctx)!;
    assert.deepEqual(ok.steps.map((p) => p.action?.type), ["ads_pause", "ads_bid"]);
    const bad = parseStrategy(base({ steps: [ads({ type: "ads_pause", campaignId: "999", reason: "r" })] }), ctx)!;
    assert.equal(bad.steps[0]!.action, null);
    assert.equal(bad.steps[0]!.by, "human");
    assert.equal(parseStrategy(base({ steps: [ads({ type: "ads_pause", campaignId: "111", reason: "r" })] }))!.steps[0]!.action, null); // кампаний нет в данных
  });
  it("ступень ставки только 5, 10, 15 или 20 процентов", () => {
    const st = (n: number) => parseStrategy(base({ steps: [ads({ type: "ads_bid", campaignId: "111", direction: "raise", stepPercent: n, reason: "r" })] }), ctx)!.steps[0]!.action;
    assert.equal(st(10)?.type, "ads_bid");
    assert.equal(st(7), null);
    assert.equal(st(50), null);
  });
  it("тестовая кампания допустима и без списка кампаний; неизвестное действие отбрасывается", () => {
    assert.equal(parseStrategy(base({ steps: [ads({ type: "ads_create_test", reason: "r" })] }))!.steps[0]!.action?.type, "ads_create_test");
    assert.equal(parseStrategy(base({ steps: [ads({ type: "delete_card" })] }), ctx)!.steps[0]!.action, null);
  });
  it("лимит 10% относится только к цене: шаги рекламы его не расходуют", () => {
    const s = parseStrategy(base({ steps: [price(0, "lower", 3), ads({ type: "ads_bid", campaignId: "111", direction: "lower", stepPercent: 20, reason: "r" }, 1), price(2, "lower", 3), price(4, "lower", 3)] }), ctx)!;
    assert.equal(s.steps.filter((p) => p.action?.type === "price").length, 3);
    assert.equal(s.steps.filter((p) => p.action?.type === "ads_bid").length, 1);
  });
});

describe("записи прежнего формата", () => {
  it("не используются: нет контрольных точек и критериев в нужном виде", async () => {
    const { normalizeStoredStrategy } = await import("./strategy");
    assert.equal(normalizeStoredStrategy({ goal: "g", steps: [], priceProgram: null, monitoring: {} }), null);
    assert.equal(normalizeStoredStrategy(null), null);
    assert.ok(normalizeStoredStrategy({ goal: "g", steps: [], checks: [], success: [], guards: [] }));
  });
});

describe("правка карточки в плане", () => {
  const good = "Ведро строительное оцинкованное 12 л для раствора";
  const longText = "Ведро оцинкованное объёмом 12 литров подходит для строительных и бытовых работ: замешивания раствора, переноски воды, хранения сыпучих материалов. Прочная стальная стенка и удобная ручка выдерживают нагрузку, дно усилено. ".repeat(2);
  const edit = (field: string, text: string) => ({ day: 0, when: "сразу", by: "program", step: "правка", action: { type: "content_edit", field, text, reason: "r" } });

  it("название: от 10 до 60 знаков, одна строка; описание от 200 до 5000", async () => {
    const { validateCardText } = await import("./strategy");
    assert.equal(validateCardText("title", good), good);
    assert.equal(validateCardText("title", "Ведро"), null);
    assert.equal(validateCardText("title", "а".repeat(61)), null);
    assert.equal(validateCardText("title", "Ведро строительное\nоцинкованное 12 л"), null);
    assert.ok(validateCardText("description", longText));
    assert.equal(validateCardText("description", "коротко"), null);
  });
  it("ссылки, телефоны, почта, мессенджеры и рекламные слова не принимаются", async () => {
    const { validateCardText } = await import("./strategy");
    for (const bad of ["Ведро 12 л, заказ на www.site.ru", "Ведро оцинкованное, звоните +7 999 123-45-67", "Ведро оцинкованное, пишите на mail@site.ru", "Ведро оцинкованное, пишите в Telegram", "Ведро оцинкованное со скидкой 12 л", "Лучшее ведро оцинкованное 12 л"]) {
      assert.equal(validateCardText("title", bad), null, bad);
    }
    assert.equal(validateCardText("title", "Ведро оцинкованное 12 л прочное"), "Ведро оцинкованное 12 л прочное");
  });
  it("заготовки вместо фактов в тексте не принимаются", async () => {
    const { validateCardText } = await import("./strategy");
    for (const bad of ["Ведро оцинкованное [подтвержденный объем] л, 5 шт", "Ведро оцинкованное ... 12 л прочное", "Ведро оцинкованное {объём} л для раствора", "Ведро оцинкованное, объём подтверждается"]) assert.equal(validateCardText("title", bad), null, bad);
  });
  it("шаг с правкой: годный текст принимается, негодный превращается в шаг для человека", () => {
    const ok = parseStrategy(base({ steps: [edit("title", good)] }))!;
    assert.equal(ok.steps[0]!.action?.type, "content_edit");
    const bad = parseStrategy(base({ steps: [edit("title", "Ведро со скидкой 50% купить на www.site.ru")] }))!;
    assert.equal(bad.steps[0]!.action, null);
    assert.equal(bad.steps[0]!.by, "human");
  });
});

describe("выход из акции в плане", () => {
  const exit = (promoId: string) => ({ day: 0, when: "сразу", by: "program", step: "выйти из акции", action: { type: "promo_exit", promoId, reason: "маржа в акции отрицательная" } });
  it("только из акций, в которых товар участвует сейчас; чужая акция превращает шаг в шаг для человека", () => {
    const ok = parseStrategy(base({ steps: [exit("777")] }), { promoIds: new Set(["777"]) })!;
    assert.equal(ok.steps[0]!.action?.type, "promo_exit");
    const bad = parseStrategy(base({ steps: [exit("999")] }), { promoIds: new Set(["777"]) })!;
    assert.equal(bad.steps[0]!.action, null);
    assert.equal(bad.steps[0]!.by, "human");
    assert.equal(parseStrategy(base({ steps: [exit("777")] }))!.steps[0]!.action, null);
  });
});

describe("шаги человека: отметки и исполнение плана", () => {
  const T = (d: number) => T0 + d * DAY_MS;
  const plan = () => parseStrategy(base({ steps: [human(0, "Проверить себестоимость"), price(0), human(3, "Обновить фото"), human(10, "Подготовить поставку")], reviewAfterDays: 14, success: [{ metric: "orders_28d", op: ">=", value: 5 }] }))!;
  it("шаг человека без отметки в свой день «пора», раньше срока «ждёт»; шаг программы «сделано» только после кнопки", async () => {
    const { stepProgress } = await import("./strategy");
    const state: StrategyState = { status: "running", acceptedAt: new Date(T0).toISOString(), doneSteps: [1], humanSteps: { "0": { status: "done", at: "x" } } };
    const p = stepProgress(plan(), state, T(4));
    assert.deepEqual(p.map((x) => x.status), ["done", "done", "due", "upcoming"]);
    assert.deepEqual(p.map((x) => x.kind), ["human", "program", "human", "human"]);
  });
  it("пропущенный шаг остаётся пропущенным и попадает в сводку", async () => {
    const { stepCompliance } = await import("./strategy");
    const state: StrategyState = { status: "running", acceptedAt: new Date(T0).toISOString(), doneSteps: [], humanSteps: { "0": { status: "done", at: "x" }, "2": { status: "skipped", at: "y" } } };
    const c = stepCompliance(plan(), state, T(4));
    assert.equal(c.done, 1);
    assert.equal(c.skipped, 1);
    assert.match(c.text, /выполнено 1 из 4, пропущено 1/);
  });
  it("следующая попытка узнаёт, что прошлый план выполнен не полностью", async () => {
    const { attemptFromStrategy } = await import("./ai-solver-run");
    const state: StrategyState = { status: "not_worked", acceptedAt: new Date(T0).toISOString(), resolvedAt: new Date(T(15)).toISOString(), humanSteps: { "2": { status: "skipped", at: "y" } }, finalMetrics: { orders_28d: 2 }, reason: "срок итога вышел" };
    const a = attemptFromStrategy(plan(), state, "План");
    assert.match(a.result, /исполнение плана: шагов выполнено 0 из 4, пропущено 1/);
  });
});

describe("остальные рычаги в плане: Клуб, вход в акцию, реклама", () => {
  const act = (action: Record<string, unknown>, day = 0) => ({ day, when: "сразу", by: "program", step: "шаг", action });
  it("вход в акцию только из открытых акций товара", () => {
    const ctx = { openPromoIds: new Set(["55"]) };
    assert.equal(parseStrategy(base({ steps: [act({ type: "promo_join", promoId: "55", reason: "r" })] }), ctx)!.steps[0]!.action?.type, "promo_join");
    assert.equal(parseStrategy(base({ steps: [act({ type: "promo_join", promoId: "56", reason: "r" })] }), ctx)!.steps[0]!.action, null);
    assert.equal(parseStrategy(base({ steps: [act({ type: "promo_join", promoId: "55", reason: "r" })] }))!.steps[0]!.action, null);
  });
  it("скидка Клуба: ступень 1–3, не чаще раза в сутки", () => {
    const ok = parseStrategy(base({ steps: [act({ type: "club_discount", direction: "raise", stepPercent: 2, reason: "r" }), act({ type: "club_discount", direction: "raise", stepPercent: 1, reason: "r" })] }))!;
    assert.equal(ok.steps.filter((p) => p.action?.type === "club_discount").length, 1);
    assert.equal(parseStrategy(base({ steps: [act({ type: "club_discount", direction: "raise", stepPercent: 9, reason: "r" })] }))!.steps[0]!.action, null);
  });
  it("реклама: удалить товар из своей кампании, добавить в чужую, пополнить на 500/1000/2000", () => {
    const ctx = { campaignIds: new Set(["1"]), otherCampaignIds: new Set(["2"]) };
    const s = parseStrategy(base({ steps: [act({ type: "ads_remove_nm", campaignId: "1", reason: "r" }), act({ type: "ads_add_nm", campaignId: "2", reason: "r" }, 1), act({ type: "ads_deposit", campaignId: "1", sumRub: 1000, reason: "r" }, 2)] }), ctx)!;
    assert.deepEqual(s.steps.map((p) => p.action?.type), ["ads_remove_nm", "ads_add_nm", "ads_deposit"]);
    const bad = parseStrategy(base({ steps: [act({ type: "ads_add_nm", campaignId: "1", reason: "r" }), act({ type: "ads_deposit", campaignId: "1", sumRub: 700, reason: "r" }, 1), act({ type: "ads_remove_nm", campaignId: "2", reason: "r" }, 2)] }), ctx)!;
    assert.deepEqual(bad.steps.map((p) => p.action), [null, null, null]);
  });
  it("ценовые шаги разных видов (цена, Клуб, вход и выход из акции) идут по одному за раз", () => {
    const s = parseStrategy(base({ steps: [act({ type: "price", direction: "raise", stepPercent: 1, reason: "r" }), act({ type: "club_discount", direction: "lower", stepPercent: 1, reason: "r" })], success: [{ metric: "orders_28d", op: ">=", value: 1 }] }))!;
    const due = dueProgramSteps(s, { doneSteps: [], lastPriceDoneAtMs: null, acceptedAtMs: T0, nowMs: T0 + 1000 });
    assert.equal(due.length, 1);
  });
});

describe("минус-фразы и места показа в плане", () => {
  const step = (action: Record<string, unknown>) => ({ day: 0, when: "сразу", by: "program", step: "шаг рекламы", action });
  const ctx = { campaignIds: new Set(["1"]), adQueries: new Map([["1", new Set(["ведро пластиковое", "лопата"])]]) };
  it("минус-фразы только из реальных запросов без заказов; выдуманные и лишние отбрасываются", async () => {
    const s = parseStrategy(base({ steps: [step({ type: "ads_minus_phrases", campaignId: "1", queries: ["Ведро пластиковое", "ведро оцинкованное", "лопата"], reason: "r" })] }), ctx)!;
    const a = s.steps[0]!.action as { queries: string[] };
    assert.deepEqual(a.queries, ["Ведро пластиковое", "лопата"]);
    assert.equal(parseStrategy(base({ steps: [step({ type: "ads_minus_phrases", campaignId: "1", queries: ["чужой запрос"], reason: "r" })] }), ctx)!.steps[0]!.action, null);
    assert.equal(parseStrategy(base({ steps: [step({ type: "ads_minus_phrases", campaignId: "9", queries: ["лопата"], reason: "r" })] }), ctx)!.steps[0]!.action, null);
  });
  it("не больше десяти фраз за шаг", () => {
    const many = new Set(Array.from({ length: 15 }, (_, i) => `запрос ${i}`));
    const s = parseStrategy(base({ steps: [step({ type: "ads_minus_phrases", campaignId: "1", queries: [...many], reason: "r" })] }), { campaignIds: new Set(["1"]), adQueries: new Map([["1", many]]) })!;
    assert.equal((s.steps[0]!.action as { queries: string[] }).queries.length, 10);
  });
  it("места показа: хотя бы одно остаётся включённым", () => {
    assert.equal(parseStrategy(base({ steps: [step({ type: "ads_placements", campaignId: "1", search: true, recommendations: false, reason: "r" })] }), ctx)!.steps[0]!.action?.type, "ads_placements");
    assert.equal(parseStrategy(base({ steps: [step({ type: "ads_placements", campaignId: "1", search: false, recommendations: false, reason: "r" })] }), ctx)!.steps[0]!.action, null);
  });
});

describe("характеристики карточки в плане", () => {
  const charcs = new Map([[10, { name: "Материал", type: 1 }], [11, { name: "Объем", type: 4 }]]);
  const step = (changes: unknown[]) => ({ day: 0, when: "сразу", by: "program", step: "характеристики", action: { type: "characteristics_edit", changes, reason: "r" } });
  it("правки только по характеристикам категории: текст короткий и правдивый, число для числовой", () => {
    const s = parseStrategy(base({ steps: [step([{ charcId: 10, value: "сталь оцинкованная" }, { charcId: 11, value: "12" }, { charcId: 99, value: "чужая" }])] }), { charcs })!;
    const a = s.steps[0]!.action as { changes: Array<{ charcId: number; value: string | number }> };
    assert.deepEqual(a.changes, [{ charcId: 10, value: "сталь оцинкованная" }, { charcId: 11, value: 12 }]);
  });
  it("заготовки, ссылки, рекламные слова, длинный текст и нечисловое число отбрасываются; без допустимых правок шага нет", () => {
    const bad = [{ charcId: 10, value: "[материал]" }, { charcId: 10, value: "www.site.ru" }, { charcId: 10, value: "лучший металл" }, { charcId: 10, value: "а".repeat(101) }, { charcId: 11, value: "много" }, { charcId: 11, value: -3 }];
    for (const c of bad) assert.equal(parseStrategy(base({ steps: [step([c])] }), { charcs })!.steps[0]!.action, null, JSON.stringify(c));
    assert.equal(parseStrategy(base({ steps: [step([{ charcId: 10, value: "сталь" }])] }))!.steps[0]!.action, null);
  });
  it("не больше пяти правок за шаг и без повторов по одной характеристике", () => {
    const many = new Map(Array.from({ length: 8 }, (_, i) => [i + 1, { name: `Х${i}`, type: 1 }] as const));
    const s = parseStrategy(base({ steps: [step([...many.keys()].map((id) => ({ charcId: id, value: `значение ${id}` })))] }), { charcs: many })!;
    assert.equal((s.steps[0]!.action as { changes: unknown[] }).changes.length, 5);
    const dup = parseStrategy(base({ steps: [step([{ charcId: 10, value: "сталь" }, { charcId: 10, value: "железо" }])] }), { charcs })!;
    assert.equal((dup.steps[0]!.action as { changes: unknown[] }).changes.length, 1);
  });
});

describe("инструмент KARTO у шага человека", () => {
  it("flow принимается только из списка и только у шагов человека", () => {
    const s = parseStrategy(base({ steps: [{ day: 0, when: "сразу", by: "human", step: "Сделать новые фото", action: null, flow: "visual" }, { day: 1, when: "", by: "human", step: "x", action: null, flow: "hack" }, { day: 2, when: "", by: "program", step: "цена", action: { type: "price", direction: "raise", stepPercent: 1, reason: "r" }, flow: "visual" }] }))!;
    assert.equal(s.steps[0]!.flow, "visual");
    assert.equal(s.steps[1]!.flow, undefined);
    assert.equal(s.steps[2]!.flow, undefined);
  });
});

describe("текст шага плана", () => {
  it("служебная пометка flow не попадает в текст, а длинный текст режется по слову с многоточием", () => {
    const long = `${"слово ".repeat(150)}конец`;
    const s = parseStrategy(base({ steps: [{ day: 0, when: "сразу", by: "human", step: 'Заменить фото. flow: "visual".', action: null, flow: "visual" }, { day: 1, when: "", by: "human", step: long, action: null }] }))!;
    assert.equal(s.steps[0]!.step, "Заменить фото.");
    assert.ok(s.steps[1]!.step.endsWith("…"));
    assert.ok(!/слов…$/.test(s.steps[1]!.step) || s.steps[1]!.step.length <= 601);
    assert.ok(s.steps[1]!.step.length <= 601);
  });
});

describe("служебные имена полей в тексте для клиента", () => {
  it("заменяются словами", () => {
    assert.equal(humanizeKeys("cart_pct 20%, decline_days равен 0, some_unknown_key"), "конверсия в корзину 20%, дней подряд падения заказов равен 0, some unknown key");
    assert.equal(humanizeKeys("обычный текст без полей"), "обычный текст без полей");
  });
  it("в цели, шаге и запасном плане имена полей тоже заменяются", () => {
    const s = parseStrategy(base({ goal: "Поднять cart_to_order_pct", fallback: "Если orders_28d не растёт", steps: [{ day: 0, when: "сразу", by: "human", step: "Проверить margin_pct", action: null }] }))!;
    assert.equal(s.goal, "Поднять конверсия корзина→заказ");
    assert.equal(s.fallback, "Если заказы за 28 дней не растёт");
    assert.equal(s.steps[0]!.step, "Проверить маржа");
  });
});

describe("шаги с условием-триггером", () => {
  const plan = () =>
    parseStrategy(
      base({
        steps: [
          { day: 0, when: "сразу", by: "human", step: "Проверить поставку", action: null },
          { day: 0, when: "если запас на исходе", by: "program", step: "Поднять цену", action: { type: "price", direction: "raise", stepPercent: 3, reason: "r" }, if: { metric: "oos_days", op: "<=", value: 14 } },
        ],
        success: [{ metric: "orders_28d", op: ">=", value: 1 }],
      }),
    )!;
  const accepted = Date.parse("2026-10-01T00:00:00Z");
  const now = accepted + 3 * DAY_MS;
  it("условие читается и попадает в отслеживаемые метрики", () => {
    const s = plan();
    assert.deepEqual(s.steps[1]!.onlyIf, { metric: "oos_days", op: "<=", value: 14 });
    assert.ok(trackedMetrics(s).includes("oos_days"));
  });
  it("шаг не предлагается, пока условие не выполнено, и предлагается, когда выполнено", () => {
    const s = plan();
    const input = { doneSteps: [], lastPriceDoneAtMs: null, acceptedAtMs: accepted, nowMs: now };
    assert.equal(dueProgramSteps(s, { ...input, current: { oos_days: 39 } }).length, 0);
    assert.equal(dueProgramSteps(s, { ...input }).length, 0, "нет данных: ждём");
    assert.equal(dueProgramSteps(s, { ...input, current: { oos_days: 12 } }).length, 1);
  });
  it("не понадобившийся шаг-триггер не считается невыполненным", () => {
    const s = plan();
    const c = stepCompliance(s, { status: "running", acceptedAt: new Date(accepted).toISOString() } as StrategyState, now);
    assert.equal(c.total, 1);
    assert.equal(c.waiting, 1, "ждёт отметки только шаг человека");
  });
});

describe("сводка плана перед принятием", () => {
  it("называет действия программы, условия, шаги человека, критерии и ограничители", () => {
    const s = parseStrategy(
      base({
        steps: [
          { day: 0, when: "сразу", by: "human", step: "Проверить поставку", action: null },
          { day: 0, when: "если запас на исходе", by: "program", step: "Поднять цену", action: { type: "price", direction: "raise", stepPercent: 3, reason: "r" }, if: { metric: "oos_days", op: "<=", value: 14 } },
        ],
        success: [{ metric: "orders_28d", op: ">=", value: 30 }],
        guards: [{ metric: "margin_pct", op: ">=", value: 15 }],
        reviewAfterDays: 14,
      }),
    )!;
    const b = planBrief(s);
    assert.equal(b.humanSteps, 1);
    assert.deepEqual(b.program, [{ when: "сразу", text: "цена +3%", condition: "дней до нулевого остатка ≤ 14" }]);
    assert.deepEqual(b.success, ["заказы за 28 дней не ниже 30"]);
    assert.deepEqual(b.guards, ["маржа, % не ниже 15"]);
    assert.equal(b.horizonDays, 14);
  });
});
